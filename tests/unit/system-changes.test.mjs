import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const ctx={window:{}};vm.createContext(ctx);vm.runInContext(readFileSync('technician/assets/system-changes.js','utf8'),ctx);
const {diff,render}=ctx.window.VWSSystemChanges;
const options={fields:['system_name','capacity_m3_hr','responsible_agency'],label:v=>String(v)};
test('separates business, derived, metadata and legacy blank changes without exposing unknown fields',()=>{
 const groups=diff({before:{system_name:'Old',responsible_agency:null,construction_year_ce:2008,record_version:1,password:'old'},after:{system_name:'New',responsible_agency:'',construction_year_ce:2002,record_version:2,password:'new'}},options.fields);
 assert.equal(groups.business.length,1);assert.equal(groups.blank.length,1);assert.equal(groups.derived.length,1);assert.equal(groups.technical.length,1);
 assert.equal(JSON.stringify(groups).includes('password'),false);
});
test('renders committed values including zero, escaping untrusted text',()=>{
 const html=render({before:{capacity_m3_hr:0,system_name:'<img onerror=alert(1)>'},after:{capacity_m3_hr:5,system_name:'Edited'}},options);
 assert.ok(html.includes('>0</span>'));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));
 assert.ok(html.includes('ก่อนแก้ไข'));assert.ok(html.includes('หลังแก้ไข'));
});
test('old API lacking before/after does not invent a successful diff',()=>{
 assert.equal(diff({changedFields:['system_name']},options.fields),null);
 assert.equal(diff({before:null,after:null,changedFields:['system_name']},options.fields),null);
 assert.ok(render({},options).includes('ไม่มีรายละเอียดก่อน–หลัง'));
});
test('explicit NULL-to-empty legacy evidence is retained in its expandable section',()=>{
 const html=render({before:{responsible_agency:null},after:{responsible_agency:''}},options);
 assert.ok(html.includes('ไม่มีค่า (NULL)'));assert.ok(html.includes('ข้อความว่าง'));assert.ok(html.includes('เปลี่ยนข้อมูล 0 ช่อง'));
});

test('success popup shows only committed business changes; full history retains other groups',()=>{
 const values={before:{system_name:'Before',record_version:1,construction_year_ce:2008,responsible_agency:null},after:{system_name:'After',record_version:2,construction_year_ce:2002,responsible_agency:''}};
 const popup=render(values,{...options,businessOnly:true});
 assert.ok(popup.includes('Before'));assert.ok(popup.includes('After'));assert.ok(popup.includes('เปลี่ยนข้อมูล 1 ช่อง'));
 assert.ok(!popup.includes('<details'));assert.ok(!popup.includes('record_version'));assert.ok(!popup.includes('2008'));assert.ok(!popup.includes('NULL'));
 assert.ok(render(values,options).includes('<details'));
});
