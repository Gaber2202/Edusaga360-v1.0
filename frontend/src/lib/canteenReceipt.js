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

export function shortReceiptNo(id) {
  const raw = String(id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
  return raw ? `CNT-${raw}` : `CNT-${Date.now().toString(36).toUpperCase()}`;
}

export function canteenReceiptLabels(isRTL = false) {
  if (isRTL) {
    return {
      saleTitle: 'إيصال بيع المقصف',
      topupTitle: 'إيصال شحن المحفظة',
      paid: 'مدفوع',
      toppedUp: 'تم الشحن',
      receiptNo: 'رقم الإيصال',
      student: 'الطالب',
      grade: 'الصف',
      date: 'التاريخ',
      time: 'الوقت',
      cashier: 'الكاشير',
      payment: 'طريقة الدفع',
      item: 'الصنف',
      qty: 'الكمية',
      unit: 'السعر',
      total: 'الإجمالي',
      amount: 'المبلغ',
      walletCredit: 'شحن رصيد المحفظة',
      balanceBefore: 'الرصيد قبل',
      balanceAfter: 'الرصيد بعد',
      wallet: 'المحفظة',
      cash: 'نقداً',
      footer: 'شكراً لكم — إيصال المقصف المدرسي',
    };
  }
  return {
    saleTitle: 'Canteen sale receipt',
    topupTitle: 'Wallet top-up receipt',
    paid: 'Paid',
    toppedUp: 'Topped up',
    receiptNo: 'Receipt #',
    student: 'Student',
    grade: 'Grade',
    date: 'Date',
    time: 'Time',
    cashier: 'Cashier',
    payment: 'Payment',
    item: 'Item',
    qty: 'Qty',
    unit: 'Unit',
    total: 'Total',
    amount: 'Amount',
    walletCredit: 'Canteen wallet credit',
    balanceBefore: 'Balance before',
    balanceAfter: 'Balance after',
    wallet: 'Wallet',
    cash: 'Cash',
    footer: 'Thank you — school canteen receipt',
  };
}

function lineName(item, isRTL) {
  if (isRTL) return item.item_name || item.name_ar || item.name_en || 'item';
  return item.name_en || item.item_name || item.name_ar || 'item';
}

function lineQty(item) {
  return Number(item.quantity ?? item.qty) || 1;
}

function lineUnit(item) {
  return Number(item.unit_price ?? item.price ?? item.unitPrice) || 0;
}

export function itemsFromTransaction(txn) {
  return Array.isArray(txn?.items) ? txn.items : [];
}

export function receiptPayloadFromTransaction(txn, { schoolName = '', isRTL = false } = {}) {
  const kind = txn?.transaction_type === 'topup' ? 'topup' : 'purchase';
  return {
    kind,
    receiptNo: shortReceiptNo(txn?.id),
    schoolName,
    studentName: txn?.student_name || '',
    grade: txn?.grade || '',
    date: txn?.transaction_date || '',
    time: txn?.transaction_time || '',
    cashier: txn?.processed_by || '',
    paymentMethod: txn?.payment_method || (kind === 'topup' ? 'cash' : 'wallet'),
    items: itemsFromTransaction(txn),
    amount: Number(txn?.amount) || 0,
    balanceBefore: txn?.balance_before,
    balanceAfter: txn?.balance_after,
    isRTL,
  };
}

export function buildCanteenReceiptHtml(opts = {}) {
  const labels = { ...canteenReceiptLabels(opts.isRTL), ...(opts.labels || {}) };
  const currencyCode = opts.currencyCode;
  if (!currencyCode) {
    throw new Error('currency_unresolved: canteen receipt requires currencyCode');
  }
  const kind = opts.kind === 'topup' ? 'topup' : 'purchase';
  const title = kind === 'topup' ? labels.topupTitle : labels.saleTitle;
  const stamp = kind === 'topup' ? labels.toppedUp : labels.paid;
  const payment = opts.paymentMethod === 'cash' ? labels.cash : (opts.paymentMethod === 'wallet' ? labels.wallet : (opts.paymentMethod || labels.wallet));
  const items = Array.isArray(opts.items) ? opts.items : [];
  const dir = opts.isRTL ? 'rtl' : 'ltr';
  const font = opts.isRTL ? "'IBM Plex Sans Arabic', sans-serif" : "'Poppins', sans-serif";

  const rows = kind === 'topup'
    ? `<tr>
        <td>${escapeHtml(labels.walletCredit)}</td>
        <td class="num">1</td>
        <td class="num">${escapeHtml(money(opts.amount, currencyCode))}</td>
        <td class="num">${escapeHtml(money(opts.amount, currencyCode))}</td>
      </tr>`
    : items.map((item) => {
      const qty = lineQty(item);
      const unit = lineUnit(item);
      return `<tr>
        <td>${escapeHtml(lineName(item, opts.isRTL))}</td>
        <td class="num">${escapeHtml(qty)}</td>
        <td class="num">${escapeHtml(money(unit, currencyCode))}</td>
        <td class="num">${escapeHtml(money(qty * unit, currencyCode))}</td>
      </tr>`;
    }).join('');

  const balanceBlock = (opts.balanceBefore != null || opts.balanceAfter != null)
    ? `<div class="balances">
        <div><span>${escapeHtml(labels.balanceBefore)}</span><b dir="ltr">${escapeHtml(money(opts.balanceBefore, currencyCode))}</b></div>
        <div><span>${escapeHtml(labels.balanceAfter)}</span><b dir="ltr">${escapeHtml(money(opts.balanceAfter, currencyCode))}</b></div>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="${opts.isRTL ? 'ar' : 'en'}" dir="${dir}">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)} ${escapeHtml(opts.receiptNo || '')}</title>
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
    .balances { margin-top: 14px; background: #F5F0E4; border-radius: 8px; padding: 10px 12px; }
    .balances div { display: flex; justify-content: space-between; padding: 2px 0; }
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
      <div class="stamp">${escapeHtml(stamp)}</div>
    </div>
    <h1 class="title">${escapeHtml(title)}</h1>
    <div class="meta">
      <div><span>${escapeHtml(labels.receiptNo)}</span><strong>${escapeHtml(opts.receiptNo || '—')}</strong></div>
      <div><span>${escapeHtml(labels.student)}</span><strong>${escapeHtml(opts.studentName || '—')}</strong></div>
      <div><span>${escapeHtml(labels.grade)}</span><strong>${escapeHtml(opts.grade || '—')}</strong></div>
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
      <div class="grand"><span>${escapeHtml(kind === 'topup' ? labels.amount : labels.total)}</span><b dir="ltr">${escapeHtml(money(opts.amount, currencyCode))}</b></div>
    </div>
    ${balanceBlock}
    <p class="foot">${escapeHtml(labels.footer)}</p>
  </div>
</body>
</html>`;
}

export function printCanteenReceipt(html) {
  if (typeof document === 'undefined') return;
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'canteen-receipt');
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
    setTimeout(() => iframe.remove(), 800);
  };

  if (iframe.contentDocument?.readyState === 'complete') {
    setTimeout(trigger, 250);
  } else {
    iframe.onload = () => setTimeout(trigger, 250);
  }
}

export function openCanteenReceipt(payload) {
  printCanteenReceipt(buildCanteenReceiptHtml(payload));
}
