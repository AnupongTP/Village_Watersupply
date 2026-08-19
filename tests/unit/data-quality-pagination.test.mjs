import test from 'node:test';
import assert from 'node:assert/strict';
import { ISSUE_PAGE_SIZE, nextIssueVisibleCount } from '../../assets/js/pagination.js';

test('data completeness page size is locked at 20 rows', () => {
  assert.equal(ISSUE_PAGE_SIZE, 20);
});

test('load-more boundaries never exceed the total', () => {
  assert.equal(nextIssueVisibleCount(19, 0), 19);
  assert.equal(nextIssueVisibleCount(20, 0), 20);
  assert.equal(nextIssueVisibleCount(21, 0), 20);
  assert.equal(nextIssueVisibleCount(21, 20), 21);
  assert.equal(nextIssueVisibleCount(40, 20), 40);
  assert.equal(nextIssueVisibleCount(109, 80), 100);
  assert.equal(nextIssueVisibleCount(109, 100), 109);
});
