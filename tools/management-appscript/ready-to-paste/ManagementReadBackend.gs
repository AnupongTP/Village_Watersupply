/**
 * Village Water Supply — Management Read v2
 * Management read facade + production HTTP transport adapter for hard-delete architecture.
 *
 * Install in the SAME Apps Script project as:
 * - Feature 3 Processor
 * - ManagementProcessorGuard.gs (CP-M1)
 * - ManagementAuthBackend.gs (CP-M2)
 *
 * IMPORTANT:
 * - Normal reads do not mutate mainplumbing, villages, water_systems, or
 *   village_water_sources. Before building a snapshot, v2 may deterministically
 *   finalize a previously PREPARED SYSTEM_DELETE audit left by commit uncertainty.
 * - Authenticated reads update auth_sessions.last_activity_at through the
 *   CP-M2 session contract.
 * - Management sees the full current dataset. Public suppression is metadata,
 *   not a Management filter.
 * - Hard-deleted systems are physically absent from water_systems. Committed SYSTEM_DELETE audit rows are tombstones for raw-link integrity classification.
 */

const MGMT_DATA = Object.freeze({
  VERSION: 2,

  SHEETS: Object.freeze({
    RAW: 'mainplumbing',
    VILLAGES: 'villages',
    SYSTEMS: 'water_systems',
    SOURCES: 'village_water_sources'
  }),

  ENTITY_TYPES: Object.freeze({
    WATER_SYSTEM: 'WATER_SYSTEM'
  }),


  PUBLIC_RULE: Object.freeze({
    ID: 'R5_1_TEMP_HIDE_244',
    SYSTEM_MISSING_COORDINATE: 'MISSING_COORDINATE',
    SYSTEM_VILLAGE_SUPPRESSED: 'VILLAGE_SUPPRESSED_NO_LINKED_ACTIVE_SYSTEM',
    VILLAGE_NO_LINKED_SYSTEM: 'WATERWORKS_WITHOUT_LINKED_ACTIVE_SYSTEM',
    SOURCE_VILLAGE_SUPPRESSED: 'VILLAGE_SUPPRESSED'
  }),

  HEADERS: Object.freeze({
    VILLAGES: Object.freeze([
      'village_id',
      'source_excel_row',
      'source_order',
      'province',
      'district',
      'subdistrict',
      'local_authority',
      'village_no',
      'village_name',
      'has_village_waterworks',
      'water_from_raw',
      'pwa_households',
      'mwa_households',
      'commercial_households',
      'other_village_pipe_households',
      'waterbank_households',
      'self_source_households',
      'natural_source_households',
      'created_at',
      'updated_at',
      'community_type',
      'dla_village_code'
    ]),

    SYSTEMS: Object.freeze([
      'system_id',
      'village_id',
      'source_excel_row',
      'system_no',
      'system_name',
      'latitude',
      'longitude',
      'owner_type',
      'responsible_agency',
      'system_type',
      'water_source_type',
      'capacity_m3_hr',
      'usage_type',
      'households_served',
      'construction_year_be',
      'construction_year_ce',
      'operational_status',
      'utility_water_quality',
      'drinking_water_quality',
      'water_quantity',
      'shared_with_other_village',
      'shared_village_name',
      'establishment_type',
      'establishment_agency',
      'transfer_year_be',
      'transfer_agency',
      'transfer_other',
      'transfer_document_status',
      'transfer_document_url',
      'created_at',
      'updated_at',
      'usage_types_json',
      'quality_failure_categories_json',
      'quality_failure_detail',
      'water_pressure',
      'year_round_status',
      'available_months_json',
      'beneficiaries',
      'monthly_production_cost',
      'monthly_service_revenue',
      'water_tariff',
      'service_agency',
      'water_source_detail',
      'surface_water_type',
      'surface_water_agency',
      'shared_villages_json'
    ]),

    SOURCES: Object.freeze([
      'source_id',
      'village_id',
      'source_excel_row',
      'source_type',
      'households'
    ])
  }),

  ENUM_CATALOG: Object.freeze({
    owner_type: Object.freeze(['LOCAL_AUTHORITY', 'VILLAGE_OR_OTHER', 'UNKNOWN']),
    system_type: Object.freeze([
      'GROUNDWATER_SMALL',
      'GROUNDWATER_MEDIUM',
      'GROUNDWATER_LARGE',
      'SURFACE_SMALL',
      'SURFACE_MEDIUM',
      'SURFACE_LARGE',
      'SURFACE_VERY_LARGE',
      'UNKNOWN'
    ]),
    water_source_type: Object.freeze(['GROUNDWATER', 'SURFACE_WATER', 'MIXED', 'UNKNOWN']),
    usage_type: Object.freeze(['DOMESTIC', 'AGRICULTURE', 'UNKNOWN']),
    operational_status: Object.freeze(['WORKING', 'NOT_WORKING', 'UNKNOWN']),
    utility_water_quality: Object.freeze(['USABLE', 'NOT_USABLE', 'UNKNOWN']),
    drinking_water_quality: Object.freeze(['PASS', 'FAIL', 'NO_DATA']),
    water_quantity: Object.freeze(['SUFFICIENT', 'INSUFFICIENT', 'NO_DATA']),
    shared_with_other_village: Object.freeze(['YES', 'NO', 'UNKNOWN']),
    establishment_type: Object.freeze([
      'LOCAL_CREATED',
      'ACCEPTED_ASSET',
      'TRANSFERRED',
      'NOT_LOCAL_AUTHORITY_ASSET',
      'UNKNOWN'
    ]),
    transfer_document_status: Object.freeze(['AVAILABLE', 'NOT_AVAILABLE', 'NO_DATA']),
    year_round_status: Object.freeze(['YEAR_ROUND', 'SEASONAL']),
    water_pressure: Object.freeze([
      'FLOW_CONTINUOUS',
      'FLOW_STRONG_SOMETIMES',
      'FLOW_WEAK_CONTINUOUS',
      'UNKNOWN'
    ])
  }),

  FEATURE_FLAGS: Object.freeze({
    directGithubToAppsScript: true,
    managementRead: true,
    updateWaterSystem: true,
    deleteWaterSystem: true,
    technicianUserManagement: true,
    entityHistory: true,
    managementCreateWaterSystem: false,
    rollbackWaterSystem: false,
    hardDeleteWaterSystem: true,
    temporaryPublicHide244ServerSide: false
  })
});

