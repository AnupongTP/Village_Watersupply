import {test}from'node:test';
import assert from'node:assert/strict';
import vm from'node:vm';
import {readFileSync}from'node:fs';
import {webcrypto,createHash}from'node:crypto';
const source=readFileSync(new URL('../../supabase/functions/management/index.ts',import.meta.url),'utf8').split('const __columns =')[0].replace("import {createHash} from 'node:crypto';",'');
const context={createHash,crypto:webcrypto,TextEncoder,TextDecoder,atob,btoa,Response,AbortSignal,fetch};vm.createContext(context);
vm.runInContext(source+';globalThis.testEngine=__engine;globalThis.testSecurity=__security;',context);
const env={TOKEN_ENCRYPTION_KEY:'1'.repeat(64),REQUEST_HMAC_KEY:'synthetic-only',AUTH_IDENTITY_DOMAIN:'invalid.test'};
const envelope={version:2,action:'technicians.create',payload:{token:'MGT-'+'a'.repeat(64),mutationId:'30000000-0000-4000-8000-000000000002',request:{username:'synthetic',displayName:'Synthetic Display',district:'D1',password:'synthetic-password'}}};

test('system update sends only changed canonical fields, not normalized legacy blanks or metadata',()=>{
 const before={system_id:'S1',village_id:'V1',system_name:'Before',responsible_agency:null,usage_types_json:null,quality_failure_detail:null};
 const delta=JSON.parse(JSON.stringify(context.testEngine.intended(before,{system_name:'After'},[])));
 assert.deepEqual(delta,{system_name:'After'});
});

test('delta preserves dependent derived fields and intentional clearing',()=>{
 const before={system_id:'S1',village_id:'V1',system_name:'Before',construction_year_be:2551,construction_year_ce:2008,responsible_agency:'Agency',latitude:19,longitude:100};
 const delta=JSON.parse(JSON.stringify(context.testEngine.intended(before,{construction_year_be:2545,responsible_agency:'',latitude:'',longitude:''},[])));
 assert.deepEqual(delta,{responsible_agency:'',latitude:null,longitude:null,construction_year_be:2545,construction_year_ce:2002});
});

test('system owner blank remains rejected by the real backend canonicalizer; UNKNOWN is explicit and valid',()=>{
 const before={system_id:'S1',village_id:'V1',owner_type:'LOCAL_AUTHORITY',system_name:'Synthetic'};
 assert.throws(()=>context.testEngine.intended(before,{owner_type:''},[]),e=>e.mgmtCode==='VALIDATION_FAILED'&&e.mgmtDetails.field==='owner_type');
 assert.equal(context.testEngine.intended(before,{owner_type:'UNKNOWN'},[]).owner_type,'UNKNOWN');
});

