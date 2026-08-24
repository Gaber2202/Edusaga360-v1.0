import { describe, it, expect } from 'vitest';
import {
  buildCanteenReceiptHtml,
  receiptPayloadFromTransaction,
  shortReceiptNo,
} from '../canteenReceipt';

const sale = {
  kind: 'purchase',
  currencyCode: 'SAR',
  receiptNo: 'CNT-ABC12345',
  schoolName: 'EduSaga 360 School',
  studentName: 'Omar Hassan',
  grade: 'Grade 1',
  date: '2026-08-18',
  time: '16:05',
  cashier: 'Khalid',
  paymentMethod: 'wallet',
  items: [
    { name_en: 'Chicken wrap', item_name: 'ساندويتش دجاج', quantity: 2, unit_price: 18 },
    { name_en: 'Orange juice', item_name: 'عصير برتقال', quantity: 1, unit_price: 6 },
  ],
  amount: 42,
  balanceBefore: 100,
  balanceAfter: 58,
};

describe('shortReceiptNo', () => {
  it('prefixes a shortened id', () => {
    expect(shortReceiptNo('4b079720-a79e-400a-afeb-40b7b21e129b')).toBe('CNT-4B079720');
  });
});

describe('buildCanteenReceiptHtml', () => {
  it('renders sale lines, totals, and wallet balances', () => {
    const html = buildCanteenReceiptHtml(sale);
    expect(html).toContain('Canteen sale receipt');
    expect(html).toContain('Omar Hassan');
    expect(html).toContain('Chicken wrap');
    expect(html).toContain('CNT-ABC12345');
    expect(html).toContain('Balance after');
    expect(html).not.toContain('<script>alert');
  });

  it('renders a top-up credit line in RTL', () => {
    const html = buildCanteenReceiptHtml({
      kind: 'topup',
      currencyCode: 'SAR',
      receiptNo: 'CNT-TOPUP01',
      studentName: 'خالد',
      amount: 50,
      balanceBefore: 10,
      balanceAfter: 60,
      paymentMethod: 'cash',
      isRTL: true,
    });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('إيصال شحن المحفظة');
    expect(html).toContain('شحن رصيد المحفظة');
    expect(html).toContain('خالد');
  });

  it('escapes student names', () => {
    const html = buildCanteenReceiptHtml({
      ...sale,
      studentName: '<img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });
});

describe('receiptPayloadFromTransaction', () => {
  it('maps a POS purchase row', () => {
    const payload = receiptPayloadFromTransaction({
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      transaction_type: 'purchase',
      student_name: 'Sara',
      amount: 22,
      items: [{ name_en: 'Burger', quantity: 1, unit_price: 22 }],
      payment_method: 'wallet',
    }, { schoolName: 'Demo', currencyCode: 'SAR' });
    expect(payload.kind).toBe('purchase');
    expect(payload.receiptNo).toBe('CNT-AAAAAAAA');
    expect(payload.items).toHaveLength(1);
  });
});
