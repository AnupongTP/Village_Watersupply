/**
 * Village Water Supply — Management Operations v2
 * Hard delete + entity history + own-password change + ADMIN technician accounts.
 *
 * Scope decisions locked by user:
 * - No Management CREATE water system. Feature 3 remains the only add form.
 * - No user-facing rollback.
 * - Water-system delete is a physical water_systems row delete.
 * - audit_log is the durable deletion history/tombstone.
 * - record_control is deprecated and not read/written by v2.
 */

const MGMT_OPS = Object.freeze({
  VERSION: 2,
  ENTITY_WATER_SYSTEM: 'WATER_SYSTEM',
  ENTITY_USER: 'USER',
  ACTION_SYSTEM_DELETE: 'SYSTEM_DELETE',
  ACTION_USER_PASSWORD_CHANGE: 'USER_PASSWORD_CHANGE',
  ACTION_TECH_CREATE: 'TECHNICIAN_CREATE',
  ACTION_TECH_UPDATE: 'TECHNICIAN_UPDATE',
  ACTION_TECH_DISABLE: 'TECHNICIAN_DISABLE',
  ACTION_TECH_ENABLE: 'TECHNICIAN_ENABLE',
  ACTION_TECH_DELETE: 'TECHNICIAN_DELETE',
  ACTION_TECH_PASSWORD_RESET: 'TECHNICIAN_PASSWORD_RESET',
  USER_ID_PREFIX: 'USR-',
  HISTORY_DEFAULT_LIMIT: 100,
  HISTORY_MAX_LIMIT: 300
});

// ============================================================================
// Generic audit helpers
// ============================================================================

function mgmtOpsAuditText_(value) {
  return mgmtCanonicalJson_(mgmtSanitizeForAudit_(value));
}

function mgmtOpsAppendPreparedAuditLocked_(ss, context, spec) {
  const auditTable = mgmtMutationReadAuditTable_(ss);
  const now = spec.now instanceof Date ? spec.now : new Date();
  const auditId = mgmtMutationNewAuditId_();
  const transactionId = mgmtMutationNewTransactionId_();
  const rowObject = {
    audit_id: auditId,
    transaction_id: transactionId,
    timestamp: now,
    user_id: mgmtNormalizeText_(context && context.userId),
    username_snapshot: mgmtNormalizeText_(context && context.username),
    role_snapshot: mgmtNormalizeUpper_(context && context.role),
    action: mgmtNormalizeUpper_(spec.action),
    entity_type: mgmtNormalizeUpper_(spec.entityType),
    entity_id: mgmtNormalizeText_(spec.entityId),
    sheet_name: mgmtNormalizeText_(spec.sheetName),
    before_json: mgmtOpsAuditText_(spec.before === undefined ? null : spec.before),
    after_json: mgmtOpsAuditText_(spec.after === undefined ? null : spec.after),
    changed_fields_json: mgmtCanonicalJson_((spec.changedFields || []).slice()),
    reason: mgmtNormalizeText_(spec.reason),
    rollback_of_audit_id: '',
    client_info: mgmtClientInfo_(spec.clientInfo || ''),
    audit_status: MGMT_MUTATION.AUDIT.PREPARED,
    committed_at: '',
    error_code: ''
  };

  if (!rowObject.user_id || !rowObject.username_snapshot || !rowObject.role_snapshot ||
      !rowObject.action || !rowObject.entity_type || !rowObject.entity_id || !rowObject.sheet_name) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'Audit context ไม่ครบถ้วน');
  }

  const row = mgmtMutationObjectToRow_(auditTable.headers, rowObject);
  const sheetRow = auditTable.sheet.getLastRow() + 1;
  auditTable.sheet.getRange(sheetRow, 1, 1, row.length).setValues([row]);
  SpreadsheetApp.flush();

  const fresh = mgmtMutationRefreshAuditTableLocked_(auditTable);
  const identity = {
    auditId: auditId,
    transactionId: transactionId,
    entityId: rowObject.entity_id,
    action: rowObject.action,
    sheetName: rowObject.sheet_name
  };
  const persisted = mgmtMutationFindAuditEntryByIdentityLocked_(fresh, identity);
  if (mgmtNormalizeUpper_(persisted.object.audit_status) !== MGMT_MUTATION.AUDIT.PREPARED ||
      !mgmtMutationIsBlank_(persisted.object.committed_at) ||
      !mgmtMutationIsBlank_(persisted.object.error_code)) {
    throw mgmtError_('MUTATION_FAILED', 'สร้าง PREPARED audit ไม่สำเร็จ');
  }

  return identity;
}

function mgmtOpsCommitAuditLocked_(ss, identity, now) {
  const auditTable = mgmtMutationReadAuditTable_(ss);
  mgmtMutationSetAuditStateLocked_(
    auditTable,
    identity,
    MGMT_MUTATION.AUDIT.COMMITTED,
    now instanceof Date ? now : new Date(),
    ''
  );
  return true;
}

function mgmtOpsFailAuditBestEffortLocked_(ss, identity, errorCode) {
  try {
    const auditTable = mgmtMutationReadAuditTable_(ss);
    mgmtMutationSetAuditStateLocked_(
      auditTable,
      identity,
      MGMT_MUTATION.AUDIT.FAILED,
      '',
      mgmtNormalizeText_(errorCode) || 'MUTATION_FAILED'
    );
    return true;
  } catch (error) {
    mgmtLogSafeFailure_('AUDIT_FAIL_TRANSITION', mgmtNewRequestId_(), error);
    return false;
  }
}

function mgmtOpsTouchSessionAfterCommittedBestEffort_(ss, rawToken, requestId, scope) {
  try {
    mgmtDataTouchSessionAfterSuccessLocked_(ss, rawToken, new Date());
    return true;
  } catch (error) {
    // Business mutation is already COMMITTED. A secondary last_activity_at write
    // must never turn a committed mutation into a client-visible failure.
    mgmtLogSafeFailure_(mgmtNormalizeText_(scope) || 'MGMT_OPS_SESSION_TOUCH', requestId, error);
    return false;
  }
}

function mgmtOpsParseAuditJson_(text, auditId, field) {
  const value = mgmtNormalizeText_(text);
  if (!value) throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'Audit snapshot ว่างผิดสัญญา', { auditId: auditId, field: field });
  try { return JSON.parse(value); }
  catch (error) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'Audit snapshot JSON ไม่ถูกต้อง', { auditId: auditId, field: field });
  }
}

// ============================================================================
// Hard-delete PREPARED recovery
// ============================================================================

function mgmtOpsPreparedDeleteItemsLocked_(ss) {
  const audit = mgmtMutationReadAuditTable_(ss);
  const items = [];
  audit.rows.forEach(function(row, offset) {
    const object = mgmtRowObject_(audit.headers, row);
    if (mgmtNormalizeUpper_(object.action) !== MGMT_OPS.ACTION_SYSTEM_DELETE) return;
    if (mgmtNormalizeUpper_(object.entity_type) !== MGMT_OPS.ENTITY_WATER_SYSTEM) return;
    if (mgmtNormalizeUpper_(object.audit_status) !== MGMT_MUTATION.AUDIT.PREPARED) return;
    items.push({ sheetRow: offset + 2, object: object });
  });
  return items;
}

function mgmtOpsRecoverPreparedDeletesLocked_(ss) {
  const items = mgmtOpsPreparedDeleteItemsLocked_(ss);
  if (items.length === 0) return { recovered: 0 };

  const systems = mgmtDataReadExactTable_(ss, MGMT_DATA.SHEETS.SYSTEMS, MGMT_DATA.HEADERS.SYSTEMS);
  const index = mgmtDataBuildUniqueIndex_(systems, 'system_id', MGMT_DATA.SHEETS.SYSTEMS);
  let recovered = 0;

  items.forEach(function(item) {
    const object = item.object;
    const auditId = mgmtNormalizeText_(object.audit_id);
    const entityId = mgmtNormalizeText_(object.entity_id);
    const identity = mgmtMutationAuditIdentityFromObject_(object);
    const before = mgmtOpsParseAuditJson_(object.before_json, auditId, 'before_json');
    const after = mgmtOpsParseAuditJson_(object.after_json, auditId, 'after_json');
    if (after !== null || !before || mgmtNormalizeText_(before.system_id) !== entityId) {
      throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'PREPARED delete audit snapshot ไม่ตรงสัญญา', { auditId: auditId });
    }

    const current = index[entityId];
    if (!current) {
      mgmtOpsCommitAuditLocked_(ss, identity, new Date());
      recovered += 1;
      return;
    }

    const currentObject = mgmtDataJsonSafeObject_(current.object);
    if (mgmtCanonicalJson_(currentObject) === mgmtCanonicalJson_(mgmtSanitizeForAudit_(before))) {
      mgmtMutationSetAuditStateLocked_(
        mgmtMutationReadAuditTable_(ss), identity, MGMT_MUTATION.AUDIT.FAILED, '', 'RECOVERED_NO_DELETE'
      );
      recovered += 1;
      return;
    }

    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'ไม่สามารถสรุป PREPARED hard delete ได้อย่าง deterministic', {
      auditId: auditId,
      systemId: entityId
    });
  });

  return { recovered: recovered };
}

