/**
 * ZATCA Phase 2 e-invoicing compliance — regression tests.
 *
 * Business context (Saudi Arabia / ZATCA Fatoora):
 *   Every B2C tax invoice must carry a TLV-encoded QR code with 5 mandatory
 *   tags (seller name, VAT number, timestamp, total-with-VAT, VAT amount),
 *   and a UBL 2.1 XML document with the correct invoice type code
 *   (388 = standard tax invoice, 381 = credit note) and a SHA-256 hash used
 *   for the cryptographic invoice chain. These tests pin that wire format so a
 *   refactor can't silently break ZATCA acceptance, and verify Arabic seller /
 *   buyer names survive UTF-8 encoding (bilingual requirement).
 *
 * Pure functions — no Supabase or network involved.
 */
import { describe, it, expect } from 'vitest';
import {
  generateTLVQR,
  generateUBLXml,
  generateInvoiceHash,
  generateZATCAInvoicePDF,
  InvoiceData,
  TenantData,
} from '../services/zatca.js';

// ── Test helpers ────────────────────────────────────────────────────────────

/**
 * Decode a ZATCA TLV byte stream the same way a scanner / ZATCA validator does.
 * Length encoding mirrors the encoder: 1 byte when <= 255, otherwise the
 * 3-byte form 0x82 + uint16 big-endian.
 */
function decodeTLV(base64: string): Record<number, Buffer> {
  const buf = Buffer.from(base64, 'base64');
  const fields: Record<number, Buffer> = {};
  let i = 0;
  while (i < buf.length) {
    const tag = buf[i];
    i += 1;
    let len: number;
    if (buf[i] === 0x82) {
      len = buf.readUInt16BE(i + 1);
      i += 3;
    } else {
      len = buf[i];
      i += 1;
    }
    fields[tag] = buf.subarray(i, i + len);
    i += len;
  }
  return fields;
}

const baseInvoice: InvoiceData = {
  invoice_number: 'INV-2026-000001',
  issue_date: '2026-06-18',
  subtotal: 1000,
  vat_amount: 150,
  total_amount: 1150,
  student_name: 'Sara Ahmed',
  discount_amount: 0,
};

const baseTenant: TenantData = {
  name: 'Al Noor International School',
  vat_number: '300000000000003',
  cr_number: '1010101010',
  address: 'King Fahd Road, Riyadh',
};

// ── TLV QR code (Tags 1-5) ──────────────────────────────────────────────────

describe('generateTLVQR — ZATCA mandatory QR tags', () => {
  it('encodes all 5 mandatory tags with the correct values', () => {
    const qr = generateTLVQR(baseInvoice, baseTenant);
    const fields = decodeTLV(qr);

    expect(fields[0x01].toString('utf8')).toBe('Al Noor International School'); // seller name
    expect(fields[0x02].toString('utf8')).toBe('300000000000003');             // VAT number
    expect(fields[0x04].toString('utf8')).toBe('1150.00');                     // total incl. VAT
    expect(fields[0x05].toString('utf8')).toBe('150.00');                      // VAT amount
    // Tag 3 is an ISO-8601 timestamp derived from issue_date
    expect(fields[0x03].toString('utf8')).toContain('2026-06-18');
  });

  it('produces valid base64 that round-trips back to bytes', () => {
    const qr = generateTLVQR(baseInvoice, baseTenant);
    expect(qr).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(Buffer.from(qr, 'base64').toString('base64')).toBe(qr);
  });

  it('formats monetary tags to exactly 2 decimal places', () => {
    const fields = decodeTLV(generateTLVQR({ ...baseInvoice, total_amount: 2300, vat_amount: 300 }, baseTenant));
    expect(fields[0x04].toString('utf8')).toBe('2300.00');
    expect(fields[0x05].toString('utf8')).toBe('300.00');
  });

  it('preserves an Arabic seller name through UTF-8 (bilingual support)', () => {
    const fields = decodeTLV(generateTLVQR(baseInvoice, { ...baseTenant, name: 'مدرسة النور العالمية' }));
    expect(fields[0x01].toString('utf8')).toBe('مدرسة النور العالمية');
  });

  it('uses the 3-byte (0x82) length form when a tag value exceeds 255 bytes', () => {
    // Arabic chars are 2 bytes in UTF-8; 200 chars ≈ 400 bytes → forces long form.
    const longArabicName = 'أ'.repeat(200);
    const qr = generateTLVQR(baseInvoice, { ...baseTenant, name: longArabicName });
    const raw = Buffer.from(qr, 'base64');

    // Tag 1, then the long-form length marker 0x82 must appear at byte index 1.
    expect(raw[0]).toBe(0x01);
    expect(raw[1]).toBe(0x82);
    // And it must still decode back to the original name.
    expect(decodeTLV(qr)[0x01].toString('utf8')).toBe(longArabicName);
  });

  it('falls back to placeholder seller name / VAT number when tenant is empty', () => {
    const fields = decodeTLV(generateTLVQR(baseInvoice, {}));
    expect(fields[0x01].toString('utf8')).toBe('School');
    expect(fields[0x02].toString('utf8')).toBe('300000000000003');
  });
});

