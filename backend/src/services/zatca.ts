import crypto from 'crypto';
import QRCode from 'qrcode';
// pdfkit uses CommonJS default export; with ESM interop we import like this:
import PDFDocument from 'pdfkit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvoiceData {
  invoice_number: string;
  issue_date: string; // ISO date string yyyy-MM-dd or full ISO
  invoice_type?: 'standard' | 'credit_note'; // default standard
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  student_name?: string;
  student_id?: string;
  items?: Array<{
    description: string;
    amount: number;
    vat_rate?: number;
  }>;
  discount_amount?: number;
  notes?: string;
}

export interface TenantData {
  id?: string;
  name?: string;
  name_ar?: string;
  vat_number?: string;
  address?: string;
  address_ar?: string;
  phone?: string;
  email?: string;
  cr_number?: string;
}

// ---------------------------------------------------------------------------
// TLV QR Code Generation (ZATCA Phase 2)
// ---------------------------------------------------------------------------

/**
 * Encodes a single TLV (Tag-Length-Value) field.
 * Length is encoded as 1 byte if value fits (<= 255 bytes),
 * otherwise as 3 bytes: 0x82 + uint16 big-endian.
 */
function encodeTLVField(tag: number, value: Buffer): Buffer {
  const tagBuf = Buffer.from([tag]);
  const len = value.length;

  let lenBuf: Buffer;
  if (len <= 255) {
    lenBuf = Buffer.from([len]);
  } else {
    lenBuf = Buffer.alloc(3);
    lenBuf[0] = 0x82;
    lenBuf.writeUInt16BE(len, 1);
  }

  return Buffer.concat([tagBuf, lenBuf, value]);
}

/**
 * Generates the ZATCA TLV QR code base64 string.
 * Tags:
 *   0x01 – Seller name (UTF-8)
 *   0x02 – VAT registration number (UTF-8, 15 digits)
 *   0x03 – Invoice timestamp (ISO 8601)
 *   0x04 – Invoice total with VAT
 *   0x05 – VAT amount
 */
export function generateTLVQR(invoice: InvoiceData, tenant: TenantData): string {
  const sellerName = tenant.name || 'School';
  const vatNumber = tenant.vat_number || '300000000000003';
  const timestamp = new Date(invoice.issue_date).toISOString();
  const totalWithVat = invoice.total_amount.toFixed(2);
  const vatAmount = invoice.vat_amount.toFixed(2);

  const tlvBuffer = Buffer.concat([
    encodeTLVField(0x01, Buffer.from(sellerName, 'utf8')),
    encodeTLVField(0x02, Buffer.from(vatNumber, 'utf8')),
    encodeTLVField(0x03, Buffer.from(timestamp, 'utf8')),
    encodeTLVField(0x04, Buffer.from(totalWithVat, 'utf8')),
    encodeTLVField(0x05, Buffer.from(vatAmount, 'utf8')),
  ]);

  return tlvBuffer.toString('base64');
}

// ---------------------------------------------------------------------------
// UBL 2.1 XML Generation (ZATCA-compliant)
// ---------------------------------------------------------------------------

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates a ZATCA-compliant UBL 2.1 XML invoice string.
 */
