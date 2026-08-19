import { describe, it, expect } from 'vitest';
import { buildPaymentReceiptHtml } from '../lib/receiptReport';

describe('buildPaymentReceiptHtml', () => {
  it('renders a bilingual payment receipt for the paid invoice', () => {
    const html = buildPaymentReceiptHtml({
      invoiceNumber: 'PP-DEMO-INV-PAID',
      studentName: 'Sara Al-Farsi',
      paidAmount: 9200,
      totalAmount: 9200,
      dueDate: '15/02/2026',
      paidDate: '15/01/2026',
      academicYear: '2025-2026',
      generatedLabel: 'Generated today',
      labels: { title: 'سند قبض / Payment Receipt', paid: 'Paid' },
    });

    expect(html).toContain('سند قبض / Payment Receipt');
    expect(html).toContain('RCP-PP-DEMO-INV-PAID');
    expect(html).toContain('Sara Al-Farsi');
    expect(html).toContain('9,200.00');
  });

  it('escapes student names so markup cannot break the receipt', () => {
    const html = buildPaymentReceiptHtml({
      invoiceNumber: 'INV-1',
      studentName: '<img src=x onerror=alert(1)>',
      paidAmount: 10,
      totalAmount: 10,
    });
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
  });
});
