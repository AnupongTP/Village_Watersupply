// Real LOCAL SQL + bundled gateway, synthetic records only. No Cloud or Auth provider.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {webcrypto,createHash} from 'node:crypto';
import vm from 'node:vm';
const container='vws-supabase-candidate-20261023',database=`vws_delta_${Date.now()}`;
const results=[];
const quote=value=>value==null?'null':"'"+String(value).replaceAll("'","''")+"'";
function sql(query,db=database){const r=spawnSync('docker',['exec','-i',container,'psql','-X','-q','-t','-A','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true});if(r.error)throw r.error;if(r.status)throw Error(r.stderr);return r.stdout.trim();}
function check(name,fn){fn();results.push({name,passed:true});}
const token='MGT-'+'a'.repeat(64),t=createHash('sha256').update(token).digest('hex');
try{
 sql(`create database ${database}`,'postgres');
 sql('create schema auth;create table auth.users(id uuid primary key,email text unique);create table auth.sessions(id uuid primary key,user_id uuid references auth.users);');
 for(const file of readdirSync('supabase/sql/install').sort())sql(readFileSync(`supabase/sql/install/${file}`,'utf8'));
 sql(readFileSync('supabase/sql/management-retry-and-audit.sql','utf8'));
 const functionIdentity=()=>sql("select jsonb_agg(jsonb_build_object('name',proname,'owner',proowner,'acl',proacl,'definer',prosecdef)order by proname)from pg_proc where oid in('app.entity_history(app.accounts,text,integer)'::regprocedure,'app.audit_commit(app.accounts,uuid,text,text,text,text,text,jsonb,jsonb,text,jsonb)'::regprocedure)");
 const ownersBefore=functionIdentity();
 sql(readFileSync('supabase/sql/history-and-summary.sql','utf8'));
 check('history/summary patch preserves existing function ownership and ACL',()=>assert.equal(functionIdentity(),ownersBefore));
 sql(`insert into app.districts values('D1');
 insert into auth.users values('00000000-0000-4000-8000-000000000001','fixture@invalid.test');
 insert into auth.sessions values('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
 insert into app.identities(actor_id,auth_user_id)values('ADMIN','00000000-0000-4000-8000-000000000001');
 insert into app.accounts(actor_id,username,display_name,role,login_identity)values('ADMIN','synthetic-admin','Synthetic','ADMIN','fixture@invalid.test');
 insert into app.sessions(token_hash,actor_id,auth_session_id,auth_cipher,auth_epoch)values('${t}','ADMIN','10000000-0000-4000-8000-000000000001','synthetic',1);
 insert into app.villages(village_id,district)values('V1','D1');
 insert into app.water_systems(system_id,village_id,system_name,owner_type,construction_year_be,construction_year_ce)
 values('S1','V1','Original synthetic','VILLAGE_OR_OTHER',2551,2008);`);
 const rawSource=readFileSync('supabase/functions/management/index.ts','utf8').split('const __columns =')[0].replace("import {createHash} from 'node:crypto';",'');
 const ctx={createHash,crypto:webcrypto,TextEncoder,TextDecoder,atob,btoa,Response,AbortSignal,fetch};
 vm.createContext(ctx);vm.runInContext(rawSource+';globalThis.engine=__engine;',ctx);
 const sent=[];
 const engine=ctx.engine.createEngine({env:{TOKEN_ENCRYPTION_KEY:'1'.repeat(64),REQUEST_HMAC_KEY:'synthetic',AUTH_IDENTITY_DOMAIN:'invalid.test'},auth:{},processor:()=>{throw Error('Not part of test');},rpc:async(name,p)=>{
  let q;
  if(name==='receipt')q=`select api.receipt(${quote(p.t)},${quote(p.mid)},${quote(p.rhash)});`;
  else if(name==='execute'){
   if(p.action==='data.updateWaterSystem')sent.push(p.payload.intended);
   q=`select api.execute(${quote(p.token_hash)},${quote(p.action)},${quote(JSON.stringify(p.payload))}::jsonb,${quote(p.mutation_id)},${quote(p.request_hash)});`;
  }else throw Error('Unexpected RPC '+name);
  const value=sql('set role service_role;'+q);return value?JSON.parse(value):null;
 }});
 const get=()=>JSON.parse(sql(`set role service_role;select api.execute('${t}','data.waterSystem','{"systemId":"S1"}');`)).system;
 const update=(patch,mid,version=get().recordVersion)=>engine.management({version:2,action:'data.updateWaterSystem',payload:{token,mutationId:mid,request:{systemId:'S1',expectedVersion:version,patch,reason:'Synthetic test'}}});
 const firstId='30000000-0000-4000-8000-000000000001',firstVersion=get().recordVersion;
 const result=await update({system_name:'Edited synthetic'},firstId,firstVersion);
 check('actual SQL/gateway commits a one-field name update',()=>{assert.equal(result.system.system_name,'Edited synthetic');assert.deepEqual(JSON.parse(JSON.stringify(sent[0])),{system_name:'Edited synthetic'});});
 check('committed response includes authoritative raw before/after with NULL preserved',()=>{
  assert.equal(result.changeSummary.before.system_name,'Original synthetic');assert.equal(result.changeSummary.after.system_name,'Edited synthetic');
  assert.equal(result.changeSummary.before.responsible_agency,null);assert.equal(result.changeSummary.after.responsible_agency,null);
 });
 check('untouched nullable fields remain SQL NULL, not empty strings',()=>assert.equal(sql("select responsible_agency is null and usage_types_json is null and quality_failure_detail is null and shared_villages_json is null and water_pressure is null from app.water_systems where system_id='S1'"),'t'));
 const fields=JSON.parse(sql(`select changed_fields from history.audit_events where mutation_id='${firstId}'`));
 check('audit records only requested name plus three SQL metadata fields',()=>assert.deepEqual(fields.sort(),['system_name','updated_at','record_version','last_mutation_id'].sort()));
 const historical=sql(`select md5(to_jsonb(a)::text)from history.audit_events a where mutation_id='${firstId}'`);
 const replay=await update({system_name:'Edited synthetic'},firstId,firstVersion);
 check('idempotent replay returns the identical committed change summary',()=>assert.deepEqual(replay.changeSummary,result.changeSummary));
 check('same-mutation retry adds no audit event or authority revision',()=>assert.equal(sql('select (select count(*)from history.audit_events)=1 and(select revision from app.authority)=1'),'t'));
 await update({construction_year_be:2545,owner_type:'LOCAL_AUTHORITY'},'30000000-0000-4000-8000-000000000002');
 check('derived Gregorian year persists alongside the explicitly edited fields',()=>assert.equal(sql("select construction_year_be=2545 and construction_year_ce=2002 and owner_type='LOCAL_AUTHORITY'and responsible_agency is null from app.water_systems where system_id='S1'"),'t'));
 await update({responsible_agency:'Agency'},'30000000-0000-4000-8000-000000000003');
 await update({responsible_agency:''},'30000000-0000-4000-8000-000000000004');
 check('intentional clearing of a previously nonblank text field remains supported',()=>assert.equal(sql("select responsible_agency=''and quality_failure_detail is null from app.water_systems where system_id='S1'"),'t'));
 check('earlier before/after audit evidence is never rewritten',()=>assert.equal(sql(`select md5(to_jsonb(a)::text)from history.audit_events a where mutation_id='${firstId}'`),historical));
 await assert.rejects(update({owner_type:''},'30000000-0000-4000-8000-000000000005'),e=>e.mgmtCode==='VALIDATION_FAILED');
 check('invalid owner blank still fails without database/audit changes',()=>assert.equal(sql('select (select count(*)from history.audit_events)=4 and(select revision from app.authority)=4'),'t'));
 const history=JSON.parse(sql(`set role service_role;select api.execute('${t}','data.entityHistory','{"entityId":"S1"}');`));
 check('authorized history returns before/after for all four committed edits',()=>{assert.equal(history.history.length,4);assert.equal(history.history[0].before.responsible_agency,'Agency');assert.equal(history.history[0].after.responsible_agency,'');});
 check('history sanitizer rejects unknown credential fields even in old JSON',()=>{
  const safe=JSON.parse(sql(`select app.system_history_values('{"system_name":"Kept","password":"do-not-export","token":"do-not-export","secret_note":"do-not-export"}',(select a from app.accounts a where actor_id='ADMIN'));`));assert.deepEqual(safe,{system_name:'Kept'});
 });
 sql("insert into app.districts values('D2');insert into app.identities(actor_id)values('TECH');insert into app.accounts(actor_id,username,display_name,role,district,login_identity)values('TECH','synthetic-tech','Synthetic Tech','TECHNICIAN','D2','tech@invalid.test');");
 check('different-district technician cannot read before/after history',()=>{
  const h=JSON.parse(sql("set role vws_executor;select app.entity_history((select a from app.accounts a where actor_id='TECH'),'S1',200);"));assert.deepEqual(h.history,[]);
 });
 const legacy={audit_id:'OLD-1',action:'SYSTEM_UPDATE',timestamp:'2026-01-01T00:00:00+07:00',entity_type:'WATER_SYSTEM',entity_id:'S1',username_snapshot:'legacy',role_snapshot:'ADMIN',changed_fields_json:'["system_name"]',before_json:JSON.stringify({village_id:'V1',system_name:'Legacy before',password:'never-return'}),after_json:JSON.stringify({village_id:'V1',system_name:'Legacy after',token:'never-return'})};
 sql(`insert into history.legacy_audit(import_identity,cells,classification)values('synthetic-old',${quote(JSON.stringify(legacy))},'COMMITTED');`);
 const withLegacy=JSON.parse(sql(`set role service_role;select api.execute('${t}','data.entityHistory','{"entityId":"S1"}');`));
 check('legacy history remains visible with sanitized before/after and role checks',()=>{const h=withLegacy.history.find(x=>x.auditId==='OLD-1');assert.equal(h.before.system_name,'Legacy before');assert.equal(h.after.system_name,'Legacy after');assert.equal(JSON.stringify(h).includes('never-return'),false);});
 sql("insert into app.villages(village_id,district)values('V2','D2'),('V3','D1');update app.accounts set district='D1'where actor_id='TECH';");
 const sharedJSON=quote(JSON.stringify({shared_villages_json:JSON.stringify([{village_id:'V2'},{village_id:'V3'}]),shared_village_name:'Cross-district legacy name'}));
 check('Technician before-after values filter cross-district shared villages like current detail reads',()=>{
  const limited=JSON.parse(sql(`set role vws_executor;select app.system_history_values(${sharedJSON}::jsonb,(select a from app.accounts a where actor_id='TECH'));`));
  assert.deepEqual(JSON.parse(limited.shared_villages_json),[{village_id:'V3'}]);assert.equal(limited.shared_village_name,'');
 });
 check('invalid legacy shared JSON is redacted for Technician without breaking other history values',()=>{
  const safe=JSON.parse(sql(`set role vws_executor;select app.system_history_values('{"system_name":"Kept","shared_villages_json":"invalid private text","shared_village_name":"private"}',(select a from app.accounts a where actor_id='TECH'));`));
  assert.equal(safe.system_name,'Kept');assert.equal(Object.hasOwn(safe,'shared_villages_json'),false);assert.deepEqual(safe.historyRedactedFields,['shared_villages_json','shared_village_name']);
 });
 sql(readFileSync('supabase/sql/history-and-summary.sql','utf8'));
 check('reapplying history patch does not rewrite events or authority',()=>assert.equal(sql(`select (select revision from app.authority)=4 and(select count(*)from history.audit_events)=4 and(select count(*)from history.legacy_audit)=1 and(select md5(to_jsonb(a)::text)from history.audit_events a where mutation_id='${firstId}')=${quote(historical)}`),'t'));
}catch(e){results.push({name:'Unexpected failure',passed:false,error:e.message});process.exitCode=1;}
const report={database,results,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,skipped:0,cloudIntegrationTested:false};
mkdirSync('output/system-delta-local',{recursive:true});writeFileSync('output/system-delta-local/tests.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
