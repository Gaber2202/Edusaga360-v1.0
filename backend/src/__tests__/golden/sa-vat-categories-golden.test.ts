/**
 * Golden-file test for Saudi VAT treatment across fee categories.
 *
 * Covers: standard (15%), zero-rated (0%), exempt, and out-of-scope lines.
 * The VAT summary object is the source of truth for ZATCA XML totals and the
 * invoice PDF totals table.
 */
import { describe, it, expect } from 'vitest';
import { computeVatSummary, InvoiceData, InvoiceItemData } from '../../packs/sa/vat.js';
import type { TenantData } from '../../types/tenant.js';
import { golden } from './support/golden.js';

const tenant: TenantData = {
  name: 'Al Noor International School',
  name_ar: 'مدرسة النور العالمية',
  legal_name_en: 'Al Noor International School',
  legal_name_ar: 'مدرسة النور العالمية',
  vat_number: '300000000000003',
  cr_number: '1010101010',
  address: 'King Fahd Road, Riyadh',
  address_ar: 'طريق الملك فهد، الرياض',
  address_en: 'King Fahd Road, Riyadh',
  city: 'Riyadh',
  country_code: 'SA',
  country_subentity_code: 'SA-01',
  phone: '966500000000',
  email: 'info@alnoor.edu.sa',
};

const baseInvoice = {
  uuid: '11111111-1111-1111-1111-111111111111',
  icv: 1,
  previous_invoice_hash: '0'.repeat(64),
  invoice_number: 'INV-2026-000001',
  document_type: 'invoice' as const,
  invoice_type: 'simplified' as const,
  issue_date: '2026-06-18T00:00:00Z',
  subtotal: 2900,
  total_amount: 3050,
  paid_amount: 0,
  discount_amount: 0,
  student_name: 'Sara Ahmed',
  buyer_name: 'Sara Ahmed',
};

const items: InvoiceItemData[] = [
  { description: 'Tuition', description_en: 'Tuition', description_ar: 'رسوم دراسية', quantity: 1, unit_price_net: 1000, vat_rate: 0.15, vat_amount: 150, line_total_gross: 1150, vat_category: 'standard', vat_category_code: 'S', discount: 0 },
  { description: 'Transport', description_en: 'Transport', description_ar: 'مواصلات', quantity: 1, unit_price_net: 500, vat_rate: 0.15, vat_amount: 75, line_total_gross: 575, vat_category: 'standard', vat_category_code: 'S', discount: 0 },
  { description: 'Uniforms (zero-rated)', description_en: 'Uniforms (zero-rated)', description_ar: 'زي مدرسي (صفرية)', quantity: 2, unit_price_net: 200, vat_rate: 0, vat_amount: 0, line_total_gross: 400, vat_category: 'zero_rated', vat_category_code: 'Z', discount: 0 },
  { description: 'Books (exempt)', description_en: 'Books (exempt)', description_ar: 'كتب (معفاة)', quantity: 1, unit_price_net: 300, vat_rate: 0, vat_amount: 0, line_total_gross: 300, vat_category: 'exempt', vat_category_code: 'E', discount: 0 },
  { description: 'Out-of-scope fee', description_en: 'Out-of-scope fee', description_ar: 'رسوم خارج النطاق', quantity: 1, unit_price_net: 150, vat_rate: 0, vat_amount: 0, line_total_gross: 150, vat_category: 'out_of_scope', vat_category_code: 'O', discount: 0 },
];

describe('Saudi VAT category golden snapshot', () => {
  it('computeVatSummary is byte-stable across all VAT treatments', () => {
    const invoice: InvoiceData = { ...baseInvoice, items, vat_amount: 225 };
    const summary = computeVatSummary(invoice);
    golden('sa-vat-categories', JSON.stringify(summary), 'json');
  });
});