// ============================================================================
// Core table/schema helpers
// ============================================================================

function mgmtDataReadExactTable_(ss, sheetName, expectedHeaders) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'ไม่พบชีตข้อมูลที่ Management ต้องใช้', {
      sheet: sheetName
    });
  }

  const expected = expectedHeaders || [];
  const lastColumn = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();

  if (lastRow < 1 || lastColumn !== expected.length) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'โครงสร้างข้อมูลหลักไม่ตรงกับสัญญาปัจจุบัน', {
      sheet: sheetName,
      issue: lastRow < 1 ? 'HEADER_MISSING' : 'COLUMN_COUNT_MISMATCH',
      expectedColumnCount: expected.length,
      actualColumnCount: lastColumn
    });
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(mgmtNormalizeText_);
  const seen = {};
  headers.forEach(function(header) {
    if (header) seen[header] = (seen[header] || 0) + 1;
  });

  for (let i = 0; i < expected.length; i += 1) {
    if (headers[i] !== expected[i] || seen[expected[i]] !== 1) {
      throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'โครงสร้างข้อมูลหลักไม่ตรงกับสัญญาปัจจุบัน', {
        sheet: sheetName,
        issue: 'HEADER_MISMATCH',
        column: i + 1,
        expected: expected[i],
        actual: headers[i] || ''
      });
    }
  }

  const rows = lastRow >= 2
    ? sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues()
    : [];

  return {
    sheet: sheet,
    headers: headers,
    headerMap: mgmtBuildHeaderMap_(headers),
    rows: rows
  };
}

function mgmtDataReadRawProcessorIndex_(ss) {
  if (typeof mgmtEvaluateProcessorGuardLinks_ !== 'function') {
    throw mgmtError_('SERVER_ERROR', 'Management Processor Guard ยังติดตั้งไม่ครบ');
  }

  const sheet = ss.getSheetByName(MGMT_DATA.SHEETS.RAW);
  if (!sheet) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'ไม่พบ mainplumbing สำหรับตรวจ Processor');
  }

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'mainplumbing ไม่มี schema ที่ใช้งานได้');
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(mgmtNormalizeText_);
  const required = ['processed_system_id', 'processing_status'];
  const counts = {};
  headers.forEach(function(header) {
    if (header) counts[header] = (counts[header] || 0) + 1;
  });

  required.forEach(function(header) {
    if ((counts[header] || 0) !== 1) {
      throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'mainplumbing มี Processor schema ไม่ถูกต้อง', {
        header: header,
        count: counts[header] || 0
      });
    }
  });

  const systemIndex = headers.indexOf('processed_system_id');
  const statusIndex = headers.indexOf('processing_status');
  const linksBySystemId = {};

  if (lastRow >= 2) {
    const rowCount = lastRow - 1;
    const systemValues = sheet.getRange(2, systemIndex + 1, rowCount, 1).getValues();
    const statusValues = sheet.getRange(2, statusIndex + 1, rowCount, 1).getValues();

    for (let i = 0; i < rowCount; i += 1) {
      const systemId = mgmtNormalizeText_(systemValues[i][0]);
      if (!systemId) continue;
      if (!linksBySystemId[systemId]) linksBySystemId[systemId] = [];
      linksBySystemId[systemId].push({
        sheetRow: i + 2,
        status: mgmtNormalizeUpper_(statusValues[i][0])
      });
    }
  }

  const guardBySystemId = {};
  Object.keys(linksBySystemId).forEach(function(systemId) {
    guardBySystemId[systemId] = mgmtEvaluateProcessorGuardLinks_(linksBySystemId[systemId]);
  });

  return {
    linksBySystemId: linksBySystemId,
    guardBySystemId: guardBySystemId,
    linkedSystemCount: Object.keys(linksBySystemId).length
  };
}

function mgmtDataBuildUniqueIndex_(table, idHeader, logicalName) {
  const index = {};
  const idIndex = table.headerMap[idHeader];
  if (idIndex === undefined) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'ไม่พบคอลัมน์ ID ที่ต้องใช้', {
      table: logicalName || '',
      header: idHeader
    });
  }

  table.rows.forEach(function(row, offset) {
    const id = mgmtNormalizeText_(row[idIndex]);
    if (!id) {
      throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'พบข้อมูลที่ไม่มี ID', {
        table: logicalName || '',
        sheetRow: offset + 2
      });
    }
    if (index[id]) {
      throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'พบ ID ซ้ำในข้อมูลหลัก', {
        table: logicalName || '',
        id: id
      });
    }
    index[id] = {
      sheetRow: offset + 2,
      row: row,
      object: mgmtRowObject_(table.headers, row)
    };
  });

  return index;
}

