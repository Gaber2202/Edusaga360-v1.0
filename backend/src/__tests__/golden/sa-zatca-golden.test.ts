/**
 * Golden-file tests for Saudi ZATCA e-invoicing outputs.
 *
 * These snapshots pin the current deployed behaviour of the ZATCA generator
 * so the pack refactor cannot silently change wire formats.
 *
 * Note: the PDF renderer (puppeteer/Chromium) embeds nondeterministic metadata
 * and font-subset streams, so it is not included as a byte-level golden file.
 * XML and TLV QR payloads are deterministic and are snapshotted.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateUBLXml,
  generateTLVQR,
  generateInvoiceHash,
  signInvoice,
  InvoiceData,
  TenantData,
} from '../../services/zatca.js';
import { golden } from './support/golden.js';

beforeAll(() => {
  process.env.TZ = 'UTC';
  // Ensure the fallback signature is used; a real RSA key would make the QR
  // nondeterministic across test runs unless the key is hard-coded.
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
  issue_date: '2026-06-18T00:00:00Z',
  subtotal: 1000,
  vat_amount: 150,
  total_amount: 1150,
  paid_amount: 0,
  discount_amount: 0,
  student_name: 'Sara Ahmed',
  buyer_name: 'Sara Ahmed',
  buyer_address: 'Riyadh, Saudi Arabia',
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

describe('ZATCA golden snapshots', () => {
  it('simplified tax invoice UBL XML is byte-stable', () => {
    const xml = generateUBLXml({ ...baseInvoice, invoice_type: 'simplified' as const }, baseTenant);
    golden('sa-zatca-simplified', xml, 'xml');
  });

  it('standard tax invoice UBL XML is byte-stable', () => {
    const xml = generateUBLXml({ ...baseInvoice, invoice_type: 'standard' as const }, baseTenant);
    golden('sa-zatca-standard', xml, 'xml');
  });

  it('simplified invoice TLV QR payload is byte-stable', () => {
    const invoice = { ...baseInvoice, invoice_type: 'simplified' as const };
    const xml = generateUBLXml(invoice, baseTenant);
    const signature = signInvoice(generateInvoiceHash(xml));
    const qr = generateTLVQR(invoice, baseTenant, signature);
    golden('sa-zatca-simplified-qr', qr, 'b64');
  });

  it('standard invoice TLV QR payload is byte-stable', () => {
    const invoice = { ...baseInvoice, invoice_type: 'standard' as const };
    const xml = generateUBLXml(invoice, baseTenant);
    const signature = signInvoice(generateInvoiceHash(xml));
    const qr = generateTLVQR(invoice, baseTenant, signature);
    golden('sa-zatca-standard-qr', qr, 'b64');
  });

  it('XML hash and signature fallback are deterministic', () => {
    const xml = generateUBLXml(baseInvoice, baseTenant);
    const hash = generateInvoiceHash(xml);
    const signature = signInvoice(hash);
    golden('sa-zatca-signature-fallback', signature, 'b64');
  });
});
