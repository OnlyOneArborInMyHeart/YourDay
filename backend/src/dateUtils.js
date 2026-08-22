/**
 * 一些无依赖的日期小工具。抽出来是为了避免 diaryArchive 与 carryover 互相引用。
 */

/**
 * 把一个 YYYY-MM-DD 字符串 + N 天相加，返回新的 YYYY-MM-DD。
 * 用本地日期而非 UTC，避免跨时区时把"今天"算成"明天/昨天"。
 */
export function addDays(yyyymmdd, days) {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * 取当前本地日期（YYYY-MM-DD）。
 * 用本地时区，跟数据库里 `datetime('now','localtime')` 一致。
 */
export function todayLocal() {
  const d = new Date();
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
