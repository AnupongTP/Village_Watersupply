export const ISSUE_PAGE_SIZE = 20;

export function nextIssueVisibleCount(total, current, pageSize = ISSUE_PAGE_SIZE) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeCurrent = Math.max(0, Number(current) || 0);
  const safePageSize = Math.max(1, Number(pageSize) || ISSUE_PAGE_SIZE);
  return Math.min(safeTotal, safeCurrent + safePageSize);
}
