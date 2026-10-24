import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=readFileSync(new URL('../../technician/assets/supabase-transport.js',import.meta.url),'utf8');
function boot(store=new Map(),blocked=false){
 const context={window:{},TextEncoder,crypto:webcrypto,sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>{if(blocked)throw Error();store.set(k,v);},removeItem:k=>store.delete(k)}};
 vm.createContext(context);vm.runInContext(source,context);return context.window.VWSSupabaseTransport;
}
const request=()=>({token:'synthetic-session-only',request:{username:'synthetic-account',displayName:'Synthetic Account',district:'Synthetic District',password:'synthetic-password-only'}});
test('only exact authorized project management URL is allowed',()=>{
 const t=boot();assert(t.allowed('https://wfxudiciylpcmjbecbhk.supabase.co/functions/v1/management'));
 for(const url of ['https://other.invalid/functions/v1/management','http://localhost/management','https://wfxudiciylpcmjbecbhk.supabase.co/functions/v1/management?x=1','https://script.google.com/macros/s/fixture/exec'])assert(!t.allowed(url));
});
test('pending retry and page refresh retain original mutation ID and displayName',async()=>{
 const store=new Map(),t=boot(store),p=request();const first=await t.payload('technicians.create',p);
 await t.received('technicians.create',p,{success:false,error:{code:'AUTH_JOB_PENDING'}});
 const second=await boot(store).payload('technicians.create',p);assert.equal(first.mutationId,second.mutationId);assert.equal(second.request.displayName,p.request.displayName);
});
test('unresolved creation cannot turn edited fields into a new Auth job',async()=>{
 const t=boot(),p=request();await t.payload('technicians.create',p);
 await assert.rejects(t.payload('technicians.create',{...p,request:{...p.request,username:'different'}}),{code:'AUTH_JOB_PENDING'});
});
test('journal contains only opaque IDs and noncredential fingerprints',async()=>{
 const store=new Map(),t=boot(store),p=request();await t.payload('technicians.create',p);
 const serialized=[...store.values()].join('');for(const value of [p.token,...Object.values(p.request)])assert(!serialized.includes(value));
 const passwordHash=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(p.request.password))).toString('hex');assert(!serialized.includes(passwordHash));
 const first=await t.payload('technicians.create',p);const changed=await t.payload('technicians.create',{...p,request:{...p.request,password:'different-synthetic-secret'}});assert.equal(first.mutationId,changed.mutationId);
});
test('unknown commit and idempotency conflict never discard recovery ID',async()=>{
 const t=boot(),p=request(),first=await t.payload('technicians.create',p);
 for(const code of ['UNKNOWN_COMMIT','SERVER_ERROR','IDEMPOTENCY_CONFLICT']){await t.received('technicians.create',p,{success:false,error:{code}});assert.equal((await t.payload('technicians.create',p)).mutationId,first.mutationId);}
});
test('successful and definitive rejected writes release journal slots',async()=>{
 const store=new Map(),t=boot(store),p=request();await t.payload('technicians.create',p);await t.received('technicians.create',p,{success:true});assert.equal(store.size,0);
 await t.payload('technicians.create',p);await t.received('technicians.create',p,{success:false,error:{code:'VALIDATION_FAILED'}});assert.equal(store.size,0);
});
test('storage failure and corrupt recovery metadata fail before dispatch',async()=>{
 await assert.rejects(boot(new Map(),true).payload('technicians.create',request()),{code:'CLIENT_RECOVERY_UNAVAILABLE'});
 await assert.rejects(boot(new Map([['vws_supabase_mutations_v1','broken']])).payload('technicians.create',request()),{code:'CLIENT_RECOVERY_UNAVAILABLE'});
});
test('same request in different sessions does not borrow another session ID',async()=>{
 const t=boot(),p=request();assert.notEqual((await t.payload('technicians.create',p)).mutationId,(await t.payload('technicians.create',{...p,token:'other-synthetic-session'})).mutationId);
});