function mgmtDataBuildCommittedDeleteTombstoneSet_(ss) {
  const audit = mgmtReadExactTable_(ss, MGMT_CONFIG.SHEETS.AUDIT, MGMT_CONFIG.HEADERS.AUDIT);
  const tombstones = {};
  audit.rows.forEach(function(row) {
    const object = mgmtRowObject_(audit.headers, row);
    if (mgmtNormalizeUpper_(object.audit_status) !== 'COMMITTED') return;
    if (mgmtNormalizeUpper_(object.action) !== 'SYSTEM_DELETE') return;
    if (mgmtNormalizeUpper_(object.entity_type) !== MGMT_DATA.ENTITY_TYPES.WATER_SYSTEM) return;
    const entityId = mgmtNormalizeText_(object.entity_id);
    if (entityId) tombstones[entityId] = true;
  });
  return tombstones;
}

// ============================================================================
// Public projection parity helpers
// ============================================================================

function mgmtDataIsBlank_(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function mgmtDataCoordinatePresent_(systemObject) {
  return !mgmtDataIsBlank_(systemObject && systemObject.latitude) &&
    !mgmtDataIsBlank_(systemObject && systemObject.longitude);
}

function mgmtDataIsWaterworksVillage_(villageObject) {
  const value = villageObject ? villageObject.has_village_waterworks : '';
  return value === true ||
    value === 1 ||
    value === '1' ||
    mgmtNormalizeUpper_(value) === 'YES' ||
    mgmtNormalizeText_(value) === 'มีประปาหมู่บ้าน';
}

function mgmtDataBuildPublicProjection_(villageIndex, systemIndex) {
  const linkedVillageIds = {};

  Object.keys(systemIndex).forEach(function(systemId) {
    const object = systemIndex[systemId].object;
    const villageId = mgmtNormalizeText_(object.village_id);
    if (villageId) linkedVillageIds[villageId] = true;
  });

  const hiddenVillageIds = {};
  Object.keys(villageIndex).forEach(function(villageId) {
    const village = villageIndex[villageId].object;
    if (mgmtDataIsWaterworksVillage_(village) && !linkedVillageIds[villageId]) {
      hiddenVillageIds[villageId] = true;
    }
  });

  const systemVisibility = {};
  let hiddenMissingCoordinateSystems = 0;
  let visibleSystemCount = 0;

  Object.keys(systemIndex).forEach(function(systemId) {
    const system = systemIndex[systemId].object;
    const villageId = mgmtNormalizeText_(system.village_id);
    const reasons = [];

    if (!mgmtDataCoordinatePresent_(system)) {
      reasons.push(MGMT_DATA.PUBLIC_RULE.SYSTEM_MISSING_COORDINATE);
      hiddenMissingCoordinateSystems += 1;
    }
    if (hiddenVillageIds[villageId]) {
      reasons.push(MGMT_DATA.PUBLIC_RULE.SYSTEM_VILLAGE_SUPPRESSED);
    }

    const visible = reasons.length === 0;
    if (visible) visibleSystemCount += 1;
    systemVisibility[systemId] = { visible: visible, reasons: reasons };
  });

  return {
    linkedVillageIds: linkedVillageIds,
    hiddenVillageIds: hiddenVillageIds,
    systemVisibility: systemVisibility,
    counts: {
      systems: Object.keys(systemIndex).length,
      visibleSystems: visibleSystemCount,
      hiddenMissingCoordinateSystems: hiddenMissingCoordinateSystems,
      hiddenWaterworksVillagesWithoutSystem: Object.keys(hiddenVillageIds).length
    }
  };
}

// ============================================================================
// JSON-safe record builders
// ============================================================================

function mgmtDataJsonSafeValue_(value) {
  if (value === null || value === undefined) return value === undefined ? null : value;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    const millis = value.getTime();
    if (!isFinite(millis)) {
      throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'พบวันที่/เวลาที่ไม่ถูกต้องในข้อมูลหลัก');
    }
    return value.toISOString();
  }
  if (typeof value === 'number' && !isFinite(value)) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'พบค่าตัวเลขที่ไม่ถูกต้องในข้อมูลหลัก');
  }
  return value;
}

function mgmtDataJsonSafeObject_(object) {
  const output = {};
  Object.keys(object || {}).forEach(function(key) {
    output[key] = mgmtDataJsonSafeValue_(object[key]);
  });
  return output;
}

function mgmtDataSanitizeProcessorGuard_(guard) {
  const source = guard || mgmtEvaluateProcessorGuardLinks_([]);
  return {
    linked: Boolean(source.linked),
    mutable: Boolean(source.mutable),
    status: mgmtNormalizeText_(source.status),
    rawLinkCount: Number(source.rawLinkCount || 0),
    code: mgmtNormalizeText_(source.code),
    reason: mgmtNormalizeText_(source.reason)
  };
}

function mgmtDataBuildSystemRecord_(systemEntry, villageEntry, projection, processorIndex) {
  const object = systemEntry.object;
  const systemId = mgmtNormalizeText_(object.system_id);
  const guard = processorIndex.guardBySystemId[systemId] || mgmtEvaluateProcessorGuardLinks_([]);
  const visibility = projection.systemVisibility[systemId] || { visible: false, reasons: [] };

  const record = mgmtDataJsonSafeObject_(object);
  record.recordVersion = mgmtRecordVersion_(MGMT_DATA.HEADERS.SYSTEMS, systemEntry.row);
  record.publicVisible = Boolean(visibility.visible);
  record.publicSuppressionReasons = visibility.reasons.slice();
  record.processingGuard = mgmtDataSanitizeProcessorGuard_(guard);
  record.managementMutable = guard.mutable === true;
  record.village = mgmtDataJsonSafeObject_(villageEntry.object);
  return record;
}

