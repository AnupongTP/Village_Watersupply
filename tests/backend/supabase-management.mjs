// LOCAL synthetic PostgreSQL only. Does not use Supabase Cloud credentials.
import {spawnSync}from'node:child_process';
import {readFileSync,readdirSync,writeFileSync,mkdirSync}from'node:fs';
import {resolve}from'node:path';
const container='vws-supabase-candidate-20261023',db='vws_local_management_'+Date.now();
mkdirSync('output/git-review-fix-20261024',{recursive:true});
const results=[];let baselineAudit;
function sql(q,database=db,expectedFailure=false){const p=spawnSync('docker',['exec','-i',container,'psql','-X','-q','-t','-A','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',windowsHide:true});if(p.error)throw p.error;if(p.status&&!expectedFailure)throw Error(p.stderr);return{code:p.status,out:p.stdout.trim(),error:p.stderr.trim()};}
function check(name,ok){results.push({name,passed:!!ok});if(!ok)throw Error(name);}
const call=(mid,user='ADMIN',hash='a')=>`select api.auth_job_begin('${user}-token','technicians.create','{"username":"new-synthetic","displayName":"Synthetic Display","district":"D1","identityDomain":"invalid.test"}','${mid}',repeat('${hash}',64),'synthetic-cipher-only');`;
try{
 sql(`create database ${db};`,'postgres');
 sql(`create schema auth;create table auth.users(id uuid primary key,email text unique);create table auth.sessions(id uuid primary key,user_id uuid references auth.users);`);
 for(const file of readdirSync('supabase/sql/install').sort())sql(readFileSync(resolve('supabase/sql/install',file),'utf8'));
 check('fresh install audit increment has singleton WHERE guard',/where\s+singleton\s+is\s+true/i.test(sql("select pg_get_functiondef('app.audit_commit(app.accounts,uuid,text,text,text,text,text,jsonb,jsonb,text,jsonb)'::regprocedure)").out));
 sql(`insert into app.districts values('D1'),('D2');
 insert into auth.users values('00000000-0000-4000-8000-000000000001','admin@invalid.test'),('00000000-0000-4000-8000-000000000002','tech@invalid.test');
 insert into auth.sessions values('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002');
 insert into app.identities(actor_id,auth_user_id)values('ADMIN','00000000-0000-4000-8000-000000000001'),('TECH','00000000-0000-4000-8000-000000000002');
 insert into app.accounts(actor_id,username,display_name,role,district,login_identity)values('ADMIN','admin-fixture','Synthetic Admin','ADMIN',null,'admin@invalid.test'),('TECH','tech-fixture','Synthetic Tech','TECHNICIAN','D1','tech@invalid.test');
 insert into app.sessions(token_hash,actor_id,auth_session_id,auth_cipher,auth_epoch)values('ADMIN-token','ADMIN','10000000-0000-4000-8000-000000000001','synthetic-cipher',1),('TECH-token','TECH','10000000-0000-4000-8000-000000000002','synthetic-cipher',1);`);
 const audit=`select app.audit_commit((select a from app.accounts a where actor_id='ADMIN'),'20000000-0000-4000-8000-000000000001',repeat('a',64),'TEST','USER','synthetic',null,'{"same":1,"changed":1}','{"same":1,"changed":2}','Synthetic reason','{"accepted":true}');`;
 const old=sql('begin;set local role vws_executor;'+audit+'rollback;',db,true);baselineAudit={passed:old.code===0,error:old.error};
 check('fresh install audit works before upgrade patch',old.code===0&&sql('select revision from app.authority').out==='0');
 const unchangedBefore=sql("select md5(row_to_json(t)::text)from(select (select jsonb_agg(to_jsonb(x)order by actor_id)from app.accounts x)accounts,(select jsonb_agg(to_jsonb(x)order by actor_id)from app.sessions x)sessions,(select jsonb_agg(to_jsonb(x)order by id)from auth.users x)auth_users)t").out;
 sql(readFileSync('supabase/sql/management-retry-and-audit.sql','utf8'));
 check('upgrade patch keeps owner, security mode and singleton WHERE guard',sql("select pg_get_userbyid(p.proowner)='vws_executor'and not p.prosecdef and pg_get_functiondef(p.oid)~*'where authority_row.singleton is true'from pg_proc p where p.oid='app.audit_commit(app.accounts,uuid,text,text,text,text,text,jsonb,jsonb,text,jsonb)'::regprocedure").out==='t');
 // Re-running this specific CREATE OR REPLACE patch is safe; never rerun the schema installation.
 sql(readFileSync('supabase/sql/management-retry-and-audit.sql','utf8'));
 check('reapplying upgrade patch does not mutate data or increment revision',sql('select revision from app.authority').out==='0');
 sql('set role vws_executor;'+audit);
 check('audit emits one event, outbox entry, receipt and authority revision atomically',sql("select (select count(*)from history.audit_events)=1 and(select count(*)from integration.outbox)=1 and(select count(*)from integration.mutations)=1 and(select revision from app.authority)=1").out==='t');
 check('audit changed_fields, reason and result preserved',sql("select changed_fields='[\"changed\"]'::jsonb and reason='Synthetic reason'from history.audit_events").out==='t'&&sql("select (result->>'accepted')::bool from integration.mutations").out==='t');
 check('audit does not modify accounts sessions or Auth users',sql("select md5(row_to_json(t)::text)from(select (select jsonb_agg(to_jsonb(x)order by actor_id)from app.accounts x)accounts,(select jsonb_agg(to_jsonb(x)order by actor_id)from app.sessions x)sessions,(select jsonb_agg(to_jsonb(x)order by id)from auth.users x)auth_users)t").out===unchangedBefore);
 const m1='30000000-0000-4000-8000-000000000001',m2='30000000-0000-4000-8000-000000000002';
 const first=JSON.parse(sql('set role service_role;'+call(m1)).out);check('ADMIN creates one job',first.jobId===m1);
 const retry=JSON.parse(sql('set role service_role;'+call(m1)).out);check('same mutation retry keeps job',retry.jobId===m1);
 const resume=JSON.parse(sql('set role service_role;'+call(m2)).out);check('new browser mutation resumes existing matching job',resume.jobId===m1&&sql('select count(*)from integration.auth_jobs').out==='1');
 const conflict=sql('set role service_role;'+call(m2,'ADMIN','b'),db,true);check('changed pending request cannot create another job',conflict.code!==0&&conflict.error.includes('AUTH_JOB_PENDING'));
 const denied=sql('set role service_role;'+call(m2,'TECH'),db,true);check('TECHNICIAN cannot create accounts',denied.code!==0&&denied.error.includes('FORBIDDEN'));
 const browser=sql('set role anon;'+call(m2),db,true);check('anon cannot call account jobs',browser.code!==0&&browser.error.includes('permission denied'));
 sql(`insert into app.villages(village_id,district)values('V1','D1'),('V2','D2');insert into app.water_systems(system_id,village_id,system_name)values('S1','V1','Synthetic One'),('S2','V2','Synthetic Two');`);
 const dashboard=JSON.parse(sql("set role service_role;select api.execute('TECH-token','data.dashboard');").out);check('TECHNICIAN sees only assigned district',dashboard.waterSystems.length===1&&dashboard.waterSystems[0].system_id==='S1');
 const cross=sql("set role service_role;select api.execute('TECH-token','data.waterSystem','{\"systemId\":\"S2\"}');",db,true);check('cross-district detail is denied',cross.code!==0&&cross.error.includes('FORBIDDEN'));
 sql("update app.sessions set revoked_at=now()where actor_id='TECH'");const revoked=sql("set role service_role;select api.execute('TECH-token','data.dashboard');",db,true);check('session revocation enforced',revoked.code!==0&&revoked.error.includes('SESSION_REVOKED'));
 // A failed receipt insert must roll back the authority, audit and outbox too.
 const dup=sql('set role vws_executor;'+audit,db,true);check('audit failure rolls back all side effects',dup.code!==0&&sql("select (select count(*)from history.audit_events)=1 and(select count(*)from integration.outbox)=1 and(select revision from app.authority)=1").out==='t');
 sql("insert into auth.users values('00000000-0000-4000-8000-000000000003','new-fixture@invalid.test');");
 const finish=`select api.auth_job_finish('ADMIN-token','${m1}','00000000-0000-4000-8000-000000000003');`;
 const wrongProvider=sql('set role service_role;'+finish,db,true);
 check('Auth-job finish rejects mismatched provider identity',wrongProvider.code!==0&&wrongProvider.error.includes('AUTH_PROVIDER_MISMATCH'));
 // Model the Auth provider's actual email derived by the canonical job.
 sql(`update auth.users set email=(select provider_identity from integration.auth_jobs where job_id='${m1}')where id='00000000-0000-4000-8000-000000000003';`);
 const committed=JSON.parse(sql('set role service_role;'+finish).out);
 check('account finish uses guarded audit and increments revision once',committed.user.displayName==='Synthetic Display'&&sql('select revision from app.authority').out==='2');
 const finishedAgain=JSON.parse(sql('set role service_role;'+finish).out);
 check('completed Auth-job retry returns receipt without duplicate audit or account',finishedAgain.user.userId===committed.user.userId&&sql("select (select revision from app.authority)=2 and(select count(*)from history.audit_events)=2 and(select count(*)from app.accounts where username='new-synthetic')=1 and(select count(*)from auth.users)=3").out==='t');
}catch(e){results.push({name:'Unexpected failure',passed:false,error:e.message});process.exitCode=1;}
const report={database:db,baselineAudit,results,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,cloudIntegrationTested:false};
writeFileSync('output/git-review-fix-20261024/backend-tests.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