// ── UBL 2.1 XML ─────────────────────────────────────────────────────────────

describe('generateUBLXml — UBL 2.1 structure & ZATCA codes', () => {
  it('emits a UBL 2.1 invoice with the ZATCA customization id', () => {
    const xml = generateUBLXml(baseInvoice, baseTenant);
    expect(xml).toContain('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>');
    expect(xml).toContain('urn:zatca.gov.sa:specification:schemas:invoice:1.0');
    expect(xml).toContain('<cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>');
  });

  it('uses invoice type code 388 for a standard tax invoice', () => {
    const xml = generateUBLXml(baseInvoice, baseTenant);
    expect(xml).toContain('>388</cbc:InvoiceTypeCode>');
    expect(xml).not.toContain('>381</cbc:InvoiceTypeCode>');
  });

  it('uses invoice type code 381 for a credit note', () => {
    const xml = generateUBLXml({ ...baseInvoice, document_type: 'credit_note' }, baseTenant);
    expect(xml).toContain('>381</cbc:InvoiceTypeCode>');
  });

  it('renders the 15% standard VAT category and SAR monetary totals', () => {
    const xml = generateUBLXml(baseInvoice, baseTenant);
    expect(xml).toContain('<cbc:Percent>15.00</cbc:Percent>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="SAR">1150.00</cbc:PayableAmount>');
    expect(xml).toContain('<cbc:TaxAmount currencyID="SAR">150.00</cbc:TaxAmount>');
  });

  it('escapes XML metacharacters in seller/student names to keep the document well-formed', () => {
    const xml = generateUBLXml(
      { ...baseInvoice, student_name: 'Tom & "Jerry" <test>' },
      { ...baseTenant, name: 'A & B <School>' },
    );
    expect(xml).toContain('A &amp; B &lt;School&gt;');
    expect(xml).toContain('Tom &amp; &quot;Jerry&quot; &lt;test&gt;');
    // No raw unescaped ampersand should survive in the rendered names.
    expect(xml).not.toContain('A & B');
  });

  it('carries Arabic buyer/seller names safely inside the XML (bilingual)', () => {
    const xml = generateUBLXml(
      { ...baseInvoice, student_name: 'سارة أحمد' },
      { ...baseTenant, name: 'مدرسة النور' },
    );
    expect(xml).toContain('مدرسة النور');
    expect(xml).toContain('سارة أحمد');
  });
});

// ── Invoice hash (SHA-256, cryptographic chain) ──────────────────────────────

describe('generateInvoiceHash — deterministic SHA-256', () => {
  it('returns a 64-char hex digest', () => {
    const hash = generateInvoiceHash('<Invoice/>');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — identical XML yields identical hash', () => {
    const xml = generateUBLXml(baseInvoice, baseTenant);
    expect(generateInvoiceHash(xml)).toBe(generateInvoiceHash(xml));
  });

  it('changes when any invoice content changes (tamper-evidence for the chain)', () => {
    const a = generateInvoiceHash(generateUBLXml(baseInvoice, baseTenant));
    const b = generateInvoiceHash(generateUBLXml({ ...baseInvoice, total_amount: 1151 }, baseTenant));
    expect(a).not.toBe(b);
  });
});

// ── PDF generation (smoke) ───────────────────────────────────────────────────

describe('generateZATCAInvoicePDF', () => {
  it('produces a non-empty PDF buffer with the %PDF magic header', async () => {
    const pdf = await generateZATCAInvoicePDF(baseInvoice, baseTenant);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(500);
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('renders a credit note without throwing', async () => {
    const pdf = await generateZATCAInvoicePDF(
      { ...baseInvoice, document_type: 'credit_note', discount_amount: 50 },
      baseTenant,
    );
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