// ============================================================================
// Hard delete water system
// ============================================================================

function mgmtOpsValidateDeleteRequest_(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw mgmtError_('VALIDATION_FAILED', 'รูปแบบคำขอลบไม่ถูกต้อง');
  }
  const allowed = { systemId: true, expectedVersion: true, reason: true, clientInfo: true };
  Object.keys(request).forEach(function(key) {
    if (!allowed[key]) throw mgmtError_('VALIDATION_FAILED', 'พบ field ที่ request ไม่รองรับ', { field: key });
  });
  const systemId = mgmtNormalizeText_(request.systemId);
  const expectedVersion = mgmtNormalizeText_(request.expectedVersion);
  const reason = mgmtNormalizeText_(request.reason);
  if (!systemId) throw mgmtError_('VALIDATION_FAILED', 'กรุณาระบุ systemId');
  if (!/^[0-9a-f]{64}$/.test(expectedVersion)) throw mgmtError_('VALIDATION_FAILED', 'expectedVersion ไม่ถูกต้อง');
  if (!reason) throw mgmtError_('VALIDATION_FAILED', 'กรุณาระบุเหตุผลในการลบ');
  return { systemId: systemId, expectedVersion: expectedVersion, reason: reason, clientInfo: mgmtClientInfo_(request.clientInfo || '') };
}

function mgmtOpsRestoreDeletedSystemRowLocked_(ss, originalSheetRow, beforeRow) {
  try {
    const systems = mgmtDataReadExactTable_(ss, MGMT_DATA.SHEETS.SYSTEMS, MGMT_DATA.HEADERS.SYSTEMS);
    const systemId = mgmtNormalizeText_(beforeRow[systems.headerMap.system_id]);
    const existing = Object.keys(mgmtDataBuildUniqueIndex_(systems, 'system_id', MGMT_DATA.SHEETS.SYSTEMS));
    if (existing.indexOf(systemId) >= 0) {
      const target = mgmtMutationReadSystemTargetLocked_(ss, systemId);
      const beforeVersion = mgmtRecordVersion_(systems.headers, beforeRow);
      return mgmtSecureStringEquals_(target.version, beforeVersion);
    }

    const sheet = systems.sheet;
    const currentLastRow = sheet.getLastRow();
    // Restore at the original position when it still exists; otherwise append at
    // the logical end. Never write to an uninserted far-away row if a direct
    // Sheet edit changed row count while the Apps Script transaction was active.
    const restoreSheetRow = Math.max(2, Math.min(Number(originalSheetRow || 2), currentLastRow + 1));
    if (restoreSheetRow <= currentLastRow) sheet.insertRowBefore(restoreSheetRow);
    else sheet.insertRowAfter(currentLastRow);
    sheet.getRange(restoreSheetRow, 1, 1, beforeRow.length).setValues([beforeRow]);
    SpreadsheetApp.flush();

    const restored = mgmtMutationReadSystemTargetLocked_(ss, systemId);
    const expectedVersion = mgmtRecordVersion_(restored.systemsTable.headers, beforeRow);
    return mgmtSecureStringEquals_(restored.version, expectedVersion);
  } catch (error) {
    return false;
  }
}

function mgmtOpsInternalDeleteWaterSystemLocked_(ss, context, request, options) {
  const opts = options || {};
  const parsed = mgmtOpsValidateDeleteRequest_(request);
  mgmtAssertPermission_(context, MGMT_PERMISSION.DELETE_SYSTEM);
  mgmtAssertDistrictAssignment_(context);
  if (opts.skipTimezoneCheck !== true) mgmtAssertTimezone_();

  mgmtOpsRecoverPreparedDeletesLocked_(ss);
  mgmtAssertProcessorMutationReady_(ss, parsed.systemId);

  let target = mgmtMutationReadSystemTargetLocked_(ss, parsed.systemId);
  mgmtOpsAssertSystemDistrictLocked_(ss, context, target.systemEntry.object);
  mgmtMutationAssertTargetRowHasNoFormulas_(target.systemsTable, target.systemEntry.sheetRow, parsed.systemId);
  if (!mgmtSecureStringEquals_(target.version, parsed.expectedVersion)) {
    throw mgmtError_('CONFLICT', 'ข้อมูลถูกแก้ไขหลังจากที่คุณเปิดรายการนี้ กรุณาโหลดข้อมูลล่าสุดก่อนลบ', { systemId: parsed.systemId });
  }

  const beforeRow = target.systemEntry.row.slice();
  const beforeObject = mgmtDataJsonSafeObject_(target.systemEntry.object);
  const originalSheetRow = target.systemEntry.sheetRow;
  const beforeRowCount = target.systemsTable.rows.length;
  const prepared = mgmtOpsAppendPreparedAuditLocked_(ss, context, {
    action: MGMT_OPS.ACTION_SYSTEM_DELETE,
    entityType: MGMT_OPS.ENTITY_WATER_SYSTEM,
    entityId: parsed.systemId,
    sheetName: MGMT_DATA.SHEETS.SYSTEMS,
    before: beforeObject,
    after: null,
    changedFields: ['__deleted__'],
    reason: parsed.reason,
    clientInfo: parsed.clientInfo,
    now: opts.now instanceof Date ? opts.now : new Date()
  });

  let deleteAttempted = false;
  try {
    // Minimize direct-Sheet race window: re-locate by ID immediately before delete.
    mgmtAssertProcessorMutationReady_(ss, parsed.systemId);
    target = mgmtMutationReadSystemTargetLocked_(ss, parsed.systemId);
    mgmtOpsAssertSystemDistrictLocked_(ss, context, target.systemEntry.object);
    mgmtMutationAssertTargetRowHasNoFormulas_(target.systemsTable, target.systemEntry.sheetRow, parsed.systemId);
    if (!mgmtSecureStringEquals_(target.version, parsed.expectedVersion)) {
      throw mgmtError_('CONFLICT', 'ข้อมูลเปลี่ยนระหว่างเตรียมการลบ กรุณาโหลดข้อมูลล่าสุดก่อนลบ', { systemId: parsed.systemId });
    }

    deleteAttempted = true;
    target.systemsTable.sheet.deleteRow(target.systemEntry.sheetRow);
    SpreadsheetApp.flush();
    const afterSystems = mgmtDataReadExactTable_(ss, MGMT_DATA.SHEETS.SYSTEMS, MGMT_DATA.HEADERS.SYSTEMS);
    const afterIndex = mgmtDataBuildUniqueIndex_(afterSystems, 'system_id', MGMT_DATA.SHEETS.SYSTEMS);
    if (afterIndex[parsed.systemId] || afterSystems.rows.length !== beforeRowCount - 1) {
      throw mgmtError_('MUTATION_FAILED', 'ตรวจสอบผลการลบระบบประปาไม่ผ่าน');
    }

    mgmtOpsCommitAuditLocked_(ss, prepared, opts.commitNow instanceof Date ? opts.commitNow : new Date());
    return {
      deleted: true,
      systemId: parsed.systemId,
      auditId: prepared.auditId,
      transactionId: prepared.transactionId
    };
  } catch (error) {
    if (error && error.mgmtCode === 'AUDIT_COMMIT_FAILED') throw error;

    let restored = true;
    if (deleteAttempted) restored = mgmtOpsRestoreDeletedSystemRowLocked_(ss, originalSheetRow, beforeRow);
    mgmtOpsFailAuditBestEffortLocked_(ss, prepared, restored ? (error && error.mgmtCode ? error.mgmtCode : 'MUTATION_FAILED') : 'COMPENSATION_FAILED');
    if (!restored) throw mgmtError_('MUTATION_FAILED', 'ลบไม่สำเร็จและไม่สามารถยืนยันการคืนแถวเดิมได้');
    if (error && error.mgmtCode) throw error;
    throw mgmtError_('MUTATION_FAILED', 'ไม่สามารถลบระบบประปาได้');
  }
}

