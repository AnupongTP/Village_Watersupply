import fs from 'node:fs';
import path from 'node:path';
import { repoRoot, resolveUiSourcePath, resolveUiSourceRoot } from './source-root.mjs';
export const candidate=resolveUiSourceRoot();
export const fixture={villages:[
 {village_id:'v1',village_name:'บ้านทดสอบจุน',district:'จุน',local_authority:'เทศบาลจุน',has_village_waterworks:true,pwa_households:10,mwa_households:0,commercial_households:0,other_village_pipe_households:0,waterbank_households:0,self_source_households:5,natural_source_households:0},
 {village_id:'v2',village_name:'บ้านทดสอบเชียงคำ',district:'เชียงคำ',local_authority:'เทศบาลเชียงคำ',has_village_waterworks:true}
],waterSystems:[
 {system_id:'s1',village_id:'v1',system_name:'ระบบทดสอบหนึ่ง',latitude:19.3,longitude:100.1,system_type:'SURFACE_SMALL',operational_status:'WORKING',drinking_water_quality:'PASS',water_quantity:'SUFFICIENT',utility_water_quality:'USABLE',capacity_m3_hr:5,construction_year_be:2549},
 {system_id:'s2',village_id:'v2',system_name:'ระบบทดสอบสอง',latitude:19.4,longitude:100.2,system_type:'GROUNDWATER_SMALL',operational_status:'NOT_WORKING',drinking_water_quality:'FAIL',water_quantity:'INSUFFICIENT',utility_water_quality:'NOT_USABLE',capacity_m3_hr:10,construction_year_be:2555}
],waterSources:[]};
export async function openReference(page,options={}){
 const source=options.dataset||fixture;
 const errors=[],unexpected=[],calls=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.origin==='https://wfxudiciylpcmjbecbhk.supabase.co'){
   const env=route.request().postDataJSON(),user=options.user||{user_id:'tech',username:'synthetic-tech',displayName:'ช่างทดสอบ',role:'TECHNICIAN',district:'จุน',mustChangePassword:false};calls.push(env);
   const rows=user.role==='ADMIN'?source:{...source,villages:source.villages.slice(0,1),waterSystems:source.waterSystems.slice(0,1)};
   const system={...rows.waterSystems[0],managementMutable:true,recordVersion:'b'.repeat(64),processingGuard:{mutable:true},recordStatus:'ACTIVE',publicVisible:true,village:rows.villages[0]};
   const responses={'auth.login':{token:'MGT-'+ 'a'.repeat(64),user},'auth.me':{user},'data.bootstrap':{user,permissions:['UPDATE_SYSTEM','DELETE_SYSTEM'],featureFlags:{managementRead:true,technicianDistrictScope:true},enumCatalog:{}},'data.dashboard':{...rows,generatedAt:'2026-11-16T00:00:00Z'},'data.waterSystem':{system},'auth.logout':{}};
   const response=(await options.respond?.(env,{success:true,data:responses[env.action]||{items:[]}},calls))||{success:true,data:responses[env.action]||{items:[]}};
   return route.fulfill({json:response});
  }
  if(u.origin==='https://reference.test'){
   if(u.pathname==='/technician/assets/config.js')return route.fulfill({contentType:'text/javascript',body:"window.VWS_MANAGEMENT_CONFIG={endpoint:'https://wfxudiciylpcmjbecbhk.supabase.co/functions/v1/management'};"});
   if(u.pathname==='/assets/js/config.js')return route.fulfill({contentType:'text/javascript',body:"export const CONFIG={USE_MOCK_DATA:true,API_URL:''};"});
   const mock={'villages.json':source.villages,'water_systems.json':source.waterSystems,'village_water_sources.json':source.waterSources};
   if(u.pathname.startsWith('/data/mock/')&&options.failMock?.())return route.fulfill({status:503,body:'Synthetic unavailable'});
   if(u.pathname.startsWith('/data/mock/')&&mock[path.basename(u.pathname)])return route.fulfill({json:mock[path.basename(u.pathname)]});
   const pathname=u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname;
   const rel=decodeURIComponent(pathname).replace(/^\/+/,'');
   const file=resolveUiSourcePath(rel);
   const allowed=file.startsWith(candidate+path.sep)||(file.startsWith(repoRoot+path.sep)&&/^(?:data\/mock|tools)\//.test(rel));
   if(!allowed||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:'Not found'});
   return route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
  }
  if(u.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
  if(u.hostname.includes('arcgisonline.com')||u.hostname.endsWith('.tile.openstreetmap.org'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e2e8f0"/></svg>'});
  unexpected.push(u.href);return route.abort();
 });
 await page.goto('https://reference.test'+(options.technician?'/technician/':''));
 return {errors,unexpected,calls};
}



