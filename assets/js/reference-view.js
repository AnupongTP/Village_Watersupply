
globalThis.VWSReferenceView={mount(options){
'use strict';
var root=options.root||document, controller=new AbortController(), currentDataset=options.dataset, destroyed=false,pendingTimers=new Set();
function later(callback,ms){var id=window.setTimeout(function(){pendingTimers.delete(id);if(!destroyed)callback();},ms);pendingTimers.add(id);return id;}
function listen(target,type,handler){target.addEventListener(type,handler,{signal:controller.signal});}
var model=globalThis.VWSReferenceModel;
var DATA=model.toReferenceDataset(currentDataset), V=DATA.V, S=DATA.S, NOW=model.summarizeSelection(currentDataset).age.referenceYearBE;
var $=function(i){return root.querySelector('[id="'+i+'"]');};
function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function fmt(n){return n==null||!Number.isFinite(n)?'–':Math.round(n).toLocaleString('en-US');}
function f1(n){return n==null||!Number.isFinite(n)?'–':(Math.round(n*10)/10).toFixed(1);}
function pc(a,b){return b?a/b*100:null;}
function P(a,b){return b?f1(pc(a,b))+'%':'–';}
var L_ST={GROUNDWATER_SMALL:'บาดาลขนาดเล็ก',GROUNDWATER_MEDIUM:'บาดาลขนาดกลาง',GROUNDWATER_LARGE:'บาดาลขนาดใหญ่',SURFACE_SMALL:'ผิวดินขนาดเล็ก',SURFACE_MEDIUM:'ผิวดินขนาดกลาง',SURFACE_LARGE:'ผิวดินขนาดใหญ่',SURFACE_VERY_LARGE:'ผิวดินขนาดใหญ่มาก',UNKNOWN:'ไม่ระบุ'};
var ST_ORDER=['GROUNDWATER_SMALL','GROUNDWATER_MEDIUM','GROUNDWATER_LARGE','SURFACE_SMALL','SURFACE_MEDIUM','SURFACE_LARGE','SURFACE_VERY_LARGE','UNKNOWN'];
var L_OT={LOCAL_AUTHORITY:'อปท.',VILLAGE_OR_OTHER:'หมู่บ้าน/หน่วยงานอื่น ๆ',UNKNOWN:'ไม่ระบุ'};
var L_OPS={WORKING:'ใช้การได้',NOT_WORKING:'ใช้การไม่ได้',UNKNOWN:'ไม่ทราบ'};
var L_DQ={PASS:'ผ่านเกณฑ์',FAIL:'ไม่ผ่านเกณฑ์',NO_DATA:'ไม่มีข้อมูล'};
var L_QTY={SUFFICIENT:'เพียงพอ',INSUFFICIENT:'ไม่เพียงพอ',NO_DATA:'ไม่มีข้อมูล'};
var L_UQ={USABLE:'ใช้ได้',NOT_USABLE:'ใช้ไม่ได้',UNKNOWN:'ไม่ทราบ'};
var L_EST={LOCAL_CREATED:'อปท. จัดตั้ง/สร้างเอง',TRANSFERRED:'ถ่ายโอน',ACCEPTED_ASSET:'รับมอบตามระเบียบพัสดุ',UNKNOWN:'ไม่ระบุ'};
var L_TD={AVAILABLE:'มีเอกสาร',NOT_AVAILABLE:'ไม่มีเอกสาร',NO_DATA:'ไม่มีข้อมูล'};
var L_SRC={GROUNDWATER:'น้ำบาดาล',SURFACE_WATER:'น้ำผิวดิน',UNKNOWN:'ไม่ระบุ'};
var HH=[['pwa','ประปาส่วนภูมิภาค (กปภ.)','#1565c0'],['mwa','ประปานครหลวง (กปน.)','#3949ab'],['ovp','ท่อประปาหมู่บ้านอื่น','#00838f'],['com','เชิงพาณิชย์','#7b1fa2'],['wb','ธนาคารน้ำ','#2e7d32'],['self','แหล่งน้ำของตนเอง','#e65100'],['nat','แหล่งน้ำธรรมชาติ','#a1887f']];
var C_OK='#2e7d32',C_BAD='#c62828',C_UNK='#9aa5b1',C_WARN='#e65100',C_BLUE='#1565c0';

// ---------- เตรียมข้อมูล ----------
function prepareRows(){
V.forEach(function(v){ v.hhKnown=[v.pwa,v.mwa,v.com,v.ovp,v.wb,v.self,v.nat].every(function(n){return typeof n==='number'&&Number.isFinite(n)&&n>=0;});v.hh=v.hhKnown?v.pwa+v.mwa+v.com+v.ovp+v.wb+v.self+v.nat:null; });
VM=Object.create(null); V.forEach(function(v){VM[v.id]=v;});
S.forEach(function(s){
  s.age=s.yr?NOW-s.yr:null; s.pOps=s.ops==='NOT_WORKING'; s.pDq=s.dq==='FAIL'; s.pQty=s.qty==='INSUFFICIENT'; s.pUq=s.uq==='NOT_USABLE';
  s.np=(s.pOps?1:0)+(s.pDq?1:0)+(s.pQty?1:0)+(s.pUq?1:0);
  var vv=VM[s.vid]; s.vhh=vv&&vv.hhKnown?vv.hh:null;
});
DIST=Array.from(new Set(V.map(function(v){return v.d;}))).sort(function(a,b){return a.localeCompare(b,'th');});
LAS=Array.from(new Set(V.map(function(v){return v.la;}).filter(Boolean))).sort(function(a,b){return a.localeCompare(b,'th');});

}
var VM,DIST,LAS;prepareRows();
// ---------- ตัวกรอง ----------
var F={d:'',la:'',st:'',rule:'',q:''};
function ruleOk(s){var r=F.rule; if(!r)return true; if(r==='ok')return s.ops==='WORKING'; if(r==='ops')return s.pOps; if(r==='dq')return s.pDq; if(r==='qty')return s.pQty; if(r==='uq')return s.pUq; if(r==='any')return s.np>0; if(r==='multi')return s.np>=2; return true;}
function qOk(txt){ if(!F.q) return true; return (txt||'').toLowerCase().indexOf(F.q.toLowerCase())>=0; }
function sPass(s){ return (!F.d||s.d===F.d)&&(!F.la||s.la===F.la)&&(!F.st||s.st===F.st)&&ruleOk(s)&&qOk([s.nm,s.vn,s.la,s.d].join(' ')); }
function vPass(v){ return (!F.d||v.d===F.d)&&(!F.la||v.la===F.la)&&qOk([v.nm,v.la,v.d].join(' ')); }
var FS=[],FV=[];
var chartEventDepth=0,chartRenderTimer=null;
function requestRender(){if(chartRenderTimer!==null)return;chartRenderTimer=later(function(){chartRenderTimer=null;render();},0);}
window.setF=function(k,val){ F[k]=(F[k]===val)?'':val; syncUi(); if(chartEventDepth)requestRender();else render(); };
function syncUi(){ $('fd').value=F.d; $('fla').value=F.la; $('fst').value=F.st; $('frule').value=F.rule; $('fq').value=F.q; $('fqClear').style.display=F.q?'':'none'; }
function fillSel(id,vals,lab){ var h='<option value="">ทั้งหมด</option>'; vals.forEach(function(x){h+='<option value="'+esc(x)+'">'+esc(lab?lab(x):x)+'</option>';}); $(id).innerHTML=h; }
fillSel('fd',DIST); fillSel('fla',LAS); fillSel('fst',ST_ORDER,function(x){return L_ST[x];});
['fd','fla','fst','frule'].forEach(function(id){ var k={fd:'d',fla:'la',fst:'st',frule:'rule'}[id]; $(id).addEventListener('change',function(){F[k]=this.value;render();}); });
var qt=null; $('fq').addEventListener('input',function(){ var t=this.value; clearTimeout(qt); qt=later(function(){F.q=t.trim(); $('fqClear').style.display=F.q?'':'none'; render();},200); });
$('fqClear').addEventListener('click',function(){F.q='';$('fq').value='';this.style.display='none';render();});
$('efReset').addEventListener('click',function(){Object.keys(F).forEach(function(k){F[k]='';});syncUi();render();});

// ---------- ตัวช่วยวาดแถบ ----------
var RULE_L={ok:'ใช้การได้',ops:'ใช้การไม่ได้',dq:'น้ำดื่มไม่ผ่านเกณฑ์',qty:'น้ำไม่เพียงพอ',uq:'น้ำใช้ไม่ได้',any:'มีปัญหาอย่างน้อย 1 ด้าน',multi:'มีปัญหา ≥ 2 ด้าน'};
function barRow(lbl,w,color,val,sub,click,sel,title){
  return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:7px;font-size:11.5px;'+(click?'cursor:pointer;':'')+(sel?'background:#e3f2fd;border-radius:6px;':'')+'"'+(click?' onclick="'+click+'"':'')+(title?' title="'+esc(title)+'"':'')+'>'
   +'<div style="width:92px;flex:none;text-align:right;color:#3a5060;line-height:1.2;white-space:normal;font-size:10.5px;">'+lbl+'</div>'
   +'<div style="flex:1;height:13px;background:#eef2f7;border-radius:4px;overflow:hidden;"><div style="width:'+Math.max(0,Math.min(100,w))+'%;height:100%;background:'+color+';border-radius:4px;transition:.3s;"></div></div>'
   +'<div style="min-width:60px;font-size:11px;font-weight:800;color:'+color+';text-align:right;">'+val+'</div>'+(sub?'<div style="min-width:70px;font-size:10px;color:#6b777c;">'+sub+'</div>':'')+'</div>';
}
function stackRow(lbl,parts,tot,click,sel,tip){ // parts:[{n,color,label}]
  var segs=parts.map(function(p){return p.n?'<div title="'+esc(p.label+' '+fmt(p.n)+' ('+f1(pc(p.n,tot))+'%)')+'" style="width:'+pc(p.n,tot)+'%;background:'+p.color+';height:100%;"></div>':'';}).join('');
  return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:7px;font-size:11.5px;'+(click?'cursor:pointer;':'')+(sel?'background:#e3f2fd;border-radius:6px;':'')+'"'+(click?' onclick="'+click+'"':'')+(tip?' title="'+esc(tip)+'"':'')+'>'
   +'<div style="width:112px;flex:none;text-align:right;color:#3a5060;line-height:1.2;white-space:normal;font-size:10.5px;">'+lbl+' <span style="color:#6b777c;">('+fmt(tot)+')</span></div>'
   +'<div style="flex:1;height:14px;background:#eef2f7;border-radius:4px;overflow:hidden;display:flex;">'+segs+'</div>'
   +'<div style="min-width:44px;font-size:10.5px;color:#3a5060;text-align:right;">'+parts.filter(function(p){return p.main;}).map(function(p){return f1(pc(p.n,tot))+'%';}).join('')+'</div></div>';
}
function jsarg(value){return JSON.stringify(String(value)).replace(/[<>&']/g,function(c){return String.fromCharCode(92)+'u'+c.charCodeAt(0).toString(16).padStart(4,'0');});}
function setClick(k,v){return esc('setF('+jsarg(k)+','+jsarg(v)+')');}

function empty(m){return '<div style="font-size:12px;color:#6b777a;padding:20px 6px;text-align:center;">'+(m||'ไม่มีข้อมูลตามตัวกรองปัจจุบัน')+'</div>';}
function byDist(list,key){ var g=Object.create(null); list.forEach(function(x){(g[x[key||'d']]=g[x[key||'d']]||[]).push(x);}); return g; }
function legendDot(c,t){return '<span class="lg-it"><i class="lg-dot" style="background:'+c+';"></i>'+t+'</span>';}

// ---------- แผนที่ (ทำเหมือนแดชบอร์ดแหล่งน้ำ) ----------
var DEFAULT_CENTER=[19.2,100.08],DEFAULT_ZOOM=9;
var SYM={BAD:'🔧',WARN:'⚠️'};
function glyphOf(s){ return s.src==='GROUNDWATER'?'🕳️':s.src==='SURFACE_WATER'?'🏞️':'💧'; }
function probBadge(s){ if(s.pOps) return {icon:'🔧',cls:'broken'}; if(s.np>0) return {icon:'⚠️',cls:'warn'}; return null; }
function makeIcon(s,st){
  var size=st.size, gs=Math.max(8,Math.round(size*0.46)), ring=st.ring?'box-shadow:0 1px 4px rgba(0,0,0,.35),0 0 0 3px '+st.ring+'99;':'';
  var b=probBadge(s), bh=b?'<span class="dvicon-badge '+b.cls+'">'+b.icon+'</span>':'';
  return L.divIcon({className:'',html:'<div class="dvicon-wrap"><div class="dvicon" style="background:'+st.col+';width:'+size+'px;height:'+size+'px;'+ring+'"><span class="dvicon-glyph" style="font-size:'+gs+'px;">'+glyphOf(s)+'</span></div>'+bh+'</div>',iconSize:[size,size]});
}
function setMapEmpty(stageId,msg){
  var st=$(stageId); if(!st) return; var el=st.querySelector(':scope>.map-empty');
  if(!msg){ if(el) el.remove(); return; }
  if(!el){ el=document.createElement('div'); el.className='map-empty'; el.setAttribute('role','status'); st.appendChild(el); }
  el.textContent=msg;
}
function zoomToMarkers(mp,ll){ if(!ll.length) return; if(ll.length===1){ mp.setView(ll[0],15,{animate:false}); return; } mp.fitBounds(L.latLngBounds(ll),{padding:[35,35],maxZoom:15,animate:false}); }
function toggleMapFullscreen(stageId,which,btn){map.stop();if(pmap)pmap.stop();
  var stage=$(stageId); if(!stage) return; var full=stage.classList.toggle('map-fullscreen'); (root===document?document.body:root).classList.toggle('map-fullscreen-lock',full);
  if(btn){ btn.innerHTML=full?'✕':'⛶'; btn.title=full?'ย่อกลับ':'ขยายดูรายละเอียด'; btn.setAttribute('aria-expanded',full?'true':'false'); }
  later(function(){ var m=which==='hero'?map:pmap; if(m) m.invalidateSize(); },260);
}
listen(document,'keydown',function(e){ if(e.key!=='Escape') return; var el=root.querySelector('.map-stage.map-fullscreen'); if(!el) return; toggleMapFullscreen(el.id,el.id==='heroMapStage'?'hero':'prob',el.querySelector('.map-expand-ctrl a')); });
function addExpand(mp,stageId,which){
  var c=L.control({position:'topleft'});
  c.onAdd=function(){ var div=L.DomUtil.create('div','leaflet-bar leaflet-control map-expand-ctrl'), a=L.DomUtil.create('a','',div); a.href='#'; a.title='ขยายเต็มจอ'; a.innerHTML='⛶'; a.setAttribute('role','button'); a.setAttribute('aria-label','ขยายเต็มจอ'); a.setAttribute('aria-expanded','false'); L.DomEvent.disableClickPropagation(div); L.DomEvent.on(a,'click',function(e){ L.DomEvent.preventDefault(e); toggleMapFullscreen(stageId,which,a); }); L.DomEvent.on(a,'keydown',function(e){ if(e.key==='Enter'||e.key===' '){ L.DomEvent.stop(e); toggleMapFullscreen(stageId,which,a); } }); return div; };
  c.addTo(mp);
}
function bindPopupDetail(mp){
  if(!mp||!options.onOpenSystem) return;
  mp.on('popupopen',function(e){
    var el=e.popup&&e.popup.getElement(); if(!el||el.dataset.vwsPopupBound) return;
    el.dataset.vwsPopupBound='1';
    L.DomEvent.on(el,'click',function(ev){
      var btn=ev.target&&ev.target.closest&&ev.target.closest('[data-open-system]');
      if(!btn) return;
      L.DomEvent.stop(ev);
      btn.focus({preventScroll:true});
      options.onOpenSystem(btn.dataset.openSystem);
    });
  });
}
function addBaseMaps(mp,opts){
  var sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'Tiles © Esri',maxZoom:19,maxNativeZoom:18});
  var st=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',{attribution:'Tiles © Esri',maxZoom:19});
  sat.addTo(mp); L.control.layers({'🛰️ ดาวเทียม':sat,'🗺️ ถนน (Esri)':st},null,{position:'bottomleft',collapsed:!!(opts&&opts.collapsed)}).addTo(mp);
}
function makeCluster(){
  return L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:60,spiderfyOnMaxZoom:true,disableClusteringAtZoom:18,chunkedLoading:true,chunkInterval:80,
    iconCreateFunction:function(cl){ var n=cl.getChildCount(), s=n<10?42:n<100?52:n<1000?62:72; return L.divIcon({className:'mc-wrap',iconSize:[s,s],iconAnchor:[s/2,s*1.18],html:'<div class="mc-pin mc-blue" style="width:'+s+'px;height:'+s+'px;"><span style="font-size:'+Math.round(s*.42)+'px;">'+n.toLocaleString('th-TH')+'</span></div>'}); }});
}
var map=L.map('map').setView(DEFAULT_CENTER,DEFAULT_ZOOM); addBaseMaps(map);
var cluster=makeCluster().addTo(map); addExpand(map,'heroMapStage','hero'); bindPopupDetail(map);
var mapState={color:'ops',typesOn:true,types:null,statusOn:false,statuses:null,probOn:false,probs:null,dists:null};
var C_RING=null;
function markerStyle(s){
  var col='#0a5fb4',size=22,ring=null, m=mapState.color;
  if(m==='ops'){ if(s.ops==='WORKING'){col=C_OK;} else if(s.ops==='NOT_WORKING'){col=C_BAD;size=26;ring=C_BAD;} else {col=C_UNK;size=20;} }
  else if(m==='dq'){ col=s.dq==='PASS'?C_OK:s.dq==='FAIL'?C_BAD:C_UNK; if(s.dq==='FAIL'){size=26;ring=C_BAD;} }
  else if(m==='qty'){ col=s.qty==='SUFFICIENT'?C_OK:s.qty==='INSUFFICIENT'?C_BAD:C_UNK; if(s.qty==='INSUFFICIENT'){size=26;ring=C_BAD;} }
  else if(m==='src'){ col=s.src==='GROUNDWATER'?'#b45309':s.src==='SURFACE_WATER'?'#1d4ed8':C_UNK; }
  else if(m==='age'){ col=s.age==null?C_UNK:s.age<=10?C_OK:s.age<=20?'#f9a825':C_BAD; }
  return {col:col,size:size,ring:ring};
}
var COLOR_LEG={ops:[[C_OK,'ใช้การได้'],[C_BAD,'ใช้การไม่ได้'],[C_UNK,'ไม่ทราบ']],dq:[[C_OK,'น้ำดื่มผ่านเกณฑ์'],[C_BAD,'น้ำดื่มไม่ผ่านเกณฑ์'],[C_UNK,'ไม่มีผลตรวจ']],qty:[[C_OK,'น้ำเพียงพอ'],[C_BAD,'น้ำไม่เพียงพอ'],[C_UNK,'ไม่มีข้อมูล']],src:[['#b45309','น้ำบาดาล'],['#1d4ed8','น้ำผิวดิน'],[C_UNK,'ไม่ระบุ']],age:[[C_OK,'อายุ ≤ 10 ปี'],['#f9a825','11–20 ปี'],[C_BAD,'มากกว่า 20 ปี'],[C_UNK,'ไม่ทราบปีที่สร้าง']]};
var PROB_L={ops:'ใช้การไม่ได้',dq:'น้ำดื่มไม่ผ่านเกณฑ์',qty:'น้ำไม่เพียงพอ',uq:'น้ำใช้ไม่ได้'};
function hasProb(s,k){ return k==='ops'?s.pOps:k==='dq'?s.pDq:k==='qty'?s.pQty:s.pUq; }
function passLayers(s){
  if(mapState.typesOn&&mapState.types&&!mapState.types.has(s.st)) return false;
  if(mapState.statusOn&&mapState.statuses){ var k=s.ops==='WORKING'?'OK':s.ops==='NOT_WORKING'?'BAD':'UNK'; if(!mapState.statuses.has(k)) return false; }
  if(mapState.probOn&&mapState.probs){ var ok=false; mapState.probs.forEach(function(p){ if(hasProb(s,p)) ok=true; }); if(!ok) return false; }
  if(mapState.dists&&!mapState.dists.has(s.d)) return false;
  return true;
}
function popup(s){
  var gm='https://www.google.com/maps?q='+s.lat+','+s.lng+'&z=17', ap='https://maps.apple.com/?ll='+s.lat+','+s.lng+'&q='+encodeURIComponent(s.nm||'ระบบประปา');
  var dmg=s.np>0?'<div class="popup-damage-badge">⚠️ '+probNames(s).join(', ')+'</div>':'';
  var detail=options.onOpenSystem?'<button type="button" class="popup-nav-btn popup-detail-btn" data-open-system="'+esc(s.id)+'">📋 ดูรายละเอียด</button>':'';
  return '<div style="font-family:\'Sarabun\',sans-serif;width:255px;font-size:13px;"><b style="color:#0d47a1;font-size:14px;">'+esc(s.nm||'ระบบประปา')+'</b><div style="color:#666;font-size:11.5px;margin-top:2px;">'+glyphOf(s)+' '+esc(L_ST[s.st]||s.st)+' · '+esc(s.d)+' · '+esc(s.vn)+(s.vno?' ม.'+esc(s.vno):'')+'</div>'+dmg
   +'<div style="font-size:12px;color:#333;line-height:1.8;margin:6px 0;"><div>⚙️ สถานะ: '+esc(L_OPS[s.ops]||'–')+'</div><div>🧪 น้ำดื่ม: '+esc(L_DQ[s.dq]||'–')+' · น้ำใช้: '+esc(L_UQ[s.uq]||'–')+'</div><div>💧 ความเพียงพอ: '+esc(L_QTY[s.qty]||'–')+'</div><div>🕰️ อายุ: '+(s.age!=null?s.age+' ปี (สร้าง พ.ศ. '+s.yr+')':'ไม่ทราบ')+'</div><div>🏠 ครัวเรือนที่รับน้ำ: '+(s.hh!=null?fmt(s.hh):'ไม่ระบุ')+'</div><div>🏛️ '+esc(s.la||'–')+' · '+esc(L_OT[s.ot]||'–')+'</div><div style="color:#999;font-size:11px;">📍 '+s.lat.toFixed(5)+', '+s.lng.toFixed(5)+(s.co?' <span style="color:#e65100;">(นอกพื้นที่พะเยา)</span>':'')+'</div></div>'
   +detail+'<a href="'+esc(gm)+'" target="_blank" rel="noopener" class="popup-nav-btn">🗺️ นำทางด้วย Google Maps</a><a href="'+esc(ap)+'" target="_blank" rel="noopener" style="display:block;margin-top:5px;text-align:center;font-size:11px;color:#888;text-decoration:none;">🍎 Apple Maps</a></div>';
}
function probNames(s){ var t=[]; if(s.pOps)t.push('ใช้การไม่ได้'); if(s.pDq)t.push('น้ำดื่มไม่ผ่านเกณฑ์'); if(s.pQty)t.push('น้ำไม่เพียงพอ'); if(s.pUq)t.push('น้ำใช้ไม่ได้'); return t; }
function buildLegend(data,targetId,plain){
  var it=function(dot,l){return '<span class="lg-it"><i class="lg-dot" style="background:'+dot+';"></i>'+l+'</span>';};
  var h='<div class="lg-row"><b class="lg-t">สัญลักษณ์:</b><span class="lg-it">🕳️ บาดาล</span><span class="lg-it">🏞️ ผิวดิน</span><span class="lg-it">💧 ไม่ระบุแหล่งน้ำ</span></div>';
  if(plain) h+='<div class="lg-row"><b class="lg-t">สี:</b>'+it('#f9a825','1 ด้าน')+it('#e65100','2 ด้าน')+it('#b71c1c','3 ด้านขึ้นไป')+'<b class="lg-t">สัญลักษณ์เตือน:</b><span class="lg-it">🔧 ใช้การไม่ได้</span><span class="lg-it">⚠️ พบปัญหาอื่น</span></div>';
  else h+='<div class="lg-row"><b class="lg-t">สี ('+({ops:'สถานะการใช้งาน',dq:'น้ำดื่ม',qty:'ความเพียงพอ',src:'แหล่งน้ำดิบ',age:'อายุระบบ'})[mapState.color]+'):</b>'+COLOR_LEG[mapState.color].map(function(x){return it(x[0],x[1]);}).join('')+'<b class="lg-t">สัญลักษณ์เตือน:</b><span class="lg-it">🔧 ใช้การไม่ได้</span><span class="lg-it">⚠️ พบปัญหาอื่น</span></div>';
  h+='<div class="lg-row lg-note">หมุดตัวเลข = หลายระบบรวมกลุ่มกัน คลิกเพื่อซูมเข้าไปดูทีละระบบ</div>';
  var el=$(targetId); if(el) el.innerHTML=h;
}
var lastMapKey='';
function drawMap(){
 if(!map.getContainer().offsetWidth)return;map.stop();
  var totalIn=FS.length, data=FS.filter(passLayers), arr=[], ll=[];
  cluster.clearLayers();
  data.forEach(function(s){ if(s.lat==null||s.lng==null) return; var m=L.marker([s.lat,s.lng],{icon:makeIcon(s,markerStyle(s))}); m.bindPopup(popup(s),{maxWidth:275,minWidth:255}); arr.push(m); ll.push([s.lat,s.lng]); });
  cluster.addLayers(arr);
  $('n-map').textContent='('+fmt(arr.length)+' จุดที่มีพิกัด)';
  var noXY=FS.filter(function(s){return s.lat==null;}).length, co=FS.filter(function(s){return s.co;}).length;
  $('mapNote').innerHTML=totalIn?('ระบบที่ไม่มีพิกัดบนแผนที่ '+fmt(noXY)+' ระบบ'+(co?' (รวมพิกัดผิดพื้นที่ '+co+' ระบบ)':'')+' — ยังนับในตัวเลขทั้งหมด'):'';
  setMapEmpty('heroMapStage',arr.length?'':(totalIn===0?'ไม่พบระบบประปาตามคำค้น/ตัวกรองที่เลือก — ลองเปลี่ยนคำค้นหรือกด "ล้างตัวกรอง"':(data.length===0?'ไม่มีระบบตรงกับ "ชั้นข้อมูล" ที่เลือกบนแผนที่ — ลองเปิดชั้นข้อมูลเพิ่ม':'พบ '+fmt(data.length)+' ระบบ แต่ไม่มีพิกัดให้แสดงบนแผนที่')));
  buildLegend(data,'mapLegend',false);
  var lk=function(x){return x?Array.from(x).sort().join(','):'ALL';};
  var key=[F.d,F.la,F.st,F.rule,F.q,mapState.typesOn?lk(mapState.types):'OFF',mapState.statusOn?lk(mapState.statuses):'OFF',mapState.probOn?lk(mapState.probs):'OFF',lk(mapState.dists)].join('|');
  if(key!==lastMapKey){ lastMapKey=key; if(key.replace(/\||ALL|OFF/g,'')!==''){ zoomToMarkers(map,ll); } else { map.setView(DEFAULT_CENTER,DEFAULT_ZOOM,{animate:false}); } }
}
// แผงควบคุม "ชั้นข้อมูล"
(function(){
  var btn=$('mlcToggle'),panel=$('mlcPanel'),arrow=$('mlcArrow');
  btn.addEventListener('click',function(e){ e.stopPropagation(); var o=panel.classList.toggle('open'); arrow.textContent=o?'▴':'▾'; });
  listen(document,'click',function(e){ if(!panel.contains(e.target)&&e.target!==btn){ panel.classList.remove('open'); arrow.textContent='▾'; } });
  var CO=[['ops','สถานะการใช้งาน'],['dq','คุณภาพน้ำดื่ม'],['qty','ความเพียงพอของน้ำ'],['src','ประเภทแหล่งน้ำดิบ'],['age','อายุระบบ']];
  $('mlcColorList').innerHTML=CO.map(function(c,i){return '<label class="mlc-opt"><input type="radio" name="mlcColor" value="'+c[0]+'"'+(i===0?' checked':'')+'>'+c[1]+'</label>';}).join('');
  $('mlcColorList').addEventListener('change',function(e){ if(e.target.name==='mlcColor'){ mapState.color=e.target.value; drawMap(); } });
  function layer(key,enableId,subId,listId,items,cls,setSet,allId,noneId,onKey){
    var list=$(listId); list.innerHTML=items.map(function(it){return '<label class="mlc-opt"><input type="checkbox" class="'+cls+'" value="'+esc(it[0])+'" checked>'+esc(it[1])+'</label>';}).join('');
    function sync(){ var bx=[].slice.call(list.querySelectorAll('.'+cls)), ck=bx.filter(function(b){return b.checked;}).map(function(b){return b.value;}); setSet(ck.length===bx.length?null:new Set(ck)); drawMap(); }
    list.addEventListener('change',sync);
    if(allId){ $(allId).addEventListener('click',function(){list.querySelectorAll('.'+cls).forEach(function(b){b.checked=true;});sync();}); $(noneId).addEventListener('click',function(){list.querySelectorAll('.'+cls).forEach(function(b){b.checked=false;});sync();}); }
    if(enableId){ $(enableId).addEventListener('change',function(e){ mapState[onKey]=e.target.checked; $(subId).style.display=e.target.checked?'block':'none'; drawMap(); }); $(subId).style.display=mapState[onKey]?'block':'none'; }
  }
  layer('type','mlcTypeEnable','mlcTypeSub','mlcTypeList',ST_ORDER.map(function(t){return [t,L_ST[t]];}),'mlc-type-cb',function(v){mapState.types=v;},'mlcTypeAll','mlcTypeNone','typesOn');
  layer('status','mlcStatusEnable','mlcStatusSub','mlcStatusList',[['OK','ใช้การได้'],['BAD','ใช้การไม่ได้'],['UNK','ไม่ทราบ']],'mlc-status-cb',function(v){mapState.statuses=v;},'mlcStatusAll','mlcStatusNone','statusOn');
  layer('prob','mlcProblemEnable','mlcProblemSub','mlcProblemList',[['ops','ใช้การไม่ได้'],['dq','น้ำดื่มไม่ผ่านเกณฑ์'],['qty','น้ำไม่เพียงพอ'],['uq','น้ำใช้ไม่ได้']],'mlc-prob-cb',function(v){mapState.probs=v;},'mlcProblemAll','mlcProblemNone','probOn');
  layer('dist',null,null,'mlcDistList',DIST.map(function(d){return [d,d];}),'mlc-dist-cb',function(v){mapState.dists=v;},'mlcDistAll','mlcDistNone',null);
})();

// ---------- แผนที่แท็บปัญหา (เหมือนแท็บแหล่งน้ำชำรุด) ----------
var pmap=null,pcl=null,pmarks={},dfState={d:'',st:'',problem:null,pick:null};
function ensurePmap(){ if(pmap) return; pmap=L.map('prob-map').setView(DEFAULT_CENTER,DEFAULT_ZOOM); addBaseMaps(pmap); pcl=makeCluster().addTo(pmap); addExpand(pmap,'probMapStage','prob'); bindPopupDetail(pmap); }
function probData(){ return FS.filter(function(s){return s.np>0&&(!dfState.d||s.d===dfState.d)&&(!dfState.st||s.st===dfState.st)&&(!dfState.problem||hasProb(s,dfState.problem));}).sort(function(a,b){return b.np-a.np||a.d.localeCompare(b.d,'th');}); }
function probEmptyMsg(data,n){
  if(n>0&&data.length>0) return '';
  var tot=FS.length, base=FS.filter(function(s){return s.np>0;}).length;
  if(tot===0) return 'ไม่พบระบบประปาตามคำค้น/ตัวกรองด้านบน — ลองเปลี่ยนคำค้นหรือกด "ล้างตัวกรอง"';
  if(base===0) return 'พบระบบประปา '+fmt(tot)+' ระบบตามตัวกรอง แต่ไม่มีระบบที่พบปัญหาเลย';
  if(data.length===0) return 'ไม่มีระบบที่ตรงกับตัวกรองในแท็บนี้ (อำเภอ/ประเภท/ปัญหา) — กด "ล้าง" เพื่อดูทั้งหมด';
  return 'พบ '+fmt(data.length)+' ระบบ แต่ไม่มีพิกัดให้แสดงบนแผนที่ (ดูรายการด้านล่าง)';
}
var lastPKey='||';
function renderProblem(keepView){
  var data=probData(); if(dfState.pick&&!data.some(function(s){return s.id===dfState.pick;})) dfState.pick=null;
  $('n-prob').textContent='('+fmt(data.length)+' ระบบ)';
  if($('panel-problem').classList.contains('active')){
    ensurePmap(); pcl.clearLayers(); pmarks={}; var arr=[],ll=[],n=0;
    data.forEach(function(s){ if(s.lat==null) return; n++; var c=s.np>=3?'#b71c1c':s.np===2?'#e65100':'#f9a825'; var m=L.marker([s.lat,s.lng],{icon:makeIcon(s,{col:c,size:s.pOps?26:22,ring:null}),zIndexOffset:dfState.pick===s.id?1000:0,title:s.nm||''}); m.bindPopup(popup(s),{maxWidth:275,minWidth:255}); m.on('click',function(){ if(dfState.pick!==s.id){ dfState.pick=s.id; renderProblem(true); } }); pmarks[s.id]=m; arr.push(m); ll.push([s.lat,s.lng]); });
    pcl.addLayers(arr); $('n-prob-map').textContent='('+fmt(n)+' จุดที่มีพิกัด)';
    setMapEmpty('probMapStage',probEmptyMsg(data,n));
    var key=[F.d,F.la,F.st,F.rule,F.q,dfState.d,dfState.st,dfState.problem||''].join('|');
    if(key!==lastPKey){ lastPKey=key; if(key.replace(/\|/g,'')!=='') zoomToMarkers(pmap,ll); else pmap.setView(DEFAULT_CENTER,DEFAULT_ZOOM,{animate:false}); }
    buildLegend(data,'probLegend',true);
    if(dfState.pick&&pmarks[dfState.pick]){ if(!keepView) pmap.setView(pmarks[dfState.pick].getLatLng(),16,{animate:false}); else { var pm=pmarks[dfState.pick]; pcl.zoomToShowLayer(pm,function(){pm.openPopup();}); } }
    later(function(){pmap.invalidateSize();},80);
  }
  var rows=dfState.pick?data.filter(function(s){return s.id===dfState.pick;}):data, view=rows.slice(0,400);
  $('probBody').innerHTML=view.map(function(s){ var has=s.lat!=null, nav=has?'<a href="'+esc('https://www.google.com/maps?q='+s.lat+','+s.lng+'&z=17')+'" target="_blank" rel="noopener" class="nav-btn-sm nav-gmap" onclick="event.stopPropagation()">🗺️ Maps</a>':'<span style="color:#ccc;font-size:11px;">ไม่มีพิกัด</span>';
    var act=(options.onOpenSystem?'<button type="button" class="nav-btn-sm prob-detail-btn" data-open-system="'+esc(s.id)+'">รายละเอียด</button> ':'')+nav;
    return '<tr class="dmg-row'+(has?' has-xy':'')+(dfState.pick===s.id?' picked':'')+'" data-id="'+esc(s.id)+'" title="'+(has?'คลิกเพื่อซูมไปที่หมุดบนแผนที่':'คลิกเพื่อดูรายละเอียดระบบประปา')+'"><td>'+esc(s.id)+'</td><td>'+esc(s.nm||'–')+'<br><small style="color:#5a7080;">'+esc(s.vn)+'</small></td><td>'+esc(s.d)+'</td><td>'+esc(s.la||'–')+'</td><td>'+probTags(s)+'</td><td><b style="color:'+C_BAD+';">'+s.np+'</b></td><td>'+act+'</td></tr>'; }).join('')||'<tr><td colspan="7" style="text-align:center;color:#5a6b7b;padding:24px;">'+(probEmptyMsg(data,0)||'ไม่พบข้อมูล')+'</td></tr>';
  if(rows.length>400) $('probBody').insertAdjacentHTML('beforeend','<tr><td colspan="7" style="color:#5a7080;font-size:11.5px;">แสดง 400 รายการแรกจาก '+fmt(rows.length)+' (เรียงตามจำนวนด้านที่มีปัญหา) — ใช้ตัวกรองเพื่อจำกัดรายการ</td></tr>');
  $('n-prob-list').textContent='('+fmt(rows.length)+(dfState.pick?' จาก '+fmt(data.length):'')+' รายการ)';
  var pk=dfState.pick&&data.filter(function(s){return s.id===dfState.pick;})[0];
  $('probPick').innerHTML=pk?'<button type="button" class="dmg-chip" id="probPickClr">กำลังแสดงเฉพาะ: '+esc(pk.nm||'ไม่ระบุชื่อ')+' <i>✕</i></button>':'';
  enhanceKeyboard();
}
listen(document,'click',function(e){
  var detailBtn=e.target.closest&&e.target.closest('#probBody [data-open-system]');
  if(detailBtn&&root.contains(detailBtn)){ e.stopPropagation(); detailBtn.focus({preventScroll:true}); options.onOpenSystem?.(detailBtn.dataset.openSystem); return; }
  var row=e.target.closest&&e.target.closest('#probBody tr.dmg-row');
  if(row&&root.contains(row)){ if(e.target.closest('a,button,input')) return; var m=pmarks[row.dataset.id]; if(m&&pmap){ pmap.closePopup(); $('probMapStage').scrollIntoView({behavior:'smooth',block:'center'}); pmap.setView(m.getLatLng(),17,{animate:false}); later(function(){pcl.zoomToShowLayer(m,function(){m.openPopup();});},780); root.querySelectorAll('#probBody tr.hot').forEach(function(x){x.classList.remove('hot');}); row.classList.add('hot'); } else if(options.onOpenSystem){ row.focus({preventScroll:true}); options.onOpenSystem(row.dataset.id); } return; }
  if(e.target.closest&&e.target.closest('#probPickClr')){ dfState.pick=null; renderProblem(true); }
});
(function(){
  var d=$('dfDist'),t=$('dfType'),ch=$('dfProblemChips');
  fillSel('dfDist',DIST); fillSel('dfType',ST_ORDER,function(x){return L_ST[x];});
  d.options[0].textContent='ทุกอำเภอ'; t.options[0].textContent='ทุกประเภท';
  Object.keys(PROB_L).forEach(function(k){ var c=document.createElement('button'); c.type='button'; c.className='df-chip'; c.setAttribute('aria-pressed','false'); c.textContent=PROB_L[k]; c.onclick=function(){ dfState.problem=dfState.problem===k?null:k; dfState.pick=null; root.querySelectorAll('.df-chip').forEach(function(x){x.classList.remove('active');x.setAttribute('aria-pressed','false');}); if(dfState.problem){ c.classList.add('active'); c.setAttribute('aria-pressed','true'); } renderProblem(); }; ch.appendChild(c); });
  d.addEventListener('change',function(){dfState.d=d.value;dfState.pick=null;renderProblem();});
  t.addEventListener('change',function(){dfState.st=t.value;dfState.pick=null;renderProblem();});
  $('dfReset').addEventListener('click',function(){dfState={d:'',st:'',problem:null,pick:null};d.value='';t.value='';root.querySelectorAll('.df-chip').forEach(function(x){x.classList.remove('active');x.setAttribute('aria-pressed','false');});renderProblem();});
})();

// ---------- กราฟ ----------
var CH={};
function mk(id,cfg){ var click=cfg.options&&cfg.options.onClick; if(click) cfg.options.onClick=function(){chartEventDepth++;try{return click.apply(this,arguments);}finally{chartEventDepth--;}}; if(CH[id]) CH[id].destroy(); CH[id]=new Chart($(id),cfg); return CH[id]; }
Chart.defaults.font.family="'Sarabun',sans-serif";

// ---------- KPI ----------
var kpiOpen=null;
function metrics(fs,fv){
  var ok=fs.filter(function(s){return s.ops==='WORKING';}).length, unk=fs.filter(function(s){return s.ops==='UNKNOWN';}).length;
  var dqA=fs.filter(function(s){return s.dq!=='NO_DATA';}).length, dqF=fs.filter(function(s){return s.pDq;}).length;
  var qA=fs.filter(function(s){return s.qty!=='NO_DATA';}).length, qF=fs.filter(function(s){return s.pQty;}).length;
  var ag=fs.filter(function(s){return s.age!=null;}), old=ag.filter(function(s){return s.age>=20;}).length;
  var hh=0,pw=0,sn=0; fv.filter(function(v){return v.hhKnown;}).forEach(function(v){hh+=v.hh;pw+=v.pwa;sn+=v.self+v.nat;});
  return {nv:fv.length,nvKnown:fv.filter(function(v){return v.ww!==null;}).length,ww:fv.filter(function(v){return v.ww;}).length,ns:fs.length,ok:ok,unk:unk,dqA:dqA,dqF:dqF,qA:qA,qF:qF,agN:ag.length,old:old,hh:hh,pwa:pw,sn:sn,
    nvs:new Set(fs.map(function(s){return s.vid;})).size};
}
var KPI=[
 {k:'v',ic:'🏘️',cls:'teal',l:'หมู่บ้านทั้งหมด',v:function(m){return fmt(m.nv);},s:function(m){return new Set(FV.map(function(v){return v.d;})).size+' อำเภอ · '+new Set(FV.map(function(v){return v.la;}).filter(Boolean)).size+' อปท.';},d:function(m){return {val:m.nv,t:fmt(m.nv)+' หมู่บ้าน'};}},
 {k:'ww',ic:'🚰',cls:'',l:'มีประปาหมู่บ้าน',v:function(m){return P(m.ww,m.nvKnown);},s:function(m){return fmt(m.ww)+' จาก '+fmt(m.nvKnown)+' หมู่บ้าน';},d:function(m){return {val:pc(m.ww,m.nvKnown),t:P(m.ww,m.nvKnown)+' ('+fmt(m.ww)+')'};}},
 {k:'ns',ic:'⚙️',cls:'',l:'ระบบประปาทั้งหมด',v:function(m){return fmt(m.ns);},s:function(m){return 'อยู่ใน '+fmt(m.nvs)+' หมู่บ้าน';},d:function(m){return {val:m.ns,t:fmt(m.ns)+' ระบบ'};}},
 {k:'ok',ic:'✅',cls:'ok',l:'ใช้การได้',v:function(m){return P(m.ok,m.ns);},s:function(m){return fmt(m.ok)+' ระบบ · ไม่ทราบสถานะ '+fmt(m.unk);},d:function(m){return {val:pc(m.ok,m.ns),t:P(m.ok,m.ns)+' ('+fmt(m.ok)+')'};}},
 {k:'dq',ic:'🧪',cls:'danger',l:'น้ำดื่มไม่ผ่านเกณฑ์',v:function(m){return P(m.dqF,m.dqA);},s:function(m){return fmt(m.dqF)+' จาก '+fmt(m.dqA)+' ระบบที่มีผลตรวจ';},d:function(m){return {val:pc(m.dqF,m.dqA),t:P(m.dqF,m.dqA)+' ('+fmt(m.dqF)+'/'+fmt(m.dqA)+')'};}},
 {k:'qty',ic:'💧',cls:'danger',l:'น้ำไม่เพียงพอ',v:function(m){return P(m.qF,m.qA);},s:function(m){return fmt(m.qF)+' จาก '+fmt(m.qA)+' ระบบที่มีข้อมูล';},d:function(m){return {val:pc(m.qF,m.qA),t:P(m.qF,m.qA)+' ('+fmt(m.qF)+'/'+fmt(m.qA)+')'};}},
 {k:'old',ic:'🕰️',cls:'warn',l:'ระบบอายุตั้งแต่ 20 ปี',v:function(m){return P(m.old,m.agN);},s:function(m){return fmt(m.old)+' จาก '+fmt(m.agN)+' ระบบที่ทราบปีสร้าง';},d:function(m){return {val:pc(m.old,m.agN),t:P(m.old,m.agN)+' ('+fmt(m.old)+'/'+fmt(m.agN)+')'};}},
 {k:'pwa',ic:'🏠',cls:'teal',l:'ครัวเรือนใช้น้ำประปา กปภ.',v:function(m){return P(m.pwa,m.hh);},s:function(m){return fmt(m.pwa)+' จาก '+fmt(m.hh)+' ครัวเรือน';},d:function(m){return {val:pc(m.pwa,m.hh),t:P(m.pwa,m.hh)+' ('+fmt(m.pwa)+')'};}}
];
window.toggleKpi=function(k){ kpiOpen=(kpiOpen===k)?null:k; renderKpi();enhanceKeyboard(); };
function renderKpi(){
  var m=metrics(FS,FV);
  $('execKpi').innerHTML=KPI.map(function(c){ return '<div class="kpi-card '+c.cls+(kpiOpen===c.k?' kpi-active':'')+'" onclick="toggleKpi(\''+c.k+'\')"><div class="ki">'+c.ic+'</div><div class="kv">'+c.v(m)+'</div><div class="kl">'+c.l+'</div><div class="ks">'+c.s(m)+'</div><div class="kpi-hint">'+(kpiOpen===c.k?'▲ ซ่อนรายละเอียดตามอำเภอ':'👆 คลิกดูรายละเอียดตามอำเภอ')+'</div></div>'; }).join('');
  var kd=$('kpiDetail'); var c=KPI.filter(function(x){return x.k===kpiOpen;})[0];
  if(!c){kd.classList.remove('open');kd.innerHTML='';return;}
  var gs=byDist(FS),gv=byDist(FV); var rows=DIST.map(function(d){ var mm=metrics(gs[d]||[],gv[d]||[]); var o=c.d(mm); return {d:d,val:o.val,t:o.t,n:(gs[d]||[]).length+(gv[d]||[]).length}; }).filter(function(r){return r.n>0;});
  var mx=Math.max.apply(null,rows.map(function(r){return r.val;}).concat([1])); var isPct=['ww','ok','dq','qty','old','pwa'].indexOf(c.k)>=0; if(isPct) mx=100;
  rows.sort(function(a,b){return (b.val==null&&a.val==null)?0:b.val==null?-1:a.val==null?1:b.val-a.val;});
  kd.innerHTML='<div class="kpi-detail-head"><div class="kpi-detail-title">📊 '+c.l+' แยกตามอำเภอ</div><button class="kpi-detail-close" onclick="event.stopPropagation();toggleKpi(\''+c.k+'\')">✕ ปิด</button></div>'
   +rows.map(function(r){ return '<div class="bar-row" onclick="event.stopPropagation();'+setClick('d',r.d)+'"><div class="lbl" title="'+esc(r.d)+'">'+esc(r.d)+'</div><div class="bar-track"><div class="bar-fill" style="width:'+(r.val!=null?pc(r.val,mx):0)+'%;background:'+C_BLUE+';"></div></div><div class="bar-val" style="width:auto;color:'+C_BLUE+';">'+r.t+'</div></div>'; }).join('');
  kd.classList.add('open');
}

// ---------- กราฟวงกลมสถานะ + ครัวเรือน ----------
function renderPies(){
  var n={W:0,N:0,U:0}; FS.forEach(function(s){ if(s.ops==='WORKING')n.W++; else if(s.ops==='NOT_WORKING')n.N++; else n.U++; });
  $('opsDesc').innerHTML='ใช้การได้: <span style="font-weight:800;color:'+C_OK+';">'+P(n.W,FS.length)+'</span> ของ '+fmt(FS.length)+' ระบบ';
  mk('c_ops',{type:'doughnut',data:{labels:['ใช้การได้','ใช้การไม่ได้','ไม่ทราบ'],datasets:[{data:[n.W,n.N,n.U],backgroundColor:[C_OK,C_BAD,C_UNK]}]},options:{maintainAspectRatio:false,plugins:{legend:{display:false}},onClick:function(e,els){ if(els.length){ var i=els[0].index; setF('rule',i===0?'ok':i===1?'ops':''); } }}});
  $('ops_legend').innerHTML=[['ok','ใช้การได้',n.W,C_OK],['ops','ใช้การไม่ได้',n.N,C_BAD]].map(function(x){return '<span style="display:inline-flex;align-items:center;gap:3px;margin-right:8px;cursor:pointer;" onclick="'+setClick('rule',x[0])+'"><span style="width:9px;height:9px;background:'+x[3]+';border-radius:2px;flex:none;"></span>'+x[1]+' '+fmt(x[2])+'</span>';}).join('')+'<span style="color:#6b777c;">ไม่ทราบ '+fmt(n.U)+'</span>';
  var tot=HH.map(function(h){return FV.reduce(function(a,v){return a+(v.hhKnown?v[h[0]]:0);},0);}); var sum=tot.reduce(function(a,b){return a+b;},0);
  mk('c_hh',{type:'doughnut',data:{labels:HH.map(function(h){return h[1];}),datasets:[{data:tot,backgroundColor:HH.map(function(h){return h[2];})}]},options:{maintainAspectRatio:false,plugins:{legend:{display:false}}}});
  $('hh_legend').innerHTML=HH.map(function(h,i){return '<span style="display:inline-flex;align-items:center;gap:3px;margin-right:8px;"><span style="width:9px;height:9px;background:'+h[2]+';border-radius:2px;flex:none;"></span>'+h[1]+' '+fmt(tot[i])+' ('+P(tot[i],sum)+')</span>';}).join('');
}

// ---------- ความครอบคลุม ----------
function renderCoverage(){
  var gv=byDist(FV), ds=DIST.filter(function(d){return gv[d];});
  var sums=ds.map(function(d){var o={d:d,hh:0}; HH.forEach(function(h){o[h[0]]=gv[d].reduce(function(a,v){return a+(v.hhKnown?v[h[0]]:0);},0);o.hh+=o[h[0]];}); return o;});
  var allHh=sums.reduce(function(a,o){return a+o.hh;},0), allSN=sums.reduce(function(a,o){return a+o.self+o.nat;},0);
  $('hhMixDesc').innerHTML='แต่ละแท่ง = 100% ของครัวเรือนในอำเภอนั้น (เรียงจากพึ่งประปา กปภ. มากไปน้อย)';
  var sorted=sums.slice().sort(function(a,b){return pc(b.pwa,b.hh)-pc(a.pwa,a.hh);});
  mk('c_hhmix',{type:'bar',data:{labels:sorted.map(function(o){return o.d;}),datasets:HH.map(function(h){return {label:h[1],data:sorted.map(function(o){return o.hh?+(o[h[0]]/o.hh*100).toFixed(1):null;}),backgroundColor:h[2]};})},
    options:{indexAxis:'y',maintainAspectRatio:false,scales:{x:{stacked:true,max:100,ticks:{callback:function(v){return v+'%';}}},y:{stacked:true}},plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:10.5}}},tooltip:{callbacks:{label:function(c){return c.dataset.label+': '+c.parsed.x+'%';}}}},onClick:function(e,els){ if(els.length) setF('d',sorted[els[0].index].d); }}});
  var avg=pc(allSN,allHh); var rows=sums.filter(function(o){return o.hh>0;}).map(function(o){return {d:o.d,p:pc(o.self+o.nat,o.hh),n:o.self+o.nat,t:o.hh};}).sort(function(a,b){return b.p-a.p;});
  $('selfNat').innerHTML=rows.length?rows.map(function(r){return barRow(esc(r.d),r.p,r.p>avg?C_BAD:C_OK,f1(r.p)+'%',fmt(r.n)+'/'+fmt(r.t),setClick('d',r.d),F.d===r.d,'เฉลี่ยพื้นที่ที่แสดง '+f1(avg)+'%');}).join('')+'<div style="font-size:10.5px;color:#5a7080;margin-top:4px;">ค่าเฉลี่ยพื้นที่ที่แสดง = '+f1(avg)+'%</div>':empty();
  var cov=ds.map(function(d){var a=gv[d].filter(function(v){return v.ww!==null;}); var w=a.filter(function(v){return v.ww;}); return {d:d,p:pc(w.length,a.length),w:w.length,n:a.length,miss:w.filter(function(v){return v.ns===0;}).length};}).filter(function(r){return r.n>0;}).sort(function(a,b){return a.p-b.p;});
  $('wwCover').innerHTML=cov.length?cov.map(function(r){return barRow(esc(r.d),r.p||0,C_BLUE,P(r.w,r.n),r.miss?'ไม่มีข้อมูลระบบ '+r.miss:'',setClick('d',r.d),F.d===r.d,fmt(r.w)+' จาก '+fmt(r.n)+' หมู่บ้าน');}).join(''):empty();
  var no=FV.filter(function(v){return v.ww===false&&v.hhKnown;}).map(function(v){return {v:v,sn:v.self+v.nat};}).filter(function(x){return x.sn>0;}).sort(function(a,b){return b.sn-a.sn;}).slice(0,12);
  $('noWwTop').innerHTML=no.length?'<table class="data-tbl"><thead><tr><th>หมู่บ้าน</th><th>อำเภอ</th><th>อปท.</th><th>ครัวเรือนรวม</th><th>ตนเอง/ธรรมชาติ</th></tr></thead><tbody>'+no.map(function(x){return '<tr><td>'+esc(x.v.nm)+'</td><td>'+esc(x.v.d)+'</td><td>'+esc(x.v.la||'–')+'</td><td>'+fmt(x.v.hh)+'</td><td><b style="color:'+C_BAD+';">'+fmt(x.sn)+'</b> ('+P(x.sn,x.v.hh)+')</td></tr>';}).join('')+'</tbody></table>':empty('ไม่พบหมู่บ้านที่ไม่มีประปาและมีข้อมูลครัวเรือนในตัวกรองนี้');
}