function mgmtDeleteWaterSystem(token, request) {
  const requestId = mgmtNewRequestId_();
  let lock = null;
  try {
    lock = mgmtAcquireScriptLock_();
    const ss = mgmtOpenSpreadsheet_();
    const verified = mgmtVerifySessionLocked_(ss, token, {
      requestId: requestId,
      touch: false,
      allowPasswordChangeRequired: false,
      permission: MGMT_PERMISSION.DELETE_SYSTEM
    });
    const data = mgmtOpsInternalDeleteWaterSystemLocked_(ss, verified.context, request, {});
    try { mgmtDataTouchSessionAfterSuccessLocked_(ss, token, new Date()); }
    catch (touchError) { mgmtLogSafeFailure_('DELETE_WATER_SYSTEM_SESSION_TOUCH', requestId, touchError); }
    return mgmtSuccess_(data, requestId);
  } catch (error) {
    mgmtLogSafeFailure_('DELETE_WATER_SYSTEM', requestId, error);
    return mgmtFailureFromException_(error, requestId);
  } finally { mgmtReleaseScriptLock_(lock); }
}

// ============================================================================
// Entity history
// ============================================================================

function mgmtGetEntityHistory(token, request) {
  const requestId = mgmtNewRequestId_();
  let lock = null;
  try {
    const input = request && typeof request === 'object' && !Array.isArray(request) ? request : {};
    const allowed = { entityType: true, entityId: true, limit: true };
    Object.keys(input).forEach(function(key) {
      if (!allowed[key]) throw mgmtError_('VALIDATION_FAILED', 'พบ field ที่ request ไม่รองรับ', { field: key });
    });
    const entityType = mgmtNormalizeUpper_(input.entityType || MGMT_OPS.ENTITY_WATER_SYSTEM);
    const entityId = mgmtNormalizeText_(input.entityId);
    const limit = input.limit === undefined ? MGMT_OPS.HISTORY_DEFAULT_LIMIT : Number(input.limit);
    if (!entityId) throw mgmtError_('VALIDATION_FAILED', 'กรุณาระบุ entityId');
    if (!Number.isInteger(limit) || limit < 1 || limit > MGMT_OPS.HISTORY_MAX_LIMIT) {
      throw mgmtError_('VALIDATION_FAILED', 'limit ไม่ถูกต้อง');
    }

    lock = mgmtAcquireScriptLock_();
    const ss = mgmtOpenSpreadsheet_();
    const verified = mgmtVerifySessionLocked_(ss, token, {
      requestId: requestId, touch: false, allowPasswordChangeRequired: false,
      permission: MGMT_PERMISSION.VIEW_ENTITY_HISTORY
    });
    if (entityType !== MGMT_OPS.ENTITY_WATER_SYSTEM && verified.context.role !== MGMT_CONFIG.ROLES.ADMIN) {
      throw mgmtError_('FORBIDDEN', 'คุณไม่มีสิทธิ์ดูประวัติ entity ประเภทนี้');
    }
    mgmtAssertDistrictAssignment_(verified.context);

    mgmtOpsRecoverPreparedDeletesLocked_(ss);
    const audit = mgmtMutationReadAuditTable_(ss);
    const items = [];
    audit.rows.forEach(function(row) {
      const object = mgmtRowObject_(audit.headers, row);
      if (mgmtNormalizeUpper_(object.entity_type) !== entityType) return;
      if (mgmtNormalizeText_(object.entity_id) !== entityId) return;
      items.push({
        auditId: mgmtNormalizeText_(object.audit_id),
        transactionId: mgmtNormalizeText_(object.transaction_id),
        timestamp: mgmtDateIsoOrBlank_(object.timestamp),
        userId: mgmtNormalizeText_(object.user_id),
        username: mgmtNormalizeText_(object.username_snapshot),
        role: mgmtNormalizeUpper_(object.role_snapshot),
        action: mgmtNormalizeUpper_(object.action),
        entityType: entityType,
        entityId: entityId,
        sheetName: mgmtNormalizeText_(object.sheet_name),
        before: mgmtOpsParseAuditJson_(object.before_json, object.audit_id, 'before_json'),
        after: mgmtOpsParseAuditJson_(object.after_json, object.audit_id, 'after_json'),
        changedFields: mgmtOpsParseAuditJson_(object.changed_fields_json, object.audit_id, 'changed_fields_json'),
        reason: mgmtNormalizeText_(object.reason),
        clientInfo: mgmtClientInfo_(object.client_info),
        status: mgmtNormalizeUpper_(object.audit_status),
        committedAt: mgmtDateIsoOrBlank_(object.committed_at),
        errorCode: mgmtNormalizeText_(object.error_code)
      });
    });
    if (verified.context.role === MGMT_CONFIG.ROLES.TECHNICIAN && items.length) {
      const villageIds = [];
      items.forEach(function(item) {
        [item.before, item.after].forEach(function(version) {
          const villageId = version && mgmtNormalizeText_(version.village_id);
          if (villageId) villageIds.push(villageId);
        });
      });
      if (!villageIds.length) throw mgmtError_('FORBIDDEN', 'ไม่สามารถยืนยันอำเภอของประวัติรายการนี้');
      const villages = mgmtDataReadExactTable_(ss, MGMT_DATA.SHEETS.VILLAGES, MGMT_DATA.HEADERS.VILLAGES);
      villageIds.forEach(function(villageId) {
        const matches = villages.rows.filter(function(row) { return mgmtNormalizeText_(row[villages.headerMap.village_id]) === villageId; });
        if (matches.length !== 1) throw mgmtError_('FORBIDDEN', 'ไม่สามารถยืนยันอำเภอของประวัติรายการนี้');
        mgmtAssertDistrictAccess_(verified.context, matches[0][villages.headerMap.district]);
      });
    }
    items.sort(function(a, b) { return String(b.timestamp).localeCompare(String(a.timestamp)); });
    mgmtDataTouchSessionAfterSuccessLocked_(ss, token, new Date());
    return mgmtSuccess_({ history: items.slice(0, limit) }, requestId);
  } catch (error) {
    mgmtLogSafeFailure_('GET_ENTITY_HISTORY', requestId, error);
    return mgmtFailureFromException_(error, requestId);
  } finally { mgmtReleaseScriptLock_(lock); }
}

// ============================================================================
// User snapshots / prepared recovery
// ============================================================================

function mgmtOpsSanitizedUserObjectFromRow_(usersTable, row) {
  return mgmtSanitizeForAudit_(mgmtRowObject_(usersTable.headers, row));
}

function mgmtOpsUserView_(usersTable, user) {
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName,
    district: user.district,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    failedLoginCount: user.failedLoginCount,
    lockedUntil: mgmtDateIsoOrBlank_(user.object.locked_until),
    lastLoginAt: mgmtDateIsoOrBlank_(user.object.last_login_at),
    createdAt: mgmtDateIsoOrBlank_(user.object.created_at),
    updatedAt: mgmtDateIsoOrBlank_(user.object.updated_at),
    deletedAt: mgmtDateIsoOrBlank_(user.object.deleted_at),
    recordVersion: mgmtRecordVersion_(usersTable.headers, user.row)
  };
}

function mgmtOpsAssertTechnicianUser_(user) {
  if (!user || user.role !== MGMT_CONFIG.ROLES.TECHNICIAN) {
    throw mgmtError_('FORBIDDEN', 'จัดการได้เฉพาะบัญชี TECHNICIAN');
  }
  return true;
}

function mgmtOpsPreparedUserAuditsLocked_(ss, userId) {
  const audit = mgmtMutationReadAuditTable_(ss);
  const items = [];
  audit.rows.forEach(function(row) {
    const object = mgmtRowObject_(audit.headers, row);
    if (mgmtNormalizeUpper_(object.entity_type) !== MGMT_OPS.ENTITY_USER) return;
    if (mgmtNormalizeText_(object.entity_id) !== userId) return;
    if (mgmtNormalizeUpper_(object.audit_status) !== MGMT_MUTATION.AUDIT.PREPARED) return;
    items.push(object);
  });
  return items;
}