function mgmtDataBuildVillageRecord_(villageEntry, projection, activeSystemCountByVillage) {
  const object = villageEntry.object;
  const villageId = mgmtNormalizeText_(object.village_id);
  const hidden = Boolean(projection.hiddenVillageIds[villageId]);
  const record = mgmtDataJsonSafeObject_(object);
  record.publicVisible = !hidden;
  record.publicSuppressionReasons = hidden
    ? [MGMT_DATA.PUBLIC_RULE.VILLAGE_NO_LINKED_SYSTEM]
    : [];
  record.linkedActiveSystemCount = Number(activeSystemCountByVillage[villageId] || 0);
  return record;
}

function mgmtDataBuildSourceRecord_(sourceEntry, villageIndex, projection) {
  const object = sourceEntry.object;
  const villageId = mgmtNormalizeText_(object.village_id);
  const hidden = Boolean(projection.hiddenVillageIds[villageId]);
  const record = mgmtDataJsonSafeObject_(object);
  record.publicVisible = !hidden;
  record.publicSuppressionReasons = hidden
    ? [MGMT_DATA.PUBLIC_RULE.SOURCE_VILLAGE_SUPPRESSED]
    : [];
  return record;
}

// ============================================================================
// Snapshot builder
// ============================================================================

function mgmtDataBuildSnapshotLocked_(ss, options) {
  // Resolve any ambiguous hard-delete audit transition before classifying raw links.
  if (typeof mgmtOpsRecoverPreparedDeletesLocked_ === 'function') {
    mgmtOpsRecoverPreparedDeletesLocked_(ss);
  }
  const opts = options || {};
  const includeSources = opts.includeSources !== false;
  const villagesTable = mgmtDataReadExactTable_(ss, MGMT_DATA.SHEETS.VILLAGES, MGMT_DATA.HEADERS.VILLAGES);
  const systemsTable = mgmtDataReadExactTable_(ss, MGMT_DATA.SHEETS.SYSTEMS, MGMT_DATA.HEADERS.SYSTEMS);
  const sourcesTable = includeSources
    ? mgmtDataReadExactTable_(ss, MGMT_DATA.SHEETS.SOURCES, MGMT_DATA.HEADERS.SOURCES)
    : null;

  const villageIndex = mgmtDataBuildUniqueIndex_(villagesTable, 'village_id', MGMT_DATA.SHEETS.VILLAGES);
  const systemIndex = mgmtDataBuildUniqueIndex_(systemsTable, 'system_id', MGMT_DATA.SHEETS.SYSTEMS);
  const sourceIndex = includeSources
    ? mgmtDataBuildUniqueIndex_(sourcesTable, 'source_id', MGMT_DATA.SHEETS.SOURCES)
    : {};

  Object.keys(systemIndex).forEach(function(systemId) {
    const villageId = mgmtNormalizeText_(systemIndex[systemId].object.village_id);
    if (!villageIndex[villageId]) {
      throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'water_systems อ้างถึง village_id ที่ไม่มีอยู่', {
        systemId: systemId, villageId: villageId
      });
    }
  });

  if (includeSources) {
    Object.keys(sourceIndex).forEach(function(sourceId) {
      const villageId = mgmtNormalizeText_(sourceIndex[sourceId].object.village_id);
      if (!villageIndex[villageId]) {
        throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'village_water_sources อ้างถึง village_id ที่ไม่มีอยู่', {
          sourceId: sourceId, villageId: villageId
        });
      }
    });
  }

  const processorIndex = mgmtDataReadRawProcessorIndex_(ss);
  const projection = mgmtDataBuildPublicProjection_(villageIndex, systemIndex);
  const deleteTombstones = mgmtDataBuildCommittedDeleteTombstoneSet_(ss);
  const activeSystemCountByVillage = {};
  Object.keys(systemIndex).forEach(function(systemId) {
    const villageId = mgmtNormalizeText_(systemIndex[systemId].object.village_id);
    activeSystemCountByVillage[villageId] = (activeSystemCountByVillage[villageId] || 0) + 1;
  });

  let orphanRawLinkCount = 0;
  let intentionalDeletedRawLinkCount = 0;
  Object.keys(processorIndex.linksBySystemId).forEach(function(systemId) {
    if (systemIndex[systemId]) return;
    if (deleteTombstones[systemId]) {
      intentionalDeletedRawLinkCount += 1;
      return;
    }
    orphanRawLinkCount += 1;
  });

  return {
    villagesTable: villagesTable,
    systemsTable: systemsTable,
    sourcesTable: sourcesTable,
    villageIndex: villageIndex,
    systemIndex: systemIndex,
    sourceIndex: sourceIndex,
    processorIndex: processorIndex,
    projection: projection,
    deleteTombstones: deleteTombstones,
    activeSystemCountByVillage: activeSystemCountByVillage,
    integrity: {
      orphanRawLinkCount: orphanRawLinkCount,
      intentionalDeletedRawLinkCount: intentionalDeletedRawLinkCount
    }
  };
}

// ============================================================================
// Request parsing + successful-session touch
// ============================================================================

function mgmtDataParseDashboardFilters_(filters) {
  if (filters === undefined || filters === null) return {};
  if (typeof filters !== 'object' || Array.isArray(filters)) {
    throw mgmtError_('VALIDATION_FAILED', 'รูปแบบ filters ไม่ถูกต้อง');
  }
  const unsupported = Object.keys(filters);
  if (unsupported.length > 0) {
    throw mgmtError_('VALIDATION_FAILED', 'Management dashboard filters ต้องทำฝั่ง UI ใน v2', {
      field: unsupported[0], issue: 'UNSUPPORTED_FIELD'
    });
  }
  return {};
}