// ---------- คุณภาพน้ำ ----------
function riskRows(groups,fnNum,fnDen,avg,key){
  var rows=Object.keys(groups).map(function(k){return {k:k,n:fnNum(groups[k]),d:fnDen(groups[k])};}).filter(function(r){return r.d>0;}).map(function(r){r.p=pc(r.n,r.d);return r;}).sort(function(a,b){return b.p-a.p;});
  return rows.length?rows.map(function(r){return barRow(esc(L_ST[r.k]||r.k),r.p,r.p>avg?C_BAD:C_OK,f1(r.p)+'%','('+fmt(r.n)+'/'+fmt(r.d)+')',setClick(key,r.k),F[key]===r.k,r.p>avg?'สูงกว่าเฉลี่ย':'ไม่เกินเฉลี่ย');}).join(''):empty();
}
function renderQuality(){
  var gs=byDist(FS), A=FS.filter(function(s){return s.dq!=='NO_DATA';}), avgDq=pc(A.filter(function(s){return s.pDq;}).length,A.length);
  $('dqDesc').innerHTML='ค่าเฉลี่ยของพื้นที่ที่แสดง: <b style="color:'+C_BAD+';">'+f1(avgDq)+'%</b> · สีแดง = สูงกว่าค่าเฉลี่ย สีเขียว = ไม่เกินค่าเฉลี่ย';
  var rows=DIST.filter(function(d){return gs[d];}).map(function(d){var a=gs[d].filter(function(s){return s.dq!=='NO_DATA';}); return {k:d,n:a.filter(function(s){return s.pDq;}).length,d:a.length};}).filter(function(r){return r.d>0;}).map(function(r){r.p=pc(r.n,r.d);return r;}).sort(function(a,b){return b.p-a.p;});
  $('dqRisk').innerHTML=rows.length?rows.map(function(r){return barRow(esc(r.k),r.p,r.p>avgDq?C_BAD:C_OK,f1(r.p)+'%','('+fmt(r.n)+'/'+fmt(r.d)+')',setClick('d',r.k),F.d===r.k,'');}).join(''):empty();
  var gt=byDist(FS,'st');
  $('dqType').innerHTML=ST_ORDER.filter(function(t){return gt[t];}).map(function(t){var a=gt[t]; return stackRow(L_ST[t],[{n:a.filter(function(s){return s.dq==='FAIL';}).length,color:C_BAD,label:'ไม่ผ่านเกณฑ์',main:true},{n:a.filter(function(s){return s.dq==='PASS';}).length,color:C_OK,label:'ผ่านเกณฑ์'},{n:a.filter(function(s){return s.dq==='NO_DATA';}).length,color:'#cfd8dc',label:'ไม่มีข้อมูล'}],a.length,setClick('st',t),F.st===t,'แดง=ไม่ผ่าน เขียว=ผ่าน เทา=ไม่มีผลตรวจ');}).join('')||empty();
  var Q=FS.filter(function(s){return s.qty!=='NO_DATA';}), avgQ=pc(Q.filter(function(s){return s.pQty;}).length,Q.length);
  var qr=DIST.filter(function(d){return gs[d];}).map(function(d){var a=gs[d].filter(function(s){return s.qty!=='NO_DATA';}); return {k:d,n:a.filter(function(s){return s.pQty;}).length,d:a.length};}).filter(function(r){return r.d>0;}).map(function(r){r.p=pc(r.n,r.d);return r;}).sort(function(a,b){return b.p-a.p;});
  $('qtyRisk').innerHTML=qr.length?'<div style="font-size:10.5px;color:#5a7080;margin-bottom:6px;">ค่าเฉลี่ยของพื้นที่ที่แสดง '+f1(avgQ)+'%</div>'+qr.map(function(r){return barRow(esc(r.k),r.p,r.p>avgQ?C_BAD:C_OK,f1(r.p)+'%','('+fmt(r.n)+'/'+fmt(r.d)+')',setClick('d',r.k),F.d===r.k,'');}).join(''):empty();
  var multi=FS.filter(function(s){return s.np>=2;}).sort(function(a,b){return b.np-a.np||a.d.localeCompare(b.d,'th');}).slice(0,15);
  $('multiTop').innerHTML=multi.length?'<table class="data-tbl"><thead><tr><th>ระบบ / หมู่บ้าน</th><th>อำเภอ</th><th>ปัญหาที่พบ</th><th>ด้าน</th></tr></thead><tbody>'+multi.map(function(s){return '<tr><td>'+esc(s.nm||'–')+'<br><small style="color:#5a7080;">'+esc(s.vn)+'</small></td><td>'+esc(s.d)+'</td><td>'+probTags(s)+'</td><td><b style="color:'+C_BAD+';">'+s.np+'</b></td></tr>';}).join('')+'</tbody></table><div style="font-size:10.5px;color:#5a7080;margin-top:6px;">แสดง 15 อันดับแรกจาก '+fmt(FS.filter(function(s){return s.np>=2;}).length)+' ระบบที่มีปัญหา ≥ 2 ด้าน</div>':empty('ไม่พบระบบที่มีปัญหา ≥ 2 ด้านพร้อมกันในตัวกรองนี้');
if(!A.length)$('dqDesc').textContent='ไม่มีผลตรวจน้ำดื่มที่ใช้คำนวณในขอบเขตนี้';
}
function probTags(s){ var t=[]; if(s.pOps)t.push('ใช้การไม่ได้'); if(s.pDq)t.push('น้ำดื่มไม่ผ่าน'); if(s.pQty)t.push('น้ำไม่พอ'); if(s.pUq)t.push('น้ำใช้ไม่ได้'); return t.map(function(x){return '<span class="badge-type" style="background:#ffebee;color:#b71c1c;margin:1px;">'+x+'</span>';}).join(''); }

