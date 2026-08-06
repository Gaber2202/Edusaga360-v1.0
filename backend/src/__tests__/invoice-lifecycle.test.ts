import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/tenant.js', () => ({ getTenantComplianceData: vi.fn() }));
import { convertToInvoice } from '../services/lifecycle.js';
import { createSupabaseStub, QueryContext } from './support/supabaseMock.js';

const TENANT_ID = 'tenant-A';
const ORIGINAL_ID = 'doc-123';

const tenant = {
  legal_name_ar: 'مدارس النور',
  legal_name_en: 'Al Noor School',
  vat_number: '300000000000003',
  address_ar: 'الرياض',
  address_en: 'Riyadh',
  city: 'Riyadh',
  country_code: 'SA',
  country_subentity_code: 'SA-01',
  phone: '+966500000000',
  email: 'test@school.sa',
  cr_number: '1010101010',
};

const quotation = {
  id: ORIGINAL_ID,
  tenant_id: TENANT_ID,
  invoice_number: 'QUO-2026-000001',
  document_type: 'quotation',
  invoice_type: 'simplified',
  student_id: 's1',
  student_name: 'Aisha',
  buyer_name: 'Aisha Guardian',
  buyer_vat_number: null,
  buyer_address: 'Riyadh',
  subtotal: 1000,
  discount_amount: 0,
  vat_amount: 150,
  total_amount: 1150,
  notes: 'Spring term',
  items: [
    {
      description_en: 'Tuition',
      description_ar: 'رسوم دراسية',
      quantity: 1,
      unit_price_net: 1000,
      vat_rate: 15,
      vat_category: 'standard',
      vat_category_code: 'S',
      discount: 0,
      vat_amount: 150,
      line_total_gross: 1150,
    },
  ],
};

describe('convertToInvoice', () => {
  it('converts a quotation into a formal tax invoice and carries data forward', async () => {
    const db = createSupabaseStub();
    let inserted: any = null;
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'tenants' && ctx.op === 'select') {
        return { data: { id: TENANT_ID, jurisdiction_code: 'SA' } };
      }
      if (ctx.table === 'invoices' && ctx.op === 'insert' && ctx.single) {
        inserted = ctx.payload as Record<string, unknown>;
        return { data: { ...(ctx.payload as object), id: 'new-invoice-id' } };
      }
      return { data: null };
    });

    const invoice = await convertToInvoice(
      db.client as any,
      quotation as any,
      'INV-2026-000008',
      tenant as any,
      'prev-hash',
      8,
    );

    expect(invoice.id).toBe('new-invoice-id');
    expect(inserted).toBeTruthy();
    if (!inserted) throw new Error('inserted payload was not captured');
    expect(inserted.document_type).toBe('invoice');
    expect(inserted.invoice_type).toBe('simplified');
    expect(inserted.status).toBe('issued');
    expect(inserted.parent_document_id).toBe(ORIGINAL_ID);
    expect(inserted.original_invoice_number).toBe('QUO-2026-000001');
    expect(inserted.invoice_number).toBe('INV-2026-000008');
    expect(inserted.total_amount).toBe(1150);
    expect((inserted.ubl_xml as string) || '').toContain('InvoiceTypeCode');
    expect(inserted.qr_code).toBeTruthy();
    expect(inserted.invoice_hash).toBeTruthy();
    expect(inserted.previous_invoice_hash).toBe('prev-hash');
    expect(inserted.icv).toBe(8);
    expect(Array.isArray(inserted.items)).toBe(true);
    expect((inserted.items as any[])[0].description_en).toBe('Tuition');

    // Balance is generated, not written. New invoice starts unpaid, so generated balance = total.
    expect(inserted).not.toHaveProperty('balance');
    expect(inserted.paid_amount).toBe(0);
    expect((inserted.total_amount as number) - (inserted.paid_amount as number)).toBe(1150);
  });
});
