// LOCAL PostgreSQL + isolated endpoint doubles only. No Cloud or real data.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {CACHE_FIELDS,buildCacheRecord,validateCacheRecord} from '../../assets/js/public-cache-model.js';

const container='vws-supabase-candidate-20261023';
const database=`vws_public_live_${Date.now()}`;
const results=[];
function sql(query,expectedFailure=false){
 const p=spawnSync('docker',['exec','-i',container,'psql','-X','-q','-t','-A','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024});
 if(p.error)throw p.error;
 if(p.status&&!expectedFailure)throw Error(p.stderr);
 return{out:p.stdout.trim(),code:p.status};
}
function check(name,run){run();results.push({name,passed:true});}
const live=()=>JSON.parse(sql('set role service_role;select api.public_snapshot();').out);
const acl=()=>sql("select jsonb_build_object('owner',pg_get_userbyid(proowner),'acl',proacl,'definer',prosecdef)from pg_proc where oid='api.public_snapshot()'::regprocedure").out;
const patch=readFileSync('supabase/sql/public-live.sql','utf8');
let handler,timing;
try{
 const created=spawnSync('docker',['exec',container,'psql','-X','-q','-U','postgres','-v','ON_ERROR_STOP=1','-c',`create database ${database}`],{encoding:'utf8',windowsHide:true});
 if(created.error)throw created.error;if(created.status)throw Error(created.stderr);
 sql('create schema auth;create table auth.users(id uuid primary key,email text unique);create table auth.sessions(id uuid primary key,user_id uuid references auth.users);');
 for(const file of readdirSync('supabase/sql/install').sort())sql(readFileSync(`supabase/sql/install/${file}`,'utf8'));
 sql(`insert into app.districts values('D1'),('D2');
 insert into app.villages(village_id,district,village_name,has_village_waterworks,source_excel_row)values
 ('V1','D1','Visible',true,9001),('V2','D1','Coordinates missing but linked',true,9002),
 ('V3','D2','No linked system',true,9003),('V4','D2','No waterworks',false,9004),('V5','D2','Pending only',true,9005);
 insert into app.water_systems(system_id,village_id,system_name,latitude,longitude,establishment_agency,transfer_document_url,shared_village_name)values
 ('S1','V1','Current synthetic',19.2,99.8,'PRIVATE-AGENCY','https://invalid.test/private','PRIVATE-NAME'),
 ('S2','V2','No coordinates',null,null,'PRIVATE-AGENCY',null,null),
 ('S3','V4','Ambiguous raw links',19.2,99.8,null,null,null),
 ('S4','V5','Pending raw',19.2,99.8,null,null,null);
 insert into ingest.submissions(submission_id,payload_hash,raw_payload,status,processed_system_id)values
 ('RAW-1','synthetic','{}','PROCESSED','S1'),('RAW-3a','synthetic','{}','PROCESSED','S3'),
 ('RAW-3b','synthetic','{}','PROCESSED','S3'),('RAW-4','synthetic','{}','PROCESSING','S4');
 insert into app.village_water_sources(source_id,village_id,source_type,households)values
 ('W1','V1','WELL',2),('W3','V3','WELL',3),('W4','V4','WELL',4),('W5','V5','WELL',5);`);
 check('baseline reproduces unavailable Public when no current snapshot exists',()=>assert.equal(sql('select api.public_snapshot()is null').out,'t'));
 // Reuse the actual existing projector as an independent R5.1 reference.
 const worker=readFileSync('supabase/functions/runtime-worker/index.ts','utf8');
 const projectionSource=worker.split('const __runtime =')[0];
 const projector={crypto:webcrypto,TextEncoder,TextDecoder,atob,btoa};
 vm.createContext(projector);vm.runInContext(projectionSource+';globalThis.project=__engine.publicProjection;',projector);
 const source=JSON.parse(sql('select api.public_source()').out);
 const expected=JSON.parse(JSON.stringify(projector.project(source)));
 // Persist a valid old snapshot, then advance authority to reproduce 1 -> 6.
 sql(`insert into integration.snapshots(scope,epoch,revision,policy,hash,payload)
 select 'PUBLIC',epoch,revision,'PUBLIC_ALLOWLIST_R5_1_V1',repeat('a',64),
 '${JSON.stringify(expected).replaceAll("'","''")}'::jsonb from app.authority;
 update app.authority set revision=6 where singleton is true;`);
 const snapshotsBefore=sql('select md5(jsonb_agg(to_jsonb(s))::text)from integration.snapshots s').out;
 const originalACL=acl();
 sql(patch);
 check('upgrade preserves existing owner, ACL and security-definer boundary',()=>assert.equal(acl(),originalACL));
 const data=live();
 check('stale or missing snapshots do not block live data at revision 6',()=>{assert.equal(data.success,true);assert.equal(data.sourceRevision,6);});
 check('all three datasets exactly match the existing server R5.1 projector',()=>{
  for(const key of Object.keys(CACHE_FIELDS))assert.deepEqual(data[key],expected[key]);
  assert.deepEqual(data.suppression,expected.suppression);
 });
 check('missing coordinates, no-system villages, pending and ambiguous raw links remain hidden',()=>{
  assert.deepEqual(data.waterSystems.map(s=>s.system_id),['S1']);
  assert.deepEqual(data.villages.map(v=>v.village_id),['V1','V2','V4']);
  assert.deepEqual(data.waterSources.map(s=>s.source_id),['W1','W4']);
 });
 check('only allowlisted public row fields and no private values are returned',()=>{
  for(const key of Object.keys(CACHE_FIELDS))for(const row of data[key])for(const field of Object.keys(row))assert.ok(CACHE_FIELDS[key].includes(field),`${key}.${field}`);
  assert.ok(!JSON.stringify(data).includes('PRIVATE-'));
 });
 check('existing public cache accepts the already-projected live payload',()=>{
  const cache=buildCacheRecord({scope:data,sourceKey:'synthetic-public'});
  assert.equal(validateCacheRecord(cache,{sourceKey:'synthetic-public'}).ok,true);
  assert.deepEqual(cache.data.villages.map(v=>v.village_id),['V1','V2','V4']);
 });
 const hash=data.datasetVersion;
 sql('update app.authority set revision=7 where singleton is true');
 check('unrelated revision increments do not block reads or change public-content hash',()=>{const d=live();assert.equal(d.sourceRevision,7);assert.equal(d.datasetVersion,hash);});
 sql("begin;update app.water_systems set system_name='Edited synthetic'where system_id='S1';update app.authority set revision=8;commit;");
 check('committed update appears on the next request without Worker',()=>{const d=live();assert.equal(d.waterSystems[0].system_name,'Edited synthetic');assert.equal(d.sourceRevision,8);assert.notEqual(d.datasetVersion,hash);});
 sql("begin;insert into app.water_systems(system_id,village_id,system_name,latitude,longitude)values('S5','V3','New linked system',19.3,100.1);update app.authority set revision=9;commit;");
 check('committed insert restores its village and water sources',()=>{const d=live();assert.ok(d.waterSystems.some(s=>s.system_id==='S5'));assert.ok(d.villages.some(v=>v.village_id==='V3'));assert.ok(d.waterSources.some(s=>s.source_id==='W3'));});
 sql("begin;delete from app.water_systems where system_id='S5';update app.authority set revision=10;commit;");
 check('committed delete and resulting suppression propagate immediately',()=>{const d=live();assert.equal(d.sourceRevision,10);assert.ok(!d.waterSystems.some(s=>s.system_id==='S5'));assert.ok(!d.villages.some(v=>v.village_id==='V3'));assert.ok(!d.waterSources.some(s=>s.source_id==='W3'));});
 for(const role of ['anon','authenticated'])check(`${role} cannot bypass Edge Function with direct RPC`,()=>assert.notEqual(sql(`set role ${role};select api.public_snapshot();`,true).code,0));
 check('reader is STABLE and remains service-only',()=>assert.equal(sql("select provolatile='s'and has_function_privilege('service_role',oid,'EXECUTE')and not has_function_privilege('anon',oid,'EXECUTE')and not has_function_privilege('authenticated',oid,'EXECUTE')from pg_proc where oid='api.public_snapshot()'::regprocedure").out,'t'));
 const before=sql("select md5(row_to_json(t)::text)from(select(select jsonb_agg(to_jsonb(a))from app.authority a)authority,(select jsonb_agg(to_jsonb(s))from app.sessions s)sessions,(select count(*)from history.audit_events)audit,(select count(*)from integration.outbox)outbox)t").out;
 const samples=[];for(let i=0;i<5;i++){const start=performance.now();live();samples.push(performance.now()-start);}
 timing={fixtureSystems:4,samplesMsIncludingDockerAndPsql:samples,productionLatencyMeasured:false};
 check('reads do not write authority, sessions, audit, outbox or snapshots',()=>{
  assert.equal(sql("select md5(row_to_json(t)::text)from(select(select jsonb_agg(to_jsonb(a))from app.authority a)authority,(select jsonb_agg(to_jsonb(s))from app.sessions s)sessions,(select count(*)from history.audit_events)audit,(select count(*)from integration.outbox)outbox)t").out,before);
  assert.equal(sql('select md5(jsonb_agg(to_jsonb(s))::text)from integration.snapshots s').out,snapshotsBefore);
 });
 sql(patch);check('specific patch is reapplicable without data or grant changes',()=>{assert.equal(acl(),originalACL);assert.equal(live().sourceRevision,10);});
 const endpoint=readFileSync('supabase/functions/public-data/index.ts','utf8').replace('req:Request','req');
 const context={crypto:webcrypto,TextEncoder,TextDecoder,atob,btoa,Response,AbortSignal,
  Deno:{env:{toObject:()=>({SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only'})},serve:fn=>{handler=fn;}},
  fetch:async url=>{assert.equal(url,'https://synthetic.invalid/rest/v1/rpc/public_snapshot');return Response.json(live());}};
 vm.createContext(context);vm.runInContext(endpoint,context);
 const response=await handler(new Request('https://synthetic.invalid/public-data'));
 check('unchanged actual Edge handler returns HTTP 200 with live RPC result',()=>{assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');});
 assert.equal((await response.json()).sourceRevision,10);
 const options=await handler(new Request('https://synthetic.invalid/public-data',{method:'OPTIONS'}));
 check('existing CORS OPTIONS and method restrictions stay intact',()=>assert.equal(options.status,204));
 assert.equal((await handler(new Request('https://synthetic.invalid/public-data',{method:'POST'}))).status,405);
 const originalFetch=globalThis.fetch;
 try{
  globalThis.fetch=async(url,options)=>{
   assert.equal(url,'https://wfxudiciylpcmjbecbhk.supabase.co/functions/v1/public-data');
   return handler(new Request(url,options));
  };
  const {loadData}=await import('../../assets/js/api.js');
  const clientData=await loadData();
  check('unchanged actual Public client accepts the live endpoint contract',()=>assert.equal(clientData.sourceRevision,10));
 }finally{globalThis.fetch=originalFetch;}
 // A real second PostgreSQL connection commits while a single reader statement
 // is sleeping between two calls. Both calls must retain the original version.
 const reader=spawn('docker',['exec','-i',container,'psql','-X','-q','-t','-A','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],{windowsHide:true});
 let readerOutput='',readerError='';
 reader.stdout.on('data',b=>{readerOutput+=b;});reader.stderr.on('data',b=>{readerError+=b;});
 const readerDone=new Promise((resolve,reject)=>{reader.on('error',reject);reader.on('close',code=>code?reject(Error(readerError)):resolve());});
 reader.stdin.end("set application_name='vws_public_read_probe';set role service_role;select jsonb_build_object('before',api.public_snapshot(),'pause',pg_sleep(3),'after',api.public_snapshot());");
 let sleeping=false;
 for(let i=0;i<20;i++){
  sleeping=sql("select exists(select 1 from pg_stat_activity where application_name='vws_public_read_probe'and wait_event='PgSleep')").out==='t';
  if(sleeping)break;
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 assert.ok(sleeping,'concurrent reader did not reach synchronization point');
 sql("begin;update app.water_systems set system_name='Concurrent committed'where system_id='S1';update app.authority set revision=11;commit;");
 await readerDone;
 const concurrent=JSON.parse(readerOutput.trim());
 check('concurrent commit cannot mix data or revision within a single read statement',()=>{
  assert.equal(concurrent.before.sourceRevision,10);assert.equal(concurrent.after.sourceRevision,10);
  assert.deepEqual(concurrent.before.waterSystems,concurrent.after.waterSystems);
  assert.equal(live().sourceRevision,11);assert.equal(live().waterSystems[0].system_name,'Concurrent committed');
 });
 // Production-shaped counts, invented fields only. No real import is accessed.
 sql(`insert into app.villages(village_id,district,village_name,has_village_waterworks)
 select 'BENCH-V-'||i,case when i%2=0 then 'D1'else 'D2'end,'Invented village '||i,i<=729 from generate_series(1,802)i;
 insert into app.water_systems(system_id,village_id,system_name,latitude,longitude)
 select 'BENCH-S-'||i,'BENCH-V-'||i,'Invented system '||i,19.2,100.1 from generate_series(1,729)i;`);
 const benchSource=JSON.parse(sql('select api.public_source()').out);
 const benchExpected=JSON.parse(JSON.stringify(projector.project(benchSource)));
 check('807-village / 733-system synthetic fixture retains exact existing R5.1 output',()=>{
  assert.equal(benchSource.villages.length,807);assert.equal(benchSource.waterSystems.length,733);
  const d=live();for(const key of Object.keys(CACHE_FIELDS))assert.deepEqual(d[key],benchExpected[key]);
  assert.deepEqual(d.suppression,benchExpected.suppression);
 });
 const plans=[];
 for(let i=0;i<3;i++)plans.push(JSON.parse(sql('set role service_role;explain(analyze,format json)select api.public_snapshot();').out)[0]['Execution Time']);
 timing.productionShapedFixture={villages:807,systems:733,databaseExecutionMs:plans,productionDataUsed:false};
 // The new reader must not silently return data without source authority.
 check('missing authority fails closed within the same SQL statement',()=>assert.equal(sql('begin;delete from app.authority;select api.public_snapshot()is null;rollback;').out,'t'));
}catch(error){results.push({name:'Unexpected failure',passed:false,error:error.message});process.exitCode=1;}
const report={database,results,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,skipped:0,timing,cloudIntegrationTested:false};
mkdirSync('output/public-live-local',{recursive:true});
writeFileSync('output/public-live-local/tests.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