// ---------- อายุระบบ ----------
var AGEB=[['≤ 5 ปี',0,5],['6–10 ปี',6,10],['11–20 ปี',11,20],['21–30 ปี',21,30],['> 30 ปี',31,Infinity]];
function ageBand(s){ if(s.age==null) return -1; for(var i=0;i<AGEB.length;i++) if(s.age>=AGEB[i][1]&&s.age<=AGEB[i][2]) return i; return -1; }
function renderAge(){
  var af=$('ageFormulaSub')||root.querySelector('.exec-section:nth-of-type(4) .sec-sub');
  if(af) af.textContent='ใช้วางแผนซ่อมบำรุงและทดแทนระบบเก่า · อายุ = ปี พ.ศ. '+NOW+' − ปีที่สร้าง';
  var bs=AGEB.map(function(){return [];}); FS.forEach(function(s){var i=ageBand(s); if(i>=0) bs[i].push(s);});
  var nop=FS.filter(function(s){return s.age==null;}).length;
  mk('c_age',{data:{labels:AGEB.map(function(b){return b[0];}),datasets:[
    {type:'bar',label:'จำนวนระบบ',data:bs.map(function(b){return b.length;}),backgroundColor:'#90caf9',yAxisID:'y'},
    {type:'line',label:'% ใช้การไม่ได้',data:bs.map(function(b){return b.length?+pc(b.filter(function(s){return s.pOps;}).length,b.length).toFixed(1):null;}),borderColor:C_BAD,backgroundColor:C_BAD,yAxisID:'y1',tension:.2},
    {type:'line',label:'% น้ำดื่มไม่ผ่าน (ของที่มีผลตรวจ)',data:bs.map(function(b){var a=b.filter(function(s){return s.dq!=='NO_DATA';});return a.length?+pc(a.filter(function(s){return s.pDq;}).length,a.length).toFixed(1):null;}),borderColor:C_WARN,backgroundColor:C_WARN,yAxisID:'y1',tension:.2}]},
   options:{maintainAspectRatio:false,scales:{y:{title:{display:true,text:'ระบบ'}},y1:{position:'right',min:0,max:100,grid:{drawOnChartArea:false},ticks:{callback:function(v){return v+'%';}}}},plugins:{legend:{labels:{boxWidth:10,font:{size:10.5}}}}}});
  $('ageNote').innerHTML='ไม่ทราบปีที่สร้าง '+fmt(nop)+' ระบบ (ไม่นับในกราฟ) · ช่วงที่มีระบบน้อยมากให้ใช้ด้วยความระมัดระวัง';
  var gt=byDist(FS,'st');
  $('typeOps').innerHTML=ST_ORDER.filter(function(t){return gt[t];}).map(function(t){var a=gt[t]; return stackRow(L_ST[t],[{n:a.filter(function(s){return s.pOps;}).length,color:C_BAD,label:'ใช้การไม่ได้',main:true},{n:a.filter(function(s){return s.ops==='WORKING';}).length,color:C_OK,label:'ใช้การได้'},{n:a.filter(function(s){return s.ops==='UNKNOWN';}).length,color:'#cfd8dc',label:'ไม่ทราบ'}],a.length,setClick('st',t),F.st===t,'');}).join('')||empty();
}

