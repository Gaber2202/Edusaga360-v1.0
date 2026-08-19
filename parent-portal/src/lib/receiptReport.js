function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(value) {
  return `SAR ${(Number(value) || 0).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function buildPaymentReceiptHtml({
  invoiceNumber,
  studentName,
  paidAmount,
  totalAmount,
  dueDate,
  paidDate,
  academicYear,
  generatedLabel,
  isRTL = false,
  labels = {},
}) {
  const title = labels.title || 'سند قبض / Payment Receipt';
  const paid = paidAmount ?? totalAmount;

  return `<!DOCTYPE html>
<html lang="${isRTL ? 'ar' : 'en'}" dir="${isRTL ? 'rtl' : 'ltr'}">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)} ${escapeHtml(invoiceNumber)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    @page { margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #1C2420;
      background: #fff;
      font-family: ${isRTL ? "'IBM Plex Sans Arabic', sans-serif" : "'Poppins', sans-serif"};
      font-size: 12px;
      line-height: 1.5;
    }
    .sheet { padding: 8px 4px; }
    .header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 3px solid #0E6B4F;
      padding-bottom: 16px;
      margin-bottom: 16px;
    }
    .brand { font-size: 20px; font-weight: 700; color: #0E6B4F; }
    .brand span { color: #C9A227; }
    .school { color: #555; font-size: 11px; }
    .stamp {
      border: 2px solid #0E6B4F;
      color: #0E6B4F;
      border-radius: 8px;
      padding: 8px 14px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .title {
      text-align: center;
      font-size: 18px;
      font-weight: 700;
      color: #0E6B4F;
      margin: 0 0 18px;
      padding: 8px;
      background: #E7F4EF;
      border-radius: 6px;
    }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; margin-bottom: 20px; }
    .meta span { display: block; color: #5A6A61; font-size: 11px; }
    .meta strong { font-size: 13px; }
    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: start;
      background: #E7F4EF;
      color: #0E6B4F;
      font-size: 11px;
      padding: 8px 10px;
    }
    td { padding: 10px; border-bottom: 1px solid #EDE4D2; }
    .totals { margin-top: 16px; margin-inline-start: auto; width: min(280px, 100%); }
    .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
    .totals .grand { border-top: 2px solid #0E6B4F; margin-top: 6px; padding-top: 8px; font-weight: 700; color: #0E6B4F; }
    .foot { margin-top: 28px; color: #5A6A61; font-size: 11px; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="brand" dir="ltr">EduSaga<span>.</span>360</div>
        <div class="school">${escapeHtml(labels.school || '')}</div>
      </div>
      <div class="stamp">${escapeHtml(labels.paid || 'Paid')}</div>
    </div>
    <h1 class="title">${escapeHtml(title)}</h1>
    <div class="meta">
      <div><span>${escapeHtml(labels.receiptNo || 'Receipt #')}</span><strong>RCP-${escapeHtml(invoiceNumber)}</strong></div>
      <div><span>${escapeHtml(labels.invoiceNo || 'Invoice #')}</span><strong>${escapeHtml(invoiceNumber)}</strong></div>
      <div><span>${escapeHtml(labels.student || 'Student')}</span><strong>${escapeHtml(studentName)}</strong></div>
      <div><span>${escapeHtml(labels.academicYear || 'Academic year')}</span><strong>${escapeHtml(academicYear || '—')}</strong></div>
      <div><span>${escapeHtml(labels.due || 'Due')}</span><strong>${escapeHtml(dueDate || '—')}</strong></div>
      <div><span>${escapeHtml(labels.paidDate || 'Payment date')}</span><strong>${escapeHtml(paidDate || '—')}</strong></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>${escapeHtml(labels.description || 'Description')}</th>
          <th>${escapeHtml(labels.amount || 'Amount')}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${escapeHtml(labels.paymentFor || 'Payment received for invoice')} ${escapeHtml(invoiceNumber)}</td>
          <td dir="ltr">${money(paid)}</td>
        </tr>
      </tbody>
    </table>
    <div class="totals">
      <div><span>${escapeHtml(labels.total || 'Total')}</span><b dir="ltr">${money(totalAmount)}</b></div>
      <div class="grand"><span>${escapeHtml(labels.amountReceived || 'Amount received')}</span><b dir="ltr">${money(paid)}</b></div>
    </div>
    <p class="foot">${escapeHtml(generatedLabel || '')}</p>
  </div>
</body>
</html>`;
}

export function printPaymentReceipt(html) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'payment-receipt');
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

  const trigger = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 500);
  };

  if (iframe.contentDocument?.readyState === 'complete') {
    setTimeout(trigger, 250);
  } else {
    iframe.onload = () => setTimeout(trigger, 250);
  }
}
