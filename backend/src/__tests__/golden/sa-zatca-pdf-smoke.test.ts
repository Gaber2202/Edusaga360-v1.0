/**
 * PDF smoke test for Saudi ZATCA invoice rendering.
 *
 * We deliberately do NOT byte-compare PDFs here. The current renderer uses
 * puppeteer/Chromium, and the output embeds non-deterministic metadata
 * (creation/modification dates, structure-tree IDs) and font subset streams.
 * The HTML template and the UBL XML / QR payloads are the deterministic golden
 * artefacts; this test only confirms the PDF pipeline still runs and produces a
 * valid PDF with the expected number of pages.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  generateZATCAInvoicePDF,
  InvoiceData,
  TenantData,
} from '../../services/zatca.js';

beforeAll(() => {
  process.env.TZ = 'UTC';
  delete process.env.ZATCA_PRIVATE_KEY;
});

const baseTenant: TenantData = {
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

const baseInvoice: InvoiceData = {
  uuid: '11111111-1111-1111-1111-111111111111',
  icv: 1,
  previous_invoice_hash: '0'.repeat(64),
  invoice_number: 'INV-2026-000001',
  document_type: 'invoice',
  invoice_type: 'simplified',
  issue_date: '2026-06-18T00:00:00Z',
  subtotal: 1000,
  vat_amount: 150,
  total_amount: 1150,
  paid_amount: 0,
  discount_amount: 0,
  student_name: 'Sara Ahmed',
  items: [
    {
      description: 'Tuition',
      description_en: 'Tuition',
      description_ar: 'رسوم دراسية',
      quantity: 1,
      unit_price_net: 1000,
      vat_rate: 0.15,
      vat_amount: 150,
      line_total_gross: 1150,
      vat_category: 'standard',
      vat_category_code: 'S',
      discount: 0,
    },
  ],
};

describe('ZATCA PDF smoke test', () => {
  it('generates a valid single-page PDF for a simplified invoice', async () => {
    const pdf = await generateZATCAInvoicePDF(baseInvoice, baseTenant);
    expect(pdf.length).toBeGreaterThan(0);
    const header = pdf.toString('latin1', 0, 8);
    expect(header.startsWith('%PDF-')).toBe(true);

    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(1);
  }, { timeout: 60000 });

  it('generates a valid single-page PDF for a standard invoice', async () => {
    const pdf = await generateZATCAInvoicePDF(
      { ...baseInvoice, invoice_type: 'standard' } as InvoiceData,
      baseTenant,
    );
    expect(pdf.length).toBeGreaterThan(0);
    const header = pdf.toString('latin1', 0, 8);
    expect(header.startsWith('%PDF-')).toBe(true);

    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(1);
  }, { timeout: 60000 });
});