function mgmtOpsRecoverPreparedUserAuditsLocked_(ss, userId) {
  const items = mgmtOpsPreparedUserAuditsLocked_(ss, userId);
  if (!items.length) return { recovered: 0 };
  let recovered = 0;

  items.forEach(function(object) {
    const auditId = mgmtNormalizeText_(object.audit_id);
    const before = mgmtOpsParseAuditJson_(object.before_json, auditId, 'before_json');
    const after = mgmtOpsParseAuditJson_(object.after_json, auditId, 'after_json');
    const identity = mgmtMutationAuditIdentityFromObject_(object);
    let current = null;
    try {
      const usersTable = mgmtReadUsersTable_(ss);
      usersTable.rows.forEach(function(row, offset) {
        if (mgmtNormalizeText_(row[usersTable.headerMap.user_id]) === userId) {
          if (current) throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'พบ user_id ซ้ำ');
          current = mgmtOpsSanitizedUserObjectFromRow_(usersTable, row);
        }
      });
    } catch (error) { throw error; }

    if (mgmtCanonicalJson_(current) === mgmtCanonicalJson_(after)) {
      mgmtOpsCommitAuditLocked_(ss, identity, new Date());
      recovered += 1;
      return;
    }
    if (mgmtCanonicalJson_(current) === mgmtCanonicalJson_(before)) {
      mgmtMutationSetAuditStateLocked_(mgmtMutationReadAuditTable_(ss), identity, MGMT_MUTATION.AUDIT.FAILED, '', 'RECOVERED_NO_MUTATION');
      recovered += 1;
      return;
    }
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'ไม่สามารถสรุป PREPARED user mutation ได้อย่าง deterministic', { auditId: auditId, userId: userId });
  });
  return { recovered: recovered };
}

function mgmtOpsRecoverAllPreparedUserAuditsLocked_(ss) {
  const audit = mgmtMutationReadAuditTable_(ss);
  const ids = {};
  audit.rows.forEach(function(row) {
    const object = mgmtRowObject_(audit.headers, row);
    if (mgmtNormalizeUpper_(object.entity_type) !== MGMT_OPS.ENTITY_USER) return;
    if (mgmtNormalizeUpper_(object.audit_status) !== MGMT_MUTATION.AUDIT.PREPARED) return;
    const id = mgmtNormalizeText_(object.entity_id);
    if (id) ids[id] = true;
  });
  let recovered = 0;
  Object.keys(ids).forEach(function(id) {
    recovered += Number(mgmtOpsRecoverPreparedUserAuditsLocked_(ss, id).recovered || 0);
  });
  return { recovered: recovered };
}

function mgmtOpsFindUserByIdForAdminLocked_(ss, userId) {
  const normalized = mgmtNormalizeText_(userId);
  if (!normalized) throw mgmtError_('VALIDATION_FAILED', 'กรุณาระบุ userId');
  const usersTable = mgmtReadUsersTable_(ss);
  const matches = [];
  usersTable.rows.forEach(function(row, offset) {
    if (mgmtNormalizeText_(row[usersTable.headerMap.user_id]) === normalized) {
      matches.push(mgmtParseUserMatch_(usersTable, offset + 2, row));
    }
  });
  if (matches.length === 0) throw mgmtError_('NOT_FOUND', 'ไม่พบบัญชีช่าง');
  if (matches.length > 1) throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'พบ user_id ซ้ำ');
  mgmtOpsAssertTechnicianUser_(matches[0]);
  return { usersTable: usersTable, user: matches[0] };
}

function mgmtOpsValidateExpectedUserVersion_(usersTable, user, expectedVersion) {
  const expected = mgmtNormalizeText_(expectedVersion);
  if (!/^[0-9a-f]{64}$/.test(expected)) throw mgmtError_('VALIDATION_FAILED', 'expectedVersion ไม่ถูกต้อง');
  const current = mgmtRecordVersion_(usersTable.headers, user.row);
  if (!mgmtSecureStringEquals_(current, expected)) {
    throw mgmtError_('CONFLICT', 'บัญชีถูกแก้ไขหลังจากที่เปิดรายการ กรุณาโหลดข้อมูลล่าสุด');
  }
  return current;
}

function mgmtOpsChangedUserFields_(beforeObject, afterObject) {
  const keys = {};
  Object.keys(beforeObject || {}).forEach(function(k) { keys[k] = true; });
  Object.keys(afterObject || {}).forEach(function(k) { keys[k] = true; });
  return Object.keys(keys).filter(function(k) {
    if (k === 'updated_at' || k === 'updated_by') return false;
    return mgmtCanonicalJson_(beforeObject ? beforeObject[k] : null) !== mgmtCanonicalJson_(afterObject ? afterObject[k] : null);
  }).sort();
}

function mgmtOpsWriteUserMutationLocked_(ss, context, userId, expectedVersion, action, updates, reason, clientInfo, options) {
  const opts = options || {};
  mgmtOpsRecoverPreparedUserAuditsLocked_(ss, userId);
  let lookup = mgmtOpsFindUserByIdForAdminLocked_(ss, userId);
  if (Array.isArray(opts.allowedStatuses) && opts.allowedStatuses.indexOf(lookup.user.status) < 0) {
    throw mgmtError_('VALIDATION_FAILED', 'สถานะบัญชีปัจจุบันไม่รองรับคำสั่งนี้', { status: lookup.user.status });
  }
  mgmtOpsValidateExpectedUserVersion_(lookup.usersTable, lookup.user, expectedVersion);

  const beforeRow = lookup.user.row.slice();
  const before = mgmtOpsSanitizedUserObjectFromRow_(lookup.usersTable, beforeRow);
  const intendedRow = beforeRow.slice();
  Object.keys(updates || {}).forEach(function(header) { mgmtSetRowField_(intendedRow, lookup.usersTable.headerMap, header, updates[header]); });
  const after = mgmtOpsSanitizedUserObjectFromRow_(lookup.usersTable, intendedRow);
  const changedFields = mgmtOpsChangedUserFields_(before, after);
  if (!changedFields.length) throw mgmtError_('VALIDATION_FAILED', 'ไม่มีข้อมูลที่เปลี่ยนแปลง');

  const prepared = mgmtOpsAppendPreparedAuditLocked_(ss, context, {
    action: action,
    entityType: MGMT_OPS.ENTITY_USER,
    entityId: userId,
    sheetName: MGMT_CONFIG.SHEETS.USERS,
    before: before,
    after: after,
    changedFields: changedFields,
    reason: reason || '',
    clientInfo: clientInfo || '',
    now: opts.now instanceof Date ? opts.now : new Date()
  });

  let writeAttempted = false;
  try {
    lookup = mgmtOpsFindUserByIdForAdminLocked_(ss, userId);
    if (Array.isArray(opts.allowedStatuses) && opts.allowedStatuses.indexOf(lookup.user.status) < 0) {
      throw mgmtError_('VALIDATION_FAILED', 'สถานะบัญชีเปลี่ยนระหว่างเตรียมการบันทึก', { status: lookup.user.status });
    }
    mgmtOpsValidateExpectedUserVersion_(lookup.usersTable, lookup.user, expectedVersion);
    if (typeof opts.beforeWriteValidation === 'function') opts.beforeWriteValidation(lookup);
    writeAttempted = true;
    mgmtWriteWholeRow_(lookup.usersTable.sheet, lookup.user.sheetRow, intendedRow);
    SpreadsheetApp.flush();

    const verify = mgmtOpsFindUserByIdForAdminLocked_(ss, userId);
    const intendedVersion = mgmtRecordVersion_(verify.usersTable.headers, intendedRow);
    const actualVersion = mgmtRecordVersion_(verify.usersTable.headers, verify.user.row);
    if (!mgmtSecureStringEquals_(actualVersion, intendedVersion)) throw mgmtError_('MUTATION_FAILED', 'ตรวจสอบบัญชีหลังบันทึกไม่ผ่าน');

    if (typeof opts.beforeAuditCommit === 'function') opts.beforeAuditCommit(verify);
    mgmtOpsCommitAuditLocked_(ss, prepared, new Date());
    return { user: mgmtOpsUserView_(verify.usersTable, verify.user), auditId: prepared.auditId, transactionId: prepared.transactionId, changedFields: changedFields };
  } catch (error) {
    if (error && error.mgmtCode === 'AUDIT_COMMIT_FAILED') throw error;
    let restored = true;
    if (writeAttempted) {
      try {
        const current = mgmtOpsFindUserByIdForAdminLocked_(ss, userId);
        const intendedVersion = mgmtRecordVersion_(current.usersTable.headers, intendedRow);
        const currentVersion = mgmtRecordVersion_(current.usersTable.headers, current.user.row);
        const beforeVersion = mgmtRecordVersion_(current.usersTable.headers, beforeRow);
        if (mgmtSecureStringEquals_(currentVersion, beforeVersion)) restored = true;
        else if (mgmtSecureStringEquals_(currentVersion, intendedVersion)) {
          mgmtWriteWholeRow_(current.usersTable.sheet, current.user.sheetRow, beforeRow);
          SpreadsheetApp.flush();
          const check = mgmtOpsFindUserByIdForAdminLocked_(ss, userId);
          restored = mgmtSecureStringEquals_(mgmtRecordVersion_(check.usersTable.headers, check.user.row), beforeVersion);
        } else restored = false;
      } catch (restoreError) { restored = false; }
    }
    mgmtOpsFailAuditBestEffortLocked_(ss, prepared, restored ? (error && error.mgmtCode ? error.mgmtCode : 'MUTATION_FAILED') : 'COMPENSATION_FAILED');
    if (!restored) throw mgmtError_('MUTATION_FAILED', 'บันทึกบัญชีไม่สำเร็จและไม่สามารถยืนยันการคืนค่าเดิมได้');
    if (error && error.mgmtCode) throw error;
    throw mgmtError_('MUTATION_FAILED', 'ไม่สามารถบันทึกบัญชีได้');
  }
}