test('unrelated system edits preserve legacy owner blank and supported optional enum clearing',()=>{
 const before={system_id:'S1',village_id:'V1',owner_type:'',system_name:'Synthetic',establishment_type:'LOCAL_CREATED',transfer_document_status:'AVAILABLE',water_pressure:'FLOW_CONTINUOUS'};
 const result=context.testEngine.intended(before,{system_name:'Edited',transfer_document_status:'',water_pressure:''},[]);
 assert.equal(Object.hasOwn(result,'owner_type'),false);assert.equal(result.system_name,'Edited');
 assert.equal(result.transfer_document_status,'');assert.equal(result.water_pressure,'');
});
test('conditional edit cleanup patches agree with the actual unchanged backend canonicalizer',()=>{
 const base={system_id:'S1',village_id:'V1',system_name:'Synthetic',drinking_water_quality:'FAIL',quality_failure_categories_json:'["PHYSICAL"]',quality_failure_detail:'Old detail',year_round_status:'SEASONAL',available_months_json:'["JAN"]',water_source_type:'MIXED',surface_water_type:'River',surface_water_agency:'Agency',shared_with_other_village:'YES',shared_village_name:'Other',shared_villages_json:'[{"village_id":"V2"}]',establishment_type:'TRANSFERRED',establishment_agency:'',transfer_year_be:2560,transfer_agency:'Agency',transfer_other:'Note',transfer_document_status:'AVAILABLE',transfer_document_url:'https://example.test/document'};
 const cases=[
  {patch:{drinking_water_quality:'PASS',quality_failure_categories_json:[],quality_failure_detail:''},expected:{drinking_water_quality:'PASS',quality_failure_categories_json:'[]',quality_failure_detail:''}},
  {patch:{year_round_status:'YEAR_ROUND',available_months_json:[]},expected:{year_round_status:'YEAR_ROUND',available_months_json:'[]'}},
  {patch:{water_source_type:'GROUNDWATER',surface_water_type:'',surface_water_agency:''},expected:{water_source_type:'GROUNDWATER',surface_water_type:'',surface_water_agency:''}},
  {patch:{shared_with_other_village:'NO',shared_village_name:'',shared_villages_json:[]},expected:{shared_with_other_village:'NO',shared_village_name:'',shared_villages_json:'[]'}},
  {patch:{establishment_type:'LOCAL_CREATED',transfer_year_be:'',transfer_agency:'',transfer_other:'',transfer_document_status:'',transfer_document_url:''},expected:{establishment_type:'LOCAL_CREATED',transfer_year_be:null,transfer_agency:'',transfer_other:'',transfer_document_status:'',transfer_document_url:''}},
  {before:{establishment_type:'ACCEPTED_ASSET',establishment_agency:'Agency',transfer_year_be:'',transfer_agency:'',transfer_other:'',transfer_document_status:'',transfer_document_url:''},patch:{establishment_type:'LOCAL_CREATED',establishment_agency:''},expected:{establishment_type:'LOCAL_CREATED',establishment_agency:''}}
 ];
 for(const row of cases)assert.deepEqual(JSON.parse(JSON.stringify(context.testEngine.intended({...base,...row.before},row.patch,[]))),row.expected);
 const legacy={...base,drinking_water_quality:'PASS',quality_failure_categories_json:'invalid legacy JSON',quality_failure_detail:'Kept'};
 assert.deepEqual(JSON.parse(JSON.stringify(context.testEngine.intended(legacy,{system_name:'Edited'},[]))),{system_name:'Edited'});
});

test('gateway follows canonical server job ID and reuses existing Auth identity',async()=>{
 const canonical='30000000-0000-4000-8000-000000000001';const calls=[];let providerCreates=0,providerUpdates=0;
 const cipher=await context.testSecurity.seal(env.TOKEN_ENCRYPTION_KEY,{password:'synthetic-password'});
 const engine=context.testEngine.createEngine({env,processor:()=>{throw Error('Not part of test');},auth:{create(){providerCreates++;throw Error('Duplicate provider creation');},setPassword:async()=>{providerUpdates++;}},rpc:async(name,args)=>{
  calls.push({name,args});if(name==='auth_job_begin')return{jobId:canonical,state:'PENDING'};
  if(name==='auth_job_state')return{target_auth_id:'synthetic-auth-id',provider_identity:'fixture@invalid.test',credential_cipher:cipher};
  if(name==='auth_job_finish')return{user:{displayName:'Synthetic Display'}};throw Error(name);
 }});
 const result=await engine.management(envelope);assert.equal(result.user.displayName,'Synthetic Display');assert.equal(providerCreates,0);assert.equal(providerUpdates,1);
 for(const call of calls.filter(c=>['auth_job_state','auth_job_finish'].includes(c.name)))assert.equal(call.args.mid,canonical);
 assert.equal(calls[0].args.p.displayName,'Synthetic Display');assert.equal(calls[0].args.p.password,undefined);
});
test('committed retry returns receipt without calling Auth provider',async()=>{
 const engine=context.testEngine.createEngine({env,processor:()=>{},auth:{create(){throw Error('Must not create');}},rpc:async(name)=>{assert.equal(name,'auth_job_begin');return{state:'COMMITTED',result:{done:true}};}});
 assert.equal((await engine.management(envelope)).done,true);
});
test('invalid session does not reach any provider or SQL operation',async()=>{
 const engine=context.testEngine.createEngine({env,processor:()=>{},auth:{},rpc:()=>{throw Error('Must not call');}});
 await assert.rejects(engine.management({...envelope,payload:{...envelope.payload,token:'invalid'}}),{code:'SESSION_INVALID'});
});
