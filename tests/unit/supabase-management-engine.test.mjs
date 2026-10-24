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