// ---------- ผู้รับผิดชอบ ----------
function opsParts(a){return [{n:a.filter(function(s){return s.pOps;}).length,color:C_BAD,label:'ใช้การไม่ได้',main:true},{n:a.filter(function(s){return s.ops==='WORKING';}).length,color:C_OK,label:'ใช้การได้'},{n:a.filter(function(s){return s.ops==='UNKNOWN';}).length,color:'#cfd8dc',label:'ไม่ทราบ'}];}
function renderOwner(){
  var go=byDist(FS,'ot'); $('ownerBox').innerHTML=Object.keys(L_OT).filter(function(k){return go[k];}).map(function(k){return stackRow(L_OT[k],opsParts(go[k]),go[k].length);}).join('')||empty();
  var ge=byDist(FS,'est'); $('estBox').innerHTML=Object.keys(L_EST).filter(function(k){return ge[k];}).map(function(k){return stackRow(L_EST[k],opsParts(ge[k]),ge[k].length);}).join('')||empty();
  var tr=FS.filter(function(s){return s.est==='TRANSFERRED';}); var td={}; tr.forEach(function(s){td[s.td]=(td[s.td]||0)+1;});
  $('tdBox').innerHTML=tr.length?['AVAILABLE','NOT_AVAILABLE','NO_DATA'].map(function(k){return barRow(L_TD[k],pc(td[k]||0,tr.length),k==='AVAILABLE'?C_OK:k==='NOT_AVAILABLE'?C_BAD:C_UNK,f1(pc(td[k]||0,tr.length))+'%','('+fmt(td[k]||0)+')');}).join('')+'<div style="font-size:10.5px;color:#5a7080;margin-top:4px;">ระบบที่ถ่ายโอนมา '+fmt(tr.length)+' ระบบ</div>':empty('ไม่มีระบบที่ถ่ายโอนมาในตัวกรองนี้');
}