function mgmtDataTouchSessionAfterSuccessLocked_(ss, rawToken, now) {
  const sessionsTable = mgmtReadExactTable_(
    ss,
    MGMT_CONFIG.SHEETS.SESSIONS,
    MGMT_CONFIG.HEADERS.SESSIONS
  );
  const tokenHash = mgmtSha256Hex_(rawToken);
  const match = mgmtFindSessionByHash_(sessionsTable, tokenHash);
  if (!match) {
    throw mgmtError_('SESSION_INVALID', 'Session ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่');
  }
  if (mgmtNormalizeText_(match.object.revoked_at)) {
    throw mgmtError_('SESSION_REVOKED', 'Session ถูกยกเลิกแล้ว กรุณาเข้าสู่ระบบใหม่');
  }

  const current = now instanceof Date ? now : new Date();
  const timeState = mgmtEvaluateSessionTimeState_(match.object, current.getTime());
  if (!timeState.valid) {
    throw mgmtError_('SESSION_EXPIRED', 'Session หมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่');
  }

  mgmtTouchSessionLocked_(sessionsTable, match, current);
}

function mgmtDataVerifyReadContextLocked_(ss, token, requestId) {
  const verified = mgmtVerifySessionLocked_(ss, token, {
    requestId: requestId,
    touch: false,
    allowPasswordChangeRequired: false,
    permission: MGMT_PERMISSION.VIEW_MANAGEMENT
  });
  mgmtAssertDistrictAssignment_(verified.context);
  return verified;
}

function mgmtDataDistrictVisible_(context, district) {
  return context.role === MGMT_CONFIG.ROLES.ADMIN || context.district === mgmtNormalizeText_(district);
}

// ============================================================================
// Facades — CP-M4
// ============================================================================

function mgmtGetBootstrap(token) {
  const requestId = mgmtNewRequestId_();
  let lock = null;

  try {
    lock = mgmtAcquireScriptLock_();
    const ss = mgmtOpenSpreadsheet_();
    mgmtAssertTimezone_();

    const verified = mgmtDataVerifyReadContextLocked_(ss, token, requestId);
    const permissions = (MGMT_ROLE_PERMISSIONS[verified.context.role] || []).slice();

    const data = {
      user: mgmtSanitizedUser_(verified.user),
      permissions: permissions,
      enumCatalog: JSON.parse(JSON.stringify(MGMT_DATA.ENUM_CATALOG)),
      publicSuppressionInfo: {
        rule: MGMT_DATA.PUBLIC_RULE.ID,
        systemReasonCodes: [
          MGMT_DATA.PUBLIC_RULE.SYSTEM_MISSING_COORDINATE,
          MGMT_DATA.PUBLIC_RULE.SYSTEM_VILLAGE_SUPPRESSED
        ],
        villageReasonCodes: [MGMT_DATA.PUBLIC_RULE.VILLAGE_NO_LINKED_SYSTEM],
        sourceReasonCodes: [MGMT_DATA.PUBLIC_RULE.SOURCE_VILLAGE_SUPPRESSED],
        relationalOrder: 'LINKS_BEFORE_COORDINATE_SUPPRESSION',
        temporaryHide244ServerSide: false
      },
      featureFlags: Object.assign({}, JSON.parse(JSON.stringify(MGMT_DATA.FEATURE_FLAGS)), { technicianDistrictScope: true }),
      dataContractVersion: MGMT_DATA.VERSION,
      session: {
        expiresAt: verified.session.expiresAt,
        idleTimeoutMinutes: verified.session.idleTimeoutMinutes
      }
    };

    mgmtDataTouchSessionAfterSuccessLocked_(ss, token, new Date());
    return mgmtSuccess_(data, requestId);
  } catch (error) {
    mgmtLogSafeFailure_('GET_BOOTSTRAP', requestId, error);
    return mgmtFailureFromException_(error, requestId);
  } finally {
    mgmtReleaseScriptLock_(lock);
  }
}