// ============================================================================
// Own password change
// ============================================================================

function mgmtChangeOwnPassword(token, request) {
  const requestId = mgmtNewRequestId_();
  let lock = null;
  try {
    const input = request && typeof request === 'object' && !Array.isArray(request) ? request : {};
    const currentPassword = typeof input.currentPassword === 'string' ? input.currentPassword : '';
    const newPassword = typeof input.newPassword === 'string' ? input.newPassword : '';
    const clientInfo = mgmtClientInfo_(input.clientInfo || '');
    const allowed = { currentPassword: true, newPassword: true, clientInfo: true };
    Object.keys(input).forEach(function(key) { if (!allowed[key]) throw mgmtError_('VALIDATION_FAILED', 'พบ field ที่ request ไม่รองรับ', { field: key }); });
    if (!currentPassword) throw mgmtError_('VALIDATION_FAILED', 'กรุณาระบุรหัสผ่านปัจจุบัน');
    const policy = mgmtPasswordPolicy_(newPassword);
    if (!policy.valid) throw mgmtError_('VALIDATION_FAILED', 'รหัสผ่านใหม่ไม่ตรงตามนโยบาย', { issue: policy.reason });
    if (mgmtSecureStringEquals_(currentPassword, newPassword)) throw mgmtError_('VALIDATION_FAILED', 'รหัสผ่านใหม่ต้องต่างจากรหัสผ่านเดิม');

    lock = mgmtAcquireScriptLock_();
    const ss = mgmtOpenSpreadsheet_();
    const verified = mgmtVerifySessionLocked_(ss, token, { requestId: requestId, touch: false, allowPasswordChangeRequired: true });
    mgmtOpsRecoverPreparedUserAuditsLocked_(ss, verified.context.userId);
    const user = mgmtLoadUserByIdLocked_(ss, verified.context.userId);
    if (!mgmtSecureStringEquals_(user.password, currentPassword)) throw mgmtError_('AUTH_INVALID_CREDENTIALS', 'รหัสผ่านปัจจุบันไม่ถูกต้อง');

    const now = new Date();
    const usersTable = mgmtReadUsersTable_(ss);
    const beforeRow = user.row.slice();
    const intendedRow = beforeRow.slice();
    mgmtSetRowField_(intendedRow, usersTable.headerMap, 'password', newPassword);
    mgmtSetRowField_(intendedRow, usersTable.headerMap, 'must_change_password', false);
    mgmtSetRowField_(intendedRow, usersTable.headerMap, 'failed_login_count', 0);
    mgmtSetRowField_(intendedRow, usersTable.headerMap, 'locked_until', '');
    mgmtSetRowField_(intendedRow, usersTable.headerMap, 'password_changed_at', now);
    mgmtSetRowField_(intendedRow, usersTable.headerMap, 'updated_at', now);
    mgmtSetRowField_(intendedRow, usersTable.headerMap, 'updated_by', user.userId);
    const before = mgmtOpsSanitizedUserObjectFromRow_(usersTable, beforeRow);
    const after = mgmtOpsSanitizedUserObjectFromRow_(usersTable, intendedRow);
    const changedFields = mgmtOpsChangedUserFields_(before, after);
    const beforeVersion = mgmtRecordVersion_(usersTable.headers, beforeRow);
    const intendedVersion = mgmtRecordVersion_(usersTable.headers, intendedRow);
    const prepared = mgmtOpsAppendPreparedAuditLocked_(ss, verified.context, {
      action: MGMT_OPS.ACTION_USER_PASSWORD_CHANGE, entityType: MGMT_OPS.ENTITY_USER, entityId: user.userId,
      sheetName: MGMT_CONFIG.SHEETS.USERS, before: before, after: after,
      changedFields: changedFields, reason: '', clientInfo: clientInfo, now: now
    });

    let writeAttempted = false;
    try {
      // Re-locate the stable user id immediately before the password write. This
      // catches a direct Sheet edit/sort that ScriptLock itself cannot prevent.
      const fresh = mgmtLoadUserByIdLocked_(ss, user.userId);
      if (!mgmtSecureStringEquals_(mgmtRecordVersion_(usersTable.headers, fresh.row), beforeVersion)) {
        throw mgmtError_('CONFLICT', 'บัญชีถูกแก้ไขระหว่างเตรียมการเปลี่ยนรหัสผ่าน กรุณาลองใหม่');
      }
      writeAttempted = true;
      mgmtWriteWholeRow_(usersTable.sheet, fresh.sheetRow, intendedRow);
      SpreadsheetApp.flush();
      const check = mgmtLoadUserByIdLocked_(ss, user.userId);
      if (!mgmtSecureStringEquals_(mgmtRecordVersion_(usersTable.headers, check.row), intendedVersion)) throw mgmtError_('MUTATION_FAILED', 'ตรวจสอบรหัสผ่านหลังบันทึกไม่ผ่าน');
      mgmtRevokeAllSessionsForUserLocked_(ss, user.userId, verified.context.sessionId);
      mgmtOpsCommitAuditLocked_(ss, prepared, new Date());
      return mgmtSuccess_({ changed: true }, requestId);
    } catch (error) {
      if (error && error.mgmtCode === 'AUDIT_COMMIT_FAILED') throw error;
      let restored = true;
      if (writeAttempted) {
        try {
          const current = mgmtLoadUserByIdLocked_(ss, user.userId);
          const currentVersion = mgmtRecordVersion_(usersTable.headers, current.row);
          if (mgmtSecureStringEquals_(currentVersion, beforeVersion)) restored = true;
          else if (mgmtSecureStringEquals_(currentVersion, intendedVersion)) {
            mgmtWriteWholeRow_(usersTable.sheet, current.sheetRow, beforeRow);
            SpreadsheetApp.flush();
            const verifyRestore = mgmtLoadUserByIdLocked_(ss, user.userId);
            restored = mgmtSecureStringEquals_(mgmtRecordVersion_(usersTable.headers, verifyRestore.row), beforeVersion);
          } else restored = false;
        } catch (restoreError) { restored = false; }
      }
      mgmtOpsFailAuditBestEffortLocked_(ss, prepared, restored ? (error && error.mgmtCode ? error.mgmtCode : 'MUTATION_FAILED') : 'COMPENSATION_FAILED');
      if (!restored) throw mgmtError_('MUTATION_FAILED', 'เปลี่ยนรหัสผ่านไม่สำเร็จและไม่สามารถยืนยันการคืนค่าบัญชีเดิมได้');
      if (error && error.mgmtCode) throw error;
      throw mgmtError_('MUTATION_FAILED', 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
    }
  } catch (error) {
    mgmtLogSafeFailure_('CHANGE_OWN_PASSWORD', requestId, error);
    return mgmtFailureFromException_(error, requestId);
  } finally { mgmtReleaseScriptLock_(lock); }
}

// ============================================================================
// ADMIN technician account management
// ============================================================================

function mgmtListTechnicians(token) {
  const requestId = mgmtNewRequestId_();
  let lock = null;
  try {
    lock = mgmtAcquireScriptLock_();
    const ss = mgmtOpenSpreadsheet_();
    mgmtVerifySessionLocked_(ss, token, { requestId: requestId, touch: false, allowPasswordChangeRequired: false, permission: MGMT_PERMISSION.MANAGE_TECHNICIANS });
    mgmtOpsRecoverAllPreparedUserAuditsLocked_(ss);
    const usersTable = mgmtReadUsersTable_(ss);
    const users = [];
    usersTable.rows.forEach(function(row, offset) {
      const user = mgmtParseUserMatch_(usersTable, offset + 2, row);
      if (user.role !== MGMT_CONFIG.ROLES.TECHNICIAN) return;
      users.push(mgmtOpsUserView_(usersTable, user));
    });
    users.sort(function(a, b) { return a.username.localeCompare(b.username); });
    mgmtDataTouchSessionAfterSuccessLocked_(ss, token, new Date());
    return mgmtSuccess_({ technicians: users }, requestId);
  } catch (error) {
    mgmtLogSafeFailure_('LIST_TECHNICIANS', requestId, error);
    return mgmtFailureFromException_(error, requestId);
  } finally { mgmtReleaseScriptLock_(lock); }
}

function mgmtOpsCompensateCreatedTechnicianLocked_(ss, userId, intendedRow) {
  try {
    let created = null;
    try {
      created = mgmtOpsFindUserByIdForAdminLocked_(ss, userId);
    } catch (error) {
      if (error && error.mgmtCode === 'NOT_FOUND') return true;
      throw error;
    }

    const intendedVersion = mgmtRecordVersion_(created.usersTable.headers, intendedRow);
    const currentVersion = mgmtRecordVersion_(created.usersTable.headers, created.user.row);
    if (!mgmtSecureStringEquals_(currentVersion, intendedVersion)) return false;

    created.usersTable.sheet.deleteRow(created.user.sheetRow);
    SpreadsheetApp.flush();
    try {
      mgmtOpsFindUserByIdForAdminLocked_(ss, userId);
      return false;
    } catch (error) {
      return Boolean(error && error.mgmtCode === 'NOT_FOUND');
    }
  } catch (error) {
    return false;
  }
}

function mgmtOpsAssertDistrictExistsLocked_(ss, district) {
  const villages = mgmtDataReadExactTable_(ss, MGMT_DATA.SHEETS.VILLAGES, MGMT_DATA.HEADERS.VILLAGES);
  if (!villages.rows.some(function(row) { return mgmtNormalizeText_(row[villages.headerMap.district]) === district; })) {
    throw mgmtError_('VALIDATION_FAILED', 'ไม่พบอำเภอที่เลือกในข้อมูลหมู่บ้าน');
  }
}

function mgmtOpsAssertSystemDistrictLocked_(ss, context, systemObject) {
  mgmtAssertDistrictAssignment_(context);
  if (context.role !== MGMT_CONFIG.ROLES.TECHNICIAN) return;
  const villageId = mgmtNormalizeText_(systemObject.village_id);
  const villages = mgmtDataReadExactTable_(ss, MGMT_DATA.SHEETS.VILLAGES, MGMT_DATA.HEADERS.VILLAGES);
  const matches = villages.rows.filter(function(row) { return mgmtNormalizeText_(row[villages.headerMap.village_id]) === villageId; });
  if (matches.length !== 1) throw mgmtError_('FORBIDDEN', 'ไม่สามารถยืนยันอำเภอของระบบประปานี้');
  mgmtAssertDistrictAccess_(context, matches[0][villages.headerMap.district]);
}

function mgmtCreateTechnician(token, request) {
  const requestId = mgmtNewRequestId_();
  let lock = null;
  try {
    const input = request && typeof request === 'object' && !Array.isArray(request) ? request : {};
    const allowed = { username: true, password: true, displayName: true, district: true, clientInfo: true };
    Object.keys(input).forEach(function(key) { if (!allowed[key]) throw mgmtError_('VALIDATION_FAILED', 'พบ field ที่ request ไม่รองรับ', { field: key }); });
    const username = mgmtNormalizeUsername_(input.username);
    const password = typeof input.password === 'string' ? input.password : '';
    const displayName = mgmtNormalizeText_(input.displayName);
    const district = mgmtNormalizeText_(input.district);
    const policy = mgmtPasswordPolicy_(password);
    if (!username) throw mgmtError_('VALIDATION_FAILED', 'กรุณาระบุ username');
    if (!displayName) throw mgmtError_('VALIDATION_FAILED', 'กรุณาระบุชื่อแสดงผล');
    if (!district) throw mgmtError_('VALIDATION_FAILED', 'กรุณาเลือกอำเภอของช่างเทคนิค');
    if (!policy.valid) throw mgmtError_('VALIDATION_FAILED', 'รหัสผ่านไม่ตรงตามนโยบาย', { issue: policy.reason });

    lock = mgmtAcquireScriptLock_();
    const ss = mgmtOpenSpreadsheet_();
    const verified = mgmtVerifySessionLocked_(ss, token, { requestId: requestId, touch: false, allowPasswordChangeRequired: false, permission: MGMT_PERMISSION.MANAGE_TECHNICIANS });
    const lookup = mgmtFindUserByNormalizedUsernameLocked_(ss, username);
    if (lookup.usersTable.headerMap.district === undefined) throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'ยังไม่ได้เพิ่มคอลัมน์ district ในชีต users');
    mgmtOpsAssertDistrictExistsLocked_(ss, district);
    if (lookup.match) throw mgmtError_('VALIDATION_FAILED', 'username นี้ถูกใช้งานแล้ว');

    const now = new Date();
    const userId = MGMT_OPS.USER_ID_PREFIX + Utilities.getUuid();
    const rowObject = {
      user_id: userId, username: username, password: password, display_name: displayName,
      role: MGMT_CONFIG.ROLES.TECHNICIAN, status: MGMT_CONFIG.USER_STATUSES.ACTIVE, district: district,
      must_change_password: false, failed_login_count: 0, locked_until: '', password_changed_at: '', last_login_at: '',
      created_at: now, created_by: verified.context.userId, updated_at: now, updated_by: verified.context.userId, deleted_at: ''
    };
    const row = mgmtMutationObjectToRow_(lookup.usersTable.headers, rowObject);
    const after = mgmtOpsSanitizedUserObjectFromRow_(lookup.usersTable, row);
    const prepared = mgmtOpsAppendPreparedAuditLocked_(ss, verified.context, {
      action: MGMT_OPS.ACTION_TECH_CREATE, entityType: MGMT_OPS.ENTITY_USER, entityId: userId,
      sheetName: MGMT_CONFIG.SHEETS.USERS, before: null, after: after,
      changedFields: ['__created__'], reason: '', clientInfo: input.clientInfo || '', now: now
    });

    let insertAttempted = false;
    try {
      const finalNameLookup = mgmtFindUserByNormalizedUsernameLocked_(ss, username);
      if (finalNameLookup.match) throw mgmtError_('CONFLICT', 'username ถูกสร้างหรือแก้ไขระหว่างเตรียมการ กรุณาโหลดข้อมูลใหม่');
      const rowNumber = finalNameLookup.usersTable.sheet.getLastRow() + 1;
      insertAttempted = true;
      finalNameLookup.usersTable.sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
      SpreadsheetApp.flush();

      const created = mgmtOpsFindUserByIdForAdminLocked_(ss, userId);
      const intendedVersion = mgmtRecordVersion_(created.usersTable.headers, row);
      const createdVersion = mgmtRecordVersion_(created.usersTable.headers, created.user.row);
      if (!mgmtSecureStringEquals_(createdVersion, intendedVersion)) {
        throw mgmtError_('MUTATION_FAILED', 'ตรวจสอบบัญชีช่างหลังสร้างไม่ผ่าน');
      }
      // Direct Sheet edits are outside ScriptLock. Recheck username uniqueness
      // after the insert as well; if a conflicting manual row appeared in the
      // tiny write window, fail and compensate our own stable user_id only.
      const persistedNameLookup = mgmtFindUserByNormalizedUsernameLocked_(ss, username);
      if (!persistedNameLookup.match || persistedNameLookup.match.userId !== userId) {
        throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'ตรวจสอบความเป็นเอกลักษณ์ของ username หลังสร้างไม่ผ่าน');
      }

      mgmtOpsCommitAuditLocked_(ss, prepared, new Date());
      mgmtOpsTouchSessionAfterCommittedBestEffort_(ss, token, requestId, 'CREATE_TECHNICIAN_SESSION_TOUCH');
      return mgmtSuccess_({ user: mgmtOpsUserView_(created.usersTable, created.user), auditId: prepared.auditId }, requestId);
    } catch (error) {
      if (error && error.mgmtCode === 'AUDIT_COMMIT_FAILED') throw error;
      const restored = insertAttempted ? mgmtOpsCompensateCreatedTechnicianLocked_(ss, userId, row) : true;
      mgmtOpsFailAuditBestEffortLocked_(ss, prepared, restored ? (error && error.mgmtCode ? error.mgmtCode : 'MUTATION_FAILED') : 'COMPENSATION_FAILED');
      if (!restored) throw mgmtError_('MUTATION_FAILED', 'สร้างบัญชีช่างไม่สำเร็จและไม่สามารถยืนยันการคืนสถานะก่อนสร้างได้');
      if (error && error.mgmtCode) throw error;
      throw mgmtError_('MUTATION_FAILED', 'สร้างบัญชีช่างไม่สำเร็จ');
    }
  } catch (error) {
    mgmtLogSafeFailure_('CREATE_TECHNICIAN', requestId, error);
    return mgmtFailureFromException_(error, requestId);
  } finally { mgmtReleaseScriptLock_(lock); }
}

