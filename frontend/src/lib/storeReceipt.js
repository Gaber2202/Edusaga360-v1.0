import { printCanteenReceipt } from './canteenReceipt';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(value, currencyCode) {
  const amount = Number(value) || 0;
  if (!currencyCode) return `— ${amount.toFixed(2)}`;
  try {
    return new Intl.NumberFormat('en-SA', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

export function shortStoreReceiptNo(id) {
  const raw = String(id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
  return raw ? `STR-${raw}` : `STR-${Date.now().toString(36).toUpperCase()}`;
}

export function storeReceiptLabels(isRTL = false) {
  if (isRTL) {
    return {
      title: 'إيصال دفع المتجر المدرسي',
      paid: 'مدفوع',
      receiptNo: 'رقم الإيصال',
      orderNo: 'رقم الطلب',
      invoiceNo: 'رقم الفاتورة',
      student: 'الطالب',
      date: 'التاريخ',
      time: 'الوقت',
      cashier: 'الكاشير',
      payment: 'طريقة الدفع',
      item: 'الصنف',
      qty: 'الكمية',
      unit: 'السعر',
      total: 'الإجمالي',
      amount: 'المبلغ',
      cash: 'نقداً',
      card: 'بطاقة',
      mada: 'مدى',
      bank_transfer: 'تحويل بنكي',
      footer: 'شكراً لكم — إيصال المتجر المدرسي',
    };
  }
  return {
    title: 'School store payment receipt',
    paid: 'Paid',
    receiptNo: 'Receipt #',
    orderNo: 'Order #',
    invoiceNo: 'Invoice #',
    student: 'Student',
    date: 'Date',
    time: 'Time',
    cashier: 'Cashier',
    payment: 'Payment method',
    item: 'Item',
    qty: 'Qty',
    unit: 'Unit',
    total: 'Total',
    amount: 'Amount',
    cash: 'Cash',
    card: 'Card',
    mada: 'Mada',
    bank_transfer: 'Bank transfer',
    footer: 'Thank you — school store receipt',
  };
}

function paymentLabel(method, labels) {
  if (method === 'cash') return labels.cash;
  if (method === 'card') return labels.card;
  if (method === 'mada') return labels.mada;
  if (method === 'bank_transfer') return labels.bank_transfer;
  return method || labels.cash;
}

function lineName(line, isRTL) {
  if (isRTL) return line.product_name_ar || line.product_name_en || 'item';
  return line.product_name_en || line.product_name_ar || 'item';
}

export function buildStoreReceiptHtml(opts = {}) {
  const labels = { ...storeReceiptLabels(opts.isRTL), ...(opts.labels || {}) };
  const currencyCode = opts.currencyCode;
  if (!currencyCode) {
    throw new Error('currency_unresolved: store receipt requires currencyCode');
  }
  const payment = paymentLabel(opts.paymentMethod, labels);
  const items = Array.isArray(opts.items) ? opts.items : [];
  const dir = opts.isRTL ? 'rtl' : 'ltr';
  const font = opts.isRTL ? "'IBM Plex Sans Arabic', sans-serif" : "'Poppins', sans-serif";

  const rows = items.map((line) => {
    const qty = Number(line.quantity) || 1;
    const unit = Number(line.unit_price) || 0;
    const slot = line.slot_start ? ` · ${String(line.slot_start).slice(0, 16).replace('T', ' ')}` : '';
    return `<tr>
      <td>${escapeHtml(lineName(line, opts.isRTL))}${escapeHtml(slot)}</td>
      <td class="num">${escapeHtml(qty)}</td>
      <td class="num">${escapeHtml(money(unit, currencyCode))}</td>
      <td class="num">${escapeHtml(money(qty * unit, currencyCode))}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="${opts.isRTL ? 'ar' : 'en'}" dir="${dir}">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(labels.title)} ${escapeHtml(opts.receiptNo || '')}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    @page { margin: 10mm; size: A5; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #12241C; background: #fff; font-family: ${font}; font-size: 12px; line-height: 1.45; }
    .sheet { padding: 8px 4px; max-width: 420px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; gap: 12px; border-bottom: 3px solid #0F5138; padding-bottom: 12px; margin-bottom: 12px; }
    .brand { font-size: 18px; font-weight: 700; color: #0F5138; }
    .brand span { color: #C9A227; }
    .school { color: #5A6A61; font-size: 11px; margin-top: 2px; }
    .stamp { border: 2px solid #0F5138; color: #0F5138; border-radius: 8px; padding: 6px 12px; font-weight: 700; text-transform: uppercase; align-self: flex-start; }
    .title { text-align: center; font-size: 16px; font-weight: 700; color: #0F5138; margin: 0 0 14px; padding: 8px; background: #E3F0E8; border-radius: 6px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin-bottom: 14px; }
    .meta span { display: block; color: #5A6A61; font-size: 10px; }
    .meta strong { font-size: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: start; background: #E3F0E8; color: #0F5138; font-size: 10px; padding: 7px 8px; }
    td { padding: 8px; border-bottom: 1px solid #EDE4D2; }
    .num { text-align: end; white-space: nowrap; }
    .totals { margin-top: 12px; margin-inline-start: auto; width: min(240px, 100%); }
    .totals div { display: flex; justify-content: space-between; padding: 3px 0; }
    .totals .grand { border-top: 2px solid #0F5138; margin-top: 6px; padding-top: 8px; font-weight: 700; color: #0F5138; }
    .foot { margin-top: 22px; color: #5A6A61; font-size: 11px; text-align: center; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="brand" dir="ltr">EduSaga<span>.</span>360</div>
        <div class="school">${escapeHtml(opts.schoolName || '')}</div>
      </div>
      <div class="stamp">${escapeHtml(labels.paid)}</div>
    </div>
    <h1 class="title">${escapeHtml(labels.title)}</h1>
    <div class="meta">
      <div><span>${escapeHtml(labels.receiptNo)}</span><strong>${escapeHtml(opts.receiptNo || '—')}</strong></div>
      <div><span>${escapeHtml(labels.orderNo)}</span><strong>${escapeHtml(opts.orderNo || '—')}</strong></div>
      <div><span>${escapeHtml(labels.invoiceNo)}</span><strong>${escapeHtml(opts.invoiceNo || '—')}</strong></div>
      <div><span>${escapeHtml(labels.student)}</span><strong>${escapeHtml(opts.studentName || '—')}</strong></div>
      <div><span>${escapeHtml(labels.date)}</span><strong>${escapeHtml(opts.date || '—')} ${escapeHtml(opts.time || '')}</strong></div>
      <div><span>${escapeHtml(labels.cashier)}</span><strong>${escapeHtml(opts.cashier || '—')}</strong></div>
      <div><span>${escapeHtml(labels.payment)}</span><strong>${escapeHtml(payment)}</strong></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>${escapeHtml(labels.item)}</th>
          <th class="num">${escapeHtml(labels.qty)}</th>
          <th class="num">${escapeHtml(labels.unit)}</th>
          <th class="num">${escapeHtml(labels.total)}</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="4">${escapeHtml(labels.amount)}</td></tr>`}</tbody>
    </table>
    <div class="totals">
      <div class="grand"><span>${escapeHtml(labels.total)}</span><b dir="ltr">${escapeHtml(money(opts.amount, currencyCode))}</b></div>
    </div>
    <p class="foot">${escapeHtml(labels.footer)}</p>
  </div>
</body>
</html>`;
}

export function openStoreReceipt(payload) {
  printCanteenReceipt(buildStoreReceiptHtml(payload));
}
