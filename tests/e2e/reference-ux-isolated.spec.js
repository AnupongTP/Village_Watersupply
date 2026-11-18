import {test,expect} from '@playwright/test';
import {openReference,fixture} from '../support/reference-ux-fixture.mjs';
test('reference shell keeps original section and tab order',async({page})=>{
 await openReference(page);
 await expect(page.locator('.main-nav button')).toHaveText(['📊 บทสรุปผู้บริหาร','🔍 รายละเอียดข้อมูล']);
 await page.locator('[data-view="detail"]').click();
 expect(await page.locator('.tab-btn').evaluateAll(ns=>ns.map(n=>n.dataset.tab))).toEqual(['compare','insight','table','vtable','problem']);
 await expect(page.locator('#view-detail')).toBeVisible();
});
test('technician saves one intended field and shows before-after confirmation',async({page})=>{
 let before;
 const evidence=await openReference(page,{technician:true,respond:(env,response)=>{
  if(env.action==='data.waterSystem'){before=response.data.system;return response;}
  if(env.action==='data.updateWaterSystem'){const after={...before,...env.payload.request.patch};return {success:true,data:{system:after,changeSummary:{before,after,changedFields:Object.keys(env.payload.request.patch)}}};}
 }});
 await page.locator('#loginUsername').fill('synthetic-tech');await page.locator('#loginPassword').fill('synthetic-password');await page.locator('#loginSubmit').click();
 await expect(page.locator('#efCount')).toContainText('1 ระบบ');await page.locator('[data-view="detail"]').click();await page.locator('[data-tab="table"]').click();await page.locator('#tblBody tr').first().click();
 await page.locator('#editSystemButton').click();await expect(page.locator('#saveEditButton')).toBeDisabled();
 await page.locator('#edit_system_name').fill('ชื่อที่แก้เพียงช่องเดียว');await expect(page.locator('#saveEditButton')).toBeEnabled();await page.locator('#saveEditButton').click();
 await expect(page.locator('#saveSummaryDialog')).toBeVisible();await expect(page.locator('#saveSummaryBody')).toContainText('ชื่อที่แก้เพียงช่องเดียว');
 const writes=evidence.calls.filter(c=>c.action==='data.updateWaterSystem');expect(writes).toHaveLength(1);expect(writes[0].payload.request.patch).toEqual({system_name:'ชื่อที่แก้เพียงช่องเดียว'});
 expect(evidence.errors).toEqual([]);
});
test('admin can filter districts and logout clears private presentation before another login',async({page})=>{
 const evidence=await openReference(page,{technician:true,user:{username:'admin',displayName:'ทดสอบแอดมิน',role:'ADMIN',district:''}});
 async function login(){await page.locator('#loginUsername').fill('admin');await page.locator('#loginPassword').fill('synthetic-password');await page.locator('#loginSubmit').click();await expect(page.locator('#efCount')).toContainText('2 ระบบ');}
 await login();await expect(page.locator('#fd')).toBeEnabled();await page.locator('#fd').selectOption('เชียงคำ');await expect(page.locator('#efCount')).toContainText('1 ระบบ');
 await page.locator('#mobileAccountButton').click();await page.getByRole('button',{name:'ออกจากระบบ',exact:true}).click();
 await expect(page.locator('#loginView')).toBeVisible();expect(await page.evaluate(()=>window.__map)).toBeUndefined();await expect(page.locator('#tblBody')).toBeEmpty();
 await login();expect(evidence.errors).toEqual([]);expect(evidence.unexpected).toEqual([]);
});
test('problem map fullscreen and repeated public refresh keep one live map and chart per canvas',async({page})=>{
 const evidence=await openReference(page);await expect(page.locator('#efCount')).toContainText('2 ระบบ');
 await page.locator('[data-view="detail"]').click();await page.locator('[data-tab="problem"]').click();await expect(page.locator('#probBody tr')).toHaveCount(1);
 await page.locator('#probMapStage .map-expand-ctrl a').click();await expect(page.locator('#probMapStage')).toHaveClass(/map-fullscreen/);await page.keyboard.press('Escape');await expect(page.locator('#probMapStage')).not.toHaveClass(/map-fullscreen/);
 await page.locator('[data-view="exec"]').click();for(let i=0;i<3;i++){await page.locator('#btnRefresh').click();await expect(page.locator('#btnRefresh')).toBeEnabled();}
 expect(await page.evaluate(()=>Object.keys(Chart.instances).length)).toBe(4);expect(evidence.errors).toEqual([]);
});
test('executive and insight distinguish missing data and use an even-count median',async({page})=>{
 const data=structuredClone(fixture);data.waterSystems.forEach(s=>{s.system_type='SURFACE_SMALL';s.drinking_water_quality='NO_DATA';s.water_quantity='NO_DATA';});data.waterSystems[1].capacity_m3_hr=1500;
 const evidence=await openReference(page,{dataset:data});await expect(page.locator('#efCount')).toContainText('2 ระบบ');
 await expect(page.locator('#dqDesc')).toContainText('ไม่มีผลตรวจ');
 await expect(page.locator('#dqaBox')).not.toContainText('ไม่มีข้อมูลเลยในชีต');
 await page.locator('[data-view="detail"]').click();await page.locator('[data-tab="insight"]').click();
 await expect(page.locator('#ixBody')).toContainText('1,505');await expect(page.locator('#ixBody')).toContainText('มัธยฐาน 752.5');
 expect(evidence.errors).toEqual([]);
});
test('malicious names and district text stay inert through drill-down and details',async({page})=>{
 const data=structuredClone(fixture);data.waterSystems[0].system_name='<img src=x onerror="window.injected=1">';data.villages[0].district="จุน');window.injected=2;//";
 const evidence=await openReference(page,{dataset:data});await expect(page.locator('#efCount')).toContainText('2 ระบบ');
 await page.locator('[data-view="detail"]').click();await page.locator('[data-tab="table"]').click();
 await expect(page.locator('#tblBody')).toContainText('<img');expect(await page.evaluate(()=>window.injected)).toBeUndefined();
 await page.locator('#tblBody tr').first().click();await expect(page.locator('#referenceDetail')).toBeVisible();expect(await page.evaluate(()=>window.injected)).toBeUndefined();
 await page.locator('#referenceDetail button').click();await page.locator('[data-tab="compare"]').click();await page.locator('#districtCompare tbody tr').filter({hasText:"จุน');"}).locator('td').first().click();expect(await page.evaluate(()=>window.injected)).toBeUndefined();
 expect(evidence.errors).toEqual([]);expect(evidence.unexpected).toEqual([]);
});
test('revoked session never loads or retains private dashboard',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('vws_management_token_v2','MGT-'+'a'.repeat(64)));
 const evidence=await openReference(page,{technician:true,respond:env=>env.action==='auth.me'?{success:false,error:{code:'SESSION_REVOKED',message:'Synthetic revoked'}}:null});
 await expect(page.locator('#loginView')).toBeVisible();expect(evidence.calls.map(c=>c.action)).toEqual(['auth.me']);expect(await page.evaluate(()=>sessionStorage.getItem('vws_management_token_v2'))).toBeNull();await expect(page.locator('#tblBody')).toBeEmpty();expect(evidence.errors).toEqual([]);
});
test('technician can open existing history and return to the reference table',async({page})=>{
 const evidence=await openReference(page,{technician:true,respond:env=>env.action==='data.entityHistory'?{success:true,data:{history:[{auditId:'A-1',action:'SYSTEM_UPDATE',username:'tech',role:'TECHNICIAN',timestamp:'2026-11-01T00:00:00Z',changedFields:['system_name'],reason:''}]}}:undefined});await page.locator('#loginUsername').fill('tech');await page.locator('#loginPassword').fill('synthetic-password');await page.locator('#loginSubmit').click();await expect(page.locator('#efCount')).toContainText('1 ระบบ');
 await page.locator('[data-view="detail"]').click();await page.locator('[data-tab="table"]').click();await page.locator('#tblBody tr').first().click();await page.locator('#referenceHistoryButton').click();
 await expect(page.locator('#historyPanel')).toBeVisible();expect(evidence.calls.some(c=>c.action==='data.entityHistory')).toBe(true);await expect(page.locator('#historyPanel [data-return-dashboard]')).toBeHidden();await page.locator('#referenceDashboard .main-nav [data-view="detail"]').click();await expect(page.locator('#referenceDashboard')).toBeVisible();await expect(page.locator('#historyPanel')).toBeHidden();await expect(page.locator('#tblBody tr').first()).toBeVisible();expect(evidence.errors).toEqual([]);
});
for(const width of [360,390,768,1024,1440,1920])test(`reference responsive layout ${width} has no page overflow`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});const evidence=await openReference(page);await expect(page.locator('#efCount')).toContainText('2 ระบบ');
 await page.waitForFunction(()=>{const c=Chart.getChart('c_ops'),a=c?.getDatasetMeta(0)?.data[0];return a&&a.outerRadius>=a.getProps(['outerRadius'],true).outerRadius-.1;});
 await page.screenshot({path:testInfo.outputPath(`reference-public-${width}.png`),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.locator('[data-view="detail"]').click();await page.locator('[data-tab="table"]').click();await expect(page.locator('#tblBody tr')).toHaveCount(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(evidence.errors).toEqual([]);
});
test('technician reference uses validated district and preserves detail/edit access',async({page})=>{
 const evidence=await openReference(page,{technician:true});
 await page.locator('#loginUsername').fill('synthetic-tech');await page.locator('#loginPassword').fill('synthetic-password');await page.locator('#loginSubmit').click();
 await expect(page.locator('#referenceDashboard #efCount')).toContainText('1 ระบบ');
 await expect(page.locator('#referenceDashboard #fd')).toBeDisabled();
 await expect(page.locator('#referenceDashboard')).toContainText('ช่างอำเภอจุน');
 await page.locator('#referenceDashboard [data-view="detail"]').click();await page.locator('#referenceDashboard [data-tab="table"]').click();await page.locator('#tblBody tr').first().click();
 await expect(page.locator('#systemDialog')).toBeVisible();
 expect(evidence.errors).toEqual([]);expect(evidence.unexpected).toEqual([]);
});
test('comparison rows drill down without executing data as code',async({page})=>{
 const evidence=await openReference(page);await expect(page.locator('#efCount')).toContainText('2 ระบบ');
 await page.locator('[data-view="detail"]').click();await page.locator('#districtCompare tbody tr').first().locator('td').first().click();
 await expect(page.locator('#fd')).not.toHaveValue('');expect(evidence.errors).toEqual([]);
});
test('filter and search update every view from API data',async({page})=>{
 const evidence=await openReference(page);
 await expect(page.locator('#efCount')).toContainText('2 ระบบ');
 await page.locator('#frule').selectOption('qty');
 await expect(page.locator('#efCount')).toContainText('1 ระบบ');
 await expect(page.locator('#efCount')).toContainText('1 หมู่บ้าน');
 await page.locator('[data-view="detail"]').click();await page.locator('[data-tab="table"]').click();
 await expect(page.locator('#tblBody tr')).toHaveCount(1);
 await page.locator('#efReset').click();await page.locator('#fq').fill('s1');
 await expect(page.locator('#tblBody')).toContainText('ระบบทดสอบหนึ่ง');
 await expect(page.locator('#tblBody')).not.toContainText('ระบบทดสอบสอง');
 expect(evidence.errors).toEqual([]);expect(evidence.unexpected).toEqual([]);
});
test('map layer visibility does not mutate global totals and hidden charts resize',async({page})=>{
 const evidence=await openReference(page);await expect(page.locator('#efCount')).toContainText('2 ระบบ');
 const count=await page.locator('#efCount').textContent();
 await page.locator('#mlcToggle').click();await page.locator('#mlcTypeNone').click();
 await expect(page.locator('#efCount')).toHaveText(count);
 for(let i=0;i<3;i++){await page.locator('[data-view="detail"]').click();await page.locator('[data-view="exec"]').click();}
 expect(await page.locator('#c_ops').evaluate(c=>c.getBoundingClientRect().width)).toBeGreaterThan(100);
 expect(evidence.errors).toEqual([]);
});
test('switching views and refreshing preserves manually chosen map camera',async({page})=>{
 await openReference(page);await expect(page.locator('#efCount')).toContainText('2 ระบบ');await page.evaluate(()=>window.__map.setView([19.5,100.05],12,{animate:false}));
 await page.locator('[data-view="detail"]').click();await page.locator('#frule').selectOption('ops');await page.locator('#efReset').click();await page.locator('[data-view="exec"]').click();
 await expect.poll(()=>page.evaluate(()=>window.__map.getZoom())).toBe(12);await page.locator('#btnRefresh').click();await expect(page.locator('#btnRefresh')).toBeEnabled();expect(await page.evaluate(()=>window.__map.getZoom())).toBe(12);
});
test('refresh updates area choices including map-local district controls',async({page})=>{
 const source=structuredClone(fixture);await openReference(page,{dataset:source});await expect(page.locator('#efCount')).toContainText('2 ระบบ');
 source.villages.push({...source.villages[0],village_id:'v3',district:'ปง',village_name:'บ้านเพิ่ม'});source.waterSystems.push({...source.waterSystems[0],system_id:'s3',village_id:'v3'});
 await page.locator('#btnRefresh').click();await expect(page.locator('#efCount')).toContainText('3 ระบบ');await expect(page.locator('#fd option[value="ปง"]')).toHaveCount(1);await expect(page.locator('#mlcDistList')).toContainText('ปง');
});
test('private public-visibility filter remains available without changing the public filter bar',async({page})=>{
 const source=structuredClone(fixture);source.waterSystems[0].publicVisible=true;source.waterSystems[1].publicVisible=false;
 await openReference(page,{dataset:source,technician:true,user:{username:'admin',role:'ADMIN',district:''}});await page.locator('#loginUsername').fill('admin');await page.locator('#loginPassword').fill('synthetic-password');await page.locator('#loginSubmit').click();await expect(page.locator('#efCount')).toContainText('2 ระบบ');
 await page.locator('#referenceVisibility').selectOption('HIDDEN');await expect(page.locator('#efCount')).toContainText('1 ระบบ');await page.locator('#efReset').click();await expect(page.locator('#referenceVisibility')).toHaveValue('');await expect(page.locator('#efCount')).toContainText('2 ระบบ');
});
test('cached public reload retains rows with an unverified warning when live fetch fails',async({page})=>{
 let fail=false;await openReference(page,{failMock:()=>fail});await expect(page.locator('#efCount')).toContainText('2 ระบบ');
 await page.waitForFunction(async()=>{const m=await import('/assets/js/public-cache.js');return (await m.readPublicCache()).status==='HIT';});fail=true;await page.reload();await expect(page.locator('#efCount')).toContainText('2 ระบบ');await expect(page.locator('#referenceStatus')).toContainText('ยังไม่ได้ตรวจสอบ');await expect(page.locator('#referenceStatus')).toContainText('อัปเดตไม่สำเร็จ');
});
test('KPI drill-down and public details can be operated with the keyboard',async({page})=>{
 await openReference(page);await expect(page.locator('#efCount')).toContainText('2 ระบบ');await page.locator('.kpi-card').first().focus();await page.keyboard.press('Enter');await expect(page.locator('#kpiDetail')).toHaveClass(/open/);
 await page.locator('[data-view="detail"]').click();await page.locator('[data-tab="table"]').click();await page.locator('#tblBody tr').first().focus();await page.keyboard.press('Enter');await expect(page.locator('#referenceDetail')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#tblBody tr').first()).toBeFocused();
});
test('both reference tables load the next batch without duplicate rows',async({page})=>{
 const source={villages:[],waterSystems:[],waterSources:[]};for(let i=1;i<=101;i++){source.villages.push({...fixture.villages[0],village_id:'batch-v'+i});source.waterSystems.push({...fixture.waterSystems[0],system_id:'batch-s'+i,village_id:'batch-v'+i});}
 await openReference(page,{dataset:source});await expect(page.locator('#efCount')).toContainText('101 ระบบ');await page.locator('[data-view="detail"]').click();await page.locator('[data-tab="table"]').click();await expect(page.locator('#tblBody tr')).toHaveCount(100);await page.locator('#loadMoreBtn').click();await expect(page.locator('#tblBody tr')).toHaveCount(101);await expect(page.locator('#loadMoreBtn')).toBeHidden();
 await page.locator('[data-tab="vtable"]').click();await expect(page.locator('#vtblBody tr')).toHaveCount(100);await page.locator('#vLoadMoreBtn').click();await expect(page.locator('#vtblBody tr')).toHaveCount(101);
});
test('pending mutation retries keep their original id and never claim success early',async({page})=>{
 let before,attempt=0;const evidence=await openReference(page,{technician:true,respond:(env,response)=>{if(env.action==='data.waterSystem')before=response.data.system;if(env.action==='data.updateWaterSystem'){attempt++;if(attempt===1)return {success:false,error:{code:'AUTH_JOB_PENDING',message:'กำลังดำเนินการ กรุณาลองใหม่ด้วยข้อมูลเดิม'}};const after={...before,...env.payload.request.patch};return {success:true,data:{system:after,changeSummary:{before,after}}};}}});
 await page.locator('#loginUsername').fill('tech');await page.locator('#loginPassword').fill('synthetic-password');await page.locator('#loginSubmit').click();await expect(page.locator('#efCount')).toContainText('1 ระบบ');await page.locator('[data-view="detail"]').click();await page.locator('[data-tab="table"]').click();await page.locator('#tblBody tr').first().click();await page.locator('#editSystemButton').click();await page.locator('#edit_system_name').fill('ลองใหม่ชื่อเดิม');await page.locator('#saveEditButton').click();await expect(page.locator('#editError')).toContainText('กำลังดำเนินการ');await expect(page.locator('#saveSummaryDialog')).not.toBeVisible();await page.locator('#saveEditButton').click();await expect(page.locator('#saveSummaryDialog')).toBeVisible();const writes=evidence.calls.filter(c=>c.action==='data.updateWaterSystem');expect(writes).toHaveLength(2);expect(writes[0].payload.mutationId).toBe(writes[1].payload.mutationId);expect(evidence.errors).toEqual([]);
});
