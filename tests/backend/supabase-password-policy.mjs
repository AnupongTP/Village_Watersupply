// Focused LOCAL PostgreSQL proof; no Cloud URLs, credentials or real account data.
import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
const container='vws-supabase-candidate-20261023',db='vws_password_policy_'+Date.now();
const results=[];
function sql(q,database=db){const p=spawnSync('docker',['exec','-i',container,'psql','-X','-q','-t','-A','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',windowsHide:true});if(p.error)throw p.error;return{code:p.status,out:p.stdout.trim(),error:p.stderr.trim()};}
function run(q,database=db){const r=sql(q,database);if(r.code)throw Error(r.error);return r.out;}
function check(name,ok){results.push({name,passed:!!ok});if(!ok)throw Error(name);}
function denied(q,code){const r=sql(q);return r.code!==0&&r.error.includes(code);}
const patch=readFileSync('supabase/sql/disable-forced-password-change.sql','utf8');
try{
 run(`create database ${db};`,'postgres');
 run('create schema auth;create table auth.users(id uuid primary key,email text unique);create table auth.sessions(id uuid primary key,user_id uuid references auth.users);');
 for(const file of readdirSync('supabase/sql/install').sort())run(readFileSync('supabase/sql/install/'+file,'utf8'));
 run(readFileSync('supabase/sql/management-retry-and-audit.sql','utf8'));
 check('fresh install no longer blocks on the legacy flag',!run("select pg_get_functiondef('app.context(text,boolean)'::regprocedure)").includes('AUTH_PASSWORD_CHANGE_REQUIRED'));
 check('fresh reset completion stores false',!run("select pg_get_functiondef('api.auth_job_finish(text,uuid,uuid,uuid,text)'::regprocedure)").includes("must_change_password=j.action="));
 run(`insert into app.districts values('D1'),('D2');
 insert into auth.users values('00000000-0000-4000-8000-000000000001','admin@invalid.test'),('00000000-0000-4000-8000-000000000002','tech@invalid.test');
 insert into auth.sessions values('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002');
 insert into app.identities(actor_id,auth_user_id)values('ADMIN','00000000-0000-4000-8000-000000000001'),('TECH','00000000-0000-4000-8000-000000000002');
 insert into app.accounts(actor_id,username,display_name,role,district,login_identity,must_change_password)values('ADMIN','admin-fixture','Admin','ADMIN',null,'admin@invalid.test',true),('TECH','tech-fixture','Tech','TECHNICIAN','D1','tech@invalid.test',true);
 insert into app.sessions(token_hash,actor_id,auth_session_id,auth_cipher,auth_epoch)values('ADMIN-token','ADMIN','10000000-0000-4000-8000-000000000001','synthetic',1),('TECH-token','TECH','10000000-0000-4000-8000-000000000002','synthetic',1);
 insert into app.villages(village_id,district)values('V1','D1'),('V2','D2');
 insert into app.water_systems(system_id,village_id,system_name)values('S1','V1','Synthetic One'),('S2','V2','Synthetic Two');`);
 const authBefore=run('select jsonb_agg(to_jsonb(x)order by id)from auth.users x');
 const sessionsBefore=run('select jsonb_agg(to_jsonb(x)order by token_hash)from app.sessions x');
 const aclQuery="select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,p.proowner,p.proacl,p.prosecdef)order by p.oid)from pg_proc p where p.oid in('app.context(text,boolean)'::regprocedure,'app.account_json(app.accounts)'::regprocedure,'api.auth_job_finish(text,uuid,uuid,uuid,text)'::regprocedure)";
 const aclBefore=run(aclQuery);
 // Restore the old policy bodies to exercise the real existing-database upgrade.
 for(const [file,name]of [['02_202610230002_commands.sql','app.account_json'],['02_202610230002_commands.sql','app.context'],['03_202610230003_auth_jobs.sql','api.auth_job_finish']]){
  let body=readFileSync('supabase/sql/install/'+file,'utf8').match(new RegExp('create function '+name.replaceAll('.','\\.')+'\\(.*?\\$\\$;','s'))[0].replace('create function','create or replace function');
  body=body.replace("'mustChangePassword',false","'mustChangePassword',a.must_change_password").replace(" if a.role='TECHNICIAN' and coalesce(a.district", " if a.must_change_password and not allow_password then raise exception 'AUTH_PASSWORD_CHANGE_REQUIRED';end if;\n if a.role='TECHNICIAN' and coalesce(a.district").replace("must_change_password=false,record_version=record_version+1","must_change_password=j.action='technicians.resetPassword',record_version=record_version+1");
  run(body);
 }
 check('old policy reproduces the dashboard blocker',denied("set role service_role;select api.execute('TECH-token','data.dashboard');",'AUTH_PASSWORD_CHANGE_REQUIRED'));
 run(patch);
 check('upgrade clears existing flags and writes one audit per account',run("select (select count(*)from app.accounts where must_change_password)=0 and(select count(*)from history.audit_events where action='ACCOUNT_PASSWORD_POLICY_CHANGED')=2 and(select revision from app.authority)=2")==='t');
 check('upgrade does not alter Auth users, credentials or sessions',authBefore===run('select jsonb_agg(to_jsonb(x)order by id)from auth.users x')&&sessionsBefore===run('select jsonb_agg(to_jsonb(x)order by token_hash)from app.sessions x'));
 check('upgrade preserves function owners, ACLs and security modes',aclBefore===run(aclQuery));
 run(patch);check('reapplying policy patch is idempotent',run('select revision from app.authority')==='2');
 const dashboard=JSON.parse(run("set role service_role;select api.execute('TECH-token','data.dashboard');"));
 check('technician enters dashboard and remains scoped to their district',dashboard.waterSystems.length===1&&dashboard.waterSystems[0].system_id==='S1');
 check('cross-district access stays forbidden',denied("set role service_role;select api.execute('TECH-token','data.waterSystem','{\"systemId\":\"S2\"}');",'FORBIDDEN'));
 check('anonymous role still cannot access Management',denied("set role anon;select api.execute('TECH-token','data.dashboard');",'permission denied'));
 run("update app.accounts set must_change_password=true where actor_id='TECH'");
 check('legacy stale flags no longer block and API contract returns false',JSON.parse(run("set role service_role;select api.execute('TECH-token','auth.me');")).user.mustChangePassword===false);
 check('technician cannot reset another account',denied("set role service_role;select api.auth_job_begin('TECH-token','technicians.resetPassword','{}','20000000-0000-4000-8000-000000000001',repeat('a',64),'synthetic');",'FORBIDDEN'));
 const mid='30000000-0000-4000-8000-000000000001';
 const expectedVersion=run("select app.version(to_jsonb(a))from app.accounts a where actor_id='TECH'");
 run(`set role service_role;select api.auth_job_begin('ADMIN-token','technicians.resetPassword','{"userId":"TECH","expectedVersion":"${expectedVersion}"}','${mid}',repeat('a',64),'synthetic');`);
 check('reset immediately revokes old technician session',denied("set role service_role;select api.execute('TECH-token','data.dashboard');",'SESSION_REVOKED'));
 const result=JSON.parse(run(`set role service_role;select api.auth_job_finish('ADMIN-token','${mid}','00000000-0000-4000-8000-000000000002');`));
 check('reset completes without forcing password change',result.user.mustChangePassword===false&&run("select not must_change_password and status='ACTIVE'from app.accounts where actor_id='TECH'")==='t');
 const revision=run('select revision from app.authority');run(`set role service_role;select api.auth_job_finish('ADMIN-token','${mid}','00000000-0000-4000-8000-000000000002');`);
 check('reset retry does not duplicate audit or revision',run('select revision from app.authority')===revision);
 run("update app.sessions set revoked_at=null,auth_epoch=(select entitlement_version from app.accounts where actor_id='TECH'),last_activity_at=now()where actor_id='TECH'");
 const change='40000000-0000-4000-8000-000000000001';
 run(`set role service_role;select api.auth_job_begin('TECH-token','auth.changePassword','{}','${change}',repeat('b',64),'synthetic');`);
 const changed=JSON.parse(run(`set role service_role;select api.auth_job_finish('TECH-token','${change}','00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','synthetic-new-cipher');`));
 check('optional password change retains audit and valid caller session',changed.user.mustChangePassword===false&&run("select (select count(*)from history.audit_events where action='USER_PASSWORD_CHANGE')=1 and(select revoked_at is null from app.sessions where actor_id='TECH')")==='t');
 run("update app.accounts set status='DISABLED'where actor_id='TECH'");check('disabled accounts remain denied',denied("set role service_role;select api.execute('TECH-token','data.dashboard');",'AUTH_ACCOUNT_DISABLED'));
 run("update app.accounts set status='ACTIVE',district=null where actor_id='TECH'");check('missing district remains denied',denied("set role service_role;select api.execute('TECH-token','data.dashboard');",'ACCOUNT_DISTRICT_REQUIRED'));
 run("update app.accounts set district='D1'where actor_id='TECH';update app.sessions set expires_at=now()-interval '1 second'where actor_id='TECH'");check('expired sessions remain denied',denied("set role service_role;select api.execute('TECH-token','data.dashboard');",'SESSION_EXPIRED'));
}catch(e){results.push({name:'Unexpected failure',passed:false,error:e.message});process.exitCode=1;}
const report={database:db,passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length,cloudIntegrationTested:false,results};
mkdirSync('output/password-policy-local',{recursive:true});writeFileSync('output/password-policy-local/sql-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
