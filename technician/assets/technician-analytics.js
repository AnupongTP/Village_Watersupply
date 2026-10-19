/* Read-only analytics over the authenticated Management dashboard response. */
(() => {
  'use strict';
  const charts = new Map();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const grouping = (rows, key) => rows.reduce((out, row) => {
    const label = String(key(row) || 'ไม่ระบุ');
    out[label] = (out[label] || 0) + 1;
    return out;
  }, {});
  const translated = (values, label) => Object.entries(values).reduce((out, [key, value]) => {
    const name = label(key) || 'ไม่ระบุ';
    out[name] = (out[name] || 0) + value;
    return out;
  }, {});
  const quality = rows => ({
    PASS: rows.filter(row => row === 'PASS').length,
    FAIL: rows.filter(row => row === 'FAIL').length,
    NO_DATA: rows.filter(row => row === 'NO_DATA').length,
    UNKNOWN: rows.filter(row => !['PASS','FAIL','NO_DATA'].includes(row)).length
  });
  function summarize(dataset, systems = dataset?.waterSystems || []) {
    const villages = Array.isArray(dataset?.villages) ? dataset.villages : [];
    const sources = Array.isArray(dataset?.waterSources) ? dataset.waterSources : [];
    const uniqueVillageIds = new Set(systems.map(row => row.village_id).filter(Boolean));
    const missingCoordinates = systems.filter(row => !window.VWSTechnicianMap?.coordinates(row)).length;
    return {
      systems: systems.length, villages: villages.length,
      linkedVillages: uniqueVillageIds.size, sources: sources.length,
      notWorking: systems.filter(row => row.operational_status === 'NOT_WORKING').length,
      insufficient: systems.filter(row => row.water_quantity === 'INSUFFICIENT').length,
      drinking: quality(systems.map(row => row.drinking_water_quality)),
      utility: quality(systems.map(row => row.utility_water_quality)),
      missingCoordinates,
      hidden: systems.filter(row => row.publicVisible === false).length,
      byDistrict: grouping(systems, row => row.village?.district),
      byDistrictVillages: grouping(villages, row => row.district),
      bySubdistrict: grouping(systems, row => row.village?.subdistrict),
      byAuthority: grouping(systems, row => row.village?.local_authority),
      byType: grouping(systems, row => row.system_type),
      byOperationalStatus: grouping(systems, row => row.operational_status),
      byQuantity: grouping(systems, row => row.water_quantity),
      monitoring: systems.filter(row => row.operational_status === 'NOT_WORKING' || row.water_quantity === 'INSUFFICIENT' || row.drinking_water_quality === 'FAIL' || row.utility_water_quality === 'FAIL' || !window.VWSTechnicianMap?.coordinates(row) || row.publicVisible === false)
    };
  }
  function setText(id, value) { const node = document.getElementById(id); if (node) node.textContent = typeof value === 'number' ? value.toLocaleString('th-TH') : value; }
  function chart(id, values, label, color = '#0284c7') {
    const canvas = document.getElementById(id);
    if (!canvas || !window.Chart || !values || !Object.keys(values).length) return;
    const labels = Object.keys(values).sort((a,b) => a.localeCompare(b,'th'));
    const data = labels.map(key => values[key]);
    const horizontal = window.matchMedia('(max-width: 767px)').matches;
    const current = charts.get(id);
    if (current) {
      current.data.labels = labels;
      current.data.datasets[0].data = data;
      current.options.indexAxis = horizontal ? 'y' : 'x';
      current.update('none');
      return;
    }
    charts.set(id, new window.Chart(canvas, {
      type: 'bar', data: { labels, datasets: [{ label, data, backgroundColor: color, borderRadius: 5 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, indexAxis: horizontal ? 'y' : 'x',
        plugins: { legend: { display: false } }, scales: { x: { beginAtZero: horizontal, ticks: { precision: 0 } }, y: { beginAtZero: !horizontal, ticks: { precision: 0 } } } }
    }));
  }
  function groupList(id, values, unit) {
    const node = document.getElementById(id);
    if (!node) return;
    const entries = Object.entries(values).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0],'th'));
    node.innerHTML = entries.length ? entries.map(([name,n]) => `<li><span>${esc(name)}</span><strong>${n.toLocaleString('th-TH')} ${unit}</strong></li>`).join('') : '<li>ไม่มีข้อมูลสำหรับตัวกรองนี้</li>';
  }
  function render(dataset, systems, typeLabel = value => value) {
    const summary = summarize(dataset, systems);
    setText('analyticsVillageCount', summary.villages);
    setText('analyticsSourceCount', summary.sources);
    setText('analyticsLinkedVillageCount', summary.linkedVillages);
    setText('analyticsInsufficient', summary.insufficient);
    setText('analyticsUtilityFail', summary.utility.FAIL);
    setText('analyticsDrinkingFail', summary.drinking.FAIL);
    setText('analyticsHidden', summary.hidden);
    setText('analyticsHiddenMonitor', summary.hidden);
    setText('analyticsMissingCoords', summary.missingCoordinates);
    groupList('analyticsDistrictList', summary.byDistrict, 'ระบบ');
    groupList('analyticsVillageDistrictList', summary.byDistrictVillages, 'หมู่บ้าน');
    groupList('analyticsSubdistrictList', summary.bySubdistrict, 'ระบบ');
    groupList('analyticsAuthorityList', summary.byAuthority, 'ระบบ');
    groupList('analyticsTypeList', translated(summary.byType, typeLabel), 'ระบบ');
    groupList('analyticsOperationalList', translated(summary.byOperationalStatus, typeLabel), 'ระบบ');
    groupList('analyticsQuantityList', translated(summary.byQuantity, typeLabel), 'ระบบ');
    const qualityLabels = { PASS:'ผ่าน', FAIL:'ไม่ผ่าน', NO_DATA:'ไม่มีข้อมูล', UNKNOWN:'ไม่ทราบ / ไม่ระบุ' };
    groupList('analyticsDrinkingList', Object.fromEntries(Object.entries(summary.drinking).map(([key,value]) => [qualityLabels[key], value])), 'ระบบ');
    groupList('analyticsUtilityList', Object.fromEntries(Object.entries(summary.utility).map(([key,value]) => [qualityLabels[key], value])), 'ระบบ');
    chart('analyticsDistrictChart', summary.byDistrict, 'ระบบประปา');
    chart('analyticsTypeChart', translated(summary.byType, typeLabel), 'ระบบประปา', '#0891b2');
    chart('analyticsQualityChart', Object.fromEntries(Object.entries(summary.drinking).map(([key,value]) => [qualityLabels[key], value])), 'ระบบประปา', '#e11d48');
    const list = document.getElementById('analyticsMonitoringList');
    if (list) list.innerHTML = summary.monitoring.length ? summary.monitoring.map(row => {
      const reasons = [row.operational_status === 'NOT_WORKING' && 'ใช้การไม่ได้', row.water_quantity === 'INSUFFICIENT' && 'น้ำไม่เพียงพอ',
        row.drinking_water_quality === 'FAIL' && 'น้ำดื่มไม่ผ่าน', row.utility_water_quality === 'FAIL' && 'น้ำใช้ไม่ผ่าน',
        !window.VWSTechnicianMap?.coordinates(row) && 'พิกัดไม่ครบ', row.publicVisible === false && 'ไม่แสดงใน Public'].filter(Boolean);
      return `<li><div><strong>${esc(row.system_name || row.village?.village_name || 'ระบบประปาหมู่บ้าน')}</strong><span>${esc(reasons.join(' · '))}</span></div><button type="button" class="mini-btn primary" data-analytics-system="${esc(row.system_id)}">ดูรายละเอียด</button></li>`;
    }).join('') : '<li>ไม่พบระบบที่เข้าเกณฑ์เฝ้าระวัง</li>';
    setText('analyticsMonitoringCount', `${summary.monitoring.length.toLocaleString('th-TH')} ระบบที่มีอย่างน้อยหนึ่งประเด็น`);
    return summary;
  }
  function bind(onSystem) { document.getElementById('analyticsMonitoringList')?.addEventListener('click', event => {
    const button = event.target.closest('[data-analytics-system]');
    if (button) onSystem(button.dataset.analyticsSystem);
  }); }
  window.VWSTechnicianAnalytics = { summarize, render, bind, resize: () => charts.forEach(chart => chart.resize()), chartCount: () => charts.size };
})();
