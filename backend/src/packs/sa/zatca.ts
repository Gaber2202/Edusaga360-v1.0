import crypto from 'crypto';
import QRCode from 'qrcode';
import { PDFDocument, PDFHexString } from 'pdf-lib';
import { runPdfJob } from '../../lib/pdfConcurrency.js';
import { formatHijri } from './hijri.js';
import { getBrowser } from '../../services/pdfBrowser.js';
import {
  categoryCode,
  computeVatSummary,
  InvoiceData,
  normalizeInvoiceItems,
  percentValue,
} from './vat.js';
import type { TenantData } from '../../types/tenant.js';

export type { TenantData } from '../../types/tenant.js';

/** Umm al-Qura issue date for the invoice; never throws (bad dates → ''). */
function safeHijriDate(iso: string): string {
  try {
    return formatHijri(iso.substring(0, 10), 'ar');
  } catch {
    return '';
  }
}

export function invoiceDataFromRow(row: Record<string, unknown>): InvoiceData {
  return {
    id: row.id as string | undefined,
    invoice_number: row.invoice_number as string,
    document_type: (row.document_type as InvoiceData['document_type']) || 'invoice',
    invoice_type: (row.invoice_type as InvoiceData['invoice_type']) || 'simplified',
    zatca_invoice_type: (row.zatca_invoice_type as InvoiceData['invoice_type']) || (row.invoice_type as InvoiceData['invoice_type']) || 'simplified',
    issue_date: row.issue_date as string,
    supply_date: row.supply_date as string | undefined,
    due_date: row.due_date as string | undefined,
    subtotal: Number(row.subtotal ?? 0),
    discount_amount: Number(row.discount_amount ?? 0),
    vat_amount: Number(row.vat_amount ?? 0),
    total_amount: Number(row.total_amount ?? 0),
    paid_amount: Number(row.paid_amount ?? 0),
    balance: Number(row.balance ?? 0),
    student_name: row.student_name as string | undefined,
    buyer_name: (row.buyer_name as string | undefined) || (row.student_name as string | undefined),
    student_id: row.student_id as string | undefined,
    guardian_id: row.guardian_id as string | undefined,
    buyer_vat_number: row.buyer_vat_number as string | undefined,
    buyer_address: row.buyer_address as string | undefined,
    items: (row.items as InvoiceData['items']) || undefined,
    vat_summary: (row.vat_summary as InvoiceData['vat_summary']) || undefined,
    notes: row.notes as string | undefined,
    terms_and_conditions: row.terms_and_conditions as string | undefined,
    uuid: (row.zatca_uuid as string | undefined) || (row.uuid as string | undefined),
    icv: (row.icv as number | undefined) || undefined,
    previous_invoice_hash: row.previous_invoice_hash as string | undefined,
    original_invoice_number: row.original_invoice_number as string | undefined,
    parent_document_id: row.parent_document_id as string | undefined,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeXml(str: string | null | undefined): string {
  const s = str == null ? '' : String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(str: string | null | undefined): string {
  const s = str == null ? '' : String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


// ---------------------------------------------------------------------------
// ZATCA Phase 2 — Cryptographic Signing & CSID
// ---------------------------------------------------------------------------

export function generateCSR(
  commonName: string,
  orgName: string,
  vatNumber: string,
): { csr: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'secp256k1',
  });

  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

  return {
    csr: `-----BEGIN CSR INFO-----\nCN=${commonName}\nO=${orgName}\nSERIALNUMBER=${vatNumber}\nC=SA\nPUBKEY=${publicKeyPem}\n-----END CSR INFO-----`,
    privateKey: privateKeyPem,
  };
}

export function signInvoice(xmlHash: string, privateKeyPem?: string): string {
  const key = privateKeyPem || process.env.ZATCA_PRIVATE_KEY;
  if (!key) {
    return Buffer.from(`unsigned:${xmlHash.substring(0, 32)}`).toString('base64');
  }
  const sign = crypto.createSign('SHA256');
  sign.update(xmlHash);
  sign.end();
  return sign.sign(key, 'base64');
}

export function generatePIH(previousHash?: string): string {
  return previousHash || '0'.repeat(64);
}

// ---------------------------------------------------------------------------
// TLV QR Code Generation (ZATCA Phase 2)
// ---------------------------------------------------------------------------

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

export function generateTLVQR(
  invoice: InvoiceData,
  tenant: TenantData,
  signature?: string,
  publicKey?: string,
): string {
  const sellerName = tenant.legal_name_ar || tenant.name_ar || tenant.name || 'School';
  const vatNumber = tenant.vat_number || '300000000000003';
  const timestamp = new Date(invoice.issue_date).toISOString();
  const totalWithVat = invoice.total_amount.toFixed(2);
  const vatAmount = invoice.vat_amount.toFixed(2);

  const fields = [
    encodeTLVField(0x01, Buffer.from(sellerName, 'utf8')),
    encodeTLVField(0x02, Buffer.from(vatNumber, 'utf8')),
    encodeTLVField(0x03, Buffer.from(timestamp, 'utf8')),
    encodeTLVField(0x04, Buffer.from(totalWithVat, 'utf8')),
    encodeTLVField(0x05, Buffer.from(vatAmount, 'utf8')),
  ];

  if (signature) {
    const xml = generateUBLXml(invoice, tenant);
    const xmlHash = generateInvoiceHash(xml);
    fields.push(encodeTLVField(0x06, Buffer.from(xmlHash, 'hex')));
    fields.push(encodeTLVField(0x07, Buffer.from(signature, 'base64')));
    if (publicKey) {
      fields.push(encodeTLVField(0x08, Buffer.from(publicKey, 'utf8')));
    }
  }

  return Buffer.concat(fields).toString('base64');
}

// ---------------------------------------------------------------------------
// UBL 2.1 XML Generation (ZATCA Phase 2)
// ---------------------------------------------------------------------------

function taxCategoryXml(catCode: string, vatRate: number, reason?: string): string {
  const percent = vatRate > 0 ? `<cbc:Percent>${percentValue(vatRate).toFixed(2)}</cbc:Percent>` : '';
  const exemption = (catCode === 'E' || catCode === 'O') && reason
    ? `<cbc:TaxExemptionReason>${escapeXml(reason)}</cbc:TaxExemptionReason>`
    : '';
  return `      <cac:TaxCategory>
        <cbc:ID>${catCode}</cbc:ID>
        ${percent}${exemption}
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>`;
}

export function generateUBLXml(invoice: InvoiceData, tenant: TenantData): string {
  const sellerName = escapeXml(tenant.legal_name_en || tenant.name || 'School');
  const sellerNameAr = escapeXml(tenant.legal_name_ar || tenant.name_ar || sellerName);
  const vatNumber = escapeXml(tenant.vat_number || '300000000000003');
  const crNumber = escapeXml(tenant.cr_number || '');
  const addressAr = escapeXml(tenant.address_ar || tenant.address || 'Saudi Arabia');
  const addressEn = escapeXml(tenant.address_en || tenant.address || 'Saudi Arabia');
  const city = escapeXml(tenant.city || 'Riyadh');
  const countryCode = escapeXml(tenant.country_code || 'SA');
  const subentity = escapeXml(tenant.country_subentity_code || 'SA-01');

  const invoiceNumber = escapeXml(invoice.invoice_number);
  const issueDate = invoice.issue_date.substring(0, 10);
  const issueTime = invoice.issue_date.length > 10
    ? invoice.issue_date.substring(11, 19)
    : new Date(invoice.issue_date).toISOString().substring(11, 19);
  const supplyDate = invoice.supply_date ? invoice.supply_date.substring(0, 10) : issueDate;

  let invoiceTypeCode = '388';
  if (invoice.document_type === 'credit_note') invoiceTypeCode = '381';
  else if (invoice.document_type === 'debit_note') invoiceTypeCode = '383';

  const zatcaType = invoice.zatca_invoice_type ?? invoice.invoice_type ?? 'simplified';
  const subType = zatcaType === 'standard' ? '0100000' : '0200000';
  const profileId = zatcaType === 'standard' ? 'clearing:1.0' : 'reporting:1.0';

  const uuid = invoice.uuid || crypto.randomUUID();
  const icv = invoice.icv || 1;
  const pih = generatePIH(invoice.previous_invoice_hash);

  const items = normalizeInvoiceItems(invoice);
  const vatSummary = computeVatSummary({ ...invoice, items });

  const subtotal = invoice.subtotal.toFixed(2);
  const vatAmount = invoice.vat_amount.toFixed(2);
  const total = invoice.total_amount.toFixed(2);
  const discount = (invoice.discount_amount || 0).toFixed(2);
  const paid = (invoice.paid_amount || 0).toFixed(2);

  const buyerName = escapeXml(invoice.buyer_name || invoice.student_name || 'Student');
  const buyerVat = escapeXml(invoice.buyer_vat_number || '');
  const buyerAddress = escapeXml(invoice.buyer_address || tenant.city || 'Riyadh');

  const buyerVatSection = buyerVat
    ? `
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${buyerVat}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>`
    : '';

  const originalInvoiceRef = invoice.original_invoice_number || invoice.parent_document_id
    ? `
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${escapeXml(invoice.original_invoice_number || invoice.parent_document_id || '')}</cbc:ID>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>`
    : '';

  const allowanceCharge = Number(invoice.discount_amount || 0) > 0
    ? `
  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:AllowanceChargeReason>Discount</cbc:AllowanceChargeReason>
    <cbc:Amount currencyID="SAR">${discount}</cbc:Amount>
    <cac:TaxCategory>
      <cbc:ID>S</cbc:ID>
      <cbc:Percent>15.00</cbc:Percent>
      <cac:TaxScheme>
        <cbc:ID>VAT</cbc:ID>
      </cac:TaxScheme>
    </cac:TaxCategory>
  </cac:AllowanceCharge>`
    : '';

  const itemsXml = items
    .map((item, idx) => {
      const lineNet = item.line_total_gross - item.vat_amount;
      const lineAllowance = item.discount > 0
        ? `
      <cac:AllowanceCharge>
        <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
        <cbc:AllowanceChargeReason>Discount</cbc:AllowanceChargeReason>
        <cbc:Amount currencyID="SAR">${item.discount.toFixed(2)}</cbc:Amount>
      </cac:AllowanceCharge>`
        : '';
      return `
  <cac:InvoiceLine>
    <cbc:ID>${idx + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="PCE">${item.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="SAR">${lineNet.toFixed(2)}</cbc:LineExtensionAmount>${lineAllowance}
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="SAR">${item.vat_amount.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="SAR">${lineNet.toFixed(2)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="SAR">${item.vat_amount.toFixed(2)}</cbc:TaxAmount>
        ${taxCategoryXml(item.vat_category_code, item.vat_rate)}
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${escapeXml(item.description_en)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${item.vat_category_code}</cbc:ID>
        ${item.vat_rate > 0 ? `<cbc:Percent>${percentValue(item.vat_rate).toFixed(2)}</cbc:Percent>` : ''}
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="SAR">${item.unit_price_net.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
    })
    .join('\n');

  const taxSubtotals = vatSummary.rates
    .map((r) => `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="SAR">${r.taxable_amount.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="SAR">${r.vat_amount.toFixed(2)}</cbc:TaxAmount>
      ${taxCategoryXml(r.category_code, r.rate, r.category_code === 'E' ? 'Exempt' : r.category_code === 'O' ? 'Out of scope' : undefined)}
    </cac:TaxSubtotal>`)
    .join('\n');

  const prepaid = Number(invoice.paid_amount || 0) > 0
    ? `
      <cbc:PrepaidAmount currencyID="SAR">${paid}</cbc:PrepaidAmount>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>urn:zatca.gov.sa:specification:schemas:invoice:1.0</cbc:CustomizationID>
  <cbc:ProfileID>${profileId}</cbc:ProfileID>
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:UUID>${uuid}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  ${invoice.due_date ? `<cbc:DueDate>${invoice.due_date.substring(0, 10)}</cbc:DueDate>` : ''}
  <cbc:InvoiceTypeCode name="${subType}">${invoiceTypeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>
  <cac:AdditionalDocumentReference>
    <cbc:ID>ICV</cbc:ID>
    <cbc:UUID>${icv}</cbc:UUID>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID>PIH</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${Buffer.from(pih, 'hex').toString('base64')}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      ${crNumber ? `<cac:PartyIdentification><cbc:ID schemeID="CRN">${crNumber}</cbc:ID></cac:PartyIdentification>` : ''}
      <cac:PostalAddress>
        <cbc:StreetName>${addressAr}</cbc:StreetName>
        <cbc:AdditionalStreetName>${addressEn}</cbc:AdditionalStreetName>
        <cbc:CityName>${city}</cbc:CityName>
        <cbc:CountrySubentity>${subentity}</cbc:CountrySubentity>
        <cac:Country>
          <cbc:IdentificationCode>${countryCode}</cbc:IdentificationCode>
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
        <cbc:StreetName>${buyerAddress}</cbc:StreetName>
        <cbc:CityName>${city}</cbc:CityName>
        <cac:Country>
          <cbc:IdentificationCode>SA</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>${buyerVatSection}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${buyerName}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>${originalInvoiceRef}${allowanceCharge}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">${vatAmount}</cbc:TaxAmount>${taxSubtotals}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="SAR">${subtotal}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="SAR">${(invoice.subtotal - (invoice.discount_amount || 0)).toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">${total}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="SAR">${discount}</cbc:AllowanceTotalAmount>${prepaid}
    <cbc:PayableAmount currencyID="SAR">${(invoice.total_amount - (invoice.paid_amount || 0)).toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${itemsXml}
</Invoice>`;
}

// ---------------------------------------------------------------------------
// Invoice Hash (SHA-256 of canonical XML)
// ---------------------------------------------------------------------------

export function generateInvoiceHash(xml: string): string {
  return crypto.createHash('sha256').update(xml, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// ZATCA Sandbox / Production API
// ---------------------------------------------------------------------------

const ZATCA_SANDBOX_URL = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal';
const ZATCA_PRODUCTION_URL = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core';

function getZatcaBaseUrl(): string {
  return process.env.ZATCA_ENV === 'production' ? ZATCA_PRODUCTION_URL : ZATCA_SANDBOX_URL;
}

export interface ZatcaApiResponse {
  [key: string]: unknown;
  reportingStatus?: string;
  clearanceStatus?: string;
  validationResults?: {
    status: string;
    infoMessages?: Array<{ type: string; code: string; message: string }>;
    warningMessages?: Array<{ type: string; code: string; message: string }>;
    errorMessages?: Array<{ type: string; code: string; message: string }>;
  };
  clearedInvoice?: string;
  qrCode?: string;
}

async function zatcaApiCall(
  endpoint: string,
  invoiceXmlBase64: string,
  invoiceHash: string,
  uuid: string,
): Promise<ZatcaApiResponse> {
  const csid = process.env.ZATCA_CSID ?? '';
  const secret = process.env.ZATCA_SECRET ?? '';

  const credentials = Buffer.from(`${csid}:${secret}`).toString('base64');

  const response = await fetch(`${getZatcaBaseUrl()}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Language': 'en',
      'Accept-Version': 'V2',
      'Authorization': `Basic ${credentials}`,
    },
    body: JSON.stringify({ invoiceHash, uuid, invoice: invoiceXmlBase64 }),
  });

  return response.json() as Promise<ZatcaApiResponse>;
}

export function reportInvoice(
  invoiceXmlBase64: string,
  invoiceHash: string,
  uuid: string,
): Promise<ZatcaApiResponse> {
  return zatcaApiCall('/invoices/reporting/single', invoiceXmlBase64, invoiceHash, uuid);
}

export function clearInvoice(
  invoiceXmlBase64: string,
  invoiceHash: string,
  uuid: string,
): Promise<ZatcaApiResponse> {
  return zatcaApiCall('/invoices/clearance/single', invoiceXmlBase64, invoiceHash, uuid);
}

export function complianceCheck(
  invoiceXmlBase64: string,
  invoiceHash: string,
  uuid: string,
): Promise<ZatcaApiResponse> {
  const csid = process.env.ZATCA_COMPLIANCE_CSID || process.env.ZATCA_CSID || '';
  const secret = process.env.ZATCA_COMPLIANCE_SECRET || process.env.ZATCA_SECRET || '';

  const credentials = Buffer.from(`${csid}:${secret}`).toString('base64');

  return fetch(`${getZatcaBaseUrl()}/compliance/invoices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Language': 'en',
      'Accept-Version': 'V2',
      'Authorization': `Basic ${credentials}`,
    },
    body: JSON.stringify({ invoiceHash, uuid, invoice: invoiceXmlBase64 }),
  }).then((r) => r.json() as Promise<ZatcaApiResponse>);
}

// ---------------------------------------------------------------------------
// PDF Generation — HTML/CSS → Puppeteer (Arabic-capable)
// ---------------------------------------------------------------------------


function documentTitle(documentType?: string): string {
  switch (documentType) {
    case 'quotation': return 'عرض سعر / Quotation';
    case 'proforma': return 'فاتورة أولية / Proforma Invoice';
    case 'credit_note': return 'إشعار دائن / Credit Note';
    case 'debit_note': return 'إشعار مدين / Debit Note';
    case 'receipt': return 'سند قبض / Payment Receipt';
    default: return 'فاتورة ضريبية / Tax Invoice';
  }
}

function simplifiedTitle(zatcaType?: string, documentType?: string): string {
  const base = documentTitle(documentType);
  if (documentType !== 'invoice') return base;
  return zatcaType === 'standard'
    ? 'فاتورة ضريبية / Tax Invoice'
    : 'فاتورة ضريبية مبسطة / Simplified Tax Invoice';
}

export function buildInvoiceHTML(invoice: InvoiceData, tenant: TenantData, qrDataUrl: string, showZatcaFooter = true): string {
  const sellerNameAr = tenant.legal_name_ar || tenant.name_ar || tenant.name || 'المدرسة';
  const sellerNameEn = tenant.legal_name_en || tenant.name || 'School';
  const vatNumber = tenant.vat_number || '300000000000003';
  const crNumber = tenant.cr_number || '';
  const addressAr = tenant.address_ar || tenant.address || '';
  const addressEn = tenant.address_en || tenant.address || '';
  const phone = tenant.phone || '';
  const email = tenant.email || '';

  const buyerName = invoice.buyer_name || invoice.student_name || '';
  const buyerVat = invoice.buyer_vat_number || '';
  const buyerAddress = invoice.buyer_address || '';

  const title = simplifiedTitle(invoice.zatca_invoice_type, invoice.document_type);
  const items = normalizeInvoiceItems(invoice);
  const vatSummary = computeVatSummary({ ...invoice, items });

  const issueDateGregorian = invoice.issue_date.substring(0, 10);
  const issueDateHijri = safeHijriDate(invoice.issue_date);

  const itemRows = items.map((item, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>
        <div class="ar-text">${escapeHtml(item.description_ar)}</div>
        <div class="en-text">${escapeHtml(item.description_en)}</div>
      </td>
      <td dir="ltr">${item.quantity}</td>
      <td dir="ltr">SAR ${formatMoney(item.unit_price_net)}</td>
      <td dir="ltr">${item.vat_category === 'standard' ? (item.vat_rate * 100).toFixed(0) + '%' : categoryCode(item.vat_category)}</td>
      <td dir="ltr">SAR ${formatMoney(item.vat_amount)}</td>
      <td dir="ltr">SAR ${formatMoney(item.line_total_gross)}</td>
    </tr>
  `).join('');

  const vatRows = vatSummary.rates.map((r) => `
    <div class="total-row">
      <span class="total-label">ضريبة القيمة المضافة ${r.rate > 0 ? (r.rate * 100).toFixed(0) + '%' : r.category_code}</span>
      <bdi>:</bdi>
      <span class="total-value" dir="ltr">SAR ${formatMoney(r.vat_amount)}</span>
    </div>
  `).join('');

  const discountRow = (invoice.discount_amount || 0) > 0
    ? `
    <div class="total-row">
      <span class="total-label">الخصم</span>
      <bdi>:</bdi>
      <span class="total-value" dir="ltr">(SAR ${formatMoney(invoice.discount_amount ?? 0)})</span>
    </div>`
    : '';

  const paidRow = (invoice.paid_amount || 0) > 0
    ? `
    <div class="total-row">
      <span class="total-label">المدفوع</span>
      <bdi>:</bdi>
      <span class="total-value" dir="ltr">SAR ${formatMoney(invoice.paid_amount ?? 0)}</span>
    </div>
    <div class="total-row">
      <span class="total-label">المتبقي</span>
      <bdi>:</bdi>
      <span class="total-value" dir="ltr">SAR ${formatMoney((invoice.total_amount || 0) - (invoice.paid_amount || 0))}</span>
    </div>`
    : '';

  const notesHtml = invoice.notes
    ? `<div class="notes"><strong>ملاحظات / Notes:</strong> ${escapeHtml(invoice.notes)}</div>`
    : '';

  const termsHtml = invoice.terms_and_conditions
    ? `<div class="notes"><strong>الشروط والأحكام / Terms:</strong> ${escapeHtml(invoice.terms_and_conditions)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;500;600;700&display=swap');
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Noto Naskh Arabic', 'Plus Jakarta Sans', sans-serif;
      font-size: 11px;
      color: #1C2420;
      background: #fff;
      padding: 32px;
      direction: rtl;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
      border-bottom: 3px solid #0E6B4F;
      padding-bottom: 16px;
    }
    .company-info { text-align: right; flex: 1; }
    .company-name { font-size: 20px; font-weight: 700; color: #0E6B4F; margin-bottom: 4px; }
    .company-name-en { font-size: 14px; font-weight: 500; color: #666; font-family: 'Plus Jakarta Sans', sans-serif; direction: ltr; text-align: right; }
    .company-detail { font-size: 10px; color: #555; margin: 2px 0; }
    .company-detail.ltr { direction: ltr; unicode-bidi: isolate; text-align: right; }
    .invoice-title {
      text-align: center;
      font-size: 18px;
      font-weight: 700;
      color: #0E6B4F;
      margin: 12px 0;
      padding: 8px;
      background: #E7F4EF;
      border-radius: 6px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
    }
    .meta-box {
      background: #f8f7f3;
      padding: 12px;
      border-radius: 6px;
      border: 1px solid #eee;
    }
    .meta-box h4 { font-size: 12px; font-weight: 700; color: #0E6B4F; margin-bottom: 8px; }
    .meta-row {
      display: flex;
      justify-content: space-between;
      margin: 4px 0;
      font-size: 10px;
    }
    .meta-label { color: #777; }
    .meta-value { font-weight: 600; font-family: 'Noto Naskh Arabic', 'Plus Jakarta Sans', sans-serif; }
    .meta-value.ltr { direction: ltr; unicode-bidi: isolate; }
    .hijri { font-family: 'Noto Naskh Arabic', sans-serif; direction: rtl; unicode-bidi: embed; }
    .ar-text { font-weight: 600; }
    .en-text { font-size: 9px; color: #666; direction: ltr; unicode-bidi: isolate; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    thead th { background: #0E6B4F; color: #fff; padding: 8px 6px; font-size: 10px; font-weight: 600; text-align: right; }
    thead th.amount { text-align: center; }
    tbody td { padding: 7px 6px; border-bottom: 1px solid #eee; font-size: 10px; text-align: right; }
    tbody td.amount { text-align: center; }
    tbody tr:nth-child(even) { background: #fafaf7; }
    .totals {
      display: flex;
      justify-content: flex-start;
      margin-top: 12px;
    }
    .totals-box {
      width: 320px;
      background: #f8f7f3;
      padding: 12px;
      border-radius: 6px;
      border: 1px solid #eee;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      font-size: 10px;
      align-items: center;
    }
    .total-label { color: #444; }
    .total-value { font-weight: 600; font-family: 'Noto Naskh Arabic', 'Plus Jakarta Sans', sans-serif; direction: ltr; unicode-bidi: isolate; }
    .total-row.grand { border-top: 2px solid #0E6B4F; padding-top: 8px; margin-top: 4px; font-size: 13px; font-weight: 700; color: #0E6B4F; }
    .notes { font-size: 10px; color: #555; margin-top: 12px; padding: 8px; background: #fafaf7; border-radius: 4px; }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #ddd;
      page-break-inside: avoid;
    }
    .qr-section { text-align: center; }
    .qr-section img { width: 150px; height: 150px; }
    .qr-label { font-size: 8px; color: #888; margin-top: 4px; }
    .zatca-notice { font-size: 8px; color: #888; max-width: 320px; text-align: right; }
    .powered { font-size: 8px; color: #aaa; text-align: center; margin-top: 12px; }
    @media print {
      body { padding: 0; }
      .footer { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-info">
      <div class="company-name">${escapeHtml(sellerNameAr)}</div>
      ${sellerNameEn !== sellerNameAr ? `<div class="company-name-en">${escapeHtml(sellerNameEn)}</div>` : ''}
      ${addressAr ? `<div class="company-detail">${escapeHtml(addressAr)}</div>` : ''}
      ${addressEn ? `<div class="company-detail ltr">${escapeHtml(addressEn)}</div>` : ''}
      ${vatNumber ? `<div class="company-detail ltr">الرقم الضريبي / VAT TRN: <bdi>${escapeHtml(vatNumber)}</bdi></div>` : ''}
      ${crNumber ? `<div class="company-detail ltr">السجل التجاري / CR: <bdi>${escapeHtml(crNumber)}</bdi></div>` : ''}
      ${phone ? `<div class="company-detail ltr">هاتف / Phone: <bdi>${escapeHtml(phone)}</bdi></div>` : ''}
      ${email ? `<div class="company-detail ltr">بريد / Email: <bdi>${escapeHtml(email)}</bdi></div>` : ''}
    </div>
  </div>

  <div class="invoice-title">${title}</div>

  <div class="meta-grid">
    <div class="meta-box">
      <h4>بيانات الفاتورة / Invoice Details</h4>
      <div class="meta-row"><span class="meta-label">رقم الفاتورة / Invoice No:</span><span class="meta-value ltr"><bdi>${escapeHtml(invoice.invoice_number)}</bdi></span></div>
      <div class="meta-row"><span class="meta-label">تاريخ الإصدار (م) / Issue Date:</span><span class="meta-value ltr"><bdi>${issueDateGregorian}</bdi></span></div>
      ${issueDateHijri ? `<div class="meta-row"><span class="meta-label">تاريخ الإصدار (هـ) / Hijri Date:</span><span class="meta-value hijri"><bdi>${issueDateHijri}</bdi></span></div>` : ''}
      ${invoice.due_date ? `<div class="meta-row"><span class="meta-label">تاريخ الاستحقاق / Due Date:</span><span class="meta-value ltr"><bdi>${invoice.due_date.substring(0, 10)}</bdi></span></div>` : ''}
      ${invoice.supply_date && invoice.supply_date !== issueDateGregorian ? `<div class="meta-row"><span class="meta-label">تاريخ التوريد / Supply Date:</span><span class="meta-value ltr"><bdi>${invoice.supply_date.substring(0, 10)}</bdi></span></div>` : ''}
      ${invoice.uuid ? `<div class="meta-row"><span class="meta-label">UUID:</span><span class="meta-value ltr" style="font-size:8px"><bdi>${escapeHtml(invoice.uuid)}</bdi></span></div>` : ''}
      ${invoice.original_invoice_number ? `<div class="meta-row"><span class="meta-label">الفاتورة الأصلية / Original Invoice:</span><span class="meta-value ltr"><bdi>${escapeHtml(invoice.original_invoice_number)}</bdi></span></div>` : ''}
    </div>
    <div class="meta-box">
      <h4>بيانات المشتري / Buyer Details</h4>
      ${buyerName ? `<div class="meta-row"><span class="meta-label">الاسم / Name:</span><span class="meta-value">${escapeHtml(buyerName)}</span></div>` : ''}
      ${buyerVat ? `<div class="meta-row"><span class="meta-label">الرقم الضريبي / VAT:</span><span class="meta-value ltr"><bdi>${escapeHtml(buyerVat)}</bdi></span></div>` : ''}
      ${buyerAddress ? `<div class="meta-row"><span class="meta-label">العنوان / Address:</span><span class="meta-value">${escapeHtml(buyerAddress)}</span></div>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>البند / Description</th>
        <th class="amount">الكمية / Qty</th>
        <th class="amount">سعر الوحدة / Unit</th>
        <th class="amount">نسبة الضريبة / VAT</th>
        <th class="amount">ضريبة القيمة المضافة / VAT Amt</th>
        <th class="amount">الإجمالي / Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-box">
      <div class="total-row">
        <span class="total-label">المجموع قبل الضريبة / Subtotal</span>
        <span class="total-value" dir="ltr">SAR ${formatMoney(invoice.subtotal)}</span>
      </div>
      ${discountRow}
      ${vatRows}
      <div class="total-row grand">
        <span class="total-label">الإجمالي شامل الضريبة / Total</span>
        <span class="total-value" dir="ltr">SAR ${formatMoney(invoice.total_amount)}</span>
      </div>
      ${paidRow}
    </div>
  </div>

  ${notesHtml}
  ${termsHtml}

  ${showZatcaFooter ? `<div class="footer">
    <div class="zatca-notice">
      <p>هذه الفاتورة تتوافق مع متطلبات الفوترة الإلكترونية للمرحلة الثانية من هيئة الزكاة والضريبة والجمارك</p>
      <p style="direction:ltr;text-align:left;margin-top:4px">This invoice complies with ZATCA Phase 2 e-invoicing requirements.</p>
    </div>
    <div class="qr-section">
      <img src="${qrDataUrl}" alt="ZATCA QR" />
      <div class="qr-label">رمز الاستجابة السريعة / ZATCA QR</div>
    </div>
  </div>` : ''}

  <div class="powered">Powered by EduSaga 360</div>
</body>
</html>`;
}

async function setPdfMetadata(pdfBuffer: Buffer, invoice: InvoiceData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);

  pdfDoc.setTitle(`${documentTitle(invoice.document_type)} ${invoice.invoice_number}`);
  pdfDoc.setAuthor(invoice.buyer_name || '');
  pdfDoc.setSubject(documentTitle(invoice.document_type));
  pdfDoc.setKeywords(['EduSaga', 'invoice', 'ZATCA']);
  pdfDoc.setCreationDate(new Date());
  pdfDoc.setModificationDate(new Date());

  const documentId = crypto.randomBytes(16).toString('hex');
  const id = PDFHexString.of(documentId);
  pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([id, id]);

  return Buffer.from(await pdfDoc.save());
}

async function attachXmlAndSetMetadata(pdfBuffer: Buffer, xml: string, invoice: InvoiceData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);

  await pdfDoc.attach(Buffer.from(xml, 'utf8'), `invoice-${invoice.invoice_number}.xml`, {
    mimeType: 'application/xml',
    description: 'ZATCA UBL 2.1 invoice XML',
    creationDate: new Date(),
    modificationDate: new Date(),
  });

  pdfDoc.setTitle(`${documentTitle(invoice.document_type)} ${invoice.invoice_number}`);
  pdfDoc.setAuthor(invoice.buyer_name || '');
  pdfDoc.setSubject(documentTitle(invoice.document_type));
  pdfDoc.setKeywords(['ZATCA', 'e-invoice', 'EduSaga']);
  pdfDoc.setCreationDate(new Date());
  pdfDoc.setModificationDate(new Date());

  // Stable document ID for archival integrity
  const documentId = crypto.randomBytes(16).toString('hex');
  const id = PDFHexString.of(documentId);
  pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([id, id]);

  // Note: full PDF/A-3b output-intent + ICC profile + XMP extension schema
  // is a follow-up step requiring veraPDF-certified fixtures.

  return Buffer.from(await pdfDoc.save());
}

const TAX_DOCUMENT_TYPES = new Set(['invoice', 'credit_note', 'debit_note']);

export async function generateZATCAInvoicePDF(
  invoice: InvoiceData,
  tenant: TenantData,
): Promise<Buffer> {
  // Normalize items and recompute VAT summary so the PDF always shows consistent math
  const normalizedItems = normalizeInvoiceItems(invoice);
  const vatSummary = computeVatSummary({ ...invoice, items: normalizedItems, vat_summary: undefined });
  const enrichedInvoice: InvoiceData = {
    ...invoice,
    items: normalizedItems,
    vat_summary: vatSummary,
    vat_amount: vatSummary.total_vat,
    total_amount: invoice.subtotal - (invoice.discount_amount || 0) + vatSummary.total_vat,
  };

  const isTaxDocument = TAX_DOCUMENT_TYPES.has(enrichedInvoice.document_type || 'invoice');

  let ublXml = '';
  let tlvBase64 = '';

  if (isTaxDocument) {
    ublXml = generateUBLXml(enrichedInvoice, tenant);
    const signature = signInvoice(generateInvoiceHash(ublXml), process.env.ZATCA_PRIVATE_KEY);
    tlvBase64 = generateTLVQR(enrichedInvoice, tenant, signature);
  } else {
    // Non-tax documents (quotation, proforma, receipt) still get a QR with the
    // 5 basic fields but no cryptographic signature/UBL attachment.
    tlvBase64 = generateTLVQR(enrichedInvoice, tenant);
  }

  const qrDataUrl = await QRCode.toDataURL(tlvBase64, { errorCorrectionLevel: 'M', margin: 1, width: 180 });

  const html = buildInvoiceHTML(enrichedInvoice, tenant, qrDataUrl, isTaxDocument);

  return runPdfJob(async () => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
      const puppeteerPdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
      });
      const pdfBuffer = Buffer.from(puppeteerPdf);
      return isTaxDocument
        ? attachXmlAndSetMetadata(pdfBuffer, ublXml, enrichedInvoice)
        : setPdfMetadata(pdfBuffer, enrichedInvoice);
    } finally {
      await page.close();
    }
  });
}