function mgmtGetDashboardData(token, filters) {
  const requestId = mgmtNewRequestId_();
  let lock = null;
  try {
    lock = mgmtAcquireScriptLock_();
    const ss = mgmtOpenSpreadsheet_();
    mgmtAssertTimezone_();
    const verified = mgmtDataVerifyReadContextLocked_(ss, token, requestId);
    const parsedFilters = mgmtDataParseDashboardFilters_(filters);
    const snapshot = mgmtDataBuildSnapshotLocked_(ss);
    const villages = [];
    const systems = [];
    const sources = [];

    Object.keys(snapshot.villageIndex).forEach(function(villageId) {
      if (!mgmtDataDistrictVisible_(verified.context, snapshot.villageIndex[villageId].object.district)) return;
      villages.push(mgmtDataBuildVillageRecord_(
        snapshot.villageIndex[villageId], snapshot.projection, snapshot.activeSystemCountByVillage
      ));
    });

    let processorBlockedSystemCount = 0;
    let processorLinkedSystemCount = 0;
    let publicSuppressedSystemCount = 0;
    Object.keys(snapshot.systemIndex).forEach(function(systemId) {
      const entry = snapshot.systemIndex[systemId];
      const villageId = mgmtNormalizeText_(entry.object.village_id);
      if (!mgmtDataDistrictVisible_(verified.context, snapshot.villageIndex[villageId].object.district)) return;
      const guard = snapshot.processorIndex.guardBySystemId[systemId] || mgmtEvaluateProcessorGuardLinks_([]);
      const visibility = snapshot.projection.systemVisibility[systemId];
      if (guard.linked) processorLinkedSystemCount += 1;
      if (!guard.mutable) processorBlockedSystemCount += 1;
      if (visibility && !visibility.visible) publicSuppressedSystemCount += 1;
      systems.push(mgmtDataBuildSystemRecord_(
        entry, snapshot.villageIndex[villageId], snapshot.projection, snapshot.processorIndex
      ));
    });

    Object.keys(snapshot.sourceIndex).forEach(function(sourceId) {
      const villageId = mgmtNormalizeText_(snapshot.sourceIndex[sourceId].object.village_id);
      if (!mgmtDataDistrictVisible_(verified.context, snapshot.villageIndex[villageId].object.district)) return;
      sources.push(mgmtDataBuildSourceRecord_(
        snapshot.sourceIndex[sourceId], snapshot.villageIndex, snapshot.projection
      ));
    });

    const publicVisibleSourceCount = sources.filter(function(source) { return source.publicVisible === true; }).length;
    const technicianScope = verified.context.role === MGMT_CONFIG.ROLES.TECHNICIAN;
    const hiddenMissingCoordinateSystems = technicianScope
      ? systems.filter(function(system) { return system.publicSuppressionReasons.indexOf(MGMT_DATA.PUBLIC_RULE.SYSTEM_MISSING_COORDINATE) >= 0; }).length
      : snapshot.projection.counts.hiddenMissingCoordinateSystems;
    const hiddenWaterworksVillagesWithoutSystem = technicianScope
      ? villages.filter(function(village) { return village.publicSuppressionReasons.indexOf(MGMT_DATA.PUBLIC_RULE.VILLAGE_NO_LINKED_SYSTEM) >= 0; }).length
      : snapshot.projection.counts.hiddenWaterworksVillagesWithoutSystem;
    const data = {
      generatedAt: new Date().toISOString(),
      filtersApplied: parsedFilters,
      summary: {
        villages: villages.length,
        systems: systems.length,
        waterSources: sources.length,
        publicVisibleVillages: villages.length - hiddenWaterworksVillagesWithoutSystem,
        publicVisibleSystems: systems.filter(function(system) { return system.publicVisible === true; }).length,
        publicVisibleWaterSources: publicVisibleSourceCount,
        publicSuppressedSystems: publicSuppressedSystemCount,
        missingCoordinateSystems: hiddenMissingCoordinateSystems,
        hiddenWaterworksVillagesWithoutSystem: hiddenWaterworksVillagesWithoutSystem,
        processorLinkedSystems: processorLinkedSystemCount,
        processorBlockedSystems: processorBlockedSystemCount,
        orphanRawLinkCount: technicianScope ? null : snapshot.integrity.orphanRawLinkCount,
        intentionalDeletedRawLinkCount: technicianScope ? null : snapshot.integrity.intentionalDeletedRawLinkCount
      },
      publicProjection: {
        rule: MGMT_DATA.PUBLIC_RULE.ID,
        hiddenMissingCoordinateSystems: hiddenMissingCoordinateSystems,
        hiddenWaterworksVillagesWithoutSystem: hiddenWaterworksVillagesWithoutSystem,
        relationalOrder: 'LINKS_BEFORE_COORDINATE_SUPPRESSION'
      },
      villages: villages,
      waterSystems: systems,
      waterSources: sources
    };

    mgmtDataTouchSessionAfterSuccessLocked_(ss, token, new Date());
    return mgmtSuccess_(data, requestId);
  } catch (error) {
    mgmtLogSafeFailure_('GET_DASHBOARD_DATA', requestId, error);
    return mgmtFailureFromException_(error, requestId);
  } finally {
    mgmtReleaseScriptLock_(lock);
  }
}

function mgmtGetWaterSystem(token, systemId) {
  const requestId = mgmtNewRequestId_();
  let lock = null;
  try {
    const normalizedSystemId = mgmtNormalizeText_(systemId);
    if (!normalizedSystemId) throw mgmtError_('VALIDATION_FAILED', 'กรุณาระบุระบบประปาที่ต้องการดู');
    lock = mgmtAcquireScriptLock_();
    const ss = mgmtOpenSpreadsheet_();
    mgmtAssertTimezone_();
    const verified = mgmtDataVerifyReadContextLocked_(ss, token, requestId);
    const snapshot = mgmtDataBuildSnapshotLocked_(ss, { includeSources: false });
    const entry = snapshot.systemIndex[normalizedSystemId];
    if (!entry) throw mgmtError_('NOT_FOUND', 'ไม่พบระบบประปาที่ต้องการ');
    const villageId = mgmtNormalizeText_(entry.object.village_id);
    mgmtAssertDistrictAccess_(verified.context, snapshot.villageIndex[villageId].object.district);
    const system = mgmtDataBuildSystemRecord_(
      entry, snapshot.villageIndex[villageId], snapshot.projection, snapshot.processorIndex
    );
    mgmtDataTouchSessionAfterSuccessLocked_(ss, token, new Date());
    return mgmtSuccess_({ system: system }, requestId);
  } catch (error) {
    mgmtLogSafeFailure_('GET_WATER_SYSTEM', requestId, error);
    return mgmtFailureFromException_(error, requestId);
  } finally {
    mgmtReleaseScriptLock_(lock);
  }
}

// ============================================================================
// Production HTTP transport — direct GitHub Pages -> Apps Script /exec
// CP-M3 proved this envelope/origin path with 14/14 browser checks.
// ============================================================================

