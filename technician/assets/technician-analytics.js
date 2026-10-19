/* Public Dashboard presentation over authenticated Management data only. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const keys = ['search','waterQuantity','district','localAuthority','systemType','operationalStatus','drinkingWaterQuality'];
  const ids = {search:'filterSearch',waterQuantity:'filterWaterQuantity',district:'filterDistrict',localAuthority:'filterLocalAuthority',systemType:'filterSystemType',operationalStatus:'filterOperationalStatus',drinkingWaterQuality:'filterDrinkingWaterQuality'};
  const fields = {waterQuantity:'water_quantity',systemType:'system_type',operationalStatus:'operational_status',drinkingWaterQuality:'drinking_water_quality'};
  const titles = {search:'ค้นหา',waterQuantity:'ความเพียงพอของน้ำ',district:'อำเภอ',localAuthority:'อปท.',systemType:'ประเภทระบบ',operationalStatus:'สถานะระบบ',drinkingWaterQuality:'คุณภาพน้ำดื่ม'};
  const colors = {blue:'#0284c7',amber:'#d97706',green:'#059669',red:'#dc2626',gray:'#94a3b8'};
  const fill = {blue:'rgba(2,132,199,.72)',amber:'rgba(217,119,6,.82)',green:'rgba(5,150,105,.82)',red:'rgba(220,38,38,.82)',gray:'rgba(148,163,184,.82)'};
  const filters = Object.fromEntries(keys.map(key => [key,'']));
  const charts = new Map();
  let dataset = {villages:[],waterSystems:[]}, label = value => value, onChange = () => {}, onSystem = () => {}, onMap = () => {}, bound = false;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => Number(value || 0).toLocaleString('th-TH');
  const sorted = values => [...new Set(values.filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b),'th'));
  const villageMap = () => new Map(dataset.villages.map(v => [v.village_id,v]));
  const villageOf = (s, map) => ({...(s.village||{}),...(map.get(s.village_id)||{})});
  const normal = (key, value) => {
    if (key === 'waterQuantity' || key === 'drinkingWaterQuality') {
      const code=String(value??'').trim();
      return !code||code==='-'||code==='UNKNOWN'?'NO_DATA':code;
    }
    return String(value || '').trim();
  };
  const isWatch = s => s.operational_status === 'NOT_WORKING' || normal('waterQuantity',s.water_quantity) === 'INSUFFICIENT' || normal('drinkingWaterQuality',s.drinking_water_quality) === 'FAIL';
  const textSearch = (s,v) => [s.system_name,v.village_name,v.district,v.subdistrict,v.local_authority,s.responsible_agency,s.establishment_agency,s.transfer_agency,s.shared_village_name,label(s.system_type),label(s.operational_status),label(s.drinking_water_quality),label(s.water_quantity)].join(' ').normalize('NFKC').toLocaleLowerCase('th-TH');
  function snapshot(exclude = [], ignoreSearch = false) {
    const omitted = new Set(exclude), map = villageMap();
    const district = omitted.has('district') ? '' : filters.district;
    const authority = omitted.has('localAuthority') ? '' : filters.localAuthority;
    const search = ignoreSearch || omitted.has('search') ? '' : filters.search.trim().normalize('NFKC').toLocaleLowerCase('th-TH');
    const areaVillages = dataset.villages.filter(v => (!district || v.district === district) && (!authority || v.local_authority === authority));
    const areaSystems = dataset.waterSystems.filter(s => { const v=villageOf(s,map);return (!district || v.district === district) && (!authority || v.local_authority === authority); });
    const systems = areaSystems.filter(s => {
      const v=villageOf(s,map);
      if (search && !textSearch(s,v).includes(search)) return false;
      return Object.keys(fields).every(key => omitted.has(key) || !filters[key] || normal(key,s[fields[key]]) === filters[key]);
    });
    const selectedVillageIds = new Set(systems.map(s => s.village_id));
    const hasSystemFilter = Object.keys(fields).some(key => !omitted.has(key) && filters[key]);
    const villages = areaVillages.filter(v => {
      if (hasSystemFilter) return selectedVillageIds.has(v.village_id);
      if (!search) return true;
      return [v.village_name,v.district,v.subdistrict,v.local_authority].join(' ').normalize('NFKC').toLocaleLowerCase('th-TH').includes(search) || selectedVillageIds.has(v.village_id);
    });
    return {villages,systems};
  }
  function setText(id, value) { const node=$(id);if(node)node.textContent=value; }
  function option(id, values, name) {
    const node=$(id), current=node.value;
    node.innerHTML='<option value="">ทั้งหมด</option>'+values.map(value => `<option value="${esc(value)}">${esc(name(value))}</option>`).join('');
    node.value=values.includes(current)?current:'';
  }
  function available(key) {
    const rows=snapshot([key],true).systems;
    const values=sorted(rows.map(s => normal(key,s[fields[key]])));
    if(filters[key]&&!values.includes(filters[key])) {
      const map=villageMap();
      const inArea=dataset.waterSystems.some(s => {const v=villageOf(s,map);return (!filters.district||v.district===filters.district)&&(!filters.localAuthority||v.local_authority===filters.localAuthority)&&normal(key,s[fields[key]])===filters[key];});
      if(inArea)values.push(filters[key]);
    }
    return sorted(values);
  }
  function updateControls() {
    const map=villageMap();
    const districts=sorted([...dataset.villages.map(v=>v.district),...dataset.waterSystems.map(s=>villageOf(s,map).district)]);
    option(ids.district,districts,v=>v);
    const authorities=sorted([...dataset.villages.filter(v=>!filters.district||v.district===filters.district).map(v=>v.local_authority),...dataset.waterSystems.filter(s=>!filters.district||villageOf(s,map).district===filters.district).map(s=>villageOf(s,map).local_authority)]);
    option(ids.localAuthority,authorities,v=>v);
    for(const key of Object.keys(fields))option(ids[key],available(key),label);
    $(ids.search).value=filters.search;
    for(const key of keys.filter(k=>k!=='search'))$(ids[key]).value=filters[key];
    const active=keys.filter(key=>filters[key]);
    $('filterCount').textContent=String(active.length);
    $('btnClearFilters').disabled=!active.length;
    $('scopeLabel').textContent=filters.district ? `อำเภอ${filters.district}` : 'จังหวัดพะเยา';
    const chips=$('activeFilterChips');
    chips.classList.toggle('hidden',!active.length);
    chips.innerHTML=active.map(key=>`<button class="filter-chip" type="button" data-filter-remove="${key}" aria-label="ล้างตัวกรอง${esc(titles[key])}">${esc(titles[key])}: ${esc(key==='search'?filters[key]:label(filters[key]))} <span aria-hidden="true">×</span></button>`).join('');
    $('alerts').querySelectorAll('[data-filter-toggle-key]').forEach(button=>{
      const key=button.dataset.filterToggleKey;
      button.setAttribute('aria-pressed',String(filters[key]===button.dataset.filterToggleValue));
    });
  }
  function setFilter(key,value,toggle=false) {
    const next=toggle&&filters[key]===value?'':value;
    if(key==='district'&&next!==filters.district)filters.localAuthority='';
    filters[key]=next;
    if(key==='district'||key==='localAuthority') {
      const area=snapshot(Object.keys(fields),true).systems;
      for(const field of Object.keys(fields))if(filters[field]&&!area.some(s=>normal(field,s[fields[field]])===filters[field]))filters[field]='';
    }
    render();
  }
  function bind(handlers={}) {
    onChange=handlers.onChange||onChange;onSystem=handlers.onSystem||onSystem;onMap=handlers.onMap||onMap;
    if(bound)return;
    bound=true;
    for(const key of keys)$(ids[key]).addEventListener(key==='search'?'input':'change',e=>setFilter(key,e.target.value));
    $('btnClearFilters').addEventListener('click',()=>{keys.forEach(key=>filters[key]='');render();});
    $('btnFilterToggle').addEventListener('click',()=>{const panel=$('dashboardFilterPanel'),open=panel.classList.toggle('hidden');$('btnFilterToggle').setAttribute('aria-expanded',String(!open));});
    $('activeFilterChips').addEventListener('click',e=>{const b=e.target.closest('[data-filter-remove]');if(b)setFilter(b.dataset.filterRemove,'');});
    $('alerts').addEventListener('click',e=>{const b=e.target.closest('[data-filter-toggle-key]');if(b)setFilter(b.dataset.filterToggleKey,b.dataset.filterToggleValue,true);});
    $('problemList').addEventListener('click',e=>{const b=e.target.closest('[data-watch-action]');if(b){if(b.dataset.watchAction==='map')onMap(b.dataset.id);else onSystem(b.dataset.id);}});
  }
  function waterworks(v) {return [true,1,'1','YES','มีประปาหมู่บ้าน'].includes(v.has_village_waterworks);}
  function summarize(source, systems=source?.waterSystems||[]) {
    const villages=Array.isArray(source?.villages)?source.villages:[];
    const complete=(villages.length>0||systems.length===0)&&villages.every(v=>Object.prototype.hasOwnProperty.call(v,'has_village_waterworks'));
    return {villages:villages.length,withWaterworks:complete?villages.filter(waterworks).length:null,
      withoutWaterworks:complete?villages.length-villages.filter(waterworks).length:null,
      systems:systems.length,notWorking:systems.filter(s=>s.operational_status==='NOT_WORKING').length,
      insufficient:systems.filter(s=>normal('waterQuantity',s.water_quantity)==='INSUFFICIENT').length,
      qualityFail:systems.filter(s=>normal('drinkingWaterQuality',s.drinking_water_quality)==='FAIL').length,
      watchlist:new Set(systems.filter(isWatch).map(s=>s.system_id)).size};
  }
  function renderMetrics(current) {
    const {villages,systems}=current;
    const complete=(villages.length>0||systems.length===0)&&villages.every(v=>Object.prototype.hasOwnProperty.call(v,'has_village_waterworks'));
    const villageAvailable=dataset.villages.length>0||dataset.waterSystems.length===0;
    setText('kpiVillages',villageAvailable?number(villages.length):'ไม่พร้อมใช้');
    $('kpiVillages').classList.toggle('kpi-unavailable',!villageAvailable);
    setText('kpiWithWaterworks',complete?number(villages.filter(waterworks).length):'ไม่พร้อมใช้');
    setText('kpiWithoutWaterworks',complete?number(villages.length-villages.filter(waterworks).length):'ไม่พร้อมใช้');
    for(const id of ['kpiWithWaterworks','kpiWithoutWaterworks']){$(id).classList.toggle('kpi-unavailable',!complete);$(id).title=complete?'':'Management dataset ไม่มี has_village_waterworks';}
    setText('kpiSystems',number(systems.length));
    setText('alertNotWorking',number(snapshot(['operationalStatus']).systems.filter(s=>s.operational_status==='NOT_WORKING').length));
    setText('alertInsufficient',number(snapshot(['waterQuantity']).systems.filter(s=>normal('waterQuantity',s.water_quantity)==='INSUFFICIENT').length));
    setText('alertQualityFail',number(snapshot(['drinkingWaterQuality']).systems.filter(s=>normal('drinkingWaterQuality',s.drinking_water_quality)==='FAIL').length));
    setText('watchlistTotal',number(new Set(systems.filter(isWatch).map(s=>s.system_id)).size));
  }
  function makeChart(id,type,labels,datasets,options={}) {
    const canvas=$(id), old=charts.get(id);if(old){old.destroy();charts.delete(id);}
    const empty=canvas.parentElement.querySelector('.chart-empty');empty?.remove();
    if(!labels.length||!window.Chart){canvas.hidden=true;const message=document.createElement('div');message.className='chart-empty';message.textContent='ไม่พบข้อมูลตามตัวกรองที่เลือก';canvas.parentElement.append(message);return;}
    canvas.hidden=false;
    const narrow=matchMedia('(max-width: 767px)').matches;
    const onClick=options.onClick;
    const chartOptions={responsive:true,maintainAspectRatio:false,animation:{duration:180},indexAxis:options.horizontal||narrow&&id==='districtChart'?'y':'x',cutout:type==='doughnut'?'66%':undefined,
      onClick:(_event,elements)=>{const hit=elements?.[0];if(hit&&onClick)setTimeout(()=>onClick(hit.index),0);},
      onHover:(event,elements)=>{if(event?.native?.target?.style)event.native.target.style.cursor=elements?.length?'pointer':'default';},
      plugins:{legend:{display:options.legend!==false,position:'bottom',labels:{usePointStyle:true,boxWidth:10,padding:16,color:'#334155',font:{size:narrow?12:13,family:'Sarabun'}},onClick:type==='doughnut'?(_event,item)=>{if(Number.isInteger(item?.index)&&onClick)setTimeout(()=>onClick(item.index),0);}:undefined},tooltip:{titleFont:{family:'Sarabun'},bodyFont:{family:'Sarabun'}}},
      scales:type==='bar'?{x:{beginAtZero:true,ticks:{precision:0,color:'#475569'}},y:{beginAtZero:true,ticks:{precision:0,color:'#475569'}}}:undefined};
    charts.set(id,new Chart(canvas,{type,data:{labels,datasets},options:chartOptions}));
  }
  function renderCharts() {
    const map=villageMap();
    const district=snapshot(['district','localAuthority']);
    const villages=Object.create(null),systems=Object.create(null);
    for(const v of district.villages){const key=v.district||'ไม่ระบุ';villages[key]=(villages[key]||0)+1;}
    for(const s of district.systems){const key=villageOf(s,map).district||'ไม่ระบุ';systems[key]=(systems[key]||0)+1;}
    const districts=sorted([...Object.keys(villages),...Object.keys(systems)]);
    makeChart('districtChart','bar',district.villages.length||!district.systems.length?districts:[],[
      {label:'หมู่บ้าน',data:districts.map(k=>villages[k]||0),backgroundColor:districts.map(k=>filters.district&&k!==filters.district?'rgba(2,132,199,.18)':fill.blue),borderColor:colors.blue,borderWidth:1,borderRadius:5,maxBarThickness:34},
      {label:'ระบบประปา',data:districts.map(k=>systems[k]||0),backgroundColor:districts.map(k=>filters.district&&k!==filters.district?'rgba(217,119,6,.18)':fill.amber),borderColor:colors.amber,borderWidth:1,maxBarThickness:34}
    ],{onClick:i=>setFilter('district',districts[i],true)});
    if(!district.villages.length&&district.systems.length)$('districtChart').parentElement.querySelector('.chart-empty').textContent='ข้อมูลหมู่บ้านรายอำเภอไม่พร้อมใช้';
    for(const [id,key,codes,names,palette] of [
      ['qualityChart','drinkingWaterQuality',['PASS','FAIL','NO_DATA'],['ผ่านเกณฑ์','ไม่ผ่านเกณฑ์','ไม่มีข้อมูล'],[fill.green,fill.red,fill.gray]],
      ['quantityChart','waterQuantity',['SUFFICIENT','INSUFFICIENT','NO_DATA'],['เพียงพอ','ไม่เพียงพอ','ไม่มีข้อมูล'],[fill.blue,fill.amber,fill.gray]]
    ]) {
      const rows=snapshot([key]).systems;
      const counts=Object.fromEntries(codes.map(code=>[code,0]));
      for(const s of rows){const code=normal(key,s[fields[key]]);counts[Object.hasOwn(counts,code)?code:'NO_DATA']++;}
      makeChart(id,'doughnut',rows.length?names:[],[{data:codes.map(code=>counts[code]),backgroundColor:codes.map((code,i)=>filters[key]&&filters[key]!==code?'rgba(148,163,184,.18)':palette[i]),borderColor:'#fff',borderWidth:3,hoverOffset:4}],{onClick:i=>setFilter(key,codes[i],true)});
    }
    const typeCounts=Object.create(null);
    for(const s of snapshot(['systemType']).systems){const code=s.system_type||'UNKNOWN';typeCounts[code]=(typeCounts[code]||0)+1;}
    const types=Object.keys(typeCounts).sort((a,b)=>typeCounts[b]-typeCounts[a]||a.localeCompare(b,'th'));
    makeChart('systemTypeChart','bar',types.map(label),[{label:'จำนวนระบบ',data:types.map(k=>typeCounts[k]),backgroundColor:types.map(k=>filters.systemType&&filters.systemType!==k?'rgba(2,132,199,.18)':fill.blue),borderColor:colors.blue,borderWidth:1,borderRadius:5,maxBarThickness:28}],{horizontal:true,legend:false,onClick:i=>setFilter('systemType',types[i],true)});
  }
  function renderWatchlist(systems) {
    const map=villageMap();
    const rows=systems.filter(isWatch).sort((a,b)=>((b.operational_status==='NOT_WORKING')*100+(b.water_quantity==='INSUFFICIENT')*30+(b.drinking_water_quality==='FAIL')*20)-((a.operational_status==='NOT_WORKING')*100+(a.water_quantity==='INSUFFICIENT')*30+(a.drinking_water_quality==='FAIL')*20));
    const root=$('problemList');
    if(!rows.length){root.innerHTML='<div class="empty-state"><strong>ไม่พบระบบที่เข้าเงื่อนไขเฝ้าระวัง</strong><span>ตามขอบเขตและตัวกรองปัจจุบัน</span></div>';return;}
    const badges=s=>[s.operational_status==='NOT_WORKING'&&'<span class="badge badge-danger">ใช้การไม่ได้</span>',normal('waterQuantity',s.water_quantity)==='INSUFFICIENT'&&'<span class="badge badge-warning">น้ำไม่เพียงพอ</span>',normal('drinkingWaterQuality',s.drinking_water_quality)==='FAIL'&&'<span class="badge badge-rose">น้ำดื่มไม่ผ่านเกณฑ์</span>'].filter(Boolean).join('');
    const name=s=>s.system_name||villageOf(s,map).village_name||'ระบบประปาหมู่บ้าน';
    const actions=s=>`<button class="action-button" type="button" data-watch-action="map" data-id="${esc(s.system_id)}" ${window.VWSTechnicianMap?.coordinates(s)?'':'disabled'}>แผนที่</button><button class="action-button" type="button" data-watch-action="detail" data-id="${esc(s.system_id)}">รายละเอียด</button>`;
    root.innerHTML=`<div class="problem-summary"><div>พบ <strong>${number(rows.length)}</strong> ระบบ ที่เข้าเงื่อนไขเฝ้าระวังอย่างน้อย 1 ประเด็น</div><span>${rows.length>8?'เลื่อนดูรายการทั้งหมดภายในกล่อง':'แสดงรายการทั้งหมด'}</span></div>
      <div class="hidden lg:block"><div class="watchlist-scroll" role="region" aria-label="ตารางระบบที่ควรติดตามสถานการณ์" tabindex="0"><table class="problem-table"><thead><tr><th>หมู่บ้าน / ระบบ</th><th>อำเภอ</th><th>ประเด็นเฝ้าระวัง</th><th>ครัวเรือน</th><th class="align-right">ดูข้อมูล</th></tr></thead><tbody>${rows.map(s=>`<tr><td><span class="system-main">${esc(villageOf(s,map).village_name||'ไม่ระบุหมู่บ้าน')}</span><span class="system-sub">${esc(name(s))}</span></td><td>${esc(villageOf(s,map).district||'-')}</td><td><div class="watch-badges">${badges(s)}</div></td><td>${esc(s.households_served??'-')}</td><td><div class="row-actions">${actions(s)}</div></td></tr>`).join('')}</tbody></table></div></div>
      <div class="watchlist-mobile lg:hidden" role="region" aria-label="รายการระบบที่ควรติดตามสถานการณ์" tabindex="0">${rows.map(s=>`<article class="watch-card"><h3 class="watch-card-title">${esc(villageOf(s,map).village_name||'ไม่ระบุหมู่บ้าน')}</h3><p class="watch-card-system">${esc(name(s))}</p><div class="watch-badges">${badges(s)}</div><div class="watch-card-actions">${actions(s)}</div></article>`).join('')}</div>`;
  }
  function render(nextDataset=dataset,nextLabel=label) {
    dataset=nextDataset||dataset;label=nextLabel||label;
    updateControls();
    const current=snapshot();
    renderMetrics(current);renderCharts();renderWatchlist(current.systems);
    onChange(current.systems,keys.some(key=>filters[key]));
    return current;
  }
  window.VWSTechnicianAnalytics={bind,render,snapshot,summarize,filters,chartCount:()=>charts.size,resize:()=>charts.forEach(chart=>chart.resize()),setFilter};
})();
