import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseStub, QueryContext } from './support/supabaseMock.js';

vi.mock('../packs/sa/zatca.js', () => ({
  generateZATCAInvoicePDF: vi.fn(() => Buffer.from('pdf')),
}));

const { createReceiptForPayment } = await import('../services/receipt.js');

describe('createReceiptForPayment', () => {
  it('creates a paid receipt without writing invoices.balance', async () => {
    const db = createSupabaseStub();
    let inserted: any = null;
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'invoices' && ctx.op === 'insert') {
        inserted = ctx.payload;
        return { data: { id: 'rcp-1', ...(ctx.payload as object) } };
      }
      return { data: null };
    });

    const invoice = {
      id: 'inv-1',
      tenant_id: 'tenant-A',
      invoice_number: 'INV-2026-000001',
      student_id: 's1',
      student_name: 'Sara',
      buyer_name: 'Sara Guardian',
      buyer_vat_number: null,
      buyer_address: 'Riyadh',
      branch_id: null,
      academic_year: '2025-2026',
      total_amount: 1150,
    };

    const result = await createReceiptForPayment(
      db.client as any,
      invoice as any,
      { id: 'pmt-1', amount: 1150, method: 'mada', reference: 'ref-1', date: '2026-08-01' },
      { name_en: 'Al Noor', name_ar: 'النور', vat_number: '300000000000003', address_en: 'Riyadh', address_ar: 'الرياض', city: 'Riyadh', country_code: 'SA', country_subentity_code: 'SA-01', phone: '+966500000000', email: 'a@school.sa', cr_number: '1010101010' } as any,
    );

    expect(result.receipt).toBeTruthy();
    expect(inserted).toBeTruthy();
    expect(inserted.document_type).toBe('receipt');
    expect(inserted.status).toBe('paid');
    expect(inserted.total_amount).toBe(1150);
    expect(inserted.paid_amount).toBe(1150);
    // Balance is generated. For a receipt paid in full it is 0.
    expect(inserted).not.toHaveProperty('balance');
    expect((inserted.total_amount as number) - (inserted.paid_amount as number)).toBe(0);
  });
});