const MGMT_TRANSPORT = Object.freeze({
  VERSION: 2,
  MAX_BODY_CHARS: 65536,
  ACTIONS: Object.freeze({
    PING: 'transport.ping',
    LOGIN: 'auth.login',
    ME: 'auth.me',
    LOGOUT: 'auth.logout',
    CHANGE_PASSWORD: 'auth.changePassword',
    DATA_BOOTSTRAP: 'data.bootstrap',
    DATA_DASHBOARD: 'data.dashboard',
    DATA_WATER_SYSTEM: 'data.waterSystem',
    DATA_UPDATE_WATER_SYSTEM: 'data.updateWaterSystem',
    DATA_DELETE_WATER_SYSTEM: 'data.deleteWaterSystem',
    DATA_ENTITY_HISTORY: 'data.entityHistory',
    TECHNICIANS_LIST: 'technicians.list',
    TECHNICIANS_CREATE: 'technicians.create',
    TECHNICIANS_UPDATE: 'technicians.update',
    TECHNICIANS_DISABLE: 'technicians.disable',
    TECHNICIANS_ENABLE: 'technicians.enable',
    TECHNICIANS_DELETE: 'technicians.delete',
    TECHNICIANS_RESET_PASSWORD: 'technicians.resetPassword'
  })
});

function doPost(e) {
  return mgmtTransportHandlePost_(e);
}

function mgmtTransportHandlePost_(e) {
  const requestId = mgmtNewRequestId_();

  try {
    const envelope = mgmtTransportParsePostEnvelope_(e);
    const result = mgmtTransportRoute_(envelope, requestId);
    return mgmtTransportJsonOutput_(result);
  } catch (error) {
    mgmtLogSafeFailure_('TRANSPORT', requestId, error);
    return mgmtTransportJsonOutput_(mgmtFailureFromException_(error, requestId));
  }
}

