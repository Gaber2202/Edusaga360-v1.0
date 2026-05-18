/**
 * CSV-safe value rendering.
 *
 * Two concerns:
 *   1. Standard CSV escaping: values containing a comma, double-quote, carriage return,
 *      or newline must be wrapped in double quotes with internal double-quotes doubled.
 *   2. CSV-injection (a.k.a. formula-injection) hardening: if a field begins with `=`,
 *      `+`, `-`, `@`, or a tab/CR, Excel and many other spreadsheet tools will treat
 *      the cell as a formula on open.
 *
 * CSV quoting alone is NOT sufficient protection against (2). Excel strips outer CSV
 * quotes during import and then re-interprets the cell content, so `"=SUM(1,2)"` in
 * the file becomes cell text `=SUM(1,2)` which Excel evaluates as a formula. We
 * therefore apply a single-quote prefix for (2) *inside* any CSV quoting applied for
 * (1). On import Excel treats the leading `'` as its text-literal escape (hidden in
 * Excel's UI); LibreOffice / Google Sheets may render the `'` as visible content —
 * that's the accepted tradeoff for a safe-by-default writer. Callers who need a
 * stricter surface (e.g. regulated exports) should validate at input time too.
 *
 * Use these helpers anywhere you are building CSV for bank exports, regulatory
 * submissions, finance reports, or anything a downstream user will open in Excel.
 */

const INJECTION_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

export function escapeCsvField(value) {
  if (value === null || value === undefined) return '';
  let str = String(value);

  // (2) CSV-injection mitigation — leading dangerous characters.
  // Applied before (1) so the `'` sits inside the eventual CSV quoting.
  if (str.length > 0 && INJECTION_PREFIXES.includes(str[0])) {
    str = `'${str}`;
  }

  // (1) Standard RFC 4180 escaping.
  const needsQuote = /[",\r\n]/.test(str);
  if (needsQuote) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvRow(values) {
  return values.map(escapeCsvField).join(',');
}

export function buildCsv(rows) {
  return rows.map(buildCsvRow).join('\r\n');
}
