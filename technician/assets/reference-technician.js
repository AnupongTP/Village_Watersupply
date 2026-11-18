/* Presentation bridge: receives only the dataset accepted by technician.js. */
(()=>{
 let detailTimer=0,headerObserver=null,headerResizeHandler=null,view=null,template='',controls=null,controlsHome=null,currentDataset=null,moved=[],programmatic=false,focusHistory=false;
 const root=()=>document.getElementById('referenceDashboard');
 const MANAGE_WORKSPACES=['historyPanel','techniciansPanel'];
 // CANDIDATE-UX-09: management view hosts the existing list/history/account sections; navigation stays in technician.js.
 const manageView=()=>root()?.querySelector('#view-manage')||null;
 function ownsWorkspace(workspace){return Boolean(view&&manageView()&&MANAGE_WORKSPACES.includes(workspace));}
 function setManageTab(tab){
  const panel=manageView();if(!panel)return;
  panel.dataset.tab=tab;
  panel.querySelectorAll('.manage-tab').forEach(link=>{if(link.dataset.manageTab===tab)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
 }
 function showManage(tab){if(!view)return;setManageTab(tab);programmatic=true;try{view.activate({view:'manage'});}finally{programmatic=false;}if(tab==='list')requestAnimationFrame(refreshManageMap);}
 // CANDIDATE-POLISH-3: Leaflet map in the manage list tab. Markers = rows technician.js already filtered (district scope comes from it);
 // icons/popups/cluster/base maps come from the Reference view helpers. Permissions are decided by technician.js hooks only.
 let manageMap=null,manageCluster=null,manageCanvas=null,manageEvents=null,manageRows=[],manageDirty=true,manageHooks={},manageOpen=null;
 const manageMarkers=new Map();
 const manageMapEl=()=>root()?.querySelector('#manageMap')||null;
 function manageCoordinates(row){
  if(row?.latitude==null||row?.longitude==null||String(row.latitude).trim()===''||String(row.longitude).trim()==='')return null;
  const lat=Number(row.latitude),lng=Number(row.longitude);
  return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180?[lat,lng]:null;
 }
 function ownsMapAction(){return Boolean(view&&manageMapEl());}
 function createManageMap(host){
  manageCanvas=document.createElement('div');manageCanvas.className='manage-map-canvas';host.append(manageCanvas);
  // Touch devices: one finger scrolls the page, two fingers pinch/pan the map; small screens never capture the mouse wheel.
  const coarse=window.matchMedia?.('(pointer:coarse)').matches===true;
  manageMap=L.map(manageCanvas,{dragging:!coarse,scrollWheelZoom:false}).setView([19.2,100.08],9);
  const small=window.matchMedia?.('(max-width:767px)');
  view.addBaseMaps(manageMap,{collapsed:small?.matches===true});
  manageCluster=view.makeCluster().addTo(manageMap);
  manageEvents=new AbortController();
  const applyWheel=()=>{if(!manageMap)return;if(small?.matches)manageMap.scrollWheelZoom.disable();else manageMap.scrollWheelZoom.enable();};
  applyWheel();small?.addEventListener?.('change',applyWheel,{signal:manageEvents.signal});
  host.addEventListener('click',event=>{
   const button=event.target.closest?.('[data-manage-action]');if(!button||!host.contains(button))return;
   event.preventDefault();event.stopPropagation();
   const id=button.dataset.id;
   if(button.dataset.manageAction==='detail')manageOpen?.(id);else if(button.dataset.manageAction==='edit')manageHooks.onEditSystem?.(id);
  },{signal:manageEvents.signal});
 }
 function drawManageMap(){
  manageDirty=false;manageMap.closePopup();manageCluster.clearLayers();manageMarkers.clear();
  // Compact popup; autoPan keeps it clear of the top-left zoom control and inside the (260px mobile) map.
  const markers=[],points=[],popupOptions={maxWidth:240,minWidth:210,autoPanPaddingTopLeft:L.point(60,10),autoPanPaddingBottomRight:L.point(10,10)};
  manageRows.forEach(row=>{
   const point=manageCoordinates(row);if(!point)return;
   const id=String(row.system_id),marker=L.marker(point,{icon:view.markerIcon(row),title:row.system_name||id});
   marker.bindPopup(()=>view.popupHtml(row,{canEdit:manageHooks.canEditSystem?.(row)===true}),popupOptions);
   manageMarkers.set(id,marker);markers.push(marker);points.push(point);
  });
  manageCluster.addLayers(markers);
  if(points.length===1)manageMap.setView(points[0],15,{animate:false});
  else if(points.length)manageMap.fitBounds(L.latLngBounds(points),{padding:[35,35],maxZoom:15,animate:false});
 }
 // Creates the map the first time the list tab has a size; afterwards re-measures (tab switch) and redraws only when the list changed.
 function refreshManageMap(){
  const host=manageMapEl();if(!view||!host||!window.L||!host.offsetWidth)return false;
  if(!manageMap)createManageMap(host);else manageMap.invalidateSize();
  if(manageDirty)drawManageMap();
  return true;
 }
 // Paging the table re-renders it with the same filtered rows; keep the user's zoom/popup unless the rows actually changed
 // (search, mode switch and data refresh produce a different set or new row objects, so they still redraw).
 function syncManageMap(systems){
  const next=Array.isArray(systems)?systems.slice():[];
  const unchanged=next.length===manageRows.length&&next.every((row,index)=>row===manageRows[index]);
  manageRows=next;
  if(!unchanged||!manageMarkers.size&&next.length)manageDirty=true;
  refreshManageMap();
 }
 function focusManageMap(id){
  if(!refreshManageMap())return false;
  const marker=manageMarkers.get(String(id??''));if(!marker)return false;
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
  (manageMapEl().closest('.manage-map-card')||manageMapEl()).scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'});
  manageCluster.zoomToShowLayer(marker,()=>marker.openPopup());
  return true;
 }
 function destroyManageMap(){
  manageEvents?.abort();manageEvents=null;
  if(manageMap){manageMap.stop();manageMap.remove();}
  manageMap=null;manageCluster=null;manageMarkers.clear();manageCanvas?.remove();manageCanvas=null;
  manageRows=[];manageDirty=true;manageHooks={};manageOpen=null;
 }
 function moveInto(node,target){if(!node||!target)return;moved.push({node,parent:node.parentNode,next:node.nextSibling});target.append(node);}
 function restoreMoved(){for(const item of moved.reverse()){const next=item.next&&item.next.parentNode===item.parent?item.next:null;item.parent.insertBefore(item.node,next);}moved=[];}
 function setupManage(host){
  const panel=host.querySelector('#view-manage');if(!panel)return;
  moveInto(document.getElementById('watchlist'),panel.querySelector('#manageListSlot'));
  MANAGE_WORKSPACES.forEach(id=>moveInto(document.getElementById(id),panel.querySelector('#managePanels')));
  host.querySelectorAll('.main-nav button[data-view="exec"],.main-nav button[data-view="detail"]').forEach(b=>b.addEventListener('click',()=>leaveManage(b.dataset.view)));
  host.querySelector('#referenceManageButton')?.addEventListener('click',()=>{
   if(programmatic)return;
   const target='technicianManagementSection';
   if(location.hash==='#'+target)window.dispatchEvent(new HashChangeEvent('hashchange'));else location.hash=target;
  });
 }
 function syncManagePermissions(host){
  const accountTab=host.querySelector('#view-manage .manage-tab[data-manage-tab="techniciansPanel"]');
  if(accountTab)accountTab.hidden=document.getElementById('techniciansAccountButton')?.classList.contains('hidden')!==false;
 }
 function syncWorkspace(workspace='dashboard'){
  const host=root(),owned=ownsWorkspace(workspace);
  if(controls){
   const target=(workspace==='dashboard'||owned)&&view&&host?host.querySelector('.app-header'):controlsHome;
   if(target&&controls.parentElement!==target)target.append(controls);
  }
  document.body.classList.toggle('reference-subworkspace',Boolean(view&&workspace!=='dashboard'&&!owned));
  if(owned){showManage(workspace);
   // CANDIDATE-UX-12: row "history" action lands on the history tab; move focus to the system id field (flag set by capture click below).
   if(workspace==='historyPanel'&&focusHistory){focusHistory=false;document.getElementById('historySystemId')?.focus({preventScroll:true});}}
 }
 // CANDIDATE-UX-12: a USER click on exec/detail while a manage workspace is active routes through technician.js hash navigation
 // (#overview -> restoreSection -> dashboard workspace, panels hidden, activeWorkspace 'dashboard'). Detail has no hash route of its own,
 // so the dashboard id stays #overview and the detail view is re-activated programmatically (reload restores exec, as before the manage view existed).
 function leaveManage(nav){
  // List-tab hashes (#technicianManagementSection/#watchlist) also route to the manage view, so leave them too.
  if(programmatic||!view||![...MANAGE_WORKSPACES,'technicianManagementSection','watchlist'].includes(location.hash.slice(1)))return;
  history.pushState(null,'','#overview');
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  // Deferred: re-clicking the detail button inside its own click event is ignored by the browser (element.click() / keyboard activation),
  // which left the exec view active. Skip if the user moved on (other view/hash) or logged out before the timer fired.
  if(nav==='detail'){clearTimeout(detailTimer);detailTimer=setTimeout(()=>{detailTimer=0;if(!view||location.hash!=='#overview'||!root()?.querySelector('#view-exec.active'))return;programmatic=true;try{view.activate({view:'detail'});}finally{programmatic=false;}},0);}
 }
 // CANDIDATE-MINOR-2: manage-view scroll offset follows the real sticky Reference header height.
 function trackHeaderHeight(host){
  const header=host.querySelector('.app-header');if(!header)return;
  const apply=()=>document.documentElement.style.setProperty('--reference-header-height',Math.ceil(header.getBoundingClientRect().height)+'px');
  apply();
  headerObserver?.disconnect();
  if(headerResizeHandler){window.removeEventListener('resize',headerResizeHandler);headerResizeHandler=null;}
  if(window.ResizeObserver){headerObserver=new ResizeObserver(apply);headerObserver.observe(header);}
  else{headerResizeHandler=apply;window.addEventListener('resize',apply);}
 }
 function render(raw,onOpenSystem,user,hooks={}){
  const host=root();if(!host)return;
  manageOpen=onOpenSystem;manageHooks=hooks||{};manageDirty=true;
  if(!template)template=host.innerHTML;
  // Canonical raw.villages win; nested system.village only fills IDs that are missing (CANDIDATE-BUG-02).
  const canonical=raw.villages||[],villageKey=id=>String(id??'').trim(),known=new Set(canonical.map(v=>villageKey(v.village_id))),nested=new Map();
  (raw.waterSystems||[]).forEach(s=>{const id=villageKey(s.village_id);if(s.village&&id&&!known.has(id)&&!nested.has(id))nested.set(id,{...s.village,village_id:s.village_id});});
  const villages=[...canonical,...nested.values()];
  let data={...raw,villages};
  if(user.role==='TECHNICIAN'){
   const scoped=villages.filter(v=>v.district===user.district),ids=new Set(scoped.map(v=>villageKey(v.village_id)).filter(Boolean)),inScope=row=>{const key=villageKey(row.village_id);return Boolean(key)&&ids.has(key);};
   data={...data,villages:scoped,waterSystems:(raw.waterSystems||[]).filter(inScope),waterSources:(raw.waterSources||[]).filter(inScope)};
  }
  const dataset=VWSReferenceModel.adaptDataset(data,{audience:user.role});
  currentDataset=dataset;
  if(view)view.render({dataset});else{
   view=VWSReferenceView.mount({root:host,audience:user.role,dataset,lockedDistrict:user.role==='TECHNICIAN'?user.district:'',onOpenSystem,onOpenVillage:id=>{
    const v=currentDataset?.villages.find(v=>v.village_id===id);if(v)Swal.fire({titleText:v.village_name,text:[v.district,v.local_authority].filter(Boolean).join(' · '),confirmButtonText:'ปิด'});
   }});
   controls=document.querySelector('.topbar-actions');if(controls){controlsHome=controls.parentElement;syncWorkspace('dashboard');}
   const badge=document.createElement('div');badge.className='reference-account-scope';badge.textContent=user.role==='TECHNICIAN'?'ช่างอำเภอ'+user.district:'ผู้ดูแลระบบ · ทุกอำเภอ';host.querySelector('.header-brand').append(badge);
   const label=document.createElement('label');label.className='gf-field';label.innerHTML='<span>การแสดงหน้าสาธารณะ</span><select id="referenceVisibility"><option value="">ทั้งหมด</option><option value="VISIBLE">แสดง</option><option value="HIDDEN">ไม่แสดง</option><option value="UNKNOWN">ไม่ทราบ</option></select>';host.querySelector('.gf-grid').append(label);label.querySelector('select').addEventListener('change',event=>{view.filters.visibility=event.target.value;view.render({});});
   setupManage(host);
   trackHeaderHeight(host);
  }
  syncManagePermissions(host);
  const district=host.querySelector('#fd');district.disabled=user.role==='TECHNICIAN';
  requestAnimationFrame(()=>{view?.resize();refreshManageMap();});
 }
 function activate(id){if(!view)return;if(['overview','map-section','areas','system-structure','operations','quality'].includes(id))view.activate({view:'exec'});else if((id==='technicianManagementSection'||id==='watchlist')&&manageView())showManage('list');else if(id==='technicianManagementSection'||id==='watchlist')view.activate({view:'detail',tab:id==='watchlist'?'problem':'table'});requestAnimationFrame(()=>view?.resize());}
 function destroy(){clearTimeout(detailTimer);detailTimer=0;headerObserver?.disconnect();headerObserver=null;if(headerResizeHandler){window.removeEventListener('resize',headerResizeHandler);headerResizeHandler=null;}document.documentElement.style.removeProperty('--reference-header-height');if(document.querySelector('body > .swal2-container'))window.Swal?.close?.();document.body.classList.remove('reference-subworkspace');destroyManageMap();restoreMoved();if(!view)return;view.destroy();view=null;currentDataset=null;if(controls&&controlsHome)controlsHome.append(controls);root().innerHTML=template;}
 document.addEventListener('click',event=>{if(event.target.closest?.('#systemActionMenu button[data-action="history"],#referenceHistoryButton')){focusHistory=true;setTimeout(()=>{focusHistory=false;},0);}},true);
 window.VWSReferenceTechnician={render,activate,syncWorkspace,ownsWorkspace,syncManageMap,focusManageMap,ownsMapAction,destroy,resize:()=>view?.resize(),getSelection:()=>view?.getSelection()};
})();
