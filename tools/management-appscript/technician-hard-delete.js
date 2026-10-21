// Replace mgmtDeleteTechnician() in the current ManagementOperationsBackend.gs
// with both functions below. Keep the other account state actions unchanged.

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
