(() => {
  'use strict';

  const TOKEN_KEY = 'vws_management_token_v2';
  const PAGE_SIZE = 50;
  function storageGet(key){ try{return sessionStorage.getItem(key)||'';}catch(_){return '';} }
  function storageSet(key,value){ try{sessionStorage.setItem(key,value);}catch(_){} }
  function storageRemove(key){ try{sessionStorage.removeItem(key);}catch(_){} }
  const $ = (id) => document.getElementById(id);
  const state = {
    token: storageGet(TOKEN_KEY),
    user: null,
    bootstrap: null,
    dashboard: null,
    filteredSystems: [],
    page: 1,
    selectedSystem: null,
    technicians: [],
    selectedTechnician: null,
    technicianDialogMode: 'create',
    accountAction: null,
    editTouched: new Set(),
    mutating: false,
    selectionRequest: 0,
    datasetGeneration: 0,
    refreshRequest: 0
  };

  const ENUM_LABELS = {
    LOCAL_AUTHORITY:'อปท.',VILLAGE_OR_OTHER:'หมู่บ้าน/หน่วยงานอื่น',UNKNOWN:'ไม่ทราบ',
    GROUNDWATER_SMALL:'บาดาลขนาดเล็ก',GROUNDWATER_MEDIUM:'บาดาลขนาดกลาง',GROUNDWATER_LARGE:'บาดาลขนาดใหญ่',
    SURFACE_SMALL:'ผิวดินขนาดเล็ก',SURFACE_MEDIUM:'ผิวดินขนาดกลาง',SURFACE_LARGE:'ผิวดินขนาดใหญ่',SURFACE_VERY_LARGE:'ผิวดินขนาดใหญ่มาก',
    GROUNDWATER:'น้ำบาดาล',SURFACE_WATER:'น้ำผิวดิน',MIXED:'ผสม',DOMESTIC:'อุปโภคบริโภค',AGRICULTURE:'เกษตร',
    WORKING:'ใช้งานได้',NOT_WORKING:'ใช้งานไม่ได้',USABLE:'ใช้ได้',NOT_USABLE:'ใช้ไม่ได้',PASS:'ผ่าน',FAIL:'ไม่ผ่าน',NO_DATA:'ไม่มีข้อมูล',
    SUFFICIENT:'เพียงพอ',INSUFFICIENT:'ไม่เพียงพอ',YES:'ใช่',NO:'ไม่ใช่',LOCAL_CREATED:'อปท. สร้าง',ACCEPTED_ASSET:'รับมอบทรัพย์สิน',
    TRANSFERRED:'ถ่ายโอน',NOT_LOCAL_AUTHORITY_ASSET:'ไม่ใช่ทรัพย์สิน อปท.',AVAILABLE:'มีเอกสาร',NOT_AVAILABLE:'ไม่มีเอกสาร',
    FLOW_CONTINUOUS:'ไหลต่อเนื่อง',FLOW_STRONG_SOMETIMES:'แรงเป็นบางช่วง',FLOW_WEAK_CONTINUOUS:'ไหลอ่อนต่อเนื่อง',YEAR_ROUND:'ตลอดปี',SEASONAL:'ตามฤดูกาล',
    ACTIVE:'ใช้งาน',DISABLED:'ปิดใช้งาน',DELETED:'ยกเลิก'
  };
  const MONTH_LABELS = {JAN:'ม.ค.',FEB:'ก.พ.',MAR:'มี.ค.',APR:'เม.ย.',MAY:'พ.ค.',JUN:'มิ.ย.',JUL:'ก.ค.',AUG:'ส.ค.',SEP:'ก.ย.',OCT:'ต.ค.',NOV:'พ.ย.',DEC:'ธ.ค.'};
  const QUALITY_CATEGORY_LABELS = {PHYSICAL:'กายภาพ',GENERAL_CHEMICAL:'เคมีทั่วไป',GENERAL_HEAVY_METALS:'โลหะหนักทั่วไป',TOXIC_HEAVY_METALS:'โลหะหนักเป็นพิษ',BACTERIA:'แบคทีเรีย'};
  const ACTION_LABELS = {SYSTEM_UPDATE:'แก้ไขข้อมูลระบบประปา',SYSTEM_DELETE:'ลบระบบประปา',USER_PASSWORD_CHANGE:'เปลี่ยนรหัสผ่าน',TECHNICIAN_CREATE:'สร้างบัญชีช่าง',TECHNICIAN_UPDATE:'แก้ไขบัญชีช่าง',TECHNICIAN_DISABLE:'ปิดใช้งานบัญชีช่าง',TECHNICIAN_ENABLE:'เปิดใช้งานบัญชีช่าง',TECHNICIAN_DELETE:'ลบบัญชีช่าง',TECHNICIAN_RESET_PASSWORD:'รีเซ็ตรหัสผ่าน'};
  const STATE_LABELS = {
    COMMITTED:'สำเร็จ',FAILED:'ไม่สำเร็จ',PREPARED:'รอตรวจสอบ',
    NO_RAW_LINK:'ข้อมูลเดิม ไม่มี Raw submission เชื่อมโยง',RAW_PROCESSED:'พร้อมแก้ไข',
    RAW_NOT_PROCESSED:'รายการยังประมวลผลไม่สมบูรณ์',MULTIPLE_RAW_LINKS:'พบข้อมูล Raw เชื่อมโยงซ้ำ ต้องให้ผู้ดูแลตรวจสอบ',
    UNSUPPORTED_PROCESSING_STATUS:'สถานะการประมวลผลไม่รองรับ',
    MISSING_COORDINATE:'ไม่มีพิกัด',VILLAGE_SUPPRESSED_NO_LINKED_ACTIVE_SYSTEM:'หมู่บ้านไม่มีระบบที่เชื่อมโยงสำหรับ Public',
    WATERWORKS_WITHOUT_LINKED_ACTIVE_SYSTEM:'หมู่บ้านระบุว่ามีประปา แต่ไม่มีระบบเชื่อมโยง',VILLAGE_SUPPRESSED:'หมู่บ้านไม่แสดงใน Public'
  };
  const FIELD_LABELS = {
    __deleted__:'ลบรายการ',system_name:'ชื่อระบบ',latitude:'ละติจูด',longitude:'ลองจิจูด',owner_type:'ประเภทเจ้าของ',
    responsible_agency:'หน่วยงานรับผิดชอบ',system_type:'ประเภทระบบ',water_source_type:'ประเภทแหล่งน้ำ',capacity_m3_hr:'กำลังผลิต',
    usage_type:'การใช้น้ำหลัก',households_served:'ครัวเรือนที่ให้บริการ',construction_year_be:'ปีสร้าง พ.ศ.',operational_status:'สถานะระบบ',
    utility_water_quality:'คุณภาพน้ำใช้',drinking_water_quality:'คุณภาพน้ำดื่ม',water_quantity:'ปริมาณน้ำ',shared_with_other_village:'ใช้น้ำร่วมหมู่บ้านอื่น',
    shared_village_name:'ชื่อหมู่บ้านที่ใช้น้ำร่วม',establishment_type:'ลักษณะการจัดตั้ง',establishment_agency:'หน่วยงานที่เกี่ยวข้องกับการจัดตั้ง',
    transfer_year_be:'ปีถ่ายโอน พ.ศ.',transfer_agency:'หน่วยงานถ่ายโอน',transfer_other:'รายละเอียดถ่ายโอนอื่น',transfer_document_status:'สถานะเอกสารถ่ายโอน',
    transfer_document_url:'URL เอกสารถ่ายโอน',usage_types_json:'ประเภทการใช้น้ำ',quality_failure_categories_json:'หมวดสาเหตุคุณภาพน้ำไม่ผ่าน',
    quality_failure_detail:'รายละเอียดคุณภาพน้ำ',water_pressure:'แรงดันน้ำ',year_round_status:'การมีน้ำตลอดปี',available_months_json:'เดือนที่มีน้ำ',
    beneficiaries:'ผู้ได้รับประโยชน์',monthly_production_cost:'ต้นทุนผลิตต่อเดือน',monthly_service_revenue:'รายรับค่าบริการต่อเดือน',water_tariff:'อัตราค่าน้ำ',
    service_agency:'หน่วยงานให้บริการ',water_source_detail:'รายละเอียดแหล่งน้ำ',surface_water_type:'ประเภทน้ำผิวดิน',surface_water_agency:'หน่วยงานน้ำผิวดิน',shared_villages_json:'หมู่บ้านที่ใช้น้ำร่วม'
  };

  const EDIT_FIELDS = [
    ['system_name','ชื่อระบบ','text'],['latitude','ละติจูด','number'],['longitude','ลองจิจูด','number'],
    ['owner_type','ประเภทเจ้าของ','enum'],['responsible_agency','หน่วยงานรับผิดชอบ','text'],['system_type','ประเภทระบบ','enum'],
    ['water_source_type','ประเภทแหล่งน้ำ','enum'],['capacity_m3_hr','กำลังผลิต (ลบ.ม./ชม.)','number'],['usage_type','การใช้น้ำหลัก','enum'],
    ['households_served','ครัวเรือนที่ให้บริการ','integer'],['construction_year_be','ปีสร้าง พ.ศ.','integer'],['operational_status','สถานะระบบ','enum'],
    ['utility_water_quality','คุณภาพน้ำใช้','enum'],['drinking_water_quality','คุณภาพน้ำดื่ม','enum'],['water_quantity','ปริมาณน้ำ','enum'],
    ['shared_with_other_village','ใช้น้ำร่วมหมู่บ้านอื่น','enum'],['shared_village_name','ชื่อหมู่บ้านที่ใช้น้ำร่วม (ข้อมูลเดิม)','text'],['establishment_type','ลักษณะการจัดตั้ง','enum'],['establishment_agency','หน่วยงานที่เกี่ยวข้องกับการจัดตั้ง','text'],
    ['transfer_year_be','ปีถ่ายโอน พ.ศ.','integer'],['transfer_agency','หน่วยงานถ่ายโอน','text'],['transfer_other','รายละเอียดถ่ายโอนอื่น','text'],
    ['transfer_document_status','สถานะเอกสารถ่ายโอน','enum'],['transfer_document_url','URL เอกสารถ่ายโอน','url'],['usage_types_json','ประเภทการใช้น้ำ','usage-array'],
    ['quality_failure_categories_json','หมวดสาเหตุคุณภาพน้ำไม่ผ่าน','quality-array'],['quality_failure_detail','รายละเอียดคุณภาพน้ำ','textarea'],
    ['water_pressure','แรงดันน้ำ','enum-blank'],['year_round_status','การมีน้ำตลอดปี','enum-blank'],['available_months_json','เดือนที่มีน้ำ','months-array'],
    ['beneficiaries','ผู้ได้รับประโยชน์','integer'],['monthly_production_cost','ต้นทุนผลิตต่อเดือน','number'],['monthly_service_revenue','รายรับค่าบริการต่อเดือน','number'],
    ['water_tariff','อัตราค่าน้ำ','number'],['service_agency','หน่วยงานให้บริการ','text'],['water_source_detail','รายละเอียดแหล่งน้ำ','textarea'],
    ['surface_water_type','ประเภทน้ำผิวดิน','text'],['surface_water_agency','หน่วยงานน้ำผิวดิน','text'],['shared_villages_json','หมู่บ้านที่ใช้น้ำร่วม','villages-array']
  ];

  const EDIT_GROUPS = [
    {title:'ข้อมูลระบบและกำลังผลิต',description:'ชื่อระบบ เจ้าของ ประเภทระบบ แหล่งน้ำ กำลังผลิต และจำนวนครัวเรือน',keys:['system_name','owner_type','responsible_agency','system_type','water_source_type','capacity_m3_hr','households_served','construction_year_be']},
    {title:'พิกัดระบบประปา',description:'ระบุละติจูดและลองจิจูดทั้งคู่ หรือเว้นว่างทั้งคู่',keys:['latitude','longitude']},
    {title:'สถานะ คุณภาพ และความเพียงพอ',description:'สถานะใช้งาน คุณภาพน้ำ ปริมาณน้ำ แรงดัน และช่วงเดือนที่มีน้ำ',keys:['operational_status','utility_water_quality','drinking_water_quality','quality_failure_categories_json','quality_failure_detail','water_quantity','water_pressure','year_round_status','available_months_json']},
    {title:'การใช้น้ำและการให้บริการ',description:'วัตถุประสงค์ ผู้ได้รับประโยชน์ ต้นทุน รายรับ อัตราค่าน้ำ และหน่วยงานให้บริการ',keys:['usage_type','usage_types_json','beneficiaries','monthly_production_cost','monthly_service_revenue','water_tariff','service_agency']},
    {title:'การใช้น้ำร่วมกับหมู่บ้านอื่น',description:'สถานะและรายชื่อหมู่บ้านที่ใช้น้ำร่วม',keys:['shared_with_other_village','shared_village_name','shared_villages_json']},
    {title:'การจัดตั้งและการถ่ายโอน',description:'ข้อมูลการจัดตั้ง หน่วยงาน ปีถ่ายโอน และเอกสารประกอบ',keys:['establishment_type','establishment_agency','transfer_year_be','transfer_agency','transfer_other','transfer_document_status','transfer_document_url']},
    {title:'รายละเอียดแหล่งน้ำ',description:'รายละเอียดเพิ่มเติมสำหรับแหล่งน้ำ โดยเฉพาะระบบน้ำผิวดิน',keys:['water_source_detail','surface_water_type','surface_water_agency']}
  ];

  function clientInfo() { return `Technician Dashboard v2 | ${navigator.userAgent}`.slice(0, 500); }
  function endpoint() { return String((window.VWS_MANAGEMENT_CONFIG || {}).endpoint || '').trim(); }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function label(value) { const key=String(value ?? ''); return ENUM_LABELS[key] || MONTH_LABELS[key] || QUALITY_CATEGORY_LABELS[key] || ACTION_LABELS[key] || STATE_LABELS[key] || FIELD_LABELS[key] || key || '-'; }
  function analyticsLabel(value){const text=label(value);return /^[A-Z][A-Z0-9_]*$/.test(text)?'ค่าที่ยังไม่มีคำแปล':text;}
  function fmt(value) { if (value === null || value === undefined || value === '') return '-'; return String(value); }
  function fmtDate(value) { if (!value) return '-'; const d=new Date(value); return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'}); }
  function hasPermission(permission) { return Boolean(state.bootstrap?.permissions?.includes(permission)); }
  function showBusy(text='กำลังประมวลผล...'){return window.VWSTechnicianUI.showLoading(text);}
  function hideBusy(operation){window.VWSTechnicianUI.closeLoading(operation);}
  function clearBusy(){window.VWSTechnicianUI.clearLoading();}
  function toast(message,type='success'){const ui=window.VWSTechnicianUI; (type==='error'?ui.showError:type==='warning'?ui.showWarning:ui.showSuccess)(message);}
  function setError(id,message=''){ $(id).textContent=message; }

  async function api(action,payload={}) {
    const url=endpoint();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/i.test(url)) throw new Error('ยังไม่ได้ตั้งค่า Management Apps Script /exec URL');
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({version:2,action,payload}),redirect:'follow',cache:'no-store',credentials:'omit'});
    const text=await res.text(); let json;
    try{ json=JSON.parse(text); }catch(_){ throw new Error(`API response ไม่ใช่ JSON (HTTP ${res.status})`); }
    return json;
  }
  function unwrap(response){ if (!response || response.success !== true){ const err=new Error(response?.error?.message || 'คำขอไม่สำเร็จ'); err.code=response?.error?.code || 'UNKNOWN'; err.details=response?.error?.details || {}; throw err; } return response.data || {}; }
  function authPayload(extra={}){ return Object.assign({token:state.token},extra); }
  function clearSession(){ state.token='';state.user=null;state.bootstrap=null;state.dashboard=null;storageRemove(TOKEN_KEY); }
  function showLogin(){ state.selectionRequest++;clearBusy();document.documentElement.classList.remove('has-session');$('skipLink').href='#loginView';$('bootView').classList.add('hidden');$('loginView').classList.remove('hidden');$('appView').classList.add('hidden');$('loginPassword').value=''; }
  function showApp(){ document.documentElement.classList.remove('has-session');$('skipLink').href='#main';$('bootView').classList.add('hidden');$('loginView').classList.add('hidden');$('appView').classList.remove('hidden'); }
  function showBoot(message='กำลังตรวจสอบการเข้าสู่ระบบ...',retry=false){document.documentElement.classList.add('has-session');$('skipLink').href='#bootView';$('bootView').classList.remove('hidden');$('loginView').classList.add('hidden');$('appView').classList.add('hidden');$('bootTitle').textContent=message;$('bootError').textContent=retry?'ไม่สามารถตรวจสอบ Session ได้ในขณะนี้ โปรดลองอีกครั้ง':'';$('bootError').classList.toggle('hidden',!retry);$('retryResumeButton').classList.toggle('hidden',!retry);$('bootView').querySelector('.loading-progress').classList.toggle('hidden',retry);}

  async function login(username,password){
    const data=unwrap(await api('auth.login',{username,password,clientInfo:clientInfo()}));
    state.token=String(data.token||''); if(!/^MGT-[0-9a-f]{64}$/.test(state.token)) throw new Error('Session token จาก server ไม่ถูกต้อง');
    storageSet(TOKEN_KEY,state.token); state.user=data.user; return data;
  }

  async function bootstrapAndLoad(){
    if (state.user?.mustChangePassword){ renderCurrentUser(); showApp(); openPasswordDialog(true); return; }
    let boot;
    try{ boot=unwrap(await api('data.bootstrap',authPayload())); }
    catch(e){
      if(e.code==='AUTH_PASSWORD_CHANGE_REQUIRED'){
        const me=unwrap(await api('auth.me',{token:state.token})); state.user=me.user;
        if(state.user?.mustChangePassword){ renderCurrentUser(); showApp(); openPasswordDialog(true); return; }
      }
      throw e;
    }
    state.bootstrap=boot; state.user=boot.user; renderCurrentUser();
    const dash=unwrap(await api('data.dashboard',authPayload({filters:{}}))); assertDashboard(dash); state.dashboard=dash; showApp(); renderDashboard();
    $('techniciansTab').classList.toggle('hidden',!hasPermission('MANAGE_TECHNICIANS'));
  }

  async function resume(){
    if(!state.token){showLogin();return;}
    showBoot();
    try{ const me=unwrap(await api('auth.me',{token:state.token})); state.user=me.user; await bootstrapAndLoad(); }
    catch(e){ if(['SESSION_INVALID','SESSION_REVOKED','SESSION_EXPIRED','SESSION_IDLE_EXPIRED','AUTH_INVALID','AUTH_ACCOUNT_DISABLED','AUTH_ACCOUNT_DELETED'].includes(e.code)){clearSession();showLogin();}else{state.user=null;state.bootstrap=null;state.dashboard=null;showBoot('ยังตรวจสอบการเข้าสู่ระบบไม่สำเร็จ',true);} }
  }

  function renderCurrentUser(){ const name=state.user?.displayName||state.user?.username||'-',role=state.user?.role||'-'; $('currentUserName').textContent=name; $('currentUserRole').textContent=role; $('mobileCurrentUserName').textContent=name; $('mobileCurrentUserRole').textContent=role; }
  function assertDashboard(dash){if(!dash||!Array.isArray(dash.villages)||!Array.isArray(dash.waterSystems)||!Array.isArray(dash.waterSources))throw new Error('รูปแบบข้อมูล Dashboard ไม่ถูกต้อง');}

  function renderDashboard(){
    state.datasetGeneration++;
    const d=state.dashboard||{}; const systems=d.waterSystems||[];
    $('generatedAt').textContent=fmtDate(d.generatedAt);
    $('kpiSystems').textContent=systems.length.toLocaleString('th-TH');
    $('kpiMissingCoords').textContent=systems.filter(s=>s.latitude===''||s.latitude==null||s.longitude===''||s.longitude==null).length.toLocaleString('th-TH');
    $('kpiNotWorking').textContent=systems.filter(s=>s.operational_status==='NOT_WORKING').length.toLocaleString('th-TH');
    $('kpiQualityFail').textContent=systems.filter(s=>s.drinking_water_quality==='FAIL').length.toLocaleString('th-TH');
    populateFilters();
    window.VWSTechnicianMap?.init(id=>openSystem(id),message=>toast(message,'error'));
    applyFilters();
  }

  function populateFilters(){
    const systems=state.dashboard?.waterSystems||[];
    const districts=[...new Set(systems.map(s=>s.village?.district).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'th'));
    const current=$('districtFilter').value;
    $('districtFilter').innerHTML='<option value="">ทั้งหมด</option>'+districts.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    if(districts.includes(current))$('districtFilter').value=current;
    const statuses=[...new Set(systems.map(s=>s.operational_status).filter(Boolean))];
    const currentStatus=$('statusFilter').value;
    $('statusFilter').innerHTML='<option value="">ทั้งหมด</option>'+statuses.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(label(v))}</option>`).join('');
    if(statuses.includes(currentStatus))$('statusFilter').value=currentStatus;
  }

  function searchableText(s){ return [s.system_id,s.system_name,s.responsible_agency,s.service_agency,s.village?.village_name,s.village?.district,s.village?.subdistrict,s.village?.local_authority].map(v=>String(v||'').toLowerCase()).join(' '); }
  function applyFilters(){
    const q=$('searchInput').value.trim().toLowerCase(),district=$('districtFilter').value,status=$('statusFilter').value,pub=$('publicFilter').value;
    state.filteredSystems=(state.dashboard?.waterSystems||[]).filter(s=>(!q||searchableText(s).includes(q))&&(!district||s.village?.district===district)&&(!status||s.operational_status===status)&&(!pub||(pub==='VISIBLE'?s.publicVisible===true:s.publicVisible!==true)));
    state.page=1; renderSystemsTable();
    window.VWSTechnicianMap?.render(state.filteredSystems,Boolean(q||district||status||pub));
    window.VWSTechnicianAnalytics?.render(state.dashboard,state.filteredSystems,analyticsLabel);
  }
  function systemActionButtons(s){
    const mutable=s.managementMutable===true;
    return `<button class="mini-btn primary" data-action="view" data-id="${escapeHtml(s.system_id)}">ดู</button><button class="mini-btn" data-action="map" data-id="${escapeHtml(s.system_id)}" ${window.VWSTechnicianMap?.coordinates(s)?'':'disabled'}>แผนที่</button><button class="mini-btn" data-action="edit" data-id="${escapeHtml(s.system_id)}" ${mutable&&hasPermission('UPDATE_SYSTEM')?'':'disabled'}>แก้ไข</button><button class="mini-btn" data-action="history" data-id="${escapeHtml(s.system_id)}">ประวัติ</button><button class="mini-btn danger" data-action="delete" data-id="${escapeHtml(s.system_id)}" ${mutable&&hasPermission('DELETE_SYSTEM')?'':'disabled'}>ลบ</button>`;
  }
  function renderSystemsTable(){
    const list=state.filteredSystems,start=(state.page-1)*PAGE_SIZE,page=list.slice(start,start+PAGE_SIZE),body=$('systemsTableBody'),mobile=$('systemsMobileList');
    $('resultCount').textContent=`${list.length.toLocaleString('th-TH')} รายการ`;
    const pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE)); $('pageStatus').textContent=`หน้า ${state.page}/${pages}`;
    $('prevPage').disabled=state.page<=1;$('nextPage').disabled=state.page>=pages;
    if(!page.length){
      body.innerHTML='<tr><td class="empty-row" colspan="6">ไม่พบข้อมูลตามตัวกรอง</td></tr>';
      if(mobile)mobile.innerHTML='<div class="empty-state">ไม่พบข้อมูลตามตัวกรอง</div>';
      return;
    }
    body.innerHTML=page.map(s=>`<tr data-system-id="${escapeHtml(s.system_id)}"><td><div class="system-name">${escapeHtml(s.system_name||'(ไม่มีชื่อระบบ)')}</div><div class="system-id">${escapeHtml(s.system_id)}</div></td><td>${escapeHtml(s.village?.village_name||'-')}<div class="system-id">${escapeHtml([s.village?.subdistrict,s.village?.district].filter(Boolean).join(' · '))}</div></td><td>${escapeHtml(label(s.system_type))}</td><td><span class="badge ${s.operational_status==='WORKING'?'good':s.operational_status==='NOT_WORKING'?'bad':'warn'}">${escapeHtml(label(s.operational_status))}</span></td><td><span class="badge ${s.publicVisible?'good':'warn'}">${s.publicVisible?'แสดง':'ไม่แสดง'}</span></td><td><div class="row-actions">${systemActionButtons(s)}</div></td></tr>`).join('');
    if(mobile){
      mobile.innerHTML=page.map(s=>`<article class="system-mobile-card" data-system-id="${escapeHtml(s.system_id)}"><div class="system-mobile-head"><div class="min-w-0"><div class="system-name">${escapeHtml(s.system_name||'(ไม่มีชื่อระบบ)')}</div><div class="system-id">${escapeHtml(s.system_id)}</div></div><span class="badge ${s.operational_status==='WORKING'?'good':s.operational_status==='NOT_WORKING'?'bad':'warn'}">${escapeHtml(label(s.operational_status))}</span></div><div class="system-mobile-meta"><div><span>หมู่บ้าน</span><strong>${escapeHtml(s.village?.village_name||'-')}</strong></div><div><span>อำเภอ</span><strong>${escapeHtml(s.village?.district||'-')}</strong></div><div><span>ประเภทระบบ</span><strong>${escapeHtml(label(s.system_type))}</strong></div><div><span>Public</span><strong>${s.publicVisible?'แสดง':'ไม่แสดง'}</strong></div></div><div class="system-mobile-actions">${systemActionButtons(s)}</div></article>`).join('');
    }
  }

  async function fetchSystem(id){ return unwrap(await api('data.waterSystem',authPayload({systemId:id}))).system; }
  async function openSystem(id,mode='view'){
    if((mode==='edit'&&!hasPermission('UPDATE_SYSTEM'))||(mode==='delete'&&!hasPermission('DELETE_SYSTEM')))return;
    const request=++state.selectionRequest,generation=state.datasetGeneration;
    const busy=showBusy('กำลังโหลดข้อมูลระบบ...');
    try{ const system=await fetchSystem(id);if(request!==state.selectionRequest||generation!==state.datasetGeneration)return;state.selectedSystem=system; renderSystemDetail(); if(!$('systemDialog').open)$('systemDialog').showModal(); if(mode==='edit')openEdit(); if(mode==='delete')openDelete(); }
    catch(e){handleApiError(e);} finally{hideBusy(busy);}
  }
  function detailItem(labelText,value,full=false){return `<div class="detail-item ${full?'full':''}"><span>${escapeHtml(labelText)}</span><strong>${escapeHtml(fmt(value))}</strong></div>`;}
  function detailSection(title,items){return `<section class="detail-section"><h4 class="detail-section-title">${escapeHtml(title)}</h4><div class="detail-grid">${items.join('')}</div></section>`;}
  function renderSystemDetail(){
    const s=state.selectedSystem;if(!s)return;$('systemDialogTitle').textContent=s.system_name||s.system_id;
    const suppression=(s.publicSuppressionReasons||[]).map(label).join(', ')||'-';
    const coord=s.latitude!==''&&s.latitude!=null&&s.longitude!==''&&s.longitude!=null?`${s.latitude}, ${s.longitude}`:'-';
    const statusBadges=`<div class="detail-status-row"><span class="badge ${s.operational_status==='WORKING'?'good':s.operational_status==='NOT_WORKING'?'bad':'warn'}">${escapeHtml(label(s.operational_status))}</span><span class="badge ${s.water_quantity==='SUFFICIENT'?'good':s.water_quantity==='INSUFFICIENT'?'warn':'info'}">${escapeHtml(label(s.water_quantity))}</span><span class="badge ${s.drinking_water_quality==='PASS'?'good':s.drinking_water_quality==='FAIL'?'bad':'info'}">${escapeHtml(label(s.drinking_water_quality))}</span><span class="badge ${s.publicVisible?'good':'warn'}">Public: ${s.publicVisible?'แสดง':'ไม่แสดง'}</span></div>`;
    $('systemDialogBody').innerHTML=statusBadges+
      detailSection('ข้อมูลพื้นที่',[detailItem('รหัสระบบ',s.system_id),detailItem('หมู่บ้าน',s.village?.village_name),detailItem('ตำบล',s.village?.subdistrict),detailItem('อำเภอ',s.village?.district),detailItem('อปท.',s.village?.local_authority,true),detailItem('พิกัด',coord,true)])+
      detailSection('ข้อมูลระบบประปา',[detailItem('ประเภทระบบ',label(s.system_type)),detailItem('แหล่งน้ำ',label(s.water_source_type)),detailItem('กำลังผลิต',s.capacity_m3_hr===''?'-':`${s.capacity_m3_hr} ลบ.ม./ชม.`),detailItem('ครัวเรือน',s.households_served),detailItem('ปีสร้าง พ.ศ.',s.construction_year_be),detailItem('หน่วยงานรับผิดชอบ',s.responsible_agency,true)])+
      detailSection('สถานะและคุณภาพ',[detailItem('สถานะการใช้งาน',label(s.operational_status)),detailItem('ปริมาณน้ำ',label(s.water_quantity)),detailItem('คุณภาพน้ำใช้',label(s.utility_water_quality)),detailItem('คุณภาพน้ำดื่ม',label(s.drinking_water_quality)),detailItem('แรงดันน้ำ',label(s.water_pressure)),detailItem('การมีน้ำตลอดปี',label(s.year_round_status))])+
      detailSection('Management / Public',[detailItem('สถานะ Public',s.publicVisible?'แสดง':'ไม่แสดง'),detailItem('Processor Guard',s.processingGuard?.mutable?'พร้อมแก้ไข':label(s.processingGuard?.reason||'ถูกล็อก')),detailItem('เหตุผลไม่แสดง Public',suppression,true)]);
    $('editSystemButton').disabled=!(s.managementMutable&&hasPermission('UPDATE_SYSTEM')); $('deleteSystemButton').disabled=!(s.managementMutable&&hasPermission('DELETE_SYSTEM'));
  }

  function parseJsonArray(value){ if(Array.isArray(value))return value; if(value===''||value==null)return[]; try{const x=JSON.parse(value);return Array.isArray(x)?x:null;}catch(_){return null;} }
  function renderCheckboxGroup(name,values,selected,labelFn=label){ const set=new Set(selected||[]); const choices=[...new Set([...values,...set])]; return `<div class="checkbox-grid">${choices.map(v=>`<label class="checkbox-option"><input type="checkbox" name="${name}" value="${escapeHtml(v)}" ${set.has(v)?'checked':''}>${escapeHtml(labelFn(v))}</label>`).join('')}</div>`; }
  function fieldHtml(def,s){ const [key,title,type]=def; const raw=s[key]??''; const id=`edit_${key}`;
    if(type==='enum'||type==='enum-blank'){ const opts=(state.bootstrap?.enumCatalog?.[key]||[]); const current=String(raw); const missing=current&&!opts.some(v=>String(v)===current); return `<label class="edit-field">${escapeHtml(title)}<select id="${id}" data-field="${key}" data-kind="${type}"><option value="" ${current?'':'selected'}>-</option>${missing?`<option value="${escapeHtml(current)}" selected>${escapeHtml(label(current))}</option>`:''}${opts.map(v=>`<option value="${escapeHtml(v)}" ${current===String(v)?'selected':''}>${escapeHtml(label(v))}</option>`).join('')}</select></label>`; }
    if(type==='textarea')return `<label class="edit-field full">${escapeHtml(title)}<textarea id="${id}" data-field="${key}" data-kind="text" rows="3">${escapeHtml(raw)}</textarea></label>`;
    if(['usage-array','quality-array','months-array'].includes(type)){const parsed=parseJsonArray(raw);if(parsed===null)return `<fieldset class="full" data-field="${key}"><legend>${escapeHtml(title)}</legend><p class="form-error">ข้อมูลเดิมอ่านไม่ได้ กรุณาตรวจสอบข้อมูลก่อนแก้ไขรายการนี้</p></fieldset>`;const values=type==='usage-array'?['DOMESTIC','AGRICULTURE']:type==='quality-array'?Object.keys(QUALITY_CATEGORY_LABELS):Object.keys(MONTH_LABELS);return `<fieldset class="full" data-field="${key}"><legend>${escapeHtml(title)}</legend>${renderCheckboxGroup(key,values,parsed,type==='quality-array'?v=>QUALITY_CATEGORY_LABELS[v]||v:label)}</fieldset>`;}
    if(type==='villages-array'){ const parsed=parseJsonArray(raw);if(parsed===null)return `<fieldset class="full" data-field="${key}"><legend>${escapeHtml(title)}</legend><p class="form-error">ข้อมูลเดิมอ่านไม่ได้ กรุณาตรวจสอบข้อมูลก่อนแก้ไขรายการนี้</p></fieldset>`;const selected=new Set(parsed.map(v=>typeof v==='string'?v:(v?.village_id||v?.villageId||'')).filter(Boolean));const options=(state.dashboard?.villages||[]).filter(v=>v.village_id!==s.village_id);const known=new Set(options.map(v=>v.village_id));const choices=[...options,...[...selected].filter(id=>!known.has(id)).map(village_id=>({village_id,village_name:`รหัสเดิม ${village_id}`}))];return `<fieldset class="full village-selector" id="${id}" data-field="${key}" data-kind="villages-array"><legend>${escapeHtml(title)}</legend><p class="selection-help">แตะหรือกด Space เพื่อเลือกได้หลายหมู่บ้าน</p>${choices.length?`<div class="checkbox-grid village-options">${choices.map(v=>`<label class="checkbox-option"><input type="checkbox" name="${key}" value="${escapeHtml(v.village_id)}" ${selected.has(v.village_id)?'checked':''}><span>${escapeHtml(`${v.village_name||'(ไม่ระบุชื่อหมู่บ้าน)'} — ${v.subdistrict||''} ${v.district||''}`)}</span></label>`).join('')}</div>`:'<p class="selection-help">ไม่มีหมู่บ้านอื่นให้เลือก</p>'}</fieldset>`; }
    const htmlType=type==='number'||type==='integer'?'number':type==='url'?'url':'text'; const step=type==='integer'?'1':type==='number'?'any':undefined;
    const bounds=key==='latitude'?'min="-90" max="90"':key==='longitude'?'min="-180" max="180"':'min="0"';
    return `<label class="edit-field">${escapeHtml(title)}<input id="${id}" data-field="${key}" data-kind="${type}" type="${htmlType}" ${step?`step="${step}" ${bounds} inputmode="${type==='integer'?'numeric':'decimal'}"`:''} value="${escapeHtml(raw)}"></label>`;
  }
  function editFieldDefinitionMap(){const map={};EDIT_FIELDS.forEach(def=>{map[def[0]]=def;});return map;}
  function renderEditSections(s){const byKey=editFieldDefinitionMap();return EDIT_GROUPS.map(group=>`<section class="edit-section"><header class="edit-section-header"><h4>${escapeHtml(group.title)}</h4><p>${escapeHtml(group.description)}</p></header><div class="edit-section-grid">${group.keys.map(key=>byKey[key]?fieldHtml(byKey[key],s):'').join('')}</div></section>`).join('');}
  function openEdit(){const s=state.selectedSystem;if(!s||!s.managementMutable||!hasPermission('UPDATE_SYSTEM'))return;state.editTouched.clear();$('editDialogTitle').textContent=s.system_name||s.system_id;$('editFields').innerHTML=renderEditSections(s);$('editReason').value='';setError('editError'); if(!$('editDialog').open)$('editDialog').showModal();}
  function canonicalArrayString(arr){return arr.length?JSON.stringify(arr):'';}
  function canonicalShared(value){const parsed=parseJsonArray(value);if(parsed===null)return null;return parsed.map(v=>typeof v==='string'?v:(v?.village_id||v?.villageId||'')).filter(Boolean).sort();}
  function collectPatch(){const s=state.selectedSystem,patch={};
    EDIT_FIELDS.forEach(([key,,type])=>{if(!state.editTouched.has(key))return;let value;
      if(['usage-array','quality-array','months-array'].includes(type)){const selected=[...document.querySelectorAll(`input[name="${key}"]:checked`)].map(x=>x.value);const before=parseJsonArray(s[key]);if(before!==null&&JSON.stringify([...new Set(selected)].sort())!==JSON.stringify([...new Set(before.map(String))].sort()))patch[key]=canonicalArrayString(selected);return;}
      if(type==='villages-array'){const ids=[...document.querySelectorAll(`input[name="${key}"]:checked`)].map(o=>o.value).sort();const before=canonicalShared(s[key]);if(before!==null&&JSON.stringify(ids)!==JSON.stringify(before))patch[key]=ids.map(village_id=>({village_id}));return;}
      const el=$(`edit_${key}`); if(!el)return; value=el.value;
      if(type==='number'||type==='integer') value=value.trim()===''?'':Number(value);
      const before=s[key]??''; if((type==='number'||type==='integer')&&value!==''&&before!==''&&Number(value)===Number(before))return;if(String(value)!==String(before))patch[key]=value;
    }); return patch; }

  function beginMutation(dialog){if(state.mutating)return false;state.mutating=true;dialog.querySelectorAll('button[type="submit"]').forEach(button=>button.disabled=true);return true;}
  function endMutation(dialog){state.mutating=false;dialog.querySelectorAll('button[type="submit"]').forEach(button=>button.disabled=false);}
  function editIsDirty(){return Object.keys(collectPatch()).length>0||$('editReason').value.trim()!=='';}
  function dismissDialog(dialog){if(state.mutating)return;if(dialog.id==='passwordDialog'&&dialog.dataset.forced==='true')return;if(dialog.id==='editDialog'&&editIsDirty()){$('discardDialog').showModal();return;}dialog.close();}
  function bindDialogDismissal(){document.querySelectorAll('dialog:not(#busyOverlay)').forEach(dialog=>{
    dialog.querySelectorAll('[data-dismiss-dialog]').forEach(button=>button.addEventListener('click',()=>dismissDialog(dialog)));
    dialog.addEventListener('cancel',event=>{event.preventDefault();if(dialog.id==='discardDialog'){dialog.close();return;}dismissDialog(dialog);});
    dialog.addEventListener('click',event=>{if(event.target===dialog)dismissDialog(dialog);});
  });
    $('busyOverlay').addEventListener('cancel',event=>event.preventDefault());
    $('continueEditingButton').addEventListener('click',()=>$('discardDialog').close());
    $('confirmDiscardButton').addEventListener('click',()=>{$('discardDialog').close();$('editDialog').close();});
  }
  async function saveEdit(){const s=state.selectedSystem,patch=collectPatch();if(!s||!s.managementMutable||!hasPermission('UPDATE_SYSTEM'))return;for(const [key,,type] of EDIT_FIELDS){if(!Object.hasOwn(patch,key)||!['number','integer'].includes(type))continue;const value=patch[key];const coordinate=key==='latitude'||key==='longitude';const min=key==='latitude'?-90:key==='longitude'?-180:0,max=key==='latitude'?90:key==='longitude'?180:Infinity;if(value!==''&&(!Number.isFinite(value)||value<min||value>max||(type==='integer'&&!Number.isInteger(value)))){setError('editError',coordinate?'พิกัดอยู่นอกช่วงที่รองรับ':'กรุณาระบุตัวเลขที่ถูกต้องและไม่ติดลบ');$(`edit_${key}`)?.focus();return;}}
    if(Object.hasOwn(patch,'latitude')||Object.hasOwn(patch,'longitude')){const latitude=Object.hasOwn(patch,'latitude')?patch.latitude:s.latitude,longitude=Object.hasOwn(patch,'longitude')?patch.longitude:s.longitude;if((latitude===''||latitude==null)!==(longitude===''||longitude==null)){setError('editError','กรุณาระบุพิกัดทั้งสองค่า หรือเว้นว่างทั้งสองค่า');return;}}
    if(!Object.keys(patch).length){setError('editError','ไม่มีข้อมูลที่เปลี่ยนแปลง');return;}if(!beginMutation($('editDialog')))return;const busy=showBusy('กำลังบันทึกการแก้ไข...');
    try{const data=unwrap(await api('data.updateWaterSystem',authPayload({request:{systemId:s.system_id,expectedVersion:s.recordVersion,patch,reason:$('editReason').value.trim(),clientInfo:clientInfo()}})));state.selectedSystem=data.system;$('editDialog').close();renderSystemDetail();toast('บันทึกการแก้ไขแล้ว');await reloadDashboard(false);}
    catch(e){if(e.code==='CONFLICT')setError('editError','ข้อมูลถูกแก้โดยรายการอื่น กรุณาปิดหน้าต่างแล้วเปิดข้อมูลล่าสุด');else setError('editError',e.message);}finally{hideBusy(busy);endMutation($('editDialog'));}
  }

  function openDelete(){const s=state.selectedSystem;if(!s||!s.managementMutable||!hasPermission('DELETE_SYSTEM'))return;$('deleteConfirmId').textContent=s.system_id;$('deleteConfirmInput').value='';$('deleteReason').value='';setError('deleteError');if(!$('deleteDialog').open)$('deleteDialog').showModal();}
  async function confirmDelete(){const s=state.selectedSystem;if(!s||!s.managementMutable||!hasPermission('DELETE_SYSTEM'))return;if($('deleteConfirmInput').value.trim()!==s.system_id){setError('deleteError','รหัสยืนยันไม่ตรงกับระบบที่จะลบ');return;}if(!$('deleteReason').value.trim()){setError('deleteError','กรุณาระบุเหตุผลในการลบ');return;}if(!beginMutation($('deleteDialog')))return;const busy=showBusy('กำลังลบระบบประปา...');
    try{unwrap(await api('data.deleteWaterSystem',authPayload({request:{systemId:s.system_id,expectedVersion:s.recordVersion,reason:$('deleteReason').value.trim(),clientInfo:clientInfo()}})));$('deleteDialog').close();$('systemDialog').close();state.selectedSystem=null;toast('ลบระบบประปาและบันทึก Audit แล้ว');await reloadDashboard(false);}
    catch(e){setError('deleteError',e.code==='CONFLICT'?'ข้อมูลเปลี่ยนแล้ว กรุณาโหลดรายการล่าสุดก่อนลบ':e.message);}finally{hideBusy(busy);endMutation($('deleteDialog'));}
  }

  async function loadHistory(systemId){const id=String(systemId||'').trim();if(!id){$('historyList').className='history-list empty-state';$('historyList').textContent='กรุณาระบุรหัสระบบ';return;}const busy=showBusy('กำลังโหลดประวัติ...');
    try{const data=unwrap(await api('data.entityHistory',authPayload({request:{entityType:'WATER_SYSTEM',entityId:id,limit:200}})));renderHistory(data.history||[]);$('historySystemId').value=id;}
    catch(e){handleApiError(e);}finally{hideBusy(busy);}
  }
  function renderHistory(items){const box=$('historyList');box.className='history-list';if(!items.length){box.className='history-list empty-state';box.textContent='ไม่พบประวัติของระบบนี้';return;}box.innerHTML=items.map(a=>`<article class="history-card"><header><div><h4>${escapeHtml(label(a.action))}</h4><div class="history-meta">${escapeHtml(a.username||a.userId)} · ${escapeHtml(a.role)} · ${escapeHtml(fmtDate(a.timestamp))}</div></div><span class="badge ${a.status==='COMMITTED'?'good':a.status==='FAILED'?'bad':'warn'}">${escapeHtml(label(a.status))}</span></header><div class="history-change-list">เปลี่ยน: ${escapeHtml((a.changedFields||[]).map(label).join(', ')||'-')}</div>${a.reason?`<div class="history-change-list">เหตุผล: ${escapeHtml(a.reason)}</div>`:''}</article>`).join('');}

  async function reloadDashboard(withBusy=true){const request=++state.refreshRequest,busy=withBusy?showBusy('กำลังรีเฟรชข้อมูล...'):null;try{const dash=unwrap(await api('data.dashboard',authPayload({filters:{}})));assertDashboard(dash);if(request===state.refreshRequest){state.dashboard=dash;renderDashboard();}}catch(e){if(request===state.refreshRequest)handleApiError(e);}finally{if(busy)hideBusy(busy);}}
  function switchTab(name){document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));document.querySelectorAll('[data-panel]').forEach(p=>p.classList.toggle('hidden',p.dataset.panel!==(name==='overview'||name==='map'?'systems':name)));if(name==='technicians')loadTechnicians();setTimeout(()=>{if(name==='overview'||name==='map'||name==='systems'){const target=$(name==='overview'?'technicianOverviewAnchor':name==='map'?'technicianMapSection':'technicianManagementSection');target.scrollIntoView({block:'start',behavior:'instant'});window.VWSTechnicianMap?.invalidate();}else {const target=$(`${name}Panel`);if(target){target.style.scrollMarginTop=`${Math.ceil($('appHeader').getBoundingClientRect().height)+12}px`;target.scrollIntoView({block:'start',behavior:'instant'});}window.VWSTechnicianAnalytics?.resize();}},0);}

  async function loadTechnicians(){if(!hasPermission('MANAGE_TECHNICIANS'))return;const busy=showBusy('กำลังโหลดบัญชีช่าง...');try{state.technicians=unwrap(await api('technicians.list',{token:state.token})).technicians||[];renderTechnicians();}catch(e){handleApiError(e);}finally{hideBusy(busy);}}
  function technicianActions(u){const id=escapeHtml(u.userId);return u.status==='DELETED'?'':`<button class="mini-btn" data-tech-action="edit" data-id="${id}">แก้ไข</button>${u.status==='ACTIVE'?`<button class="mini-btn" data-tech-action="disable" data-id="${id}">ปิด</button>`:''}${u.status==='DISABLED'?`<button class="mini-btn primary" data-tech-action="enable" data-id="${id}">เปิด</button>`:''}<button class="mini-btn" data-tech-action="reset" data-id="${id}">รีเซ็ตรหัสผ่าน</button><button class="mini-btn danger" data-tech-action="delete" data-id="${id}">ลบบัญชี</button>`;}
  function renderTechnicians(){const body=$('techniciansTableBody'),mobile=$('techniciansMobileList');if(!state.technicians.length){body.innerHTML='<tr><td colspan="5" class="empty-row">ยังไม่มีบัญชี Technician</td></tr>';mobile.innerHTML='<p class="empty-state">ยังไม่มีบัญชี Technician</p>';return;}body.innerHTML=state.technicians.map(u=>`<tr><td><strong>${escapeHtml(u.username)}</strong><div class="system-id">${escapeHtml(u.userId)}</div></td><td>${escapeHtml(u.displayName)}</td><td><span class="badge ${u.status==='ACTIVE'?'good':u.status==='DISABLED'?'warn':'bad'}">${escapeHtml(label(u.status))}</span></td><td>${escapeHtml(fmtDate(u.lastLoginAt))}</td><td><div class="row-actions">${technicianActions(u)}</div></td></tr>`).join('');mobile.innerHTML=state.technicians.map(u=>`<article class="technician-mobile-card"><div class="technician-mobile-head"><div><strong>${escapeHtml(u.displayName)}</strong><span>${escapeHtml(u.username)} · ${escapeHtml(u.userId)}</span></div><span class="badge ${u.status==='ACTIVE'?'good':u.status==='DISABLED'?'warn':'bad'}">${escapeHtml(label(u.status))}</span></div><p>เข้าสู่ระบบล่าสุด: ${escapeHtml(fmtDate(u.lastLoginAt))}</p><div class="technician-mobile-actions">${technicianActions(u)}</div></article>`).join('');}
  function openTechnicianForm(mode,user=null){state.technicianDialogMode=mode;state.selectedTechnician=user;$('technicianDialogTitle').textContent=mode==='create'?'สร้างบัญชีช่าง':'แก้ไขบัญชีช่าง';$('techUsername').value=user?.username||'';$('techDisplayName').value=user?.displayName||'';$('techPassword').value='';$('techPasswordLabel').classList.toggle('hidden',mode!=='create');$('techPassword').required=mode==='create';setError('technicianError');$('technicianDialog').showModal();}
  async function saveTechnician(){if(!beginMutation($('technicianDialog')))return;const mode=state.technicianDialogMode;const busy=showBusy(mode==='create'?'กำลังสร้างบัญชี...':'กำลังบันทึกบัญชี...');try{if(mode==='create'){unwrap(await api('technicians.create',authPayload({request:{username:$('techUsername').value,displayName:$('techDisplayName').value,password:$('techPassword').value,clientInfo:clientInfo()}})));toast('สร้างบัญชีช่างแล้ว');}else{const u=state.selectedTechnician;unwrap(await api('technicians.update',authPayload({request:{userId:u.userId,expectedVersion:u.recordVersion,username:$('techUsername').value,displayName:$('techDisplayName').value,clientInfo:clientInfo()}})));toast('แก้ไขบัญชีช่างแล้ว');}$('technicianDialog').close();$('techPassword').value='';await loadTechnicians();}catch(e){setError('technicianError',e.message);}finally{hideBusy(busy);endMutation($('technicianDialog'));}}
  function findTech(id){return state.technicians.find(u=>u.userId===id);}
  function openAccountAction(action,user){state.accountAction=action;state.selectedTechnician=user;$('actionReason').value='';$('actionPassword').value='';setError('actionError');const reason=action==='delete',password=action==='reset';$('actionReasonLabel').classList.toggle('hidden',!reason);$('actionPasswordLabel').classList.toggle('hidden',!password);const titles={disable:'ปิดการใช้งานบัญชี',enable:'เปิดการใช้งานบัญชี',delete:'ลบบัญชีช่าง',reset:'รีเซ็ตรหัสผ่าน'};$('actionTitle').textContent=titles[action];$('actionDescription').textContent=`${user.displayName} (${user.username})`;$('actionConfirmButton').className=`btn ${action==='delete'?'danger':'primary'}`;$('actionDialog').showModal();}
  async function runAccountAction(){const u=state.selectedTechnician,a=state.accountAction;const map={disable:'technicians.disable',enable:'technicians.enable',delete:'technicians.delete',reset:'technicians.resetPassword'};const req={userId:u.userId,expectedVersion:u.recordVersion,clientInfo:clientInfo()};if(a==='delete'){req.reason=$('actionReason').value.trim();if(!req.reason){setError('actionError','กรุณาระบุเหตุผล');return;}}if(a==='reset'){req.newPassword=$('actionPassword').value;if(!req.newPassword){setError('actionError','กรุณาระบุรหัสผ่านใหม่');return;}}if(!beginMutation($('actionDialog')))return;const busy=showBusy('กำลังดำเนินการบัญชี...');try{unwrap(await api(map[a],authPayload({request:req})));$('actionDialog').close();$('actionPassword').value='';toast('ดำเนินการบัญชีสำเร็จ');await loadTechnicians();}catch(e){setError('actionError',e.message);}finally{hideBusy(busy);endMutation($('actionDialog'));}}

  function openPasswordDialog(forced=false){
    ['currentPassword','newPassword','confirmNewPassword'].forEach(id=>$(id).value='');setError('passwordError');
    $('passwordDialogDescription').textContent=forced?'บัญชีนี้ต้องเปลี่ยนรหัสผ่านก่อนใช้งาน Dashboard ช่าง':'เปลี่ยนรหัสผ่านของบัญชีที่กำลังเข้าสู่ระบบ';
    $('passwordCloseButton').classList.toggle('hidden',forced);$('passwordCancelButton').classList.toggle('hidden',forced);
    $('passwordDialog').dataset.forced=forced?'true':'false';if(!$('passwordDialog').open)$('passwordDialog').showModal();
  }
  async function changePassword(){const cur=$('currentPassword').value,next=$('newPassword').value,confirm=$('confirmNewPassword').value;if(next!==confirm){setError('passwordError','รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');return;}if(!beginMutation($('passwordDialog')))return;const busy=showBusy('กำลังเปลี่ยนรหัสผ่าน...');try{unwrap(await api('auth.changePassword',authPayload({request:{currentPassword:cur,newPassword:next,clientInfo:clientInfo()}})));const me=unwrap(await api('auth.me',{token:state.token}));state.user=me.user;['currentPassword','newPassword','confirmNewPassword'].forEach(id=>$(id).value='');$('passwordDialog').close();toast('เปลี่ยนรหัสผ่านแล้ว');await bootstrapAndLoad();}catch(e){setError('passwordError',e.message);}finally{hideBusy(busy);endMutation($('passwordDialog'));}}
  async function performLogout(){const token=state.token;clearSession();$('mobileAccountMenu').classList.add('hidden');$('mobileAccountButton').setAttribute('aria-expanded','false');showLogin();try{await api('auth.logout',{token});}catch(_){}}
  function handleApiError(e){if(['SESSION_INVALID','SESSION_REVOKED','SESSION_EXPIRED','SESSION_IDLE_EXPIRED','AUTH_ACCOUNT_DISABLED','AUTH_ACCOUNT_DELETED'].includes(e.code)){clearSession();document.querySelectorAll('dialog[open]').forEach(d=>d.close());showLogin();toast('Session สิ้นสุด กรุณาเข้าสู่ระบบใหม่','error');return;}toast(e.message||'เกิดข้อผิดพลาด','error');}

  function bind(){
    bindDialogDismissal();
    window.VWSTechnicianAnalytics?.bind(id=>openSystem(id));
    for(const id of ['editForm','deleteForm','technicianForm','actionForm','passwordForm'])$(id).addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('input, select')&&event.target.type!=='checkbox')event.preventDefault();});
    $('retryResumeButton').addEventListener('click',resume);
    for(const name of ['input','change'])$('editFields').addEventListener(name,event=>{const key=event.target.dataset.field||event.target.name;if(key)state.editTouched.add(key);});
    $('loginForm').addEventListener('submit',async e=>{e.preventDefault();setError('loginError');const u=$('loginUsername').value,p=$('loginPassword').value;const busy=showBusy('กำลังเข้าสู่ระบบ...');try{await login(u,p);$('loginPassword').value='';await bootstrapAndLoad();}catch(err){clearSession();setError('loginError',err.message);showLogin();}finally{hideBusy(busy);}});
    $('logoutButton').addEventListener('click',performLogout);$('mobileLogoutButton').addEventListener('click',performLogout);
    $('refreshButton').addEventListener('click',()=>reloadDashboard(true));
    $('changePasswordButton').addEventListener('click',()=>openPasswordDialog(false));$('mobileChangePasswordButton').addEventListener('click',()=>{$('mobileAccountMenu').classList.add('hidden');$('mobileAccountButton').setAttribute('aria-expanded','false');openPasswordDialog(false);});
    $('mobileAccountButton').addEventListener('click',()=>{const menu=$('mobileAccountMenu'),open=menu.classList.contains('hidden');menu.classList.toggle('hidden',!open);$('mobileAccountButton').setAttribute('aria-expanded',open?'true':'false');});
    document.addEventListener('click',e=>{if(!e.target.closest('.mobile-account')){$('mobileAccountMenu').classList.add('hidden');$('mobileAccountButton').setAttribute('aria-expanded','false');}});
    $('filterToggleButton').addEventListener('click',()=>{const panel=$('filterPanel'),open=panel.classList.toggle('open');$('filterToggleButton').setAttribute('aria-expanded',open?'true':'false');});
    document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
    ['searchInput','districtFilter','statusFilter','publicFilter'].forEach(id=>$(id).addEventListener(id==='searchInput'?'input':'change',applyFilters));
    $('clearFiltersButton').addEventListener('click',()=>{$('searchInput').value='';$('districtFilter').value='';$('statusFilter').value='';$('publicFilter').value='';applyFilters();});
    $('prevPage').addEventListener('click',()=>{if(state.page>1){state.page--;renderSystemsTable();}});$('nextPage').addEventListener('click',()=>{if(state.page<Math.ceil(state.filteredSystems.length/PAGE_SIZE)){state.page++;renderSystemsTable();}});
    const handleSystemAction=e=>{const b=e.target.closest('button[data-action]');if(!b||b.disabled)return;const {action,id}=b.dataset;if(action==='edit'&&!hasPermission('UPDATE_SYSTEM'))return;if(action==='delete'&&!hasPermission('DELETE_SYSTEM'))return;if(action==='view'||action==='edit'||action==='delete')openSystem(id,action);if(action==='map'){switchTab('map');window.VWSTechnicianMap?.focus(id);}if(action==='history'){switchTab('history');loadHistory(id);}};
    $('systemsTableBody').addEventListener('click',handleSystemAction);$('systemsMobileList').addEventListener('click',handleSystemAction);
    $('editSystemButton').addEventListener('click',openEdit);$('deleteSystemButton').addEventListener('click',openDelete);
    $('editForm').addEventListener('submit',e=>{e.preventDefault();saveEdit();});$('deleteForm').addEventListener('submit',e=>{e.preventDefault();confirmDelete();});
    $('historySearchButton').addEventListener('click',()=>loadHistory($('historySystemId').value));$('historySystemId').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();loadHistory(e.target.value);}});
    $('createTechnicianButton').addEventListener('click',()=>openTechnicianForm('create'));
    $('technicianForm').addEventListener('submit',e=>{e.preventDefault();saveTechnician();});
    for(const list of [$('techniciansTableBody'),$('techniciansMobileList')])list.addEventListener('click',e=>{const b=e.target.closest('button[data-tech-action]');if(!b)return;const u=findTech(b.dataset.id);if(!u)return;if(b.dataset.techAction==='edit')openTechnicianForm('edit',u);else openAccountAction(b.dataset.techAction,u);});
    $('actionForm').addEventListener('submit',e=>{e.preventDefault();runAccountAction();});$('passwordForm').addEventListener('submit',e=>{e.preventDefault();changePassword();});
  }

  bind(); resume();
})();
