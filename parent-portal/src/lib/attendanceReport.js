function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildAttendanceReportHtml({
  title,
  subtitle,
  generatedLabel,
  rateLabel,
  rate,
  columns,
  rows,
  meta = [],
  isRTL = false,
}) {
  const metaHtml = meta
    .filter((item) => item?.label && item?.value)
    .map((item) => `<div class="meta-item"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`)
    .join('');

  const body = rows.map((row) => `
    <tr>
      ${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="${isRTL ? 'ar' : 'en'}" dir="${isRTL ? 'rtl' : 'ltr'}">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    @page { margin: 16mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #12241C;
      background: #F5F0E4;
      font-family: ${isRTL ? "'IBM Plex Sans Arabic', sans-serif" : "'Poppins', sans-serif"};
      font-size: 12px;
      line-height: 1.5;
    }
    .sheet { background: #fff; padding: 24px 28px; min-height: 100vh; }
    .banner {
      background: #0B3A29;
      color: #F5F0E4;
      padding: 18px 20px;
      border-radius: 12px;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-end;
    }
    .brand { font-size: 18px; font-weight: 600; }
    .brand span { color: #C9A227; }
    .title { margin: 4px 0 0; font-size: 22px; font-weight: 600; }
    .rate { font-size: 28px; font-weight: 600; }
    .rate-label { font-size: 11px; color: #C9D6CE; }
    .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; margin: 18px 0; }
    .meta-item span { display: block; color: #5A6A61; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: start;
      background: #F5F0E4;
      color: #0F5138;
      font-size: 11px;
      font-weight: 600;
      padding: 8px 10px;
    }
    td { padding: 8px 10px; border-bottom: 1px solid #EDE4D2; }
    tr:nth-child(even) td { background: #FDFBF6; }
    .foot { margin-top: 24px; color: #5A6A61; font-size: 11px; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="banner">
      <div>
        <div class="brand" dir="ltr">EduSaga<span>.</span>360</div>
        <h1 class="title">${escapeHtml(title)}</h1>
        <div>${escapeHtml(subtitle || '')}</div>
      </div>
      <div>
        <div class="rate-label">${escapeHtml(rateLabel)}</div>
        <div class="rate">${escapeHtml(rate)}</div>
      </div>
    </div>
    <div class="meta">${metaHtml}</div>
    <table>
      <thead>
        <tr>${columns.map((col) => `<th>${escapeHtml(col)}</th>`).join('')}</tr>
      </thead>
      <tbody>${body || `<tr><td colspan="${columns.length}">—</td></tr>`}</tbody>
    </table>
    <p class="foot">${escapeHtml(generatedLabel)}</p>
  </div>
</body>
</html>`;
}

export function printAttendanceReport(html) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'attendance-report');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const frameDoc = iframe.contentDocument;
  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  const cleanup = () => {
    setTimeout(() => iframe.remove(), 500);
  };

  const trigger = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    cleanup();
  };

  if (iframe.contentDocument?.readyState === 'complete') {
    setTimeout(trigger, 250);
  } else {
    iframe.onload = () => setTimeout(trigger, 250);
  }
}
