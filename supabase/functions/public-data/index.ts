// Single-file packaging of the existing Village_Watersupply public-data endpoint.
// Only module packaging/import paths changed; no business logic changes.


// Original: backend/shared/security.mjs
const __security = (() => {

const enc=new TextEncoder();
const fail=(code,message=code)=>Object.assign(new Error(message),{code});
async function sha(v){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(v)))].map(v=>v.toString(16).padStart(2,'0')).join('');}
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
async function requestHash(secret,v){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(JSON.stringify(stable(v)))))].map(v=>v.toString(16).padStart(2,'0')).join('');}
function unhex(v){if(!/^[0-9a-f]{64}$/i.test(v))throw fail('CRYPTO_CONFIGURATION');return Uint8Array.from(v.match(/../g),v=>parseInt(v,16));}
async function seal(secret,value){const key=await crypto.subtle.importKey('raw',unhex(secret),'AES-GCM',false,['encrypt']);const iv=crypto.getRandomValues(new Uint8Array(12));const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(value)));return btoa(String.fromCharCode(...iv))+'.'+btoa(String.fromCharCode(...new Uint8Array(bytes)));}
async function open(secret,cipher){const [a,b]=cipher.split('.');const key=await crypto.subtle.importKey('raw',unhex(secret),'AES-GCM',false,['decrypt']);return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:Uint8Array.from(atob(a),c=>c.charCodeAt(0))},key,Uint8Array.from(atob(b),c=>c.charCodeAt(0)))));}
function jwtClaims(token){try{return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(token.split('.')[1].replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0))));}catch{throw fail('AUTH_INVALID');}}
function password(value){if(typeof value!=='string'||value.length<8||value.length>128)throw fail('VALIDATION_FAILED','กรุณากำหนดรหัสผ่านอย่างน้อย 8 ตัวอักษร และไม่เกิน 128 ตัวอักษร');}
function knownError(e){const source=e.code||e.mgmtCode||String(e.message||'');const names=['WORKFLOW_RETIRED','CONFLICT','FORBIDDEN','NOT_FOUND','SESSION_INVALID','SESSION_EXPIRED','SESSION_REVOKED','SESSION_IDLE_EXPIRED','AUTH_INVALID','AUTH_ACCOUNT_DISABLED','AUTH_ACCOUNT_DELETED','AUTH_PASSWORD_CHANGE_REQUIRED','ACCOUNT_DISTRICT_REQUIRED','VALIDATION_FAILED','IMMUTABLE_FIELD','IDEMPOTENCY_REQUIRED','IDEMPOTENCY_CONFLICT','USERNAME_IN_USE','PROCESSING_NOT_READY','RAW_FIRST_REQUIRED','BASE_EXPIRED','TOMBSTONED','AUTH_JOB_PENDING','RATE_LIMITED','SYNC_CONFIGURATION','UNKNOWN_COMMIT'];return names.find(n=>source===n||source.includes(' '+n)||source.startsWith(n))||'SERVER_ERROR';}

return {fail, sha, stable, requestHash, seal, open, jwtClaims, password, knownError};
})();


// Original: backend/shared/supabase.mjs
const __supabase = (() => {
const {fail} = __security;

function supabase(env,fetcher=fetch){const url=env.SUPABASE_URL?.replace(/\/$/,'');const service=env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!service)throw fail('SYNC_CONFIGURATION');
 async function call(path,{method='POST',body,token=service,headers={}}={}){let r;try{r=await fetcher(url+path,{method,headers:{apikey:service,Authorization:'Bearer '+token,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}catch{throw fail('UNKNOWN_COMMIT');}
 let j;try{j=await r.json();}catch{j={};}if(!r.ok)throw fail(j.message||'AUTH_INVALID');return j;}
 return {
 rpc:(name,args)=>{if(!/^[a-z_]+$/.test(name))throw fail('INVALID_RPC');return call('/rest/v1/rpc/'+name,{body:args,headers:{'Content-Profile':'api','Accept-Profile':'api'}});},
 auth:{
  async login(identity,password){const a=await call('/auth/v1/token?grant_type=password',{body:{email:identity,password}});await call('/auth/v1/user',{method:'GET',token:a.access_token});return a;},
  create:(email,password)=>call('/auth/v1/admin/users',{body:{email,password,email_confirm:true}}),
  setPassword:(id,password)=>call('/auth/v1/admin/users/'+encodeURIComponent(id),{method:'PUT',body:{password}}),
  delete:id=>call('/auth/v1/admin/users/'+encodeURIComponent(id),{method:'DELETE'}),
  async change(identity,current,newPassword){const a=await this.login(identity,current);await call('/auth/v1/user',{method:'PUT',token:a.access_token,body:{password:newPassword}});return a;},
  logout:async token=>{try{await call('/auth/v1/logout?scope=local',{token,body:{}});}catch(e){if(e.code==='UNKNOWN_COMMIT')throw e;}},
 },
 };
}

return {supabase};
})();


// Original: supabase/functions/public-data/index.ts
const {supabase} = __supabase;

const env=Deno.env.toObject();const {rpc}=supabase(env);
Deno.serve(async(req:Request)=>{if(req.method!=='GET'&&req.method!=='OPTIONS')return new Response('Method denied',{status:405});const headers={'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'};
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});try{const data=await rpc('public_snapshot',{});if(!data)return Response.json({success:false,message:'ข้อมูลกำลังปรับปรุง กรุณาลองใหม่'},{status:503,headers});return Response.json(data,{headers});}
 catch{return Response.json({success:false,message:'ยังไม่สามารถโหลดข้อมูลได้'},{status:503,headers});}});