function mgmtTransportParsePostEnvelope_(e) {
  if (!e || !e.postData || typeof e.postData.contents !== 'string') {
    throw mgmtError_('VALIDATION_FAILED', 'รูปแบบคำขอไม่ถูกต้อง', {
      field: 'body', issue: 'MISSING_BODY'
    });
  }

  const body = e.postData.contents;
  if (!body || !body.trim()) {
    throw mgmtError_('VALIDATION_FAILED', 'รูปแบบคำขอไม่ถูกต้อง', {
      field: 'body', issue: 'EMPTY_BODY'
    });
  }
  if (body.length > MGMT_TRANSPORT.MAX_BODY_CHARS) {
    throw mgmtError_('VALIDATION_FAILED', 'คำขอมีขนาดใหญ่เกินกว่าที่รองรับ', {
      field: 'body', issue: 'BODY_TOO_LARGE'
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw mgmtError_('VALIDATION_FAILED', 'รูปแบบ JSON ไม่ถูกต้อง', {
      field: 'body', issue: 'INVALID_JSON'
    });
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw mgmtError_('VALIDATION_FAILED', 'รูปแบบคำขอไม่ถูกต้อง', {
      field: 'body', issue: 'OBJECT_REQUIRED'
    });
  }

  const allowedEnvelopeKeys = { version: true, action: true, payload: true };
  Object.keys(parsed).forEach(function(key) {
    if (!allowedEnvelopeKeys[key]) {
      throw mgmtError_('VALIDATION_FAILED', 'รูปแบบคำขอไม่ถูกต้อง', {
        field: key, issue: 'UNSUPPORTED_FIELD'
      });
    }
  });

  if (Number(parsed.version) !== MGMT_TRANSPORT.VERSION) {
    throw mgmtError_('VALIDATION_FAILED', 'เวอร์ชันการเชื่อมต่อไม่รองรับ', {
      field: 'version', issue: 'UNSUPPORTED_VERSION'
    });
  }

  const action = mgmtNormalizeText_(parsed.action);
  if (!action) {
    throw mgmtError_('VALIDATION_FAILED', 'ไม่ได้ระบุคำสั่งที่ต้องการ', {
      field: 'action', issue: 'REQUIRED'
    });
  }

  const payload = parsed.payload === undefined || parsed.payload === null
    ? {}
    : parsed.payload;
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    throw mgmtError_('VALIDATION_FAILED', 'รูปแบบข้อมูลคำขอไม่ถูกต้อง', {
      field: 'payload', issue: 'OBJECT_REQUIRED'
    });
  }

  return { version: MGMT_TRANSPORT.VERSION, action: action, payload: payload };
}

function mgmtTransportAssertPayloadKeys_(payload, allowedKeys) {
  const allowed = {};
  (allowedKeys || []).forEach(function(key) { allowed[key] = true; });
  Object.keys(payload || {}).forEach(function(key) {
    if (!allowed[key]) {
      throw mgmtError_('VALIDATION_FAILED', 'รูปแบบข้อมูลคำขอไม่ถูกต้อง', {
        field: key, issue: 'UNSUPPORTED_FIELD'
      });
    }
  });
}

function mgmtTransportRoute_(envelope, requestId) {
  const action = envelope.action;
  const payload = envelope.payload || {};

  if (action === MGMT_TRANSPORT.ACTIONS.PING) {
    mgmtTransportAssertPayloadKeys_(payload, []);
    return mgmtSuccess_({
      transportVersion: MGMT_TRANSPORT.VERSION,
      transport: 'APPS_SCRIPT_CONTENT_SERVICE',
      authenticated: false,
      managementReadVersion: MGMT_DATA.VERSION
    }, requestId);
  }

  if (action === MGMT_TRANSPORT.ACTIONS.LOGIN) {
    mgmtTransportAssertPayloadKeys_(payload, ['username', 'password', 'clientInfo']);
    return mgmtLogin({
      username: typeof payload.username === 'string' ? payload.username : '',
      password: typeof payload.password === 'string' ? payload.password : '',
      clientInfo: typeof payload.clientInfo === 'string' ? payload.clientInfo : ''
    });
  }

  if (action === MGMT_TRANSPORT.ACTIONS.ME) {
    mgmtTransportAssertPayloadKeys_(payload, ['token']);
    return mgmtMe(typeof payload.token === 'string' ? payload.token : '');
  }

  if (action === MGMT_TRANSPORT.ACTIONS.LOGOUT) {
    mgmtTransportAssertPayloadKeys_(payload, ['token']);
    return mgmtLogout(typeof payload.token === 'string' ? payload.token : '');
  }

  if (action === MGMT_TRANSPORT.ACTIONS.CHANGE_PASSWORD) {
    mgmtTransportAssertPayloadKeys_(payload, ['token', 'request']);
    return mgmtChangeOwnPassword(
      typeof payload.token === 'string' ? payload.token : '',
      payload.request === undefined ? {} : payload.request
    );
  }

  if (action === MGMT_TRANSPORT.ACTIONS.DATA_BOOTSTRAP) {
    mgmtTransportAssertPayloadKeys_(payload, ['token']);
    return mgmtGetBootstrap(typeof payload.token === 'string' ? payload.token : '');
  }

  if (action === MGMT_TRANSPORT.ACTIONS.DATA_DASHBOARD) {
    mgmtTransportAssertPayloadKeys_(payload, ['token', 'filters']);
    return mgmtGetDashboardData(
      typeof payload.token === 'string' ? payload.token : '',
      payload.filters === undefined ? {} : payload.filters
    );
  }

  if (action === MGMT_TRANSPORT.ACTIONS.DATA_WATER_SYSTEM) {
    mgmtTransportAssertPayloadKeys_(payload, ['token', 'systemId']);
    return mgmtGetWaterSystem(
      typeof payload.token === 'string' ? payload.token : '',
      typeof payload.systemId === 'string' ? payload.systemId : ''
    );
  }


  if (action === MGMT_TRANSPORT.ACTIONS.DATA_UPDATE_WATER_SYSTEM) {
    mgmtTransportAssertPayloadKeys_(payload, ['token', 'request']);
    return mgmtUpdateWaterSystem(
      typeof payload.token === 'string' ? payload.token : '',
      payload.request === undefined ? {} : payload.request
    );
  }

  if (action === MGMT_TRANSPORT.ACTIONS.DATA_DELETE_WATER_SYSTEM) {
    mgmtTransportAssertPayloadKeys_(payload, ['token', 'request']);
    return mgmtDeleteWaterSystem(
      typeof payload.token === 'string' ? payload.token : '',
      payload.request === undefined ? {} : payload.request
    );
  }

  if (action === MGMT_TRANSPORT.ACTIONS.DATA_ENTITY_HISTORY) {
    mgmtTransportAssertPayloadKeys_(payload, ['token', 'request']);
    return mgmtGetEntityHistory(
      typeof payload.token === 'string' ? payload.token : '',
      payload.request === undefined ? {} : payload.request
    );
  }

  if (action === MGMT_TRANSPORT.ACTIONS.TECHNICIANS_LIST) {
    mgmtTransportAssertPayloadKeys_(payload, ['token']);
    return mgmtListTechnicians(typeof payload.token === 'string' ? payload.token : '');
  }

  if (action === MGMT_TRANSPORT.ACTIONS.TECHNICIANS_CREATE) {
    mgmtTransportAssertPayloadKeys_(payload, ['token', 'request']);
    return mgmtCreateTechnician(typeof payload.token === 'string' ? payload.token : '', payload.request || {});
  }

  if (action === MGMT_TRANSPORT.ACTIONS.TECHNICIANS_UPDATE) {
    mgmtTransportAssertPayloadKeys_(payload, ['token', 'request']);
    return mgmtUpdateTechnician(typeof payload.token === 'string' ? payload.token : '', payload.request || {});
  }

  if (action === MGMT_TRANSPORT.ACTIONS.TECHNICIANS_DISABLE) {
    mgmtTransportAssertPayloadKeys_(payload, ['token', 'request']);
    return mgmtDisableTechnician(typeof payload.token === 'string' ? payload.token : '', payload.request || {});
  }

  if (action === MGMT_TRANSPORT.ACTIONS.TECHNICIANS_ENABLE) {
    mgmtTransportAssertPayloadKeys_(payload, ['token', 'request']);
    return mgmtEnableTechnician(typeof payload.token === 'string' ? payload.token : '', payload.request || {});
  }

  if (action === MGMT_TRANSPORT.ACTIONS.TECHNICIANS_DELETE) {
    mgmtTransportAssertPayloadKeys_(payload, ['token', 'request']);
    return mgmtDeleteTechnician(typeof payload.token === 'string' ? payload.token : '', payload.request || {});
  }

  if (action === MGMT_TRANSPORT.ACTIONS.TECHNICIANS_RESET_PASSWORD) {
    mgmtTransportAssertPayloadKeys_(payload, ['token', 'request']);
    return mgmtResetTechnicianPassword(typeof payload.token === 'string' ? payload.token : '', payload.request || {});
  }

  throw mgmtError_('VALIDATION_FAILED', 'ไม่รองรับคำสั่งนี้', {
    field: 'action', issue: 'UNSUPPORTED_ACTION'
  });
}

function mgmtTransportJsonOutput_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

