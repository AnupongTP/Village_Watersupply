/* Canonical, storage-free data boundary for the reference presentation. */
((g)=>{
 'use strict';
 const villageFields='village_id province district subdistrict local_authority village_no village_name has_village_waterworks pwa_households mwa_households commercial_households other_village_pipe_households waterbank_households self_source_households natural_source_households'.split(' ');
 const systemFields='system_id village_id system_name latitude longitude operational_status drinking_water_quality water_quantity households_served owner_type system_type water_source_type capacity_m3_hr usage_type construction_year_be utility_water_quality shared_with_other_village establishment_type transfer_year_be transfer_document_status'.split(' ');
 const hhFields=['pwa_households','mwa_households','commercial_households','other_village_pipe_households','waterbank_households','self_source_households','natural_source_households'];
 const currentYearBE=()=>Number(new Intl.DateTimeFormat('en-US-u-ca-buddhist',{year:'numeric',timeZone:'Asia/Bangkok'}).formatToParts(new Date()).find(p=>p.type==='year').value);
 const num=x=>!['number','string'].includes(typeof x)||String(x).trim()===''||!Number.isFinite(Number(x))?null:Number(x);
 const nonnegative=x=>{const n=num(x);return n!==null&&n>=0?n:null;};
 const bool=x=>{const v=typeof x==='string'?x.trim():x,u=typeof v==='string'?v.toUpperCase():v;return [true,1,'1','TRUE','YES','มีประปาหมู่บ้าน','มี'].includes(u)||[true,1].includes(v)?true:[false,0,'0','FALSE','NO','ไม่มีประปาหมู่บ้าน','ไม่มี'].includes(u)||[false,0].includes(v)?false:null;};
 const code=(value,allowed,fallback)=>allowed.includes(value)?value:fallback;
 const text=x=>String(x??'');
 const norm=x=>text(x).normalize('NFKC').toLocaleLowerCase('th-TH').trim();
 const tid=x=>text(x).trim();
 const unique=(rows,id)=>[...new Map((rows||[]).filter(x=>x&&tid(x[id])).map(x=>[tid(x[id]),{...x,[id]:tid(x[id])}])).values()];
 const project=(row,fields)=>Object.fromEntries(fields.filter(k=>Object.hasOwn(row,k)).map(k=>[k,row[k]]));
 function adaptDataset(raw={},options={}){
  const audience=options.audience||'PUBLIC', availability={...options.fieldAvailability};
  const villages=unique(raw.villages,'village_id').map(v=>audience==='PUBLIC'?project(v,villageFields):v);
  const ids=new Set(villages.map(v=>tid(v.village_id)));
  const waterSystems=unique(raw.waterSystems,'system_id').map(s=>{
   const row=audience==='PUBLIC'?project(s,systemFields):s;
   return {...row,village_id:tid(row.village_id),operational_status:code(row.operational_status,['WORKING','NOT_WORKING'],'UNKNOWN'),drinking_water_quality:code(row.drinking_water_quality,['PASS','FAIL'],'NO_DATA'),water_quantity:code(row.water_quantity,['SUFFICIENT','INSUFFICIENT'],'NO_DATA'),utility_water_quality:code(row.utility_water_quality,['USABLE','NOT_USABLE'],'UNKNOWN')};
  }).filter(s=>ids.has(tid(s.village_id)));
  const waterSources=unique(raw.waterSources,'source_id').map(s=>({...s,village_id:tid(s.village_id)})).filter(s=>ids.has(tid(s.village_id))).map(s=>audience==='PUBLIC'?project(s,['source_id','village_id','source_type','households']):s);
  return {villages,waterSystems,waterSources,availability,audience};
 }
 function issues(s){return [s.operational_status==='NOT_WORKING',s.drinking_water_quality==='FAIL',s.water_quantity==='INSUFFICIENT',s.utility_water_quality==='NOT_USABLE'].filter(Boolean).length;}
 function matchesRule(s,rule){return !rule||({ok:()=>s.operational_status==='WORKING',ops:()=>s.operational_status==='NOT_WORKING',dq:()=>s.drinking_water_quality==='FAIL',qty:()=>s.water_quantity==='INSUFFICIENT',uq:()=>s.utility_water_quality==='NOT_USABLE',any:()=>issues(s)>0,multi:()=>issues(s)>=2}[rule]?.()??false);}
 function selectDataset(data,filters={},options={}){
  const excluded=new Set(options.excludeKeys||[]), f=Object.fromEntries(Object.entries(filters).filter(([k])=>!excluded.has(k)));
  const q=norm(f.search), vm=new Map(data.villages.map(v=>[tid(v.village_id),v]));
  const area=v=>(!f.district||v.district===f.district)&&(!f.localAuthority||v.local_authority===f.localAuthority);
  const villageSearch=v=>norm([v.village_id,v.village_name,v.district,v.local_authority].join(' ')).includes(q);
  const waterSystems=data.waterSystems.filter(s=>{
   const v=vm.get(tid(s.village_id))||{};
   return area(v)&&(!f.systemType||s.system_type===f.systemType)&&matchesRule(s,f.rule)&&(!f.publicVisibility||(s.publicVisible===true?'VISIBLE':s.publicVisible===false?'HIDDEN':'UNKNOWN')===f.publicVisibility)&&(!q||villageSearch(v)||norm([s.system_id,s.system_name,s.responsible_agency].join(' ')).includes(q));
  });
  const selected=new Set(waterSystems.map(s=>tid(s.village_id))), systemFilter=Boolean(f.systemType||f.rule||f.publicVisibility);
  const villages=data.villages.filter(v=>area(v)&&(systemFilter?selected.has(tid(v.village_id)):!q||villageSearch(v)||selected.has(tid(v.village_id))));
  const ids=new Set(villages.map(v=>tid(v.village_id)));
  return {villages,waterSystems,waterSources:data.waterSources.filter(s=>ids.has(tid(s.village_id))),availability:data.availability,audience:data.audience};
 }
 const metric=(count,denominator,missing=0,unavailable=false)=>({count,denominator,missing,unavailable,percent:denominator?100*count/denominator:null});
 const median=values=>{const a=[...values].sort((a,b)=>a-b),m=a.length>>1;return a.length?(a.length%2?a[m]:(a[m-1]+a[m])/2):null;};
 function summarizeSelection(sel,{referenceYearBE}={}){
  const systems=sel.waterSystems, villages=sel.villages, available=sel.availability||{}, n=systems.length;
  const result=(field,bad,known)=>{const rows=systems.filter(s=>known.includes(s[field]));return metric(rows.filter(s=>s[field]===bad).length,rows.length,n-rows.length,available[field]===false);};
  const year=referenceYearBE??currentYearBE();
  const ages=systems.map(s=>num(s.construction_year_be)).filter(y=>Number.isInteger(y)&&y>0&&y<=year).map(y=>year-y);
  const caps=systems.map(s=>nonnegative(s.capacity_m3_hr)).filter(x=>x!==null);
  const hh=villages.filter(v=>hhFields.every(k=>nonnegative(v[k])!==null));
  const bySource=Object.fromEntries(hhFields.map(k=>[k,hh.reduce((sum,v)=>sum+Number(v[k]),0)]));
  const knownVillages=villages.filter(v=>bool(v.has_village_waterworks)!==null);
  const transferred=systems.filter(s=>s.establishment_type==='TRANSFERRED');
  const completeness=Object.fromEntries(['latitude','longitude','construction_year_be','capacity_m3_hr','drinking_water_quality','water_quantity'].map(k=>[k,metric(systems.filter(s=>s[k]!==null&&s[k]!==undefined&&s[k]!==''&&!['NO_DATA','UNKNOWN'].includes(s[k])).length,n,0,available[k]===false)]));
  return {kpi:{systems:n,villages:villages.length},coverage:metric(knownVillages.filter(v=>bool(v.has_village_waterworks)).length,knownVillages.length,villages.length-knownVillages.length),households:{total:Object.values(bySource).reduce((a,b)=>a+b,0),bySource,excludedVillages:villages.length-hh.length,denominator:hh.length},quality:{drinking:result('drinking_water_quality','FAIL',['PASS','FAIL']),quantity:result('water_quantity','INSUFFICIENT',['SUFFICIENT','INSUFFICIENT']),multiple:metric(systems.filter(s=>issues(s)>=2).length,n)},age:{referenceYearBE:year,atLeast20:metric(ages.filter(x=>x>=20).length,ages.length,n-ages.length),unknown:n-ages.length},capacity:{total:caps.reduce((a,b)=>a+b,0),median:median(caps),count:caps.length,missing:n-caps.length,unavailable:available.capacity_m3_hr===false},ownership:{transferred:transferred.length,documents:metric(transferred.filter(s=>s.transfer_document_status==='AVAILABLE').length,transferred.length)},completeness,compare:[],insights:[]};
 }
 function toReferenceDataset(data,{referenceYearBE}={}){
  const counts=new Map();data.waterSystems.forEach(s=>{const id=tid(s.village_id);counts.set(id,(counts.get(id)||0)+1);});
  const V=data.villages.map(v=>({id:tid(v.village_id),d:text(v.district),la:text(v.local_authority),no:text(v.village_no).trim(),nm:text(v.village_name),ww:bool(v.has_village_waterworks),pwa:nonnegative(v.pwa_households),mwa:nonnegative(v.mwa_households),com:nonnegative(v.commercial_households),ovp:nonnegative(v.other_village_pipe_households),wb:nonnegative(v.waterbank_households),self:nonnegative(v.self_source_households),nat:nonnegative(v.natural_source_households),ns:counts.get(tid(v.village_id))||0}));
  const vm=new Map(V.map(v=>[v.id,v]));
  const yr=referenceYearBE??currentYearBE();
  const S=data.waterSystems.map(s=>{const vid=tid(s.village_id),v=vm.get(vid)||{}, y=num(s.construction_year_be),lat=num(s.latitude),lng=num(s.longitude),valid=lat!==null&&lng!==null&&Math.abs(lat)<=90&&Math.abs(lng)<=180, inPhayao=valid&&lat>=18.7&&lat<=20&&lng>=99.4&&lng<=100.7, publicAllowed=data.audience!=='PUBLIC'?valid:inPhayao, capVal=nonnegative(s.capacity_m3_hr);return {id:tid(s.system_id),vid,d:v.d||'',la:v.la||'',vn:v.nm||'',vno:v.no,nm:text(s.system_name),lat:publicAllowed?lat:null,lng:publicAllowed?lng:null,co:valid&&!inPhayao,ot:s.owner_type||'UNKNOWN',st:s.system_type||'UNKNOWN',src:s.water_source_type||'UNKNOWN',use:s.usage_type||'',cap:capVal,capx:capVal===null,hh:nonnegative(s.households_served),yr:Number.isInteger(y)&&y>0&&y<=yr?y:null,ops:s.operational_status,uq:s.utility_water_quality,dq:s.drinking_water_quality,qty:s.water_quantity,sh:bool(s.shared_with_other_village),est:s.establishment_type||'UNKNOWN',td:s.transfer_document_status||'NO_DATA',ag:text(s.responsible_agency)};});
  return {V,S};
 }
 g.VWSReferenceModel={adaptDataset,selectDataset,summarizeSelection,toReferenceDataset,issues,matchesRule,median,currentYearBE};
})(globalThis);