// ---------- คุณภาพข้อมูล ----------
function renderDqa(){
 var N=FS.length, availability=currentDataset.availability||{};
 var fields=[['พิกัดที่ใช้แสดงแผนที่ได้','latitude',function(s){return s.lat!=null&&s.lng!=null;}],['จำนวนครัวเรือนที่รับน้ำ','households_served',function(s){return s.hh!=null;}],['ปีที่สร้าง','construction_year_be',function(s){return s.yr!=null;}],['กำลังผลิต (ลบ.ม./ชม.)','capacity_m3_hr',function(s){return s.cap!=null;}],['ผลตรวจน้ำดื่ม','drinking_water_quality',function(s){return s.dq==='PASS'||s.dq==='FAIL';}],['ข้อมูลความเพียงพอของน้ำ','water_quantity',function(s){return s.qty==='SUFFICIENT'||s.qty==='INSUFFICIENT';}],['ที่มา/การจัดตั้งระบบ','establishment_type',function(s){return s.est!=='UNKNOWN';}],['ประเภทการใช้น้ำ','usage_type',function(s){return !!s.use&&!!s.use&&s.use!=='UNKNOWN';}]];
 var linkedMissing=FV.filter(function(v){return v.ww===true&&v.ns===0;}).length;
 var householdMissing=FV.filter(function(v){return !v.hhKnown;}).length;
 var warnings=[['ข้อมูลในขอบเขตที่แสดง','คำนวณจาก '+fmt(N)+' ระบบ และ '+fmt(FV.length)+' หมู่บ้านที่ผ่านตัวกรองและสิทธิ์ ไม่ใช่การยืนยันความครบถ้วนของทั้งจังหวัด'],['หมู่บ้านมีประปาแต่ไม่มีระบบเชื่อม',fmt(linkedMissing)+' หมู่บ้าน'],['ข้อมูลจำนวนตามแหล่งน้ำไม่ครบ',fmt(householdMissing)+' หมู่บ้านไม่รวมในฐานสัดส่วนครัวเรือน รายการที่รายงานอาจซ้ำข้ามแหล่งน้ำได้'],['พิกัดที่ไม่แสดงบนแผนที่',fmt(FS.filter(function(s){return s.lat==null;}).length)+' ระบบยังอยู่ในตัวเลขอื่น'],['ฐานกำลังผลิต',fmt(FS.filter(function(s){return s.cap!=null;}).length)+' ระบบมีค่าจำนวนไม่ติดลบ ไม่ตัดค่ามากกว่า 1,000 โดยไม่มีเกณฑ์ยืนยัน']];
 $('dqaBox').innerHTML='<div class="charts-2col"><div><h3>ความครบถ้วนของข้อมูลระบบประปา ('+fmt(N)+' ระบบ)</h3><div class="chart-desc">จำนวนที่มีข้อมูลในแต่ละช่อง พร้อมฐานระบบที่แสดง</div>'+fields.map(function(f){if(availability[f[1]]===false)return '<div>'+esc(f[0])+': ข้อมูลนี้ไม่เปิดเผยหรือไม่รองรับ</div>';var count=FS.filter(f[2]).length;return barRow(esc(f[0]),pc(count,N)||0,C_BLUE,N?P(count,N):'ไม่มีฐานคำนวณ','('+fmt(count)+'/'+fmt(N)+')');}).join('')+'</div><div><h3>ข้อควรระวังเมื่อใช้ตัวเลข</h3>'+warnings.map(function(w){return '<div style="margin-bottom:10px;font-size:12px"><b>'+esc(w[0])+'</b><br>'+esc(w[1])+'</div>';}).join('')+'</div></div>';
}

