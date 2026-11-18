import {loadData} from './api.js';
import {buildTemporaryPublicScope} from './public-scope.js';
import {readPublicCache,writePublicCache} from './public-cache.js';
import {buildSystemDetailHtml} from './system-detail.js';
import {buildVillageDetailHtml} from './village-detail.js';
const status=document.getElementById('referenceStatus');
let view=null,dataset=null,busy=false,origin='',initialHashHandled=false;
const refresh=document.createElement('button');refresh.type='button';refresh.className='reference-refresh';refresh.setAttribute('aria-label','รีเฟรชข้อมูล');refresh.innerHTML='<span class="rr-icon" aria-hidden="true">↻</span><span class="rr-text"> รีเฟรช</span>';refresh.id='btnRefresh';document.querySelector('.app-header').append(refresh);
function syncHash(){
 if(!view)return;
 const hash=location.hash;
 if(hash==='#overview'||hash==='#exec')view.activate({view:'exec'});
 else if(hash==='#problemList'||hash==='#problem')view.activate({view:'detail',tab:'problem'});
 else if(['#compare','#insight','#table','#vtable'].includes(hash))view.activate({view:'detail',tab:hash.slice(1)});
}
function detail(id,kind){
 const trigger=document.activeElement instanceof HTMLElement?document.activeElement:null;
 const row=(kind==='system'?dataset.waterSystems:dataset.villages).find(s=>String(s[kind==='system'?'system_id':'village_id'])===String(id));if(!row)return;
 const old=document.getElementById('referenceDetail');old?.remove();
 // Right-side drawer, same structure as the technician #systemDialog (header / scrolling body / footer).
 const dialog=document.createElement('dialog');dialog.id='referenceDetail';dialog.className='reference-drawer';dialog.setAttribute('aria-labelledby','referenceDetailTitle');
 const panel=document.createElement('div');panel.className='reference-drawer-panel';
 const header=document.createElement('header');header.className='reference-drawer-header';
 const heading=document.createElement('div');const eyebrow=document.createElement('p');eyebrow.className='reference-drawer-eyebrow';eyebrow.textContent=kind==='system'?'ข้อมูลระบบประปา':'ข้อมูลหมู่บ้าน';
 const titleEl=document.createElement('h3');titleEl.id='referenceDetailTitle';heading.append(eyebrow,titleEl);
 const closeX=document.createElement('button');closeX.type='button';closeX.className='reference-drawer-x';closeX.setAttribute('aria-label','ปิด');closeX.textContent='✕';closeX.onclick=()=>dialog.close();
 header.append(heading,closeX);
 const content=document.createElement('div');content.className='reference-drawer-body';
 const refSystem=kind==='system'?VWSReferenceModel.toReferenceDataset(dataset).S.find(item=>item.id===String(row.system_id)):null;
 const detailRow=refSystem?{...row,latitude:refSystem.lat,longitude:refSystem.lng,construction_year_be:refSystem.yr}:row;
 content.innerHTML=kind==='system'?buildSystemDetailHtml(detailRow,dataset.villages.find(v=>String(v.village_id)===String(row.village_id))):buildVillageDetailHtml(row);
 const bodyTitle=content.querySelector('.detail-title');titleEl.textContent=bodyTitle?.textContent||'';bodyTitle?.remove();
 if(kind==='village'){const linked=dataset.waterSystems.filter(s=>String(s.village_id)===String(row.village_id)).length;if(linked)content.querySelector('p.detail-subtitle:last-child').textContent='มีข้อมูลระบบประปาที่เชื่อมโยง '+linked+' ระบบ';}
 panel.append(header,content);dialog.append(panel);
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});dialog.addEventListener('close',()=>{dialog.remove();if(trigger&&trigger.isConnected)trigger.focus({preventScroll:true});},{once:true});document.body.append(dialog);dialog.showModal();
}
function apply(raw,dataOrigin){
 dataset=VWSReferenceModel.adaptDataset(raw,{audience:'PUBLIC'});origin=dataOrigin;
 if(view)view.render({dataset});else view=VWSReferenceView.mount({root:document,audience:'PUBLIC',dataset,onOpenSystem:id=>detail(id,'system'),onOpenVillage:id=>detail(id,'village')});
 status.textContent=dataOrigin==='CACHE'?'แสดงข้อมูลที่บันทึกไว้ ยังไม่ได้ตรวจสอบกับข้อมูลล่าสุด':'โหลดข้อมูลล่าสุดแล้ว';
 if(!initialHashHandled){initialHashHandled=true;syncHash();}
}
async function reload(){
 if(busy)return;busy=true;refresh.disabled=true;status.textContent=dataset?'กำลังอัปเดตข้อมูล…':'กำลังโหลดข้อมูล…';
 try{const raw=await loadData();const scope=raw.projection?.policy==='PUBLIC_ALLOWLIST_R5_1_V1'?raw:buildTemporaryPublicScope(raw);apply(scope,'LIVE');void writePublicCache({scope,sourceGeneratedAt:raw.generatedAt||''}).catch(()=>{});}
 catch(error){status.textContent=dataset?(origin==='CACHE'?'อัปเดตไม่สำเร็จ ข้อมูลที่บันทึกไว้ยังไม่ได้ตรวจสอบ':'อัปเดตไม่สำเร็จ กำลังแสดงข้อมูลที่โหลดก่อนหน้านี้')+': '+error.message:'โหลดข้อมูลไม่สำเร็จ: '+error.message;}
 finally{busy=false;refresh.disabled=false;}
}
refresh.addEventListener('click',reload);
window.addEventListener('hashchange',syncHash);
try{const cached=await Promise.race([readPublicCache(),new Promise(resolve=>setTimeout(()=>resolve(null),800))]);if(cached?.status==='HIT')apply(cached.record.data,'CACHE');}catch{}
await reload();