function mgmtUpdateTechnician(token, request) {
  const requestId = mgmtNewRequestId_();
  let lock = null;
  try {
    const input = request && typeof request === 'object' && !Array.isArray(request) ? request : {};
    const allowed = { userId: true, expectedVersion: true, username: true, displayName: true, district: true, clientInfo: true };
    Object.keys(input).forEach(function(key) { if (!allowed[key]) throw mgmtError_('VALIDATION_FAILED', 'พบ field ที่ request ไม่รองรับ', { field: key }); });
    const userId = mgmtNormalizeText_(input.userId);
    const username = mgmtNormalizeUsername_(input.username);
    const displayName = mgmtNormalizeText_(input.displayName);
    const district = mgmtNormalizeText_(input.district);
    if (!userId || !username || !displayName || !district) throw mgmtError_('VALIDATION_FAILED', 'กรุณาระบุข้อมูลบัญชีให้ครบ');

    lock = mgmtAcquireScriptLock_();
    const ss = mgmtOpenSpreadsheet_();
    const verified = mgmtVerifySessionLocked_(ss, token, { requestId: requestId, touch: false, allowPasswordChangeRequired: false, permission: MGMT_PERMISSION.MANAGE_TECHNICIANS });
    const nameLookup = mgmtFindUserByNormalizedUsernameLocked_(ss, username);
    if (nameLookup.usersTable.headerMap.district === undefined) throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'ยังไม่ได้เพิ่มคอลัมน์ district ในชีต users');
    mgmtOpsAssertDistrictExistsLocked_(ss, district);
    if (nameLookup.match && nameLookup.match.userId !== userId) throw mgmtError_('VALIDATION_FAILED', 'username นี้ถูกใช้งานแล้ว');
    const previousDistrict = mgmtOpsFindUserByIdForAdminLocked_(ss, userId).user.district;
    const now = new Date();
    const data = mgmtOpsWriteUserMutationLocked_(ss, verified.context, userId, input.expectedVersion, MGMT_OPS.ACTION_TECH_UPDATE, {
      username: username, display_name: displayName, district: district, updated_at: now, updated_by: verified.context.userId
    }, '', input.clientInfo || '', {
      allowedStatuses: [MGMT_CONFIG.USER_STATUSES.ACTIVE, MGMT_CONFIG.USER_STATUSES.DISABLED],
      beforeWriteValidation: function() {
        const finalLookup = mgmtFindUserByNormalizedUsernameLocked_(ss, username);
        if (finalLookup.match && finalLookup.match.userId !== userId) {
          throw mgmtError_('CONFLICT', 'username ถูกใช้โดยบัญชีอื่นระหว่างเตรียมการ กรุณาโหลดข้อมูลใหม่');
        }
      },
      beforeAuditCommit: function() {
        const persistedLookup = mgmtFindUserByNormalizedUsernameLocked_(ss, username);
        if (!persistedLookup.match || persistedLookup.match.userId !== userId) {
          throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'ตรวจสอบความเป็นเอกลักษณ์ของ username หลังบันทึกไม่ผ่าน');
        }
        if (previousDistrict !== district) mgmtRevokeAllSessionsForUserLocked_(ss, userId, '');
      }
    });
    mgmtOpsTouchSessionAfterCommittedBestEffort_(ss, token, requestId, 'UPDATE_TECHNICIAN_SESSION_TOUCH');
    return mgmtSuccess_(data, requestId);
  } catch (error) { mgmtLogSafeFailure_('UPDATE_TECHNICIAN', requestId, error); return mgmtFailureFromException_(error, requestId); }
  finally { mgmtReleaseScriptLock_(lock); }
}