// ---------- มุมมองรายละเอียด ----------
function renderPivot(){
  var h='<tr><th>อำเภอ</th>'+ST_ORDER.map(function(t){return '<th style="cursor:pointer;" onclick="'+setClick('st',t)+'">'+L_ST[t]+'</th>';}).join('')+'<th>รวม</th></tr>';
  $('pivotHead').innerHTML=h; var g=byDist(FS),tot={},grand=0, b='';
  DIST.filter(function(d){return g[d];}).forEach(function(d){ var a=g[d]; b+='<tr><td style="cursor:pointer;font-weight:700;" onclick="'+setClick('d',d)+'">'+esc(d)+'</td>'; ST_ORDER.forEach(function(t){var n=a.filter(function(s){return s.st===t;}).length; tot[t]=(tot[t]||0)+n; b+='<td style="cursor:pointer;text-align:right;" onclick="'+esc('setPair('+jsarg(d)+','+jsarg(t)+')')+'">'+(n?fmt(n):'–')+'</td>';}); b+='<td style="text-align:right;font-weight:800;">'+fmt(a.length)+'</td></tr>'; grand+=a.length; });
  $('pivotBody').innerHTML=b||'<tr><td colspan="10">'+empty()+'</td></tr>';
  $('pivotFoot').innerHTML='<tr><td>รวม</td>'+ST_ORDER.map(function(t){return '<td style="text-align:right;">'+fmt(tot[t]||0)+'</td>';}).join('')+'<td style="text-align:right;">'+fmt(grand)+'</td></tr>';
}
function cmpCell(txt,val,avg,high){ if(val==null||avg==null) return '<td style="text-align:right;color:'+C_UNK+';font-weight:700;">'+txt+'</td>'; var bad=high?val>avg:val<avg; return '<td style="text-align:right;color:'+(bad?C_BAD:C_OK)+';font-weight:700;">'+txt+'</td>'; }
function renderCompare(){
  var gs=byDist(FS),gv=byDist(FV), all=metrics(FS,FV); var rows=DIST.filter(function(d){return gs[d]||gv[d];}).map(function(d){return {d:d,m:metrics(gs[d]||[],gv[d]||[])};});
  var snAll=pc(all.sn,all.hh);
  $('districtCompare').innerHTML=rows.length?'<table class="data-tbl"><thead><tr><th>อำเภอ</th><th>หมู่บ้าน</th><th>% มีประปา</th><th>ระบบ</th><th>% ใช้การได้</th><th>% น้ำดื่มไม่ผ่าน</th><th>% น้ำไม่พอ</th><th>% ระบบอายุ ≥ 20 ปี</th><th>% ครัวเรือนใช้ กปภ.</th><th>% ตนเอง/ธรรมชาติ</th></tr></thead><tbody>'
   +rows.map(function(r){var m=r.m; return '<tr style="cursor:pointer;" onclick="'+setClick('d',r.d)+'"><td><b>'+esc(r.d)+'</b></td><td style="text-align:right;">'+fmt(m.nv)+'</td><td style="text-align:right;">'+P(m.ww,m.nvKnown)+'</td><td style="text-align:right;">'+fmt(m.ns)+'</td>'
     +cmpCell(P(m.ok,m.ns),pc(m.ok,m.ns),pc(all.ok,all.ns),false)+cmpCell(P(m.dqF,m.dqA),pc(m.dqF,m.dqA),pc(all.dqF,all.dqA),true)+cmpCell(P(m.qF,m.qA),pc(m.qF,m.qA),pc(all.qF,all.qA),true)+cmpCell(P(m.old,m.agN),pc(m.old,m.agN),pc(all.old,all.agN),true)
     +cmpCell(P(m.pwa,m.hh),pc(m.pwa,m.hh),pc(all.pwa,all.hh),false)+cmpCell(P(m.sn,m.hh),pc(m.sn,m.hh),snAll,true)+'</tr>';}).join('')
   +'<tr style="background:#f0f5fa;font-weight:800;"><td>รวมที่แสดง</td><td style="text-align:right;">'+fmt(all.nv)+'</td><td style="text-align:right;">'+P(all.ww,all.nvKnown)+'</td><td style="text-align:right;">'+fmt(all.ns)+'</td><td style="text-align:right;">'+P(all.ok,all.ns)+'</td><td style="text-align:right;">'+P(all.dqF,all.dqA)+'</td><td style="text-align:right;">'+P(all.qF,all.qA)+'</td><td style="text-align:right;">'+P(all.old,all.agN)+'</td><td style="text-align:right;">'+P(all.pwa,all.hh)+'</td><td style="text-align:right;">'+P(all.sn,all.hh)+'</td></tr></tbody></table>':empty();
}

