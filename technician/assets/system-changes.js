// Pure, allowlisted presentation of committed WATER_SYSTEM audit values.
(() => {
  'use strict';
  const technical = new Set(['updated_at','created_at','record_version','last_mutation_id','system_id','village_id','source_excel_row','system_no']);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  function diff(summary, fields) {
    if (!summary || !Object.hasOwn(summary,'before') || !Object.hasOwn(summary,'after') || summary.before==null&&summary.after==null) return null;
    const before=summary.before||{}, after=summary.after||{};
    if (!Object.keys(before).length&&!Object.keys(after).length) return null;
    const allowed=new Set([...fields,'construction_year_ce',...technical]);
    const groups={business:[],derived:[],technical:[],blank:[]};
    for (const key of new Set([...Object.keys(before),...Object.keys(after)])) {
      if (!allowed.has(key) || equal(before[key],after[key])) continue;
      const item={key,before:before[key],after:after[key]};
      const blankChange=(before[key]===null&&after[key]==='')||(before[key]===''&&after[key]===null);
      groups[technical.has(key)?'technical':key==='construction_year_ce'?'derived':blankChange?'blank':'business'].push(item);
    }
    return groups;
  }
  function valueText(value,key,{label, villageName},exact=false) {
    if (value===undefined) return 'ไม่มีฟิลด์ในข้อมูลเดิม';
    if (value===null) return exact?'ไม่มีค่า (NULL)':'ไม่ระบุ';
    if (value==='') return exact?'ข้อความว่าง ("")':'ไม่ระบุ';
    let parsed=value;
    if (key.endsWith('_json')&&typeof value==='string') {try{parsed=JSON.parse(value);}catch{}}
    if (Array.isArray(parsed)) return parsed.length?parsed.map(item=>{
      if (item&&typeof item==='object') {const id=item.village_id||item.villageId||item.villageIdRef;return villageName?.(id)||id||JSON.stringify(item);}
      return key==='shared_villages_json'?(villageName?.(item)||item):label(item);
    }).join(', '):'ไม่มีรายการ';
    return typeof value==='boolean'?(value?'ใช่':'ไม่ใช่'):label(value);
  }
  function render(summary,options) {
    const groups=diff(summary,options.fields);
    if (!groups) return '<p class="change-unavailable">ไม่มีรายละเอียดก่อน–หลังจาก API รุ่นนี้</p>';
    const rows=(items,exact=false)=>`<dl class="change-values">${items.map(item=>`<div class="change-row"><dt>${esc(options.label(item.key))}</dt><dd><small>ก่อนแก้ไข</small><span>${esc(valueText(item.before,item.key,options,exact))}</span></dd><dd><small>หลังแก้ไข</small><span>${esc(valueText(item.after,item.key,options,exact))}</span></dd></div>`).join('')}</dl>`;
    if(options.businessOnly)return `<p class="change-count">เปลี่ยนข้อมูล ${groups.business.length} ช่อง</p>${rows(groups.business)}`;
    const redacted=summary.before?.historyRedactedFields||summary.after?.historyRedactedFields;
    return `${redacted?'<p class="change-unavailable">รายละเอียดหมู่บ้านใช้น้ำร่วมบางส่วนไม่สามารถแสดงตามสิทธิ์อำเภอจากรูปแบบข้อมูลเดิมได้</p>':''}<p class="change-count">เปลี่ยนข้อมูล ${groups.business.length} ช่อง</p>${rows(groups.business)}${groups.derived.length?`<details class="change-extra"><summary>ค่าที่คำนวณตาม (${groups.derived.length})</summary>${rows(groups.derived)}</details>`:''}${groups.blank.length?`<details class="change-extra"><summary>การเปลี่ยนรูปแบบค่าว่าง (${groups.blank.length})</summary>${rows(groups.blank,true)}</details>`:''}${groups.technical.length?`<details class="change-extra"><summary>รายละเอียดระบบ (${groups.technical.length})</summary>${rows(groups.technical,true)}</details>`:''}`;
  }
  window.VWSSystemChanges=Object.freeze({diff,render});
})();
