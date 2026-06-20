/**
 * Build a clean, professional, print-ready HTML document for a report (P3.4).
 *
 * Produces a self-contained printable page (title, meta line, school brand,
 * zebra-striped table) that respects RTL for Arabic. All values are
 * HTML-escaped so report data can't break the markup or inject scripts.
 * Pure (returns a string) so it is unit-testable.
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildReportPrintHtml({ title = 'Report', meta = '', headers = [], rows = [], isRTL = false } = {}) {
  const dir = isRTL ? 'rtl' : 'ltr';
  const align = isRTL ? 'right' : 'left';
  const headHtml = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const bodyHtml = rows
    .map((r) => `<tr>${(Array.isArray(r) ? r : [r]).map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
    .join('');

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${isRTL ? 'ar' : 'en'}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Tahoma, Arial, sans-serif; color: #0f172a; margin: 32px; }
  .report-header { display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 18px; }
  .report-header h1 { font-size: 20px; margin: 0; }
  .report-header .meta { color: #64748b; font-size: 12px; margin-top: 4px; }
  .brand { font-weight: 700; font-size: 14px; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: ${align}; }
  thead th { background: #f1f5f9; font-weight: 600; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  @media print { body { margin: 12px; } }
</style>
</head>
<body>
  <div class="report-header">
    <div>
      <h1>${escapeHtml(title)}</h1>
      ${meta ? `<div class="meta">${escapeHtml(meta)}</div>` : ''}
    </div>
    <div class="brand">EduSaga 360</div>
  </div>
  <table>
    <thead><tr>${headHtml}</tr></thead>
    <tbody>${bodyHtml}</tbody>
  </table>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 200); };</script>
</body>
</html>`;
}

export default buildReportPrintHtml;