// ---------- ข้อมูลเชิงลึก ----------
function ixCard(c,ic,t,h,s,f){ return '<a class="ix-fd" '+(f?'onclick="'+f+'" style="cursor:pointer;--c:'+c+';"':'style="--c:'+c+';"')+'><span class="ic">'+ic+'</span><div class="t">'+t+'</div><div class="h">'+esc(h)+'</div><div class="s">'+s+'</div></a>'; }
function heat(rows,cols,cell,note){
  var mx={}; cols.forEach(function(c){mx[c.k]=Math.max.apply(null,rows.map(function(r){return cell(r,c).v;}).concat([0.0001]));});
  var h='<div class="ix-heat-wrap"><table class="ix-heat"><thead><tr><th class="ix-corner">'+note.corner+'</th>'+cols.map(function(c){return '<th>'+esc(c.l)+'</th>';}).join('')+'</tr></thead><tbody>';
  rows.forEach(function(r){ h+='<tr><td class="ix-tb" style="cursor:pointer;" onclick="'+setClick(note.key,r.k)+'">'+esc(r.l)+'<small>('+fmt(r.n)+')</small></td>'+cols.map(function(c){var o=cell(r,c); var a=o.n&&mx[c.k]?o.v/mx[c.k]:0; return '<td title="'+esc(o.t)+'" style="background:rgba(198,40,40,'+(0.05+0.6*a).toFixed(2)+');">'+(o.n?o.v.toFixed(0)+'%':'–')+'</td>';}).join('')+'</tr>'; });
  return h+'</tbody></table></div><div class="ix-note">'+note.text+'</div>';
}
function renderInsight(){
  var N=FS.length; if(!N){ $('ixBody').innerHTML='<div class="ix-empty">ไม่มีข้อมูลตามตัวกรองปัจจุบัน</div>'; return; }
  var gs=byDist(FS), cards=[];
  var dl=DIST.filter(function(d){return gs[d];}).map(function(d){var a=gs[d],q=a.filter(function(s){return s.dq!=='NO_DATA';}); return {d:d,n:a.length,q:q.length,f:q.filter(function(s){return s.pDq;}).length,np:a.filter(function(s){return s.np>0;}).length,m:a.filter(function(s){return s.np>=2;}).length};});
  var dq=dl.filter(function(r){return r.q>=10;}).sort(function(a,b){return pc(b.f,b.q)-pc(a.f,a.q);});
  var allQ=FS.filter(function(s){return s.dq!=='NO_DATA';}), allF=allQ.filter(function(s){return s.pDq;}).length;
  if(dq.length) cards.push(ixCard('#c62828','🧪','อำเภอที่น้ำดื่มไม่ผ่านเกณฑ์สูงสุด','อ.'+dq[0].d,fmt(dq[0].f)+' จาก '+fmt(dq[0].q)+' ระบบที่มีผลตรวจ ('+P(dq[0].f,dq[0].q)+') · เฉลี่ยรวม '+P(allF,allQ.length)+' (เฉพาะอำเภอที่มีผลตรวจ ≥ 10 ระบบ)',setClick('d',dq[0].d)));
  var sg=byDist(FS,'src'), sq=['GROUNDWATER','SURFACE_WATER'].map(function(k){var a=(sg[k]||[]).filter(function(s){return s.dq!=='NO_DATA';});return {k:k,n:a.length,f:a.filter(function(s){return s.pDq;}).length};});
  if(sq[0].n&&sq[1].n) cards.push(ixCard('#1565c0','⛲','น้ำบาดาล vs น้ำผิวดิน — ไม่ผ่านเกณฑ์','บาดาล '+P(sq[0].f,sq[0].n)+' · ผิวดิน '+P(sq[1].f,sq[1].n),'จากระบบที่มีผลตรวจ '+fmt(sq[0].n)+' และ '+fmt(sq[1].n)+' ระบบ — ไม่ได้บอกสาเหตุ (ชีตไม่มีข้อมูลสาเหตุที่ไม่ผ่าน)',''));
  var ag=FS.filter(function(s){return s.age!=null;}), old=ag.filter(function(s){return s.age>=20;}), yng=ag.filter(function(s){return s.age<20;});
  if(old.length&&yng.length) cards.push(ixCard('#558b2f','🕰️','ระบบอายุตั้งแต่ 20 ปี vs ต่ำกว่า 20 ปี — ใช้การไม่ได้','เก่า '+P(old.filter(function(s){return s.pOps;}).length,old.length)+' · ใหม่ '+P(yng.filter(function(s){return s.pOps;}).length,yng.length),'จาก '+fmt(old.length)+' และ '+fmt(yng.length)+' ระบบที่ทราบปีสร้าง — เป็นความสัมพันธ์ ไม่ใช่การพิสูจน์สาเหตุ',''));
  var ml=dl.slice().sort(function(a,b){return b.m-a.m;})[0]; if(ml&&ml.m) cards.push(ixCard('#e0730f','⚠️','อำเภอที่มีระบบปัญหาหลายด้านมากที่สุด','อ.'+ml.d,fmt(ml.m)+' ระบบมีปัญหา ≥ 2 ด้าน จาก '+fmt(ml.n)+' ระบบ',setClick('d',ml.d)));
  var vsn=byDist(FV); var sn=DIST.filter(function(d){return vsn[d];}).map(function(d){var a=vsn[d],h=0,s=0;a.filter(function(v){return v.hhKnown;}).forEach(function(v){h+=v.hh;s+=v.self+v.nat;});return {d:d,h:h,s:s};}).filter(function(r){return r.h>0;}).sort(function(a,b){return pc(b.s,b.h)-pc(a.s,a.h);});
  if(sn.length) cards.push(ixCard('#6a1b9a','🏠','อำเภอที่ครัวเรือนพึ่งแหล่งน้ำตนเอง/ธรรมชาติมากที่สุด','อ.'+sn[0].d,fmt(sn[0].s)+' จาก '+fmt(sn[0].h)+' ครัวเรือน ('+P(sn[0].s,sn[0].h)+')',setClick('d',sn[0].d)));
  var vNo=FV.filter(function(v){return v.ww&&v.ns===0;}).length; if(vNo) cards.push(ixCard('#455a64','🗂️','ช่องว่างของข้อมูลที่ต้องเก็บเพิ่มก่อน','หมู่บ้านมีประปาแต่ไม่มีข้อมูลระบบ '+fmt(vNo),'ตัวเลขสถานะ/คุณภาพน้ำของจังหวัดจึงเป็นของหมู่บ้านที่มีข้อมูลระบบเท่านั้น',''));
  var h='<div class="ix-grp"><i>💡</i>สิ่งที่ข้อมูลบอก <small>คำนวณอัตโนมัติจากข้อมูลที่แสดงอยู่ · คลิกการ์ดเพื่อกรอง</small></div><div class="ix-finds">'+cards.join('')+'</div>';
  // heat: district x problem
  var cols=[{k:'ops',l:'ใช้การไม่ได้',f:function(s){return s.pOps;},d:function(s){return s.ops!=='UNKNOWN';}},{k:'dq',l:'น้ำดื่มไม่ผ่าน',f:function(s){return s.pDq;},d:function(s){return s.dq!=='NO_DATA';}},{k:'qty',l:'น้ำไม่เพียงพอ',f:function(s){return s.pQty;},d:function(s){return s.qty!=='NO_DATA';}},{k:'uq',l:'น้ำใช้ไม่ได้',f:function(s){return s.pUq;},d:function(s){return s.uq!=='UNKNOWN';}}];
  var rows=DIST.filter(function(d){return gs[d];}).map(function(d){return {k:d,l:d,n:gs[d].length,a:gs[d]};});
  var heatD=heat(rows,cols,function(r,c){var a=r.a.filter(c.d),f=a.filter(c.f).length; return {v:pc(f,a.length),n:a.length,t:r.l+' · '+c.l+': '+f+' จาก '+a.length+' ('+f1(pc(f,a.length))+'%)'};},{corner:'อำเภอ',key:'d',text:'ค่าในช่อง = % ของระบบที่มีปัญหานั้น ÷ ระบบที่มีข้อมูลด้านนั้น · ความเข้มสีเทียบภายในคอลัมน์ · ตัวเลขในวงเล็บ = จำนวนระบบของอำเภอ (อ่านร้อยละควบคู่กับจำนวนเสมอ)'});
  var gt=byDist(FS,'st'); var rows2=ST_ORDER.filter(function(t){return gt[t];}).map(function(t){return {k:t,l:L_ST[t],n:gt[t].length,a:gt[t]};});
  var heatT=heat(rows2,cols,function(r,c){var a=r.a.filter(c.d),f=a.filter(c.f).length; return {v:pc(f,a.length),n:a.length,t:r.l+' · '+c.l+': '+f+' จาก '+a.length};},{corner:'ประเภทระบบ',key:'st',text:'ค่าในช่อง = % ของระบบในประเภทนั้นที่มีปัญหา ÷ ระบบที่มีข้อมูลด้านนั้น · ประเภทที่มีระบบน้อยให้ใช้ด้วยความระมัดระวัง'});
  h+='<div class="ix-grp"><i>🔥</i>ตารางความร้อนปัญหา <small>เทียบพื้นที่/ประเภทที่เสี่ยงที่สุด</small></div><div class="ix-grid"><div class="ix-p ix-full"><h3>ปัญหา 4 ด้าน แยกตามอำเภอ</h3><div class="ix-use">💡 ใช้ตัดสินใจ: เลือกอำเภอและประเภทปัญหาที่ควรของบประมาณก่อน</div>'+heatD+'</div><div class="ix-p ix-full"><h3>ปัญหา 4 ด้าน แยกตามประเภทระบบ</h3><div class="ix-use">💡 ใช้ตัดสินใจ: เลือกว่าระบบประเภทไหนควรปรับปรุงก่อน</div>'+heatT+'</div></div>';
  // capacity
  var cp=FS.filter(function(s){return s.cap!=null&&!s.capx;}), tcap=cp.reduce(function(a,s){return a+s.cap;},0), cx=FS.filter(function(s){return s.capx;}).length;
  var cap=ST_ORDER.filter(function(t){return gt[t];}).map(function(t){var a=gt[t].filter(function(s){return s.cap!=null&&!s.capx;}); return {t:t,n:a.length,sum:a.reduce(function(x,s){return x+s.cap;},0),med:model.median(a.map(function(s){return s.cap;}))};}).filter(function(x){return x.n>0;});
  h+='<div class="ix-grp"><i>⚙️</i>กำลังผลิต <small>เฉพาะค่าที่ระบุเป็นจำนวนไม่ติดลบ</small></div><div class="ix-grid"><div class="ix-p ix-full"><h3>กำลังผลิตตามประเภทระบบ (ลบ.ม./ชม.)</h3><div class="ix-use">💡 ใช้ตัดสินใจ: ดูว่ากำลังผลิตกระจุกอยู่ที่ระบบประเภทใด · ใช้ค่ามัธยฐานแทนค่าเฉลี่ยเพื่อลดอิทธิพลของค่าสุดโต่ง</div><div class="ix-sum">กำลังผลิตรวม '+fmt(tcap)+' ลบ.ม./ชม. จาก '+fmt(cp.length)+' ระบบที่ระบุค่า · ค่าที่ไม่พร้อมคำนวณ '+fmt(cx)+' ระบบ</div>'+cap.map(function(x){return '<div class="ix-row"><div class="ix-lbl">'+L_ST[x.t]+'<small>'+fmt(x.n)+' ระบบ</small></div><div class="ix-bar"><i style="width:'+pc(x.sum,tcap)+'%;background:#00838f;"></i></div><div class="ix-val">'+fmt(x.sum)+' <small>มัธยฐาน '+f1(x.med)+'</small></div></div>';}).join('')+'</div></div>';
  $('ixBody').innerHTML=h;
}

