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
    villageById: new Map(),
    filteredSystems: [],
    tableMode: 'monitoring',
    tableBaseTotal: 0,
    tableScopeTotal: 0,
    page: 1,
    selectedSystem: null,
    savedSummary: null,
    technicians: [],
    selectedTechnician: null,
    technicianDialogMode: 'create',
    accountAction: null,
    editTouched: new Set(),
    sharedVillageIds: new Set(),
    sharedVillageLimit: 20,
    mutating: false,
    selectionRequest: 0,
    historyRequest: 0,
    datasetGeneration: 0,
    refreshRequest: 0,
    dashboardIntent: 0,
    dashboardAppliedRequest: 0,
    refreshStatusIntent: 0,
    technicianRequest: 0,
    techniciansLoadedToken: ''
  };
  let dashboardRequest=null;
  let queuedDashboardRequest=null;
  let accountsRequest=null;
  const systemRequests=new Map();

  const ENUM_LABELS = {
    LOCAL_AUTHORITY:'อปท.',VILLAGE_OR_OTHER:'หมู่บ้าน/หน่วยงานอื่น',UNKNOWN:'ไม่ทราบ',
    GROUNDWATER_SMALL:'บาดาลขนาดเล็ก',GROUNDWATER_MEDIUM:'บาดาลขนาดกลาง',GROUNDWATER_LARGE:'บาดาลขนาดใหญ่',
    SURFACE_SMALL:'ผิวดินขนาดเล็ก',SURFACE_MEDIUM:'ผิวดินขนาดกลาง',SURFACE_LARGE:'ผิวดินขนาดใหญ่',SURFACE_VERY_LARGE:'ผิวดินขนาดใหญ่มาก',
    GROUNDWATER:'น้ำบาดาล',SURFACE_WATER:'น้ำผิวดิน',MIXED:'ผสม',DOMESTIC:'อุปโภคบริโภค',AGRICULTURE:'เกษตร',
    WORKING:'ใช้งานได้',NOT_WORKING:'ใช้งานไม่ได้',USABLE:'ใช้ได้',NOT_USABLE:'ใช้ไม่ได้',PASS:'ผ่าน',FAIL:'ไม่ผ่าน',NO_DATA:'ไม่มีข้อมูล',
    SUFFICIENT:'เพียงพอ',INSUFFICIENT:'ไม่เพียงพอ',YES:'ใช่',NO:'ไม่ใช่',LOCAL_CREATED:'อปท. สร้าง',ACCEPTED_ASSET:'รับมอบทรัพย์สิน',
    TRANSFERRED:'ถ่ายโอน',NOT_LOCAL_AUTHORITY_ASSET:'ไม่ใช่ทรัพย์สิน อปท.',AVAILABLE:'มีเอกสาร',NOT_AVAILABLE:'ไม่มีเอกสาร',
    FLOW_CONTINUOUS:'ไหลต่อเนื่อง',FLOW_STRONG_SOMETIMES:'แรงเป็นบางช่วง',FLOW_WEAK_CONTINUOUS:'ไหลอ่อนต่อเนื่อง',YEAR_ROUND:'ตลอดปี',SEASONAL:'ตามฤดูกาล',
    ACTIVE:'ใช้งาน',DISABLED:'ปิดใช้งาน',DELETED:'ยกเลิก',VISIBLE:'แสดง',HIDDEN:'ไม่แสดง'
  };
  const MONTH_LABELS = {JAN:'ม.ค.',FEB:'ก.พ.',MAR:'มี.ค.',APR:'เม.ย.',MAY:'พ.ค.',JUN:'มิ.ย.',JUL:'ก.ค.',AUG:'ส.ค.',SEP:'ก.ย.',OCT:'ต.ค.',NOV:'พ.ย.',DEC:'ธ.ค.'};
  const QUALITY_CATEGORY_LABELS = {PHYSICAL:'กายภาพ',GENERAL_CHEMICAL:'เคมีทั่วไป',GENERAL_HEAVY_METALS:'โลหะหนักทั่วไป',TOXIC_HEAVY_METALS:'โลหะหนักเป็นพิษ',BACTERIA:'แบคทีเรีย'};
  const ACTION_LABELS = {SYSTEM_UPDATE:'แก้ไขข้อมูลระบบประปา',SYSTEM_DELETE:'ลบระบบประปา',USER_PASSWORD_CHANGE:'เปลี่ยนรหัสผ่าน',TECHNICIAN_CREATE:'สร้างบัญชีช่างเทคนิค',TECHNICIAN_UPDATE:'แก้ไขบัญชีช่างเทคนิค',TECHNICIAN_DISABLE:'ปิดใช้งานบัญชีช่างเทคนิค',TECHNICIAN_ENABLE:'เปิดใช้งานบัญชีช่างเทคนิค',TECHNICIAN_DELETE:'ลบบัญชีช่างเทคนิค',TECHNICIAN_RESET_PASSWORD:'รีเซ็ตรหัสผ่าน'};
  const ROLE_LABELS = {ADMIN:'ผู้ดูแลระบบ',TECHNICIAN:'ช่างเทคนิค'};
  const STATE_LABELS = {
    COMMITTED:'สำเร็จ',FAILED:'ไม่สำเร็จ',PREPARED:'รอตรวจสอบ',
    NO_RAW_LINK:'ข้อมูลเดิม ไม่มีรายการส่งข้อมูลต้นทางเชื่อมโยง',RAW_PROCESSED:'พร้อมแก้ไข',
    RAW_NOT_PROCESSED:'รายการยังประมวลผลไม่สมบูรณ์',MULTIPLE_RAW_LINKS:'พบข้อมูลต้นทางเชื่อมโยงซ้ำ ต้องให้ผู้ดูแลระบบตรวจสอบ',
    UNSUPPORTED_PROCESSING_STATUS:'สถานะการประมวลผลไม่รองรับ',
    MISSING_COORDINATE:'ไม่มีพิกัด',VILLAGE_SUPPRESSED_NO_LINKED_ACTIVE_SYSTEM:'หมู่บ้านไม่มีระบบที่เชื่อมโยงสำหรับหน้าสาธารณะ',
    WATERWORKS_WITHOUT_LINKED_ACTIVE_SYSTEM:'หมู่บ้านระบุว่ามีประปา แต่ไม่มีระบบเชื่อมโยง',VILLAGE_SUPPRESSED:'หมู่บ้านไม่แสดงบนหน้าสาธารณะ'
  };
  const FIELD_LABELS = {
    __deleted__:'ลบรายการ',system_name:'ชื่อระบบ',latitude:'ละติจูด',longitude:'ลองจิจูด',owner_type:'ประเภทเจ้าของ',
    responsible_agency:'หน่วยงานรับผิดชอบ',system_type:'ประเภทระบบ',water_source_type:'ประเภทแหล่งน้ำ',capacity_m3_hr:'กำลังผลิต',
    usage_type:'การใช้น้ำหลัก',households_served:'ครัวเรือนที่ให้บริการ',construction_year_be:'ปีสร้าง พ.ศ.',operational_status:'สถานะระบบ',
    utility_water_quality:'คุณภาพน้ำใช้',drinking_water_quality:'คุณภาพน้ำดื่ม',water_quantity:'ปริมาณน้ำ',shared_with_other_village:'ใช้น้ำร่วมหมู่บ้านอื่น',
    shared_village_name:'ชื่อหมู่บ้านที่ใช้น้ำร่วม',establishment_type:'ลักษณะการจัดตั้ง',establishment_agency:'หน่วยงานที่เกี่ยวข้องกับการจัดตั้ง',
    transfer_year_be:'ปีถ่ายโอน พ.ศ.',transfer_agency:'หน่วยงานถ่ายโอน',transfer_other:'รายละเอียดถ่ายโอนอื่น',transfer_document_status:'สถานะเอกสารถ่ายโอน',
    transfer_document_url:'ลิงก์เอกสารถ่ายโอน',usage_types_json:'ประเภทการใช้น้ำ',quality_failure_categories_json:'หมวดสาเหตุคุณภาพน้ำไม่ผ่าน',
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
    ['transfer_document_status','สถานะเอกสารถ่ายโอน','enum'],['transfer_document_url','ลิงก์เอกสารถ่ายโอน','url'],['usage_types_json','ประเภทการใช้น้ำ','usage-array'],
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

  const EDIT_CONDITIONS = [
    {controller:'drinking_water_quality',values:['FAIL'],fields:['quality_failure_categories_json','quality_failure_detail']},
    {controller:'year_round_status',values:['SEASONAL'],fields:['available_months_json']},
    {controller:'water_source_type',values:['SURFACE_WATER','MIXED'],fields:['surface_water_type','surface_water_agency']},
    {controller:'shared_with_other_village',values:['YES'],fields:['shared_village_name','shared_villages_json']},
    {controller:'establishment_type',values:['ACCEPTED_ASSET'],fields:['establishment_agency']},
    {controller:'establishment_type',values:['TRANSFERRED'],fields:['transfer_year_be','transfer_agency','transfer_other','transfer_document_status','transfer_document_url']}
  ];
  function editFieldActive(key){const rule=EDIT_CONDITIONS.find(rule=>rule.fields.includes(key));return !rule||rule.values.includes($(`edit_${rule.controller}`)?.value);}
  function updateEditConditions(){
    for(const rule of EDIT_CONDITIONS)for(const key of rule.fields){
      const wrapper=$('editFields').querySelector(`[data-edit-field="${key}"]`);if(!wrapper)continue;
      const active=editFieldActive(key);wrapper.classList.toggle('hidden',!active);
      wrapper.querySelectorAll('input,select,textarea,button').forEach(control=>{control.disabled=!active;});
    }
  }
  function clientInfo() { return `Technician Dashboard v2 | ${navigator.userAgent}`.slice(0, 500); }
  function endpoint() { return String((window.VWS_MANAGEMENT_CONFIG || {}).endpoint || '').trim(); }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function label(value) { const key=String(value ?? ''); return ENUM_LABELS[key] || MONTH_LABELS[key] || QUALITY_CATEGORY_LABELS[key] || ACTION_LABELS[key] || STATE_LABELS[key] || ROLE_LABELS[key] || FIELD_LABELS[key] || key || '-'; }
  function analyticsLabel(value){const text=label(value);return /^[A-Z][A-Z0-9_]*$/.test(text)?'ค่าที่ยังไม่มีคำแปล':text;}
  function fmt(value) { if (value === null || value === undefined || value === '') return '-'; return String(value); }
  function fmtDate(value) { if (!value) return '-'; const d=new Date(value); return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'}); }
  function hasPermission(permission) { return Boolean(state.bootstrap?.permissions?.includes(permission)); }
  function showBusy(text='กำลังประมวลผล...'){return window.VWSTechnicianUI.showLoading(text);}
  function hideBusy(operation){window.VWSTechnicianUI.closeLoading(operation);}
  function clearBusy(){window.VWSTechnicianUI.clearLoading();}
  function toast(message,type='success'){const ui=window.VWSTechnicianUI; (type==='error'?ui.showError:type==='warning'?ui.showWarning:ui.showSuccess)(message);}
  function setError(id,message=''){ $(id).textContent=message; }
  function setRefreshStatus(type='',message=''){
    const status=$('refreshStatus');
    status.textContent=message;status.className=`refresh-status${type?` ${type}`:''}${message?'':' hidden'}`;
    $('refreshButton').setAttribute('aria-busy',String(type==='loading'));
  }

  async function api(action,payload={}) {
    const url=endpoint();
    if (!window.VWSSupabaseTransport.allowed(url)) throw new Error('ยังไม่ได้ตั้งค่าการเชื่อมต่อระบบจัดการข้อมูล');
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({version:2,action,payload:await window.VWSSupabaseTransport.payload(action,payload)}),redirect:'follow',cache:'no-store',credentials:'omit'});
    const text=await res.text(); let json;
    try{ json=JSON.parse(text); }catch(_){ throw new Error(`ระบบจัดการข้อมูลส่งข้อมูลกลับมาในรูปแบบที่อ่านไม่ได้ (รหัส ${res.status})`); }
    await window.VWSSupabaseTransport.received(action,payload,json);return json;
  }
  function unwrap(response){ if (!response || response.success !== true){ const err=new Error(response?.error?.message || 'คำขอไม่สำเร็จ'); err.code=response?.error?.code || 'UNKNOWN'; err.details=response?.error?.details || {}; throw err; } return response.data || {}; }
  function authPayload(extra={}){ return Object.assign({token:state.token},extra); }
  function invalidateTechnicians(){state.technicianRequest++;state.technicians=[];state.selectedTechnician=null;state.techniciansLoadedToken='';accountsRequest=null;$('techniciansTableBody').replaceChildren();$('techniciansMobileList').replaceChildren();}
  function userIdentity(user){return user?`${user.userId||user.username||''}|${user.role||''}`:'';}
  function setCurrentUser(user){if(userIdentity(state.user)!==userIdentity(user))invalidateTechnicians();state.user=user||null;}
  function clearSession(){ state.refreshRequest++;state.dashboardIntent++;state.refreshStatusIntent++;state.selectionRequest++;state.historyRequest++;state.token='';setCurrentUser(null);state.bootstrap=null;state.dashboard=null;state.savedSummary=null;state.dashboardAppliedRequest=0;dashboardRequest=null;queuedDashboardRequest=null;systemRequests.clear();setRefreshStatus();window.VWSTechnicianMap?.clear();storageRemove(TOKEN_KEY); }
  function startDashboardRequest(intentId=++state.dashboardIntent){
    const requestId=++state.refreshRequest,token=state.token;
    const operation=(async()=>{const dash=unwrap(await api('data.dashboard',{token:token,filters:{}}));assertDashboard(dash);return{dash:dash,requestId:requestId,intentId:intentId,token:token};})();
    dashboardRequest=operation;
    operation.then(()=>{if(dashboardRequest===operation)dashboardRequest=null;},()=>{if(dashboardRequest===operation)dashboardRequest=null;});
    return operation;
  }
  function requestDashboard(explicitFresh=false){
    if(!dashboardRequest)return startDashboardRequest();
    if(!explicitFresh)return dashboardRequest;
    if(queuedDashboardRequest)return queuedDashboardRequest;
    const requestedToken=state.token,intentId=++state.dashboardIntent;
    const queued=dashboardRequest.catch(()=>null).then(()=>{if(!requestedToken||requestedToken!==state.token||intentId!==state.dashboardIntent){const error=new Error('คำขอข้อมูลถูกยกเลิกเนื่องจาก Session เปลี่ยนแล้ว');error.code='STALE_RESPONSE';throw error;}if(queuedDashboardRequest===queued)queuedDashboardRequest=null;return startDashboardRequest(intentId);});
    queuedDashboardRequest=queued;
    queued.then(()=>{if(queuedDashboardRequest===queued)queuedDashboardRequest=null;},()=>{if(queuedDashboardRequest===queued)queuedDashboardRequest=null;});
    return queued;
  }
  function acceptDashboardResult(result){
    if(!isCurrentDashboardResult(result)||result.requestId<=state.dashboardAppliedRequest)return false;
    state.dashboardAppliedRequest=result.requestId;state.dashboard=result.dash;return true;
  }
  function isCurrentDashboardResult(result){return Boolean(result&&result.token===state.token&&result.intentId===state.dashboardIntent&&result.requestId===state.refreshRequest);}
  function validateLoginField(id, required=false){
    const input=$(id),error=$(`${id}Error`);
    const blank=id==='loginUsername'?!input.value.trim():input.value.length===0;
    const invalid=required&&blank;
    if(invalid)input.setAttribute('aria-invalid','true');else input.removeAttribute('aria-invalid');
    error.textContent=invalid?(id==='loginUsername'?'กรุณาระบุชื่อผู้ใช้':'กรุณาระบุรหัสผ่าน'):'';
    error.classList.toggle('hidden',!invalid);
    return !invalid;
  }
  function showLogin(){ state.selectionRequest++;clearBusy();closeSystemActionMenu(false);closeAccountMenu();document.documentElement.classList.remove('has-session','boot-handoff');$('skipLink').href='#loginView';$('bootView').classList.add('hidden');$('loginView').classList.remove('hidden');$('appView').classList.add('hidden');$('loginPassword').value='';validateLoginField('loginUsername');validateLoginField('loginPassword');scheduleBackToTop(); }
  function showApp(){ document.documentElement.classList.remove('has-session','boot-handoff');$('skipLink').href='#main';$('bootView').classList.add('hidden');$('loginView').classList.add('hidden');$('appView').classList.remove('hidden');scheduleBackToTop(); }
  function showBoot(message='กำลังโหลดข้อมูล...',retry=false){
    document.documentElement.classList.add('has-session','boot-handoff');
    $('skipLink').href='#bootTitle';
    $('loginView').classList.add('hidden');
    $('appView').classList.add('hidden');
    $('bootTitle').textContent=message;
    $('bootError').textContent=retry?'ไม่สามารถตรวจสอบการเข้าสู่ระบบได้ในขณะนี้ โปรดลองอีกครั้ง':'';
    $('bootError').classList.toggle('hidden',!retry);
    $('retryResumeButton').classList.toggle('hidden',!retry);
    $('bootView').classList.remove('hidden');
  }

  async function login(username,password){
    let data;
    try{data=unwrap(await api('auth.login',{username,password,clientInfo:clientInfo()}));}
    catch(error){
      if(error.code==='AUTH_INVALID')error.message='ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาลองอีกครั้ง';
      throw error;
    }
    state.token=String(data.token||''); if(!/^MGT-[0-9a-f]{64}$/.test(state.token)) throw new Error('ข้อมูลยืนยันการเข้าสู่ระบบไม่ถูกต้อง');
    storageSet(TOKEN_KEY,state.token); setCurrentUser(data.user); return data;
  }

  async function bootstrapAndLoad(){
    if (state.user?.mustChangePassword){ renderCurrentUser(); showApp(); openPasswordDialog(true); return; }
    let boot;
    try{ boot=unwrap(await api('data.bootstrap',authPayload())); }
    catch(e){
      if(e.code==='AUTH_PASSWORD_CHANGE_REQUIRED'){
        const me=unwrap(await api('auth.me',{token:state.token})); setCurrentUser(me.user);
        if(state.user?.mustChangePassword){ renderCurrentUser(); showApp(); openPasswordDialog(true); return; }
      }
      throw e;
    }
    if(boot.user?.role==='TECHNICIAN' && (boot.featureFlags?.technicianDistrictScope!==true || !boot.user.district)){
      const error=new Error(boot.featureFlags?.technicianDistrictScope===true?'บัญชีช่างยังไม่ได้รับมอบหมายอำเภอ กรุณาติดต่อผู้ดูแลระบบ':'ระบบยังไม่พร้อมจำกัดสิทธิ์ช่างตามอำเภอ กรุณาติดต่อผู้ดูแลระบบ');
      error.code='ACCOUNT_DISTRICT_REQUIRED';throw error;
    }
    state.bootstrap=boot; setCurrentUser(boot.user); renderCurrentUser();
    const dashboardResult=await requestDashboard(false);if(!acceptDashboardResult(dashboardResult))throw new Error('คำขอข้อมูลแดชบอร์ดถูกแทนที่ กรุณาลองใหม่');
    const canManageAccounts=hasPermission('MANAGE_TECHNICIANS');
    if(!canManageAccounts)invalidateTechnicians();
    $('techniciansAccountButton').classList.toggle('hidden',!canManageAccounts);
    $('techniciansPanel').classList.add('hidden');
    if(!canManageAccounts&&location.hash==='#techniciansPanel')history.replaceState(null,'',location.pathname+location.search);
    showApp(); renderDashboard(); window.VWSTechnicianMap?.locateAutomatically(); requestAnimationFrame(()=>restoreSection());
  }

  async function resume(){
    if(!state.token){showLogin();return;}
    showBoot();
    try{ const me=unwrap(await api('auth.me',{token:state.token})); setCurrentUser(me.user); await bootstrapAndLoad(); }
    catch(e){ if(['SESSION_INVALID','SESSION_REVOKED','SESSION_EXPIRED','SESSION_IDLE_EXPIRED','AUTH_INVALID','AUTH_ACCOUNT_DISABLED','AUTH_ACCOUNT_DELETED','ACCOUNT_DISTRICT_REQUIRED'].includes(e.code)){clearSession();showLogin();if(e.code==='ACCOUNT_DISTRICT_REQUIRED')setError('loginError',e.message);}else{state.user=null;state.bootstrap=null;state.dashboard=null;showBoot('ยังตรวจสอบการเข้าสู่ระบบไม่สำเร็จ',true);} }
  }

  function renderCurrentUser(){ const district=String(state.user?.district||'').trim(); $('headerDistrictBadge').textContent=state.user?.role==='TECHNICIAN'&&district?`ช่างอำเภอ${district}`:''; $('headerDistrictBadge').classList.toggle('hidden',state.user?.role!=='TECHNICIAN'||!district); const name=state.user?.displayName||state.user?.username||'-',role=label(state.user?.role),showRole=role&&role!=='-'&&name.trim().toLocaleLowerCase('th')!==role.trim().toLocaleLowerCase('th'); $('currentUserName').textContent=name; $('currentUserRole').textContent=role; $('currentUserRole').classList.toggle('hidden',!showRole); $('mobileCurrentUserName').textContent=name; $('mobileCurrentUserRole').textContent=role; $('mobileCurrentUserRole').classList.toggle('hidden',!showRole); $('mobileAccountButton').setAttribute('aria-label',`เมนูบัญชีผู้ใช้ ${name}${showRole?` ${role}`:''}`); }
  function assertDashboard(dash){if(!dash||!Array.isArray(dash.villages)||!Array.isArray(dash.waterSystems)||!Array.isArray(dash.waterSources))throw new Error('รูปแบบข้อมูลแดชบอร์ดไม่ถูกต้อง');}

  function renderDashboard(){
    state.datasetGeneration++;
    if($('systemDialog').open&&!$('systemDetailStatus').classList.contains('hidden')){state.selectionRequest++;setSystemDetailStatus('error','ข้อมูลแดชบอร์ดเปลี่ยนแล้ว กรุณาปิดแล้วเปิดรายละเอียดอีกครั้ง');}
    const d=state.dashboard||{};
    state.villageById=new Map((d.villages||[]).map(v=>[v.village_id,v]));
    $('generatedAt').textContent=fmtDate(d.generatedAt);
    window.VWSTechnicianMap?.init(
      id=>openSystem(id),
      id=>(state.dashboard?.waterSystems||[]).find(s=>String(s.system_id)===String(id)),
      villageForSystem
    );
    window.VWSTechnicianAnalytics?.render(d,analyticsLabel);
  }


  function villageForSystem(s){return {...(s.village||{}),...(state.villageById.get(s.village_id)||{})};}
  function searchableText(s){const v=villageForSystem(s);return [s.system_id,s.system_name,s.responsible_agency,s.service_agency,v.village_name,v.district,v.subdistrict,v.local_authority].map(v=>String(v||'')).join(' ').normalize('NFKC').toLocaleLowerCase('th-TH');}
  function monitoringIssues(s){return window.VWSTechnicianAnalytics?.monitoringIssues(s)||[];}
  function publicVisibility(s){return s.publicVisible===true?'VISIBLE':s.publicVisible===false?'HIDDEN':'UNKNOWN';}
  function applyFilters(resetPage=true){
    const scope=window.VWSTechnicianAnalytics?.snapshot().systems||state.dashboard?.waterSystems||[];
    const monitoring=scope.filter(s=>monitoringIssues(s).length);
    $('allSystemsCount').textContent=scope.length.toLocaleString('th-TH');$('monitoringSystemsCount').textContent=monitoring.length.toLocaleString('th-TH');
    for(const mode of ['all','monitoring'])$(`systemsMode${mode==='all'?'All':'Monitoring'}`).setAttribute('aria-pressed',String(state.tableMode===mode));
    const base=state.tableMode==='monitoring'?monitoring:scope;
    state.tableBaseTotal=base.length;state.tableScopeTotal=scope.length;
    const q=$('searchInput').value.trim().normalize('NFKC').toLocaleLowerCase('th-TH');
    state.filteredSystems=base.filter(s=>!q||searchableText(s).includes(q));
    if(state.tableMode==='monitoring')state.filteredSystems.sort((a,b)=>monitoringIssues(b).length-monitoringIssues(a).length||String(a.system_name||a.system_id).localeCompare(String(b.system_name||b.system_id),'th')||String(a.system_id).localeCompare(String(b.system_id)));
    if(resetPage)state.page=1;
    renderSystemsTable();
  }
  function systemActionTrigger(s){return `<button class="system-action-trigger" type="button" data-action-trigger data-id="${escapeHtml(s.system_id)}" aria-label="จัดการระบบ ${escapeHtml(s.system_name||s.system_id)}" aria-haspopup="true" aria-expanded="false" aria-controls="systemActionMenu"><i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i><span class="icon-fallback" aria-hidden="true">⋮</span></button>`;}
  function systemMapButton(s){const canMap=Boolean(window.VWSTechnicianMap?.coordinates(s)),name=escapeHtml(s.system_name||s.system_id),description=canMap?`แสดงระบบ ${name} บนแผนที่`:`ระบบ ${name} ไม่มีพิกัดสำหรับแสดงบนแผนที่`;return `<button class="system-map-button" type="button" data-action="map" data-id="${escapeHtml(s.system_id)}" aria-label="${description}" title="${description}" ${canMap?'':'disabled'}><i class="fa-solid fa-map-location-dot" aria-hidden="true"></i></button>`;}
  function issueBadges(s){const issues=monitoringIssues(s);return issues.length?issues.map(code=>`<span class="badge ${code==='NOT_WORKING'?'bad':'warn'}">${escapeHtml(code==='FAIL'?'น้ำดื่มไม่ผ่านเกณฑ์':code==='INSUFFICIENT'?'น้ำไม่เพียงพอ':'ใช้การไม่ได้')}</span>`).join(''):'<span class="muted">–</span>';}
  function visibilityBadge(s){const value=publicVisibility(s);return `<span class="badge ${value==='VISIBLE'?'good':value==='HIDDEN'?'warn':'info'}">${value==='VISIBLE'?'แสดง':value==='HIDDEN'?'ไม่แสดง':'ไม่ทราบ'}</span>`;}
  function systemRowHtml(s,mobile=false){const v=villageForSystem(s),name=escapeHtml(s.system_name||'(ไม่มีชื่อระบบ)'),id=escapeHtml(s.system_id),village=escapeHtml(v.village_name||'-'),area=escapeHtml([v.subdistrict,v.district].filter(Boolean).join(' · ')),type=escapeHtml(label(s.system_type)),status=`<span class="badge ${s.operational_status==='WORKING'?'good':s.operational_status==='NOT_WORKING'?'bad':'warn'}">${escapeHtml(label(s.operational_status))}</span>`,issues=issueBadges(s),visibility=visibilityBadge(s),households=escapeHtml(fmt(s.households_served)),action=`<div class="system-row-actions">${systemMapButton(s)}${systemActionTrigger(s)}</div>`;
    if(mobile)return `<article class="system-mobile-card" data-system-id="${id}"><div class="system-mobile-head"><div class="min-w-0"><div class="system-name">${name}</div><div class="system-id">${id}</div></div>${action}</div><p class="system-mobile-village">${village}${area?` · ${area}`:''}</p><div class="system-mobile-badges">${status}${issues}${visibility}</div><div class="system-mobile-detail">${type} · ${households==='-'?'ไม่ระบุจำนวนครัวเรือน':`${households} ครัวเรือน`}</div></article>`;
    return `<tr data-system-id="${id}"><td><div class="system-name">${name}</div><div class="system-id">${id}</div></td><td>${village}<div class="system-id">${area}</div></td><td>${type}</td><td>${status}</td><td><div class="system-issue-badges">${issues}</div></td><td>${visibility}</td><td>${households}</td><td>${action}</td></tr>`;
  }
  function renderSystemsTable(){
    closeSystemActionMenu(false);
    const baseTotal=state.tableBaseTotal,scopeTotal=state.tableScopeTotal;
    const list=state.filteredSystems,pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));state.page=Math.min(state.page,pages);const start=(state.page-1)*PAGE_SIZE,page=list.slice(start,start+PAGE_SIZE),body=$('systemsTableBody'),mobile=$('systemsMobileList');
    $('resultCount').textContent=`แสดง ${list.length.toLocaleString('th-TH')} จาก ${baseTotal.toLocaleString('th-TH')} ระบบ`;
    const globalActive=Object.values(window.VWSTechnicianAnalytics?.filters||{}).some(Boolean);
    $('systemsScopeNote').textContent=globalActive?`ภายใต้ตัวกรองแดชบอร์ด · ขอบเขต ${scopeTotal.toLocaleString('th-TH')} ระบบ`:'ข้อมูลระบบที่บัญชีนี้เข้าถึงได้';
    $('pageStatus').textContent=`หน้า ${state.page}/${pages}`;
    $('prevPage').disabled=state.page<=1;$('nextPage').disabled=state.page>=pages;
    if(!page.length){body.innerHTML='<tr><td class="empty-row" colspan="8">ไม่พบข้อมูลตามตัวกรอง</td></tr>';mobile.innerHTML='<div class="empty-state">ไม่พบข้อมูลตามตัวกรอง</div>';return;}
    body.innerHTML=page.map(s=>systemRowHtml(s)).join('');mobile.innerHTML=page.map(s=>systemRowHtml(s,true)).join('');
  }
  let openSystemMenuTrigger=null;
  function closeSystemActionMenu(restoreFocus=false){const trigger=openSystemMenuTrigger;openSystemMenuTrigger=null;$('systemActionMenu').classList.add('hidden');$('systemActionMenu').innerHTML='';if(trigger){trigger.setAttribute('aria-expanded','false');if(restoreFocus&&trigger.isConnected)trigger.focus();}}
  function positionSystemActionMenu(){if(!openSystemMenuTrigger)return;const button=openSystemMenuTrigger.getBoundingClientRect(),menu=$('systemActionMenu');if(!openSystemMenuTrigger.isConnected||button.bottom<0||button.top>innerHeight){closeSystemActionMenu(false);return;}const popup=menu.getBoundingClientRect();menu.style.left=`${Math.max(8,Math.min(button.right-popup.width,innerWidth-popup.width-8))}px`;menu.style.top=`${button.bottom+popup.height+8<=innerHeight?button.bottom+4:Math.max(8,button.top-popup.height-4)}px`;}
  function openSystemActionMenu(trigger){const id=trigger.dataset.id,s=(state.dashboard?.waterSystems||[]).find(item=>String(item.system_id)===id);if(!s)return;if(openSystemMenuTrigger===trigger){closeSystemActionMenu(true);return;}closeSystemActionMenu(false);openSystemMenuTrigger=trigger;trigger.setAttribute('aria-expanded','true');const mutable=s.managementMutable===true,menu=$('systemActionMenu');menu.innerHTML=`<button type="button" data-action="view" data-id="${escapeHtml(id)}">รายละเอียด</button><button type="button" data-action="edit" data-id="${escapeHtml(id)}" ${mutable&&hasPermission('UPDATE_SYSTEM')?'':'disabled'}>แก้ไข</button><button type="button" data-action="history" data-id="${escapeHtml(id)}">ประวัติ</button><button type="button" class="danger" data-action="delete" data-id="${escapeHtml(id)}" ${mutable&&hasPermission('DELETE_SYSTEM')?'':'disabled'}>ลบ</button>`;menu.classList.remove('hidden');positionSystemActionMenu();menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});}
  function handleSystemAction(action,id){if(action==='edit'&&!hasPermission('UPDATE_SYSTEM')||action==='delete'&&!hasPermission('DELETE_SYSTEM'))return;const s=(state.dashboard?.waterSystems||[]).find(item=>String(item.system_id)===id);if(!s)return;if(['edit','delete'].includes(action)&&s.managementMutable!==true)return;closeSystemActionMenu(false);if(action==='view'||action==='edit'||action==='delete')openSystem(id,action);else if(action==='map'){if(!window.VWSTechnicianMap?.coordinates(s))return;navigateToSection('map-section');if(!window.VWSTechnicianMap?.focus(id))toast('ระบบนี้ไม่อยู่ในขอบเขตแผนที่ปัจจุบัน','warning');}else if(action==='history'){navigateToSection('historyPanel');loadHistory(id);}}

  function setSystemDetailStatus(type='',message=''){const status=$('systemDetailStatus');status.textContent=message;status.className=`detail-load-status${type?` ${type}`:''}${message?'':' hidden'}`;}
  function fetchSystem(id){
    const token=state.token,key=`${token}\u0000${id}`;
    if(systemRequests.has(key))return systemRequests.get(key);
    const operation=(async()=>unwrap(await api('data.waterSystem',{token:token,systemId:id})).system)();
    systemRequests.set(key,operation);
    operation.then(()=>{if(systemRequests.get(key)===operation)systemRequests.delete(key);},()=>{if(systemRequests.get(key)===operation)systemRequests.delete(key);});
    return operation;
  }
  async function openSystem(id,mode='view'){
    if((mode==='edit'&&!hasPermission('UPDATE_SYSTEM'))||(mode==='delete'&&!hasPermission('DELETE_SYSTEM')))return;
    state.savedSummary=null;
    const request=++state.selectionRequest,generation=state.datasetGeneration;
    const preview=mode==='view'?(state.dashboard?.waterSystems||[]).find(item=>String(item.system_id)===String(id)):null;
    if(preview){state.selectedSystem=preview;renderSystemDetail();setSystemDetailStatus('loading','กำลังตรวจสอบข้อมูลล่าสุด...');$('editSystemButton').disabled=true;$('deleteSystemButton').disabled=true;if(!$('systemDialog').open)$('systemDialog').showModal();}
    const busy=preview?null:showBusy('กำลังโหลดข้อมูลระบบ...');
    try{const system=await fetchSystem(id);if(request!==state.selectionRequest||generation!==state.datasetGeneration)return;state.selectedSystem=system;renderSystemDetail();setSystemDetailStatus();if(!$('systemDialog').open)$('systemDialog').showModal();if(mode==='edit')openEdit();if(mode==='delete')openDelete();}
    catch(e){if(request!==state.selectionRequest||generation!==state.datasetGeneration)return;if(preview){setSystemDetailStatus('error','โหลดข้อมูลล่าสุดไม่สำเร็จ กรุณาปิดแล้วลองใหม่');$('editSystemButton').disabled=true;$('deleteSystemButton').disabled=true;}handleApiError(e);}finally{if(busy)hideBusy(busy);}
  }
  function detailItem(labelText,value,full=false){return `<div class="detail-item ${full?'full':''}"><span>${escapeHtml(labelText)}</span><strong>${escapeHtml(fmt(value))}</strong></div>`;}
  function detailSection(title,items){return `<section class="detail-section"><h4 class="detail-section-title">${escapeHtml(title)}</h4><div class="detail-grid">${items.join('')}</div></section>`;}
  function renderSystemDetail(){
    const s=state.selectedSystem;if(!s)return;$('systemDialogTitle').textContent=s.system_name||s.system_id;
    const suppression=(s.publicSuppressionReasons||[]).map(label).join(', ')||'-';
    const coord=s.latitude!==''&&s.latitude!=null&&s.longitude!==''&&s.longitude!=null?`${s.latitude}, ${s.longitude}`:'-';
    const statusBadges=`<div class="detail-status-row"><span class="badge ${s.operational_status==='WORKING'?'good':s.operational_status==='NOT_WORKING'?'bad':'warn'}">${escapeHtml(label(s.operational_status))}</span><span class="badge ${s.water_quantity==='SUFFICIENT'?'good':s.water_quantity==='INSUFFICIENT'?'warn':'info'}">${escapeHtml(label(s.water_quantity))}</span><span class="badge ${s.drinking_water_quality==='PASS'?'good':s.drinking_water_quality==='FAIL'?'bad':'info'}">${escapeHtml(label(s.drinking_water_quality))}</span><span class="badge ${s.publicVisible?'good':'warn'}">หน้าสาธารณะ: ${s.publicVisible?'แสดง':'ไม่แสดง'}</span></div>`;
    $('systemDialogBody').innerHTML=statusBadges+
      detailSection('ข้อมูลพื้นที่',[detailItem('รหัสระบบ',s.system_id),detailItem('หมู่บ้าน',s.village?.village_name),detailItem('ตำบล',s.village?.subdistrict),detailItem('อำเภอ',s.village?.district),detailItem('อปท.',s.village?.local_authority,true),detailItem('พิกัด',coord,true)])+
      detailSection('ข้อมูลระบบประปา',[detailItem('ประเภทระบบ',label(s.system_type)),detailItem('แหล่งน้ำ',label(s.water_source_type)),detailItem('กำลังผลิต',s.capacity_m3_hr===''?'-':`${s.capacity_m3_hr} ลบ.ม./ชม.`),detailItem('ครัวเรือน',s.households_served),detailItem('ปีสร้าง พ.ศ.',s.construction_year_be),detailItem('หน่วยงานรับผิดชอบ',s.responsible_agency,true)])+
      detailSection('สถานะและคุณภาพ',[detailItem('สถานะการใช้งาน',label(s.operational_status)),detailItem('ปริมาณน้ำ',label(s.water_quantity)),detailItem('คุณภาพน้ำใช้',label(s.utility_water_quality)),detailItem('คุณภาพน้ำดื่ม',label(s.drinking_water_quality)),detailItem('แรงดันน้ำ',label(s.water_pressure)),detailItem('การมีน้ำตลอดปี',label(s.year_round_status))])+
      detailSection('ข้อมูลจัดการและการแสดงต่อสาธารณะ',[detailItem('สถานะบนหน้าสาธารณะ',s.publicVisible?'แสดง':'ไม่แสดง'),detailItem('ข้อจำกัดการแก้ไขข้อมูล',s.processingGuard?.mutable?'พร้อมแก้ไข':label(s.processingGuard?.reason||'ถูกล็อก')),detailItem('เหตุผลที่ไม่แสดงบนหน้าสาธารณะ',suppression,true)]);
    $('editSystemButton').disabled=!(s.managementMutable&&hasPermission('UPDATE_SYSTEM')); $('deleteSystemButton').disabled=!(s.managementMutable&&hasPermission('DELETE_SYSTEM'));
  }

  function parseJsonArray(value){ if(Array.isArray(value))return value; if(value===''||value==null)return[]; try{const x=JSON.parse(value);return Array.isArray(x)?x:null;}catch(_){return null;} }
  function renderCheckboxGroup(name,values,selected,labelFn=label){ const set=new Set(selected||[]); const choices=[...new Set([...values,...set])]; return `<div class="checkbox-grid">${choices.map(v=>`<label class="checkbox-option"><input type="checkbox" name="${name}" value="${escapeHtml(v)}" ${set.has(v)?'checked':''}>${escapeHtml(labelFn(v))}</label>`).join('')}</div>`; }
  function fieldHtml(def,s){ const [key,title,type]=def; const raw=s[key]??''; const id=`edit_${key}`;
    if(type==='enum'||type==='enum-blank'){ const opts=(state.bootstrap?.enumCatalog?.[key]||[]); const current=String(raw); const missing=current&&!opts.some(v=>String(v)===current); return `<label class="edit-field">${escapeHtml(title)}<select id="${id}" data-field="${key}" data-kind="${type}"><option value="" ${current?'':'selected'}>-</option>${missing?`<option value="${escapeHtml(current)}" selected>${escapeHtml(label(current))}</option>`:''}${opts.map(v=>`<option value="${escapeHtml(v)}" ${current===String(v)?'selected':''}>${escapeHtml(label(v))}</option>`).join('')}</select></label>`; }
    if(type==='textarea')return `<label class="edit-field full">${escapeHtml(title)}<textarea id="${id}" data-field="${key}" data-kind="text" rows="3">${escapeHtml(raw)}</textarea></label>`;
    if(['usage-array','quality-array','months-array'].includes(type)){const parsed=parseJsonArray(raw);if(parsed===null)return `<fieldset class="full" data-field="${key}"><legend>${escapeHtml(title)}</legend><p class="form-error">ข้อมูลเดิมอ่านไม่ได้ กรุณาตรวจสอบข้อมูลก่อนแก้ไขรายการนี้</p></fieldset>`;const values=type==='usage-array'?['DOMESTIC','AGRICULTURE']:type==='quality-array'?Object.keys(QUALITY_CATEGORY_LABELS):Object.keys(MONTH_LABELS);return `<fieldset class="full" data-field="${key}"><legend>${escapeHtml(title)}</legend>${renderCheckboxGroup(key,values,parsed,type==='quality-array'?v=>QUALITY_CATEGORY_LABELS[v]||v:label)}</fieldset>`;}
    if(type==='villages-array'){ const parsed=parseJsonArray(raw);if(parsed===null)return `<fieldset class="full" data-field="${key}"><legend>${escapeHtml(title)}</legend><p class="form-error">ข้อมูลเดิมอ่านไม่ได้ กรุณาตรวจสอบข้อมูลก่อนแก้ไขรายการนี้</p></fieldset>`;return `<fieldset class="full village-selector" id="${id}" data-field="${key}" data-kind="villages-array"><legend>${escapeHtml(title)}</legend><p class="selection-help">เลือกได้หลายหมู่บ้าน ค้นหาจากรายชื่อที่โหลดไว้แล้ว</p><label class="village-search-label">ค้นหาหมู่บ้าน<input id="sharedVillageSearch" type="search" data-shared-search autocomplete="off" placeholder="ชื่อ หมู่ที่ ตำบล อำเภอ หรือรหัสหมู่บ้าน"></label><p id="sharedVillageCount" class="selection-help" aria-live="polite"></p><div id="sharedVillageChips" class="village-chips" aria-label="หมู่บ้านที่เลือกแล้ว"></div><p id="sharedVillageResultsCount" class="selection-help" aria-live="polite"></p><div id="sharedVillageOptions" class="checkbox-grid village-options"></div><button id="sharedVillageMore" class="btn btn-outline village-more hidden" type="button">แสดงเพิ่มเติม</button></fieldset>`; }
    const htmlType=type==='number'||type==='integer'?'number':type==='url'?'url':'text'; const step=type==='integer'?'1':type==='number'?'any':undefined;
    const bounds=key==='latitude'?'min="-90" max="90"':key==='longitude'?'min="-180" max="180"':'min="0"';
    return `<label class="edit-field">${escapeHtml(title)}<input id="${id}" data-field="${key}" data-kind="${type}" type="${htmlType}" ${step?`step="${step}" ${bounds} inputmode="${type==='integer'?'numeric':'decimal'}"`:''} value="${escapeHtml(raw)}"></label>`;
  }
  function editFieldDefinitionMap(){const map={};EDIT_FIELDS.forEach(def=>{map[def[0]]=def;});return map;}
  function renderEditSections(s){const byKey=editFieldDefinitionMap();return EDIT_GROUPS.map(group=>`<section class="edit-section"><header class="edit-section-header"><h4>${escapeHtml(group.title)}</h4><p>${escapeHtml(group.description)}</p></header><div class="edit-section-grid">${group.keys.map(key=>byKey[key]?fieldHtml(byKey[key],s).replace(/^(<\w+)/,`$1 data-edit-field="${key}"`):'').join('')}</div></section>`).join('');}
  function sharedVillageOptions(){const seen=new Set();return (state.dashboard?.villages||[]).filter(v=>v.village_id&&v.village_id!==state.selectedSystem?.village_id&&!seen.has(v.village_id)&&seen.add(v.village_id));}
  function sharedVillageName(v){return `${v.village_name||'(ไม่ระบุชื่อหมู่บ้าน)'}${v.village_no===''||v.village_no==null?'':` หมู่ ${v.village_no}`}`;}
  function sharedVillageSearchText(value){return String(value??'').normalize('NFKC').toLocaleLowerCase('th-TH').replace(/\s+/g,' ').trim();}
  function renderSharedVillageSelector(){if(!$('sharedVillageOptions'))return;const options=sharedVillageOptions(),byId=new Map(options.map(v=>[v.village_id,v])),selected=[...state.sharedVillageIds].sort((a,b)=>a.localeCompare(b,'th')),query=sharedVillageSearchText($('sharedVillageSearch').value),terms=query.split(' ').filter(Boolean);
    $('sharedVillageCount').textContent=`เลือกแล้ว ${selected.length.toLocaleString('th-TH')} หมู่บ้าน`;
    $('sharedVillageChips').innerHTML=selected.length?selected.map(id=>{const v=byId.get(id),name=v?sharedVillageName(v):`รหัสเดิม ${id} (ไม่อยู่ในรายชื่อปัจจุบัน)`;return `<button type="button" class="village-chip" data-remove-village="${escapeHtml(id)}" aria-label="นำ ${escapeHtml(name)} ออกจากที่เลือก"><span aria-hidden="true">✓</span> ${escapeHtml(name)} <span aria-hidden="true">×</span></button>`;}).join(''):'<span class="selection-help">ยังไม่ได้เลือกหมู่บ้าน</span>';
    const matches=options.filter(v=>{const text=sharedVillageSearchText([v.village_name,v.village_no,v.subdistrict,v.district,v.province,v.village_id,`หมู่ ${v.village_no??''}`].join(' '));return terms.every(term=>text.includes(term));});
    $('sharedVillageResultsCount').textContent=query?`ผลการค้นหา ${matches.length.toLocaleString('th-TH')} รายการ`:`รายชื่อหมู่บ้าน ${matches.length.toLocaleString('th-TH')} รายการ`;
    $('sharedVillageOptions').innerHTML=matches.length?matches.slice(0,state.sharedVillageLimit).map(v=>`<label class="checkbox-option village-option"><input type="checkbox" name="shared_villages_json" value="${escapeHtml(v.village_id)}" ${state.sharedVillageIds.has(v.village_id)?'checked':''}><span><strong>${escapeHtml(sharedVillageName(v))}</strong><small>${escapeHtml([v.subdistrict,v.district,v.province,v.village_id].filter(Boolean).join(' · '))}</small></span></label>`).join(''):`<p class="selection-help village-empty">${options.length?'ไม่พบหมู่บ้านที่ตรงกับคำค้น':'ไม่มีรายชื่อหมู่บ้านให้เลือก'}</p>`;
    $('sharedVillageMore').classList.toggle('hidden',matches.length<=state.sharedVillageLimit);
  }
  function openEdit(){const s=state.selectedSystem;if(!s||!s.managementMutable||!hasPermission('UPDATE_SYSTEM'))return;state.editTouched.clear();state.sharedVillageIds=new Set(canonicalShared(s.shared_villages_json)||[]);state.sharedVillageLimit=20;$('editDialogTitle').textContent=s.system_name||s.system_id;$('editFields').innerHTML=renderEditSections(s);renderSharedVillageSelector();updateEditConditions();$('editReason').value='';setError('editError'); if(!$('editDialog').open)$('editDialog').showModal();syncSaveButton();}
  function canonicalArrayString(arr){return arr.length?JSON.stringify(arr):'';}
  function canonicalShared(value){const parsed=parseJsonArray(value);if(parsed===null)return null;return [...new Set(parsed.map(v=>typeof v==='string'?v:(v?.village_id||v?.villageId||'')).filter(Boolean))].sort();}
  function collectPatch(){const s=state.selectedSystem,patch={};
    EDIT_FIELDS.forEach(([key,,type])=>{if(!state.editTouched.has(key)||!editFieldActive(key))return;let value;
      if(['usage-array','quality-array','months-array'].includes(type)){const selected=[...document.querySelectorAll(`input[name="${key}"]:checked`)].map(x=>x.value);const before=parseJsonArray(s[key]);if(before!==null&&JSON.stringify([...new Set(selected)].sort())!==JSON.stringify([...new Set(before.map(String))].sort()))patch[key]=canonicalArrayString(selected);return;}
      if(type==='villages-array'){const ids=[...state.sharedVillageIds].sort();const before=canonicalShared(s[key]);if(before!==null&&JSON.stringify(ids)!==JSON.stringify(before))patch[key]=ids.map(village_id=>({village_id}));return;}
      const el=$(`edit_${key}`); if(!el)return; value=el.value;if(['text','textarea','url'].includes(type))value=value.trim();
      if(type==='number'||type==='integer') value=value.trim()===''?'':Number(value);
      const before=s[key]??''; if((type==='number'||type==='integer')&&value!==''&&before!==''&&Number(value)===Number(before))return;if(String(value)!==String(before))patch[key]=value;
    });
    // Only an explicitly changed parent can clear stored dependent values.
    // Hidden controls retain their draft values; opening/cancelling never writes.
    for(const rule of EDIT_CONDITIONS){
      if(!Object.hasOwn(patch,rule.controller)||rule.values.includes(patch[rule.controller]))continue;
      for(const key of rule.fields){
        if(key.endsWith('_json')){const before=parseJsonArray(s[key]);if(before===null||before.length)patch[key]=[];}
        else if(String(s[key]??'').trim()!=='')patch[key]='';
      }
    }
    return patch; }

  function validateConditionalPatch(patch){
    const touches=keys=>keys.some(key=>Object.hasOwn(patch,key));
    const value=key=>$(`edit_${key}`)?.value.trim()||'';
    const checked=key=>$('editFields').querySelectorAll(`input[name="${key}"]:checked`).length;
    if(touches(['drinking_water_quality','quality_failure_categories_json','quality_failure_detail'])&&value('drinking_water_quality')==='FAIL'&&!checked('quality_failure_categories_json'))return ['quality_failure_categories_json','กรุณาเลือกหมวดสาเหตุคุณภาพน้ำไม่ผ่านอย่างน้อย 1 รายการ'];
    if(touches(['year_round_status','available_months_json'])&&value('year_round_status')==='SEASONAL'&&!checked('available_months_json'))return ['available_months_json','กรุณาเลือกเดือนที่มีน้ำใช้อย่างน้อย 1 เดือน'];
    if(touches(['shared_with_other_village','shared_village_name','shared_villages_json'])&&value('shared_with_other_village')==='YES'&&((Object.hasOwn(patch,'shared_villages_json')&&!state.sharedVillageIds.size)||(!state.sharedVillageIds.size&&!value('shared_village_name'))))return ['shared_villages_json','กรุณาเลือกหมู่บ้านที่ใช้น้ำร่วมอย่างน้อย 1 หมู่บ้าน'];
    if(touches(['establishment_type','establishment_agency','transfer_year_be','transfer_agency','transfer_other','transfer_document_status','transfer_document_url'])){
      if(value('establishment_type')==='ACCEPTED_ASSET'&&!value('establishment_agency'))return ['establishment_agency','กรุณาระบุหน่วยงานที่เกี่ยวข้องกับการรับมอบทรัพย์สิน'];
      if(value('establishment_type')==='TRANSFERRED'&&!value('transfer_agency'))return ['transfer_agency','กรุณาระบุหน่วยงานถ่ายโอน'];
    }
    return null;
  }

  function syncSaveButton(){ $('saveEditButton').disabled=state.mutating||!state.selectedSystem||Object.keys(collectPatch()).length===0; }
  function changeHtml(values,businessOnly=false){return window.VWSSystemChanges.render(values,{businessOnly,fields:EDIT_FIELDS.map(f=>f[0]),label:key=>({updated_at:'เวลาแก้ไข',created_at:'เวลาสร้าง',record_version:'เวอร์ชันข้อมูล',last_mutation_id:'หมายเลขคำขอ',construction_year_ce:'ปีสร้าง ค.ศ.'}[key]||label(key)),villageName:id=>state.villageById.get(id)?.village_name||id});}
  function beginMutation(dialog){if(state.mutating)return false;state.mutating=true;dialog.querySelectorAll('button[type="submit"]').forEach(button=>button.disabled=true);return true;}
  function endMutation(dialog){state.mutating=false;dialog.querySelectorAll('button[type="submit"]').forEach(button=>button.disabled=false);if(dialog.id==='editDialog')syncSaveButton();}
  function editIsDirty(){return Object.keys(collectPatch()).length>0||$('editReason').value.trim()!=='';}
  function dismissDialog(dialog){if(state.mutating)return;if(dialog.id==='passwordDialog'&&dialog.dataset.forced==='true')return;if(dialog.id==='editDialog'&&editIsDirty()){$('discardDialog').showModal();return;}if(dialog.id==='systemDialog')state.selectionRequest++;dialog.close();}
  function bindDialogDismissal(){document.querySelectorAll('dialog:not(#busyOverlay)').forEach(dialog=>{
    dialog.querySelectorAll('[data-dismiss-dialog]').forEach(button=>button.addEventListener('click',()=>dismissDialog(dialog)));
    dialog.addEventListener('cancel',event=>{event.preventDefault();if(dialog.id==='discardDialog'){dialog.close();return;}dismissDialog(dialog);});
    dialog.addEventListener('click',event=>{if(event.target===dialog)dismissDialog(dialog);});
  });
    $('systemDialog').addEventListener('close',()=>{state.selectionRequest++;setSystemDetailStatus();});
    $('busyOverlay').addEventListener('cancel',event=>event.preventDefault());
    $('continueEditingButton').addEventListener('click',()=>$('discardDialog').close());
    $('confirmDiscardButton').addEventListener('click',()=>{$('discardDialog').close();$('editDialog').close();});
    $('finalDeleteDialog').addEventListener('close',()=>{pendingDelete=null;});
  }
  async function saveEdit(){const s=state.selectedSystem,patch=collectPatch();if(!s||!s.managementMutable||!hasPermission('UPDATE_SYSTEM'))return;
    const conditionalError=validateConditionalPatch(patch);
    if(conditionalError){const [key,message]=conditionalError;setError('editError',message);const wrapper=$('editFields').querySelector(`[data-edit-field="${key}"]`),target=$(`edit_${key}`)||wrapper?.querySelector('input,select,textarea');if(target)target.focus();else if(wrapper){wrapper.tabIndex=-1;wrapper.focus();}return;}
    // Validate only edited fields; untouched legacy blanks remain unchanged.
    for(const [key,title,type] of EDIT_FIELDS){if(Object.hasOwn(patch,key)&&type==='enum'&&key!=='transfer_document_status'&&String(patch[key]??'').trim()===''){setError('editError',`กรุณาเลือก${title}`);$(`edit_${key}`)?.focus();return;}}
    for(const [key,,type] of EDIT_FIELDS){if(!Object.hasOwn(patch,key)||!['number','integer'].includes(type))continue;const value=patch[key];const coordinate=key==='latitude'||key==='longitude';const min=key==='latitude'?-90:key==='longitude'?-180:0,max=key==='latitude'?90:key==='longitude'?180:Infinity;if(value!==''&&(!Number.isFinite(value)||value<min||value>max||(type==='integer'&&!Number.isInteger(value)))){setError('editError',coordinate?'พิกัดอยู่นอกช่วงที่รองรับ':'กรุณาระบุตัวเลขที่ถูกต้องและไม่ติดลบ');$(`edit_${key}`)?.focus();return;}}
    if(Object.hasOwn(patch,'latitude')||Object.hasOwn(patch,'longitude')){const latitude=Object.hasOwn(patch,'latitude')?patch.latitude:s.latitude,longitude=Object.hasOwn(patch,'longitude')?patch.longitude:s.longitude;if((latitude===''||latitude==null)!==(longitude===''||longitude==null)){setError('editError','กรุณาระบุพิกัดทั้งสองค่า หรือเว้นว่างทั้งสองค่า');return;}}
    if(!Object.keys(patch).length){setError('editError','ไม่มีข้อมูลที่เปลี่ยนแปลง');return;}if(!beginMutation($('editDialog')))return;state.savedSummary=null;const busy=showBusy('กำลังบันทึกการแก้ไข...');
    try{const data=unwrap(await api('data.updateWaterSystem',authPayload({request:{systemId:s.system_id,expectedVersion:s.recordVersion,patch,reason:$('editReason').value.trim(),clientInfo:clientInfo()}})));state.selectedSystem=data.system;state.savedSummary={systemId:s.system_id,values:data.changeSummary||null};$('editDialog').close();renderSystemDetail();$('systemDialogBody').scrollTop=0;await reloadDashboard(false);}
    catch(e){if(e.code==='CONFLICT')setError('editError','ข้อมูลถูกแก้โดยรายการอื่น กรุณาปิดหน้าต่างแล้วเปิดข้อมูลล่าสุด');else setError('editError',e.message);}finally{hideBusy(busy);endMutation($('editDialog'));}
    const summary=state.savedSummary,token=state.token;
    if(summary?.systemId===s.system_id&&!$('editDialog').open){
      await window.VWSTechnicianUI.whenIdle();
      if(!token||token!==state.token||summary!==state.savedSummary||!$('systemDialog').open)return;
      $('saveSummaryBody').innerHTML=changeHtml(summary.values,true);
      if(!$('saveSummaryDialog').open)$('saveSummaryDialog').showModal();
    }
  }

  let pendingDelete=null;
  function openDelete(){const s=state.selectedSystem;if(!s||!s.managementMutable||!hasPermission('DELETE_SYSTEM'))return;pendingDelete=null;$('deleteConfirmId').textContent=s.system_id;$('deleteConfirmInput').value='';$('deleteReason').value='';setError('deleteError');if(!$('deleteDialog').open)$('deleteDialog').showModal();}
  function confirmDelete(){const s=state.selectedSystem;if(!s||!s.managementMutable||!hasPermission('DELETE_SYSTEM'))return;if($('deleteConfirmInput').value.trim()!==s.system_id){setError('deleteError','รหัสยืนยันไม่ตรงกับระบบที่จะลบ');return;}const reason=$('deleteReason').value.trim();if(!reason){setError('deleteError','กรุณาระบุเหตุผลในการลบ');return;}if(state.mutating||$('finalDeleteDialog').open)return;pendingDelete={systemId:s.system_id,expectedVersion:s.recordVersion,reason,generation:state.datasetGeneration,token:state.token};$('finalDeleteSystem').textContent=`${s.system_name||'ระบบประปา'} (${s.system_id})`;$('finalDeleteDialog').showModal();}
  async function performConfirmedDelete(){const request=pendingDelete,s=state.selectedSystem;if(!request||!$('deleteDialog').open||!s||!s.managementMutable||!hasPermission('DELETE_SYSTEM')||s.system_id!==request.systemId||s.recordVersion!==request.expectedVersion||state.datasetGeneration!==request.generation||state.token!==request.token){$('finalDeleteDialog').close();setError('deleteError','ข้อมูลหรือการเข้าสู่ระบบเปลี่ยนไป กรุณาเปิดรายการล่าสุดก่อนลบ');return;}if(!beginMutation($('deleteDialog')))return;$('finalDeleteDialog').close();const busy=showBusy('กำลังลบระบบประปา...');
    try{unwrap(await api('data.deleteWaterSystem',authPayload({request:{systemId:request.systemId,expectedVersion:request.expectedVersion,reason:request.reason,clientInfo:clientInfo()}})));$('deleteDialog').close();$('systemDialog').close();state.selectedSystem=null;toast('ลบระบบประปาและบันทึกประวัติการดำเนินการแล้ว');await reloadDashboard(false);}
    catch(e){setError('deleteError',e.code==='CONFLICT'?'ข้อมูลเปลี่ยนแล้ว กรุณาโหลดรายการล่าสุดก่อนลบ':e.message);}finally{hideBusy(busy);endMutation($('deleteDialog'));}
  }

  async function loadHistory(systemId){const request=++state.historyRequest,token=state.token,id=String(systemId||'').trim();if(!id){$('historyList').className='history-list empty-state';$('historyList').textContent='กรุณาระบุรหัสระบบ';return;}const busy=showBusy('กำลังโหลดประวัติ...');
    try{const data=unwrap(await api('data.entityHistory',{token:token,request:{entityType:'WATER_SYSTEM',entityId:id,limit:200}}));if(request!==state.historyRequest||token!==state.token)return;renderHistory(data.history||[]);$('historySystemId').value=id;}
    catch(e){if(request===state.historyRequest&&token===state.token)handleApiError(e);}finally{hideBusy(busy);}
  }
  function renderHistory(items){const box=$('historyList');box.className='history-list';if(!items.length){box.className='history-list empty-state';box.textContent='ไม่พบประวัติของระบบนี้';return;}box.innerHTML=items.map(a=>`<article class="history-card"><header><div><h3>${escapeHtml(label(a.action))}</h3><div class="history-meta">${escapeHtml(a.username||a.userId)} · ${escapeHtml(label(a.role))} · ${escapeHtml(fmtDate(a.timestamp))}</div></div><span class="badge ${a.status==='COMMITTED'?'good':a.status==='FAILED'?'bad':'warn'}">${escapeHtml(label(a.status))}</span></header>${changeHtml(a)}${!window.VWSSystemChanges.diff(a,EDIT_FIELDS.map(f=>f[0]))?`<div class="history-change-list">ช่องที่บันทึกไว้: ${escapeHtml((a.changedFields||[]).map(label).join(', ')||'-')}</div>`:''}${a.reason?`<div class="history-change-list">เหตุผล: ${escapeHtml(a.reason)}</div>`:''}</article>`).join('');}

  async function reloadDashboard(withStatus=true){
    const intent=withStatus?++state.refreshStatusIntent:state.refreshStatusIntent,token=state.token;
    if(withStatus)setRefreshStatus('loading','กำลังรีเฟรชข้อมูล โดยยังใช้งานแดชบอร์ดเดิมได้');
    try{const result=await requestDashboard(true);if(!isCurrentDashboardResult(result))return;if(acceptDashboardResult(result))renderDashboard();if(intent===state.refreshStatusIntent&&(withStatus||$('refreshButton').getAttribute('aria-busy')==='true'))setRefreshStatus('success','รีเฟรชข้อมูลแล้ว');}
    catch(e){if(token!==state.token||e.code==='STALE_RESPONSE')return;if(intent===state.refreshStatusIntent)setRefreshStatus('error',`รีเฟรชไม่สำเร็จ: ${e.message||'เกิดข้อผิดพลาด'}`);handleApiError(e);}
  }
  const dashboardSections=['overview','map-section','areas','system-structure','operations','quality','watchlist'];
  const workspaceTargets={historyPanel:'historyPanel',techniciansPanel:'techniciansPanel'};
  const sectionIds=[...dashboardSections,'technicianManagementSection',...Object.keys(workspaceTargets)];
  let dashboardScrollY=0;
  let activeWorkspace='dashboard';
  let lastDashboardId='overview';
  let backToTopRaf=0;
  function scheduleBackToTop(){if(backToTopRaf)return;backToTopRaf=requestAnimationFrame(updateBackToTop);}
  function updateBackToTop(){
    backToTopRaf=0;
    const button=$('btnBackToTop');
    const visible=!$('appView').classList.contains('hidden')&&window.scrollY>Math.max(480,window.innerHeight*.85);
    button.classList.toggle('hidden',!visible);button.classList.toggle('flex',visible);button.setAttribute('aria-hidden',String(!visible));
    button.style.transform='';
    if(!visible)return;
    requestAnimationFrame(()=>{
      if(button.classList.contains('hidden'))return;
      const rect=button.getBoundingClientRect();let shift=0;
      for(const control of document.querySelectorAll('#technicianWaterMap .leaflet-bottom.leaflet-right')){
        const other=control.getBoundingClientRect();
        if(rect.left<other.right&&rect.right>other.left&&rect.top<other.bottom&&rect.bottom>other.top)shift=Math.max(shift,rect.bottom-other.top+12);
      }
      if(shift>0)button.style.transform=`translateY(-${Math.ceil(shift)}px)`;
    });
  }
  function sectionAllowed(id){return sectionIds.includes(id)&&(id!=='techniciansPanel'||hasPermission('MANAGE_TECHNICIANS'));}
  function setActiveSection(id){const navId=id==='watchlist'?'technicianManagementSection':id;document.querySelectorAll('.tabs .section-link').forEach(link=>{const active=link.hash==='#'+navId;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});}
  function closeAccountMenu(restoreFocus=false){$('mobileAccountMenu').classList.add('hidden');$('mobileAccountButton').setAttribute('aria-expanded','false');if(restoreFocus)$('mobileAccountButton').focus();}
  function updateHeaderOffset(){document.documentElement.style.setProperty('--technician-header-height',`${Math.ceil($('appHeader').getBoundingClientRect().height)}px`);}
  function navigateToSection(id,{smooth=true,updateHash=true}={}){
    if(!sectionAllowed(id)||$('appView').classList.contains('hidden'))return false;
    const workspace=workspaceTargets[id]||'dashboard';
    const previousWorkspace=activeWorkspace;
    if(activeWorkspace==='dashboard'&&workspace!=='dashboard')dashboardScrollY=window.scrollY;
    if(workspace==='dashboard'){lastDashboardId=id;if(id==='watchlist'||id==='technicianManagementSection'){state.tableMode=id==='watchlist'?'monitoring':'all';applyFilters();}}
    $('dashboardWorkspace').classList.toggle('hidden',workspace!=='dashboard');
    for(const targetId of Object.values(workspaceTargets))$(targetId).classList.toggle('hidden',targetId!==workspace);
    activeWorkspace=workspace;
    const target=id==='technicianManagementSection'?$('watchlist'):$(id);if(!target)return false;
    updateHeaderOffset();
    if(workspace==='dashboard'&&previousWorkspace!=='dashboard')window.scrollTo({top:dashboardScrollY,behavior:'instant'});
    else target.scrollIntoView({block:'start',behavior:smooth&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'instant'});
    if(updateHash&&location.hash!=='#'+id)history.pushState(null,'','#'+id);
    setActiveSection(id);
    if(id==='techniciansPanel')loadTechnicians();
    if(id==='map-section')requestAnimationFrame(()=>window.VWSTechnicianMap?.invalidate());
    return true;
  }
  function restoreSection(){let id='';try{id=decodeURIComponent(location.hash.slice(1));}catch(_){id='';}if(!sectionAllowed(id)){if(id==='techniciansPanel')history.replaceState(null,'',location.pathname+location.search);id='overview';}navigateToSection(id,{smooth:false,updateHash:false});if(!location.hash)window.scrollTo({top:0,behavior:'instant'});}
  function syncActiveSection(){if($('appView').classList.contains('hidden')||activeWorkspace!=='dashboard')return;const offset=$('appHeader').getBoundingClientRect().height+24;let active=dashboardSections[0],top=-Infinity;for(const id of dashboardSections){const element=$(id);if(!element)continue;const sectionTop=element.getBoundingClientRect().top;if(sectionTop>offset)continue;if(sectionTop>top+1){active=id;top=sectionTop;}else if(Math.abs(sectionTop-top)<=1&&id===lastDashboardId)active=id;}setActiveSection(active==='watchlist'&&state.tableMode==='all'?'technicianManagementSection':active);}

  function loadTechnicians(options={}){
    if(!hasPermission('MANAGE_TECHNICIANS'))return Promise.resolve();
    const force=options.force===true,withBusy=options.withBusy!==false;
    if(!force&&state.techniciansLoadedToken===state.token){renderTechnicians();return Promise.resolve();}
    if(accountsRequest)return accountsRequest;
    const request=++state.technicianRequest,token=state.token;
    const operation=(async()=>{const busy=withBusy?showBusy('กำลังโหลดบัญชีช่างเทคนิค...'):null;try{const technicians=unwrap(await api('technicians.list',{token:token})).technicians||[];if(request!==state.technicianRequest||token!==state.token)return;state.technicians=technicians;state.techniciansLoadedToken=token;renderTechnicians();}catch(e){if(request===state.technicianRequest&&token===state.token)handleApiError(e);}finally{if(busy)hideBusy(busy);}})();
    accountsRequest=operation;
    operation.then(()=>{if(accountsRequest===operation)accountsRequest=null;},()=>{if(accountsRequest===operation)accountsRequest=null;});
    return operation;
  }
  function technicianActions(u){const id=escapeHtml(u.userId);return u.status==='DELETED'?'':`<button class="mini-btn" data-tech-action="edit" data-id="${id}">แก้ไข</button>${u.status==='ACTIVE'?`<button class="mini-btn" data-tech-action="disable" data-id="${id}">ปิด</button>`:''}${u.status==='DISABLED'?`<button class="mini-btn primary" data-tech-action="enable" data-id="${id}">เปิด</button>`:''}<button class="mini-btn" data-tech-action="reset" data-id="${id}">รีเซ็ตรหัสผ่าน</button><button class="mini-btn danger" data-tech-action="delete" data-id="${id}">ลบบัญชี</button>`;}
  function renderTechnicians(){
    const body=$('techniciansTableBody'),mobile=$('techniciansMobileList'),visible=state.technicians.filter(u=>u.status!=='DELETED');
    if(!visible.length){body.innerHTML='<tr><td colspan="6" class="empty-row">ยังไม่มีบัญชีช่างเทคนิค</td></tr>';mobile.innerHTML='<p class="empty-state">ยังไม่มีบัญชีช่างเทคนิค</p>';return;}
    body.innerHTML=visible.map(u=>`<tr><td><strong>${escapeHtml(u.username)}</strong><div class="system-id">${escapeHtml(u.userId)}</div></td><td>${escapeHtml(u.displayName)}</td><td>${escapeHtml(u.district||'ยังไม่กำหนด')}</td><td><span class="badge ${u.status==='ACTIVE'?'good':u.status==='DISABLED'?'warn':'bad'}">${escapeHtml(label(u.status))}</span></td><td>${escapeHtml(fmtDate(u.lastLoginAt))}</td><td><div class="row-actions">${technicianActions(u)}</div></td></tr>`).join('');
    mobile.innerHTML=visible.map(u=>`<article class="technician-mobile-card"><div class="technician-mobile-head"><div><strong>${escapeHtml(u.displayName)}</strong><span>${escapeHtml(u.username)} · ${escapeHtml(u.userId)}</span></div><span class="badge ${u.status==='ACTIVE'?'good':u.status==='DISABLED'?'warn':'bad'}">${escapeHtml(label(u.status))}</span></div><p>อำเภอ: ${escapeHtml(u.district||'ยังไม่กำหนด')}</p><p>เข้าสู่ระบบล่าสุด: ${escapeHtml(fmtDate(u.lastLoginAt))}</p><div class="technician-mobile-actions">${technicianActions(u)}</div></article>`).join('');
  }
  function technicianDistricts(){return [...new Set((state.dashboard?.villages||[]).map(v=>String(v.district||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th'));}
  function updateTechPasswordFeedback(submitted=false){
    const input=$('techPassword'),length=input.value.length;
    const validity=length>=8&&length<=128?'valid':length||submitted?'invalid':'';
    if(validity)input.dataset.validity=validity;else delete input.dataset.validity;
    if(validity==='invalid')input.setAttribute('aria-invalid','true');else input.removeAttribute('aria-invalid');
    $('techPasswordHelp').classList.toggle('password-help-invalid',validity==='invalid'&&length<=128);
    setError('techPasswordError',length>128?'รหัสผ่านต้องมีความยาวไม่เกิน 128 ตัวอักษร':'');
    return validity==='valid';
  }
  function openTechnicianForm(mode,user=null){
    state.technicianDialogMode=mode;state.selectedTechnician=user;
    $('technicianDialogTitle').textContent=mode==='create'?'สร้างบัญชีช่างเทคนิค':'แก้ไขบัญชีช่างเทคนิค';
    $('techDistrictOptions').innerHTML=technicianDistricts().map(d=>`<option value="${escapeHtml(d)}"></option>`).join('');
    $('techUsername').value=user?.username||'';$('techDisplayName').value=user?.displayName||'';$('techDistrict').value=user?.district||'';$('techPassword').value='';
    $('techPasswordLabel').classList.toggle('hidden',mode!=='create');$('techPassword').required=mode==='create';setError('technicianError');updateTechPasswordFeedback();$('technicianDialog').showModal();
  }
  async function saveTechnician(){
    for(const id of ['techUsername','techDisplayName','techDistrict']){
      if($(id).value.trim())continue;
      setError('technicianError','กรุณากรอกข้อมูลบัญชีให้ครบ');$(id).focus();return;
    }
    if(state.technicianDialogMode==='create'&&!updateTechPasswordFeedback(true)){$('techPassword').focus();return;}
    const district=$('techDistrict').value.trim();
    if(!technicianDistricts().includes(district)){setError('technicianError','กรุณาเลือกอำเภอจากรายชื่อ');$('techDistrict').focus();return;}
    if(!beginMutation($('technicianDialog')))return;
    const mode=state.technicianDialogMode,busy=showBusy(mode==='create'?'กำลังสร้างบัญชี...':'กำลังบันทึกบัญชี...');
    try{
      if(mode==='create'){
        unwrap(await api('technicians.create',authPayload({request:{username:$('techUsername').value,displayName:$('techDisplayName').value,district,password:$('techPassword').value,clientInfo:clientInfo()}})));
        toast('สร้างบัญชีช่างเทคนิคแล้ว');
      }else{
        const u=state.selectedTechnician;
        unwrap(await api('technicians.update',authPayload({request:{userId:u.userId,expectedVersion:u.recordVersion,username:$('techUsername').value,displayName:$('techDisplayName').value,district,clientInfo:clientInfo()}})));
        toast('แก้ไขบัญชีช่างเทคนิคแล้ว');
      }
      $('technicianDialog').close();$('techPassword').value='';invalidateTechnicians();await loadTechnicians({force:true,withBusy:false});
    }catch(e){setError('technicianError',e.message);}finally{hideBusy(busy);endMutation($('technicianDialog'));}
  }
  function findTech(id){return state.technicians.find(u=>u.userId===id);}
  function openAccountAction(action,user){state.accountAction=action;state.selectedTechnician=user;$('actionReason').value='';$('actionPassword').value='';setError('actionError');const reason=action==='delete',password=action==='reset';$('actionReasonLabel').classList.toggle('hidden',!reason);$('actionPasswordLabel').classList.toggle('hidden',!password);const titles={disable:'ปิดการใช้งานบัญชี',enable:'เปิดการใช้งานบัญชี',delete:'ลบบัญชีช่างเทคนิค',reset:'รีเซ็ตรหัสผ่าน'};$('actionTitle').textContent=titles[action];$('actionDescription').textContent=`${user.displayName} (${user.username})`;$('actionConfirmButton').className=`btn ${action==='delete'?'danger':'primary'}`;$('actionDialog').showModal();}
  async function runAccountAction(){const u=state.selectedTechnician,a=state.accountAction;const map={disable:'technicians.disable',enable:'technicians.enable',delete:'technicians.delete',reset:'technicians.resetPassword'};const req={userId:u.userId,expectedVersion:u.recordVersion,clientInfo:clientInfo()};if(a==='delete'){req.reason=$('actionReason').value.trim();if(!req.reason){setError('actionError','กรุณาระบุเหตุผล');return;}}if(a==='reset'){req.newPassword=$('actionPassword').value;if(!req.newPassword){setError('actionError','กรุณาระบุรหัสผ่านใหม่');return;}}if(!beginMutation($('actionDialog')))return;const busy=showBusy('กำลังดำเนินการบัญชี...');try{unwrap(await api(map[a],authPayload({request:req})));$('actionDialog').close();$('actionPassword').value='';toast('ดำเนินการบัญชีสำเร็จ');invalidateTechnicians();await loadTechnicians({force:true,withBusy:false});}catch(e){setError('actionError',e.message);}finally{hideBusy(busy);endMutation($('actionDialog'));}}

  function openPasswordDialog(forced=false){
    ['currentPassword','newPassword','confirmNewPassword'].forEach(id=>$(id).value='');setError('passwordError');
    $('passwordDialogDescription').textContent=forced?'บัญชีนี้ต้องเปลี่ยนรหัสผ่านก่อนใช้งานแดชบอร์ดช่างเทคนิค':'เปลี่ยนรหัสผ่านของบัญชีที่กำลังเข้าสู่ระบบ';
    $('passwordCloseButton').classList.toggle('hidden',forced);$('passwordCancelButton').classList.toggle('hidden',forced);
    $('passwordDialog').dataset.forced=forced?'true':'false';if(!$('passwordDialog').open)$('passwordDialog').showModal();
  }
  async function changePassword(){const cur=$('currentPassword').value,next=$('newPassword').value,confirm=$('confirmNewPassword').value;if(next!==confirm){setError('passwordError','รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');return;}if(!beginMutation($('passwordDialog')))return;const busy=showBusy('กำลังเปลี่ยนรหัสผ่าน...');try{unwrap(await api('auth.changePassword',authPayload({request:{currentPassword:cur,newPassword:next,clientInfo:clientInfo()}})));const me=unwrap(await api('auth.me',{token:state.token}));setCurrentUser(me.user);['currentPassword','newPassword','confirmNewPassword'].forEach(id=>$(id).value='');$('passwordDialog').close();toast('เปลี่ยนรหัสผ่านแล้ว');await bootstrapAndLoad();}catch(e){setError('passwordError',e.message);}finally{hideBusy(busy);endMutation($('passwordDialog'));}}
  async function performLogout(){const token=state.token;clearSession();closeAccountMenu();showLogin();try{await api('auth.logout',{token});}catch(_){}}
  function handleApiError(e){if(['SESSION_INVALID','SESSION_REVOKED','SESSION_EXPIRED','SESSION_IDLE_EXPIRED','AUTH_ACCOUNT_DISABLED','AUTH_ACCOUNT_DELETED'].includes(e.code)){clearSession();document.querySelectorAll('dialog[open]:not(#busyOverlay)').forEach(d=>d.close());showLogin();toast('ช่วงการใช้งานสิ้นสุด กรุณาเข้าสู่ระบบใหม่','error');return;}toast(e.message||'เกิดข้อผิดพลาด','error');}

  function bind(){
    bindDialogDismissal();
    window.VWSTechnicianAnalytics?.bind({
      onChange:(systems,filtered)=>{window.VWSTechnicianMap?.render(systems,filtered);applyFilters();}
    });
    for(const id of ['editForm','deleteForm','technicianForm','actionForm','passwordForm'])$(id).addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('input, select')&&event.target.type!=='checkbox')event.preventDefault();});
    $('retryResumeButton').addEventListener('click',resume);
    $('editFields').addEventListener('input',event=>{if(event.target.matches('[data-shared-search]')){state.sharedVillageLimit=20;renderSharedVillageSelector();return;}const key=event.target.dataset.field||event.target.name;if(key&&key!=='shared_villages_json')state.editTouched.add(key);if(EDIT_CONDITIONS.some(rule=>rule.controller===key))updateEditConditions();syncSaveButton();});
    $('editFields').addEventListener('change',event=>{if(event.target.matches('input[name="shared_villages_json"]')){const id=event.target.value;if(event.target.checked)state.sharedVillageIds.add(id);else state.sharedVillageIds.delete(id);state.editTouched.add('shared_villages_json');renderSharedVillageSelector();[...$('sharedVillageOptions').querySelectorAll('input[name="shared_villages_json"]')].find(input=>input.value===id)?.focus();syncSaveButton();return;}const key=event.target.dataset.field||event.target.name;if(key)state.editTouched.add(key);if(EDIT_CONDITIONS.some(rule=>rule.controller===key))updateEditConditions();syncSaveButton();});
    $('editFields').addEventListener('click',event=>{const remove=event.target.closest('[data-remove-village]');if(remove){state.sharedVillageIds.delete(remove.dataset.removeVillage);state.editTouched.add('shared_villages_json');renderSharedVillageSelector();$('sharedVillageSearch')?.focus();syncSaveButton();return;}if(event.target.closest('#sharedVillageMore')){state.sharedVillageLimit+=20;renderSharedVillageSelector();}});
    for(const id of ['loginUsername','loginPassword'])$(id).addEventListener('input',()=>{if($(id).getAttribute('aria-invalid')==='true')validateLoginField(id,true);});
    $('loginForm').addEventListener('submit',async e=>{e.preventDefault();setError('loginError');const usernameValid=validateLoginField('loginUsername',true),passwordValid=validateLoginField('loginPassword',true);if(!usernameValid||!passwordValid){$(!usernameValid?'loginUsername':'loginPassword').focus();return;}const u=$('loginUsername').value,p=$('loginPassword').value;const busy=showBusy('กำลังเข้าสู่ระบบ...');try{await login(u,p);$('loginPassword').value='';await bootstrapAndLoad();}catch(err){clearSession();setError('loginError',err.message);showLogin();}finally{hideBusy(busy);}});
    $('logoutButton').addEventListener('click',performLogout);$('mobileLogoutButton').addEventListener('click',performLogout);
    $('refreshButton').addEventListener('click',()=>reloadDashboard(true));
    $('refreshTechniciansButton').addEventListener('click',()=>loadTechnicians({force:true}));
    $('changePasswordButton').addEventListener('click',()=>{closeAccountMenu();openPasswordDialog(false);});$('mobileChangePasswordButton').addEventListener('click',()=>{closeAccountMenu();openPasswordDialog(false);});
    $('mobileAccountButton').addEventListener('click',()=>{const menu=$('mobileAccountMenu'),open=menu.classList.contains('hidden');menu.classList.toggle('hidden',!open);$('mobileAccountButton').setAttribute('aria-expanded',open?'true':'false');});
    document.addEventListener('click',e=>{if(!e.target.closest('.mobile-account'))closeAccountMenu();});
    document.querySelectorAll('a.section-link').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();navigateToSection(link.hash.slice(1));}));
    document.querySelectorAll('[data-return-dashboard]').forEach(button=>button.addEventListener('click',()=>navigateToSection(lastDashboardId)));
    $('techniciansAccountButton').addEventListener('click',()=>{closeAccountMenu();navigateToSection('techniciansPanel');});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('mobileAccountMenu').classList.contains('hidden')){event.preventDefault();closeAccountMenu(true);}});
    $('btnBackToTop').addEventListener('click',()=>{$('appHeader').focus({preventScroll:true});window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});});
    window.addEventListener('scroll',()=>{positionSystemActionMenu();requestAnimationFrame(syncActiveSection);scheduleBackToTop();},{passive:true});
    window.addEventListener('resize',()=>{closeSystemActionMenu(false);updateHeaderOffset();requestAnimationFrame(syncActiveSection);scheduleBackToTop();},{passive:true});
    window.addEventListener('hashchange',restoreSection);window.addEventListener('popstate',restoreSection);
    if('ResizeObserver'in window)new ResizeObserver(updateHeaderOffset).observe($('appHeader'));
    $('searchInput').addEventListener('input',()=>applyFilters());
    document.querySelectorAll('[data-system-mode]').forEach(button=>button.addEventListener('click',()=>navigateToSection(button.dataset.systemMode==='all'?'technicianManagementSection':'watchlist')));
    $('prevPage').addEventListener('click',()=>{if(state.page>1){state.page--;renderSystemsTable();}});$('nextPage').addEventListener('click',()=>{if(state.page<Math.ceil(state.filteredSystems.length/PAGE_SIZE)){state.page++;renderSystemsTable();}});
    $('watchlist').addEventListener('click',e=>{const mapButton=e.target.closest('.system-map-button');if(mapButton&&!mapButton.disabled){handleSystemAction('map',mapButton.dataset.id);return;}const trigger=e.target.closest('[data-action-trigger]');if(trigger)openSystemActionMenu(trigger);});
    $('systemActionMenu').addEventListener('click',e=>{const button=e.target.closest('button[data-action]');if(button&&!button.disabled)handleSystemAction(button.dataset.action,button.dataset.id);});
    document.addEventListener('click',e=>{if(openSystemMenuTrigger&&!e.target.closest('#systemActionMenu')&&!e.target.closest('[data-action-trigger]'))closeSystemActionMenu(false);});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&openSystemMenuTrigger){e.preventDefault();closeSystemActionMenu(true);}});
    $('editSystemButton').addEventListener('click',openEdit);$('deleteSystemButton').addEventListener('click',openDelete);
    $('editForm').addEventListener('submit',e=>{e.preventDefault();saveEdit();});$('deleteForm').addEventListener('submit',e=>{e.preventDefault();confirmDelete();});$('finalDeleteForm').addEventListener('submit',e=>{e.preventDefault();performConfirmedDelete();});
    $('historySearchButton').addEventListener('click',()=>loadHistory($('historySystemId').value));$('historySystemId').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();loadHistory(e.target.value);}});
    $('createTechnicianButton').addEventListener('click',()=>openTechnicianForm('create'));
    $('technicianForm').addEventListener('submit',e=>{e.preventDefault();saveTechnician();});
    $('techPassword').addEventListener('input',()=>updateTechPasswordFeedback());
    for(const list of [$('techniciansTableBody'),$('techniciansMobileList')])list.addEventListener('click',e=>{const b=e.target.closest('button[data-tech-action]');if(!b)return;const u=findTech(b.dataset.id);if(!u)return;if(b.dataset.techAction==='edit')openTechnicianForm('edit',u);else openAccountAction(b.dataset.techAction,u);});
    $('actionForm').addEventListener('submit',e=>{e.preventDefault();runAccountAction();});$('passwordForm').addEventListener('submit',e=>{e.preventDefault();changePassword();});
  }

  bind(); resume();
})();