function mgmtOpsAccountStateMutationFacade_(scope, token, request, action, status, requireReason, allowedStatuses) {
  const requestId = mgmtNewRequestId_();
  let lock = null;
  try {
    const input = request && typeof request === 'object' && !Array.isArray(request) ? request : {};
    const allowed = { userId: true, expectedVersion: true, reason: true, clientInfo: true };
    Object.keys(input).forEach(function(key) { if (!allowed[key]) throw mgmtError_('VALIDATION_FAILED', 'พบ field ที่ request ไม่รองรับ', { field: key }); });
    const reason = mgmtNormalizeText_(input.reason);
    if (requireReason && !reason) throw mgmtError_('VALIDATION_FAILED', 'กรุณาระบุเหตุผล');
    lock = mgmtAcquireScriptLock_();
    const ss = mgmtOpenSpreadsheet_();
    const verified = mgmtVerifySessionLocked_(ss, token, { requestId: requestId, touch: false, allowPasswordChangeRequired: false, permission: MGMT_PERMISSION.MANAGE_TECHNICIANS });
    const now = new Date();
    const updates = { status: status, updated_at: now, updated_by: verified.context.userId };
    if (status === MGMT_CONFIG.USER_STATUSES.ACTIVE) {
      updates.deleted_at = '';
      updates.failed_login_count = 0;
      updates.locked_until = '';
    }
    if (status === MGMT_CONFIG.USER_STATUSES.DELETED) updates.deleted_at = now;
    const data = mgmtOpsWriteUserMutationLocked_(ss, verified.context, mgmtNormalizeText_(input.userId), input.expectedVersion, action, updates, reason, input.clientInfo || '', {
      allowedStatuses: allowedStatuses,
      beforeAuditCommit: function(verify) {
        if (status !== MGMT_CONFIG.USER_STATUSES.ACTIVE) mgmtRevokeAllSessionsForUserLocked_(ss, verify.user.userId, '');
      }
    });
    mgmtOpsTouchSessionAfterCommittedBestEffort_(ss, token, requestId, scope + '_SESSION_TOUCH');
    return mgmtSuccess_(data, requestId);
  } catch (error) { mgmtLogSafeFailure_(scope, requestId, error); return mgmtFailureFromException_(error, requestId); }
  finally { mgmtReleaseScriptLock_(lock); }
}

function mgmtDisableTechnician(token, request) {
  return mgmtOpsAccountStateMutationFacade_('DISABLE_TECHNICIAN', token, request, MGMT_OPS.ACTION_TECH_DISABLE, MGMT_CONFIG.USER_STATUSES.DISABLED, false, [MGMT_CONFIG.USER_STATUSES.ACTIVE]);
}

function mgmtEnableTechnician(token, request) {
  return mgmtOpsAccountStateMutationFacade_('ENABLE_TECHNICIAN', token, request, MGMT_OPS.ACTION_TECH_ENABLE, MGMT_CONFIG.USER_STATUSES.ACTIVE, false, [MGMT_CONFIG.USER_STATUSES.DISABLED]);
}

function mgmtOpsRestoreDeletedTechnicianRowLocked_(ss, userId, originalSheetRow, beforeRow) {
  try {
    const usersTable = mgmtReadUsersTable_(ss);
    const matches = usersTable.rows.filter(function(row) {
      return mgmtNormalizeText_(row[usersTable.headerMap.user_id]) === userId;
    });
    if (matches.length > 1) return false;
    if (matches.length === 1) {
      return mgmtSecureStringEquals_(
        mgmtRecordVersion_(usersTable.headers, matches[0]),
        mgmtRecordVersion_(usersTable.headers, beforeRow)
      );
    }

    // Do not restore a deleted username over an independently created account.
    const username = mgmtNormalizeUsername_(beforeRow[usersTable.headerMap.username]);
    if (mgmtFindUserByNormalizedUsernameLocked_(ss, username).match) return false;

    const sheet = usersTable.sheet;
    const lastRow = sheet.getLastRow();
    const restoreRow = Math.max(2, Math.min(Number(originalSheetRow || 2), lastRow + 1));
    if (restoreRow <= lastRow) sheet.insertRowBefore(restoreRow);
    else sheet.insertRowAfter(lastRow);
    sheet.getRange(restoreRow, 1, 1, beforeRow.length).setValues([beforeRow]);
    SpreadsheetApp.flush();

    const restored = mgmtOpsFindUserByIdForAdminLocked_(ss, userId);
    return mgmtSecureStringEquals_(
      mgmtRecordVersion_(restored.usersTable.headers, restored.user.row),
      mgmtRecordVersion_(restored.usersTable.headers, beforeRow)
    );
  } catch (error) {
    return false;
  }
}

