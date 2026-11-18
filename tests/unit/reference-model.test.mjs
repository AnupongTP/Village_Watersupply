import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {resolveUiSourcePath} from '../support/source-root.mjs';
const file=resolveUiSourcePath('assets/js/reference-model.js');
const context={};vm.createContext(context);if(fs.existsSync(file))vm.runInContext(fs.readFileSync(file,'utf8'),context);
const model=context.VWSReferenceModel||{};
const data={villages:[{village_id:'v1',village_name:'หมู่บ้าน',district:'จุน',has_village_waterworks:true},{village_id:'v2',village_name:'อีกหมู่บ้าน',district:'เชียงคำ',has_village_waterworks:false}],waterSystems:[{system_id:'s1',village_id:'v1',system_name:'หนึ่ง',operational_status:'WORKING',drinking_water_quality:'PASS',water_quantity:'SUFFICIENT',construction_year_be:2549,capacity_m3_hr:0},{system_id:'s2',village_id:'v2',system_name:'สอง',operational_status:'NOT_WORKING',drinking_water_quality:'FAIL',water_quantity:'INSUFFICIENT',utility_water_quality:'NOT_USABLE',construction_year_be:2570,capacity_m3_hr:1500}],waterSources:[]};
test('adapter deduplicates canonical IDs and excludes private public fields',()=>{
 const d=model.adaptDataset({...data,waterSystems:[{...data.waterSystems[0],responsible_agency:'PRIVATE'},...data.waterSystems]},{audience:'PUBLIC'});
 assert.equal(d.waterSystems.length,2);assert.equal(d.waterSystems[0].responsible_agency,undefined);assert.equal(data.waterSystems.length,2);
});
test('selection ANDs rules/area and retains only matching villages',()=>{
 const d=model.adaptDataset(data,{audience:'PUBLIC'});
 for(const [rule,want] of [['',2],['ok',1],['ops',1],['dq',1],['qty',1],['uq',1],['any',1],['multi',1]])assert.equal(model.selectDataset(d,{rule}).waterSystems.length,want,rule);
 const x=model.selectDataset(d,{rule:'dq',district:'จุน'});assert.equal(x.waterSystems.length,0);assert.equal(x.villages.length,0);
 const y=model.selectDataset(d,{search:'s2'});assert.equal(y.waterSystems[0].system_id,'s2');assert.equal(y.villages[0].village_id,'v2');
});
test('summary uses known-status denominators and valid ages without removing high capacity',()=>{
 const d=model.adaptDataset({...data,waterSystems:[...data.waterSystems,{system_id:'s3',village_id:'v1',drinking_water_quality:'garbage',water_quantity:null}]},{audience:'PUBLIC'});
 const s=model.summarizeSelection(model.selectDataset(d,{}),{referenceYearBE:2569});
 assert.equal(s.quality.drinking.count,1);assert.equal(s.quality.drinking.denominator,2);assert.equal(s.quality.drinking.percent,50);assert.equal(s.quality.drinking.missing,1);
 assert.equal(s.age.atLeast20.count,1);assert.equal(s.age.unknown,2);assert.equal(s.capacity.total,1500);assert.equal(s.capacity.median,750);assert.equal(s.capacity.count,2);
});
test('no denominator stays null and unavailable is distinct from missing',()=>{
 const d=model.adaptDataset({villages:[],waterSystems:[],waterSources:[]},{audience:'PUBLIC',fieldAvailability:{capacity_m3_hr:false}});
 const s=model.summarizeSelection(model.selectDataset(d,{}),{referenceYearBE:2569});
 assert.equal(s.quality.drinking.percent,null);assert.equal(s.capacity.unavailable,true);assert.equal(s.capacity.count,0);
});
test('household zero differs from null and source rows are not added twice',()=>{
 const v={village_id:'v',pwa_households:10,mwa_households:1,commercial_households:0,other_village_pipe_households:0,waterbank_households:0,self_source_households:2,natural_source_households:0};
 const d=model.adaptDataset({villages:[v,{...v,village_id:'missing',mwa_households:null}],waterSystems:[],waterSources:[{source_id:'x',village_id:'v',households:500}]},{audience:'PUBLIC'});
 const s=model.summarizeSelection(model.selectDataset(d,{}),{referenceYearBE:2569});assert.equal(s.households.total,13);assert.equal(s.households.excludedVillages,1);
});
test('boolean and object measurements are invalid rather than numeric zero or one',()=>{
 const d=model.adaptDataset({...data,waterSystems:[{...data.waterSystems[0],capacity_m3_hr:true,latitude:false,longitude:{}}]},{audience:'PUBLIC'});
 const s=model.summarizeSelection(model.selectDataset(d,{}),{referenceYearBE:2569});assert.equal(s.capacity.count,0);
 const projected=model.toReferenceDataset(d,{referenceYearBE:2569});assert.equal(projected.S[0].lat,null);assert.equal(projected.S[0].lng,null);
});
test('default Bangkok Buddhist reference year is numeric and retains known construction years',()=>{
 const d=model.adaptDataset(data,{audience:'PUBLIC'}),s=model.summarizeSelection(model.selectDataset(d,{}));
 assert.ok(Number.isInteger(s.age.referenceYearBE));assert.equal(model.toReferenceDataset(d).S[0].yr,2549);assert.equal(s.age.atLeast20.count,1);
});