export function generateUBLXml(invoice: InvoiceData, tenant: TenantData): string {
  const sellerName = escapeXml(tenant.name || 'School');
  const vatNumber = escapeXml(tenant.vat_number || '300000000000003');
  const invoiceNumber = escapeXml(invoice.invoice_number);
  const issueDate = invoice.issue_date.substring(0, 10);
  const issueTime = new Date(invoice.issue_date).toISOString().substring(11, 19);
  // 388 = Tax Invoice (Standard), 381 = Credit Note
  const invoiceTypeCode = invoice.invoice_type === 'credit_note' ? '381' : '388';
  const subtotal = invoice.subtotal.toFixed(2);
  const vatAmount = invoice.vat_amount.toFixed(2);
  const total = invoice.total_amount.toFixed(2);
  const discount = (invoice.discount_amount || 0).toFixed(2);
  const buyerName = escapeXml(invoice.student_name || 'Student');
  const crNumber = escapeXml(tenant.cr_number || '');
  const address = escapeXml(tenant.address || 'Saudi Arabia');

  const itemsXml = (invoice.items || [{ description: 'Tuition Fee', amount: invoice.subtotal }])
    .map((item, idx) => {
      const lineAmt = item.amount.toFixed(2);
      const lineVat = (item.amount * 0.15).toFixed(2);
      return `
  <cac:InvoiceLine>
    <cbc:ID>${idx + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="PCE">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="SAR">${lineAmt}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="SAR">${lineVat}</cbc:TaxAmount>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${escapeXml(item.description)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>15</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="SAR">${lineAmt}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>urn:zatca.gov.sa:tranzact:billing:1.0</cbc:CustomizationID>
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:UUID>${crypto.randomUUID()}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${invoiceTypeCode === '388' ? '0100000' : '0200000'}">${invoiceTypeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="CRN">${crNumber}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:StreetName>${address}</cbc:StreetName>
        <cbc:CityName>Riyadh</cbc:CityName>
        <cbc:CountrySubentity>SA-01</cbc:CountrySubentity>
        <cac:Country>
          <cbc:IdentificationCode>SA</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${vatNumber}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${sellerName}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PostalAddress>
        <cbc:StreetName>Student Address</cbc:StreetName>
        <cbc:CityName>Riyadh</cbc:CityName>
        <cac:Country>
          <cbc:IdentificationCode>SA</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${buyerName}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:AllowanceChargeReason>Discount</cbc:AllowanceChargeReason>
    <cbc:Amount currencyID="SAR">${discount}</cbc:Amount>
  </cac:AllowanceCharge>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">${vatAmount}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="SAR">${subtotal}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="SAR">${vatAmount}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>15</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="SAR">${subtotal}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="SAR">${subtotal}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">${total}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="SAR">${discount}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="SAR">${total}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${itemsXml}
</Invoice>`;
}

// ---------------------------------------------------------------------------
// Invoice Hash (SHA-256 of canonical XML)
// ---------------------------------------------------------------------------

/**
 * Generates a SHA-256 hex hash of the UBL XML string.
 *
 * NOTE: ZATCA Phase 2 CSID signing requires a production certificate from the
 * ZATCA portal (https://fatoora.zatca.gov.sa). The cryptographic structure is
 * ready here — insert the certificate private key in ZATCA_PRIVATE_KEY env var
 * when production credentials are available.
 */
export function generateInvoiceHash(xml: string): string {
  return crypto.createHash('sha256').update(xml, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// PDF Generation
// ---------------------------------------------------------------------------

/**
 * Generates a clean ZATCA-compliant invoice PDF with embedded QR code.
 * Returns a Buffer containing the PDF bytes.
 */
export async function generateZATCAInvoicePDF(
  invoice: InvoiceData,
  tenant: TenantData,
): Promise<Buffer> {
  // Generate TLV QR and render it as a PNG data URL
  const tlvBase64 = generateTLVQR(invoice, tenant);
  const qrDataUrl = await QRCode.toDataURL(tlvBase64, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 150,
  });
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const sellerName = tenant.name || 'School';
    const vatNumber = tenant.vat_number || '300000000000003';
    const pageWidth = doc.page.width;
    const margin = 50;
    const contentWidth = pageWidth - margin * 2;

    // ---- Header ----
    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .text(sellerName, margin, 50, { align: 'center' });

    if (tenant.address) {
      doc.fontSize(10).font('Helvetica').text(tenant.address, { align: 'center' });
    }
    doc.fontSize(10).font('Helvetica').text(`VAT Registration No: ${vatNumber}`, { align: 'center' });
    if (tenant.phone) doc.text(`Tel: ${tenant.phone}`, { align: 'center' });

    doc.moveDown(0.5);
    doc
      .moveTo(margin, doc.y)
      .lineTo(pageWidth - margin, doc.y)
      .strokeColor('#888888')
      .stroke();
    doc.moveDown(0.5);

    // ---- Invoice Title ----
    const title =
      invoice.invoice_type === 'credit_note' ? 'CREDIT NOTE' : 'TAX INVOICE';
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .fillColor('#000000')
      .text(title, { align: 'center' });
    doc.moveDown(0.5);

    // ---- Invoice Meta ----
    const col1x = margin;
    const col2x = margin + contentWidth / 2;
    const metaY = doc.y;

    doc.fontSize(10).font('Helvetica-Bold').text('Invoice Number:', col1x, metaY);
    doc.font('Helvetica').text(invoice.invoice_number, col1x + 110, metaY);

    doc.font('Helvetica-Bold').text('Issue Date:', col2x, metaY);
    doc.font('Helvetica').text(invoice.issue_date.substring(0, 10), col2x + 80, metaY);

    doc.moveDown(0.3);
    const metaY2 = doc.y;
    doc.font('Helvetica-Bold').text('Bill To:', col1x, metaY2);
    doc.font('Helvetica').text(invoice.student_name || 'Student', col1x + 55, metaY2);

    doc.moveDown(1.5);

    // ---- Items Table ----
    const tableTop = doc.y;
    const colAmt = margin + contentWidth - 80;

    // Table header
    doc.rect(margin, tableTop, contentWidth, 20).fill('#f0f0f0').stroke();
    doc
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('Description', margin + 5, tableTop + 5)
      .text('Amount (SAR)', colAmt, tableTop + 5);

    let rowY = tableTop + 22;
    const items = invoice.items || [
      { description: 'Tuition Fee', amount: invoice.subtotal },
    ];

    for (const item of items) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#000000')
        .text(item.description, margin + 5, rowY)
        .text(item.amount.toFixed(2), colAmt, rowY);
      rowY += 18;
    }

    // Divider
    doc.moveTo(margin, rowY).lineTo(pageWidth - margin, rowY).stroke();
    rowY += 6;

    // Subtotals
    const labelX = colAmt - 100;
    const valueX = colAmt;

    if ((invoice.discount_amount || 0) > 0) {
      doc
        .font('Helvetica')
        .text('Subtotal:', labelX, rowY)
        .text(invoice.subtotal.toFixed(2), valueX, rowY);
      rowY += 16;
      doc
        .text('Discount:', labelX, rowY)
        .text(`(${(invoice.discount_amount || 0).toFixed(2)})`, valueX, rowY);
      rowY += 16;
    }

    doc
      .font('Helvetica')
      .text('VAT (15%):', labelX, rowY)
      .text(invoice.vat_amount.toFixed(2), valueX, rowY);
    rowY += 16;

    doc
      .moveTo(labelX, rowY)
      .lineTo(pageWidth - margin, rowY)
      .stroke();
    rowY += 4;

    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .text('TOTAL (SAR):', labelX, rowY)
      .text(invoice.total_amount.toFixed(2), valueX, rowY);

    // ---- QR Code (bottom-right) ----
    const qrSize = 100;
    const qrX = pageWidth - margin - qrSize;
    const qrY = doc.page.height - margin - qrSize - 30;

    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
    doc
      .fontSize(7)
      .font('Helvetica')
      .text('ZATCA QR Code', qrX, qrY + qrSize + 2, { width: qrSize, align: 'center' });

    // ---- ZATCA Compliance Notice ----
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#555555')
      .text(
        'This invoice complies with ZATCA Fatoora Phase 2 e-invoicing requirements.',
        margin,
        doc.page.height - margin - 20,
        { align: 'left' },
      );

    if (invoice.notes) {
      doc.moveDown(1).fontSize(9).fillColor('#000000').text(`Notes: ${invoice.notes}`);
    }

    doc.end();
  });
}