// ---------- ตาราง ----------
var tPage=100,vPage=100;
function age(s){return s.age==null?'–':s.age;}
function tag(txt,good){ return '<span class="badge-type" style="'+(good===true?'background:#e8f5e9;color:#2e7d32;':good===false?'background:#ffebee;color:#b71c1c;':'background:#eceff1;color:#546e7a;')+'">'+txt+'</span>'; }
function renderTable(){
  $('n-table').textContent='('+fmt(FS.length)+' ระบบ)'; var a=FS.slice(0,tPage);
  $('tblBody').innerHTML=a.map(function(s){return '<tr><td>'+esc(s.id)+'</td><td>'+esc(s.nm||'–')+'</td><td>'+esc(s.vn)+'</td><td>'+esc(s.d)+'</td><td>'+esc(s.la||'–')+'</td><td>'+esc(L_ST[s.st]||s.st)+'</td><td>'+tag(L_OPS[s.ops]||'–',s.ops==='WORKING'?true:s.ops==='NOT_WORKING'?false:null)+'</td><td>'+tag(L_DQ[s.dq]||'–',s.dq==='PASS'?true:s.dq==='FAIL'?false:null)+'</td><td>'+tag(L_QTY[s.qty]||'–',s.qty==='SUFFICIENT'?true:s.qty==='INSUFFICIENT'?false:null)+'</td><td>'+age(s)+'</td><td style="text-align:right;">'+(s.hh!=null?fmt(s.hh):'–')+'</td></tr>';}).join('')||'<tr><td colspan="11">'+empty()+'</td></tr>';
  $('loadMoreBtn').style.display=FS.length>tPage?'':'none';
  var fns=Object.create(null); FS.forEach(function(s){fns[s.vid]=(fns[s.vid]||0)+1;});
  $('n-vtable').textContent='('+fmt(FV.length)+' หมู่บ้าน)'; var b=FV.slice(0,vPage);
  $('vtblBody').innerHTML=b.map(function(v){return '<tr><td>'+esc(v.id)+'</td><td>'+esc(v.nm)+'</td><td>'+esc(v.d)+'</td><td>'+esc(v.la||'–')+'</td><td>'+(v.ww===null?tag('ไม่ทราบ',null):v.ww?tag('มี',true):tag('ไม่มี',null))+'</td><td style="text-align:right;">'+(fns[v.id]||0)+'</td><td style="text-align:right;">'+fmt(v.hh)+'</td><td style="text-align:right;">'+fmt(v.pwa)+'</td><td style="text-align:right;">'+fmt(v.wb)+'</td><td style="text-align:right;">'+fmt(v.self)+'</td><td style="text-align:right;">'+fmt(v.nat)+'</td></tr>';}).join('')||'<tr><td colspan="11">'+empty()+'</td></tr>';
  $('vLoadMoreBtn').style.display=FV.length>vPage?'':'none';
}
$('loadMoreBtn').addEventListener('click',function(){tPage+=100;renderTable();});
$('vLoadMoreBtn').addEventListener('click',function(){vPage+=100;renderTable();});
// ---------- ชิปตัวกรอง + สถานะว่าง ----------
function renderChips(){
  var LB={d:'อำเภอ',la:'อปท.',st:'ประเภทระบบ',rule:'สถานะ/ปัญหา',q:'ค้นหา',visibility:'การแสดงหน้าสาธารณะ'}; var h='';
  Object.keys(F).forEach(function(k){ if(!F[k]||(k==='d'&&options.lockedDistrict)) return; var v=k==='visibility'?({VISIBLE:'แสดง',HIDDEN:'ไม่แสดง',UNKNOWN:'ไม่ทราบ'}[F[k]]):k==='st'?L_ST[F[k]]:k==='rule'?RULE_L[F[k]]:F[k]; h+='<span class="gf-chip"><b>'+LB[k]+':</b> '+esc(v)+' <button type="button" aria-label="ล้าง" onclick="clearF(\''+k+'\')">✕</button></span>'; });
  $('gfChips').innerHTML=h;
  $('efReset').hidden=!Object.keys(F).some(function(k){return F[k]&&!(k==='d'&&options.lockedDistrict);});if($('referenceVisibility'))$('referenceVisibility').value=F.visibility||'';$('efCount').textContent='แสดง '+fmt(FS.length)+' ระบบ จาก '+fmt(S.length)+' · '+fmt(FV.length)+' หมู่บ้าน จาก '+fmt(V.length);
  var ge=$('gfEmpty'); if(!FS.length&&!FV.length){ ge.hidden=false; ge.textContent='ไม่พบข้อมูลตามตัวกรองที่เลือก — ลองลดเงื่อนไข หรือกด "ล้างตัวกรอง"'; } else if(!FS.length){ ge.hidden=false; ge.textContent='ไม่พบระบบประปาตามตัวกรองนี้ (ยังมีข้อมูลหมู่บ้านที่ตรงเงื่อนไข) — ตัวเลขระบบประปาจะเป็น 0'; } else ge.hidden=true;
}
window.clearF=function(k){F[k]='';syncUi();render();};

function render(){
var authorities=Array.from(new Set(V.filter(function(v){return !F.d||v.d===F.d;}).map(function(v){return v.la;}).filter(Boolean))).sort(function(a,b){return a.localeCompare(b,'th');});if(F.la&&!authorities.includes(F.la))F.la='';fillSel('fla',authorities);$('fla').value=F.la;
 if(options.lockedDistrict){F.d=options.lockedDistrict;$('fd').value=F.d;}
  var selected=model.selectDataset(currentDataset,{search:F.q,district:F.d,localAuthority:F.la,systemType:F.st,rule:F.rule,publicVisibility:F.visibility});var systemIds=new Set(selected.waterSystems.map(function(s){return String(s.system_id).trim();})),villageIds=new Set(selected.villages.map(function(v){return String(v.village_id).trim();}));FS=S.filter(function(s){return systemIds.has(s.id);}); FV=V.filter(function(v){return villageIds.has(v.id);}); tPage=100; vPage=100;
  renderChips(); renderKpi(); renderPies(); renderCoverage(); renderQuality(); renderAge(); renderOwner(); renderDqa(); drawMap();
  renderPivot(); renderCompare(); renderInsight(); renderTable(); renderProblem();enhanceKeyboard();
}

// ---------- นำทาง ----------
root.querySelectorAll('.main-nav button').forEach(function(b){ b.addEventListener('click',function(){map.stop();if(pmap)pmap.stop(); root.querySelectorAll('.main-nav button').forEach(function(x){x.classList.toggle('active',x===b);}); root.querySelectorAll('.view').forEach(function(v){v.classList.toggle('active',v.id==='view-'+b.dataset.view);}); later(resize,50); window.scrollTo(0,0); }); });
root.querySelectorAll('.tab-btn').forEach(function(b){ b.addEventListener('click',function(){map.stop();if(pmap)pmap.stop(); root.querySelectorAll('.tab-btn').forEach(function(x){x.classList.toggle('active',x===b);}); root.querySelectorAll('.tab-panel').forEach(function(p){p.classList.toggle('active',p.id==='panel-'+b.dataset.tab);}); if(b.dataset.tab==='problem') renderProblem();later(resize,50); }); });
window.setPair=function(d,t){F.d=d;F.st=t;syncUi();render();}; window.F=F; window.syncUi=syncUi; window.render=render; window.__map=map;
function enhanceKeyboard(){root.querySelectorAll('[onclick],#tblBody tr,#vtblBody tr,#probBody tr.dmg-row').forEach(function(node){if(node.matches('button,input,select,a[href]')||!node.textContent.trim())return;node.tabIndex=0;if(node.matches('#probBody tr.dmg-row'))node.setAttribute('aria-describedby','probRowHint');if(node.querySelector('button,input,select,a[href]')){node.removeAttribute('role');return;}node.setAttribute('role','button');});}
listen(root,'keydown',function(event){if(!['Enter',' '].includes(event.key)||!event.target.matches('[role="button"],tr[tabindex]'))return;event.preventDefault();event.target.click();});
function resize(){if(destroyed)return;if(map.getContainer().offsetWidth){map.invalidateSize();drawMap();}if(pmap&&pmap.getContainer().offsetWidth)pmap.invalidateSize();Object.values(CH).forEach(function(chart){chart.resize();});}
function activate(next){if(next.view){var button=root.querySelector('[data-view="'+next.view+'"]');if(button)button.click();}if(next.tab){var tab=root.querySelector('[data-tab="'+next.tab+'"]');if(tab)tab.click();}}
function update(next){
 if(next.dataset){currentDataset=next.dataset;NOW=model.summarizeSelection(currentDataset).age.referenceYearBE;DATA=model.toReferenceDataset(currentDataset);V=DATA.V;S=DATA.S;prepareRows();if(options.lockedDistrict&&!DIST.includes(options.lockedDistrict))DIST.push(options.lockedDistrict);if(F.d&&!DIST.includes(F.d)){F.d='';F.la='';}fillSel('fd',DIST);fillSel('fla',LAS);fillSel('dfDist',DIST);$('dfDist').options[0].textContent='ทุกอำเภอ';if(dfState.d&&!DIST.includes(dfState.d))dfState.d='';$('dfDist').value=dfState.d;$('mlcDistList').innerHTML=DIST.map(function(d){return '<label class="mlc-opt"><input type="checkbox" class="mlc-dist-cb" value="'+esc(d)+'"'+(!mapState.dists||mapState.dists.has(d)?' checked':'')+'>'+esc(d)+'</label>';}).join('');syncUi();}
 render();resize();
}
function destroy(){destroyed=true;controller.abort();pendingTimers.forEach(clearTimeout);pendingTimers.clear();clearTimeout(qt);Object.values(CH).forEach(function(chart){chart.destroy();});map.stop();map.remove();if(pmap){pmap.stop();pmap.remove();}(root===document?document.body:root).classList.remove('map-fullscreen-lock');['setF','clearF','setPair','F','syncUi','render','__map','toggleKpi'].forEach(function(key){delete window[key];});}
listen(root,'click',function(event){var row=event.target.closest('#tblBody tr,#vtblBody tr');if(!row||event.target.closest('a,button,input'))return;var id=row.cells[0]?.textContent;row.focus({preventScroll:true});if(row.parentElement.id==='tblBody')options.onOpenSystem?.(id);else options.onOpenVillage?.(id);});
// Technician rows (system_id, latitude, ...) map to the same prepared record the view draws; rows outside the view dataset go through the same model.
function manageRecord(system){
  var id=String(system&&system.system_id!=null?system.system_id:'').trim();
  for(var i=0;i<S.length;i++) if(S[i].id===id) return S[i];
  var r=model.toReferenceDataset({villages:currentDataset.villages||[],waterSystems:[system||{}],audience:currentDataset.audience},{referenceYearBE:NOW}).S[0];
  r.age=r.yr?NOW-r.yr:null; r.pOps=r.ops==='NOT_WORKING'; r.pDq=r.dq==='FAIL'; r.pQty=r.qty==='INSUFFICIENT'; r.pUq=r.uq==='NOT_USABLE'; r.np=(r.pOps?1:0)+(r.pDq?1:0)+(r.pQty?1:0)+(r.pUq?1:0);
  return r;
}
function manageMarkerIcon(system){ var r=manageRecord(system), keep=mapState.color, st; mapState.color='ops'; try{ st=markerStyle(r); } finally { mapState.color=keep; } return makeIcon(r,st); }
// Compact manage popup (spec decision 4): name, village · district, status badge, then the existing actions; short enough for the 260px mobile map.
function managePopupHtml(system,actions){
  var r=manageRecord(system), id=esc(r.id), tone=r.ops==='WORKING'?['#e8f5e9','#1b5e20']:r.ops==='NOT_WORKING'?['#fdecea','#b71c1c']:['#eef2f7','#37474f'];
  return '<div class="manage-popup" style="font-family:\'Sarabun\',sans-serif;width:210px;font-size:13px;"><b style="color:#0b2545;font-size:14px;">'+esc(r.nm||'ระบบประปา')+'</b>'
   +'<div style="color:#3e5468;font-size:12px;margin-top:2px;">'+esc(r.vn||'–')+(r.vno?' ม.'+esc(r.vno):'')+' · '+esc(r.d||'–')+'</div>'
   +'<span class="manage-popup-status" style="display:inline-block;margin-top:6px;padding:2px 10px;border-radius:999px;background:'+tone[0]+';color:'+tone[1]+';font-size:12px;font-weight:700;">สถานะ: '+esc(L_OPS[r.ops]||'ไม่ทราบ')+'</span>'
   +'<div class="manage-popup-actions"><button type="button" class="popup-nav-btn popup-detail-btn" data-manage-action="detail" data-id="'+id+'">📋 รายละเอียด</button>'+(actions&&actions.canEdit===true?'<button type="button" class="popup-nav-btn popup-detail-btn manage-popup-edit" data-manage-action="edit" data-id="'+id+'">✏️ แก้ไข</button>':'')+'</div></div>';
}
render();
return {markerIcon:manageMarkerIcon,popupHtml:managePopupHtml,makeCluster:makeCluster,addBaseMaps:addBaseMaps,render:update,activate:activate,resize:resize,destroy:destroy,filters:F,getSelection:function(){return model.selectDataset(currentDataset,{search:F.q,district:F.d,localAuthority:F.la,systemType:F.st,rule:F.rule,publicVisibility:F.visibility});}};
}};