function mgmtDeleteTechnician(token, request) {
  const requestId = mgmtNewRequestId_();
  let lock = null;
  try {
    const input = request && typeof request === 'object' && !Array.isArray(request) ? request : {};
    const allowed = { userId: true, expectedVersion: true, reason: true, clientInfo: true };
    Object.keys(input).forEach(function(key) {
      if (!allowed[key]) throw mgmtError_('VALIDATION_FAILED', 'พบ field ที่ request ไม่รองรับ', { field: key });
    });
    const userId = mgmtNormalizeText_(input.userId);
    const reason = mgmtNormalizeText_(input.reason);
    if (!userId) throw mgmtError_('VALIDATION_FAILED', 'กรุณาระบุ userId');
    if (!reason) throw mgmtError_('VALIDATION_FAILED', 'กรุณาระบุเหตุผล');

    lock = mgmtAcquireScriptLock_();
    const ss = mgmtOpenSpreadsheet_();
    const verified = mgmtVerifySessionLocked_(ss, token, {
      requestId: requestId,
      touch: false,
      allowPasswordChangeRequired: false,
      permission: MGMT_PERMISSION.MANAGE_TECHNICIANS
    });
    mgmtOpsRecoverPreparedUserAuditsLocked_(ss, userId);
    let lookup = mgmtOpsFindUserByIdForAdminLocked_(ss, userId);
    if ([MGMT_CONFIG.USER_STATUSES.ACTIVE, MGMT_CONFIG.USER_STATUSES.DISABLED].indexOf(lookup.user.status) < 0) {
      throw mgmtError_('VALIDATION_FAILED', 'สถานะบัญชีไม่รองรับการลบ', { status: lookup.user.status });
    }
    mgmtOpsValidateExpectedUserVersion_(lookup.usersTable, lookup.user, input.expectedVersion);

    const beforeRow = lookup.user.row.slice();
    const originalSheetRow = lookup.user.sheetRow;
    const beforeRowCount = lookup.usersTable.rows.length;
    const before = mgmtOpsSanitizedUserObjectFromRow_(lookup.usersTable, beforeRow);
    const prepared = mgmtOpsAppendPreparedAuditLocked_(ss, verified.context, {
      action: MGMT_OPS.ACTION_TECH_DELETE,
      entityType: MGMT_OPS.ENTITY_USER,
      entityId: userId,
      sheetName: MGMT_CONFIG.SHEETS.USERS,
      before: before,
      after: null,
      changedFields: ['__deleted__'],
      reason: reason,
      clientInfo: input.clientInfo || '',
      now: new Date()
    });

    let deleteAttempted = false;
    try {
      // ScriptLock serializes API callers; recheck after preparing the audit to
      // reduce the remaining race with manual Sheet edits.
      lookup = mgmtOpsFindUserByIdForAdminLocked_(ss, userId);
      if ([MGMT_CONFIG.USER_STATUSES.ACTIVE, MGMT_CONFIG.USER_STATUSES.DISABLED].indexOf(lookup.user.status) < 0) {
        throw mgmtError_('CONFLICT', 'สถานะบัญชีเปลี่ยนไป กรุณาโหลดรายการใหม่');
      }
      mgmtOpsValidateExpectedUserVersion_(lookup.usersTable, lookup.user, input.expectedVersion);
      const nameMatch = mgmtFindUserByNormalizedUsernameLocked_(ss, lookup.user.normalizedUsername).match;
      if (!nameMatch || nameMatch.userId !== userId) {
        throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'ชื่อผู้ใช้ไม่ตรงกับบัญชีที่จะลบ');
      }

      // A deleted account cannot retain a usable session even if row removal fails.
      mgmtRevokeAllSessionsForUserLocked_(ss, userId, '');
      deleteAttempted = true;
      lookup.usersTable.sheet.deleteRow(lookup.user.sheetRow);
      SpreadsheetApp.flush();

      const afterTable = mgmtReadUsersTable_(ss);
      const stillPresent = afterTable.rows.some(function(row) {
        return mgmtNormalizeText_(row[afterTable.headerMap.user_id]) === userId;
      });
      if (stillPresent || afterTable.rows.length !== beforeRowCount - 1) {
        throw mgmtError_('MUTATION_FAILED', 'ตรวจสอบผลการลบบัญชีไม่ผ่าน');
      }
      mgmtOpsCommitAuditLocked_(ss, prepared, new Date());
      mgmtOpsTouchSessionAfterCommittedBestEffort_(ss, token, requestId, 'DELETE_TECHNICIAN_SESSION_TOUCH');
      return mgmtSuccess_({ deleted: true, userId: userId, auditId: prepared.auditId, transactionId: prepared.transactionId }, requestId);
    } catch (error) {
      // Leave PREPARED for deterministic recovery if the row is gone but the
      // audit transition failed. Recovery already understands after:null.
      if (error && error.mgmtCode === 'AUDIT_COMMIT_FAILED') throw error;
      const restored = !deleteAttempted || mgmtOpsRestoreDeletedTechnicianRowLocked_(ss, userId, originalSheetRow, beforeRow);
      if (restored) {
        mgmtOpsFailAuditBestEffortLocked_(ss, prepared, error && error.mgmtCode ? error.mgmtCode : 'MUTATION_FAILED');
      }
      if (!restored) throw mgmtError_('AUDIT_COMMIT_FAILED', 'ลบบัญชีแล้วแต่ยังยืนยันหรือคืนข้อมูลไม่สำเร็จ ต้องตรวจสอบ Audit ก่อนทำซ้ำ');
      if (error && error.mgmtCode) throw error;
      throw mgmtError_('MUTATION_FAILED', 'ไม่สามารถลบบัญชีได้');
    }
  } catch (error) {
    mgmtLogSafeFailure_('DELETE_TECHNICIAN', requestId, error);
    return mgmtFailureFromException_(error, requestId);
  } finally {
    mgmtReleaseScriptLock_(lock);
  }
}

function mgmtResetTechnicianPassword(token, request) {
  const requestId = mgmtNewRequestId_();
  let lock = null;
  try {
    const input = request && typeof request === 'object' && !Array.isArray(request) ? request : {};
    const allowed = { userId: true, expectedVersion: true, newPassword: true, clientInfo: true };
    Object.keys(input).forEach(function(key) { if (!allowed[key]) throw mgmtError_('VALIDATION_FAILED', 'พบ field ที่ request ไม่รองรับ', { field: key }); });
    const newPassword = typeof input.newPassword === 'string' ? input.newPassword : '';
    const policy = mgmtPasswordPolicy_(newPassword);
    if (!policy.valid) throw mgmtError_('VALIDATION_FAILED', 'รหัสผ่านไม่ตรงตามนโยบาย', { issue: policy.reason });
    lock = mgmtAcquireScriptLock_();
    const ss = mgmtOpenSpreadsheet_();
    const verified = mgmtVerifySessionLocked_(ss, token, { requestId: requestId, touch: false, allowPasswordChangeRequired: false, permission: MGMT_PERMISSION.MANAGE_TECHNICIANS });
    const now = new Date();
    const data = mgmtOpsWriteUserMutationLocked_(ss, verified.context, mgmtNormalizeText_(input.userId), input.expectedVersion, MGMT_OPS.ACTION_TECH_PASSWORD_RESET, {
      password: newPassword,
      must_change_password: true,
      failed_login_count: 0,
      locked_until: '',
      password_changed_at: now,
      updated_at: now,
      updated_by: verified.context.userId
    }, '', input.clientInfo || '', {
      allowedStatuses: [MGMT_CONFIG.USER_STATUSES.ACTIVE, MGMT_CONFIG.USER_STATUSES.DISABLED],
      beforeAuditCommit: function(verify) { mgmtRevokeAllSessionsForUserLocked_(ss, verify.user.userId, ''); }
    });
    mgmtOpsTouchSessionAfterCommittedBestEffort_(ss, token, requestId, 'RESET_TECHNICIAN_PASSWORD_SESSION_TOUCH');
    return mgmtSuccess_(data, requestId);
  } catch (error) { mgmtLogSafeFailure_('RESET_TECHNICIAN_PASSWORD', requestId, error); return mgmtFailureFromException_(error, requestId); }
  finally { mgmtReleaseScriptLock_(lock); }
}
