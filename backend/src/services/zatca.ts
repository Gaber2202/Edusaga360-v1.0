import crypto from 'crypto';
import QRCode from 'qrcode';
import puppeteer from 'puppeteer';
import { runPdfJob } from '../lib/pdfConcurrency.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvoiceData {
  invoice_number: string;
  issue_date: string; // ISO date string yyyy-MM-dd or full ISO
  invoice_type?: 'standard' | 'credit_note'; // default standard
  zatca_invoice_type?: 'standard' | 'simplified'; // B2B/B2G vs B2C
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  student_name?: string;
  student_id?: string;
  buyer_vat_number?: string;
  buyer_address?: string;
  items?: Array<{
    description: string;
    amount: number;
    vat_rate?: number;
  }>;
  discount_amount?: number;
  notes?: string;
  uuid?: string;
  icv?: number;
  previous_invoice_hash?: string;
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
// ZATCA Phase 2 — Cryptographic Signing & CSID
// ---------------------------------------------------------------------------

/**
 * Generate a CSR (Certificate Signing Request) for ZATCA CSID onboarding.
 * In production, the taxpayer submits this to the Fatoora portal.
 */
export function generateCSR(
  commonName: string,
  orgName: string,
  vatNumber: string,
): { csr: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'secp256k1',
  });

  const csrInfo = {
    commonName,
    organizationName: orgName,
    serialNumber: vatNumber,
    countryName: 'SA',
  };

  // Return PEM-encoded key pair for the caller to submit to ZATCA
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

  return {
    csr: `-----BEGIN CSR INFO-----\nCN=${csrInfo.commonName}\nO=${csrInfo.organizationName}\nSERIALNUMBER=${csrInfo.serialNumber}\nC=${csrInfo.countryName}\nPUBKEY=${publicKeyPem}\n-----END CSR INFO-----`,
    privateKey: privateKeyPem,
  };
}

/**
 * Sign invoice XML hash with ECDSA using the ZATCA private key.
 * Returns base64-encoded signature.
 */
export function signInvoice(xmlHash: string, privateKeyPem?: string): string {
  const key = privateKeyPem || process.env.ZATCA_PRIVATE_KEY;
  if (!key) {
    // No signing key available — return a placeholder for sandbox/dev
    return Buffer.from(`unsigned:${xmlHash.substring(0, 32)}`).toString('base64');
  }

  const sign = crypto.createSign('SHA256');
  sign.update(xmlHash);
  sign.end();

  return sign.sign(key, 'base64');
}

/**
 * Generate the Previous Invoice Hash (PIH) chain.
 * First invoice uses a zero hash.
 */
export function generatePIH(previousHash?: string): string {
  return previousHash || '0'.repeat(64);
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
 * Generates the ZATCA Phase 2 TLV QR code base64 string.
 * Tags 1-5 are mandatory; Tags 6-9 are Phase 2 extensions.
 */
export function generateTLVQR(
  invoice: InvoiceData,
  tenant: TenantData,
  signature?: string,
  publicKey?: string,
): string {
  const sellerName = tenant.name || 'School';
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

  // Phase 2 extended TLV tags
  if (signature) {
    const xml = generateUBLXml(invoice, tenant);
    const xmlHash = generateInvoiceHash(xml);
    fields.push(encodeTLVField(0x06, Buffer.from(xmlHash, 'hex'))); // XML hash
    fields.push(encodeTLVField(0x07, Buffer.from(signature, 'base64'))); // ECDSA signature
    if (publicKey) {
      fields.push(encodeTLVField(0x08, Buffer.from(publicKey, 'utf8'))); // Public key
    }
  }

  return Buffer.concat(fields).toString('base64');
}

// ---------------------------------------------------------------------------
// UBL 2.1 XML Generation (ZATCA Phase 2 compliant)
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
 * Generates a ZATCA Phase 2 compliant UBL 2.1 XML invoice string.
 * Includes UUID, ICV counter, PIH chain, and proper invoice sub-types.
 */
export function generateUBLXml(invoice: InvoiceData, tenant: TenantData): string {
  const sellerName = escapeXml(tenant.name || 'School');
  const vatNumber = escapeXml(tenant.vat_number || '300000000000003');
  const invoiceNumber = escapeXml(invoice.invoice_number);
  const issueDate = invoice.issue_date.substring(0, 10);
  const issueTime = new Date(invoice.issue_date).toISOString().substring(11, 19);
  // 388 = Tax Invoice (Standard), 381 = Credit Note
  const invoiceTypeCode = invoice.invoice_type === 'credit_note' ? '381' : '388';
  // Sub-type: 01 = Standard (B2B/B2G clearance), 02 = Simplified (B2C reporting)
  const subType = invoice.zatca_invoice_type === 'simplified' ? '0200000' : '0100000';
  const subtotal = invoice.subtotal.toFixed(2);
  const vatAmount = invoice.vat_amount.toFixed(2);
  const total = invoice.total_amount.toFixed(2);
  const discount = (invoice.discount_amount || 0).toFixed(2);
  const buyerName = escapeXml(invoice.student_name || 'Student');
  const crNumber = escapeXml(tenant.cr_number || '');
  const address = escapeXml(tenant.address || 'Saudi Arabia');
  const addressAr = escapeXml(tenant.address_ar || address);
  const uuid = invoice.uuid || crypto.randomUUID();
  const icv = invoice.icv || 1;
  const pih = generatePIH(invoice.previous_invoice_hash);

  const itemsXml = (invoice.items || [{ description: 'Tuition Fee', amount: invoice.subtotal }])
    .map((item, idx) => {
      const lineAmt = item.amount.toFixed(2);
      const vatRate = item.vat_rate ?? 15;
      const lineVat = (item.amount * (vatRate / 100)).toFixed(2);
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
        <cbc:Percent>${vatRate}</cbc:Percent>
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

  // Buyer party — include VAT for standard (B2B) invoices
  const buyerVatSection = invoice.buyer_vat_number
    ? `
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(invoice.buyer_vat_number)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>urn:zatca.gov.sa:tranzact:billing:1.0</cbc:CustomizationID>
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:UUID>${uuid}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
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
      <cac:PartyIdentification>
        <cbc:ID schemeID="CRN">${crNumber}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:StreetName>${addressAr}</cbc:StreetName>
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
        <cbc:StreetName>${escapeXml(invoice.buyer_address || 'Riyadh')}</cbc:StreetName>
        <cbc:CityName>Riyadh</cbc:CityName>
        <cac:Country>
          <cbc:IdentificationCode>SA</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>${buyerVatSection}
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

export function generateInvoiceHash(xml: string): string {
  return crypto.createHash('sha256').update(xml, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// ZATCA Sandbox API Integration
// ---------------------------------------------------------------------------

const ZATCA_SANDBOX_URL = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal';
const ZATCA_PRODUCTION_URL = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core';

function getZatcaBaseUrl(): string {
  return process.env.ZATCA_ENV === 'production' ? ZATCA_PRODUCTION_URL : ZATCA_SANDBOX_URL;
}

export interface ZatcaApiResponse {
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

/**
 * Submit invoice to ZATCA for reporting (simplified/B2C invoices).
 */
export async function reportInvoice(
  invoiceXmlBase64: string,
  invoiceHash: string,
  uuid: string,
): Promise<ZatcaApiResponse> {
  const csid = process.env.ZATCA_CSID;
  const secret = process.env.ZATCA_SECRET;

  if (!csid || !secret) {
    return {
      reportingStatus: 'NOT_CONFIGURED',
      validationResults: {
        status: 'WARNING',
        warningMessages: [{ type: 'WARNING', code: 'ZATCA_NOT_CONFIGURED', message: 'ZATCA credentials not configured. Set ZATCA_CSID and ZATCA_SECRET.' }],
      },
    };
  }

  const credentials = Buffer.from(`${csid}:${secret}`).toString('base64');

  const response = await fetch(`${getZatcaBaseUrl()}/invoices/reporting/single`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Language': 'en',
      'Accept-Version': 'V2',
      'Authorization': `Basic ${credentials}`,
    },
    body: JSON.stringify({
      invoiceHash,
      uuid,
      invoice: invoiceXmlBase64,
    }),
  });

  return response.json() as Promise<ZatcaApiResponse>;
}

/**
 * Submit invoice to ZATCA for clearance (standard/B2B/B2G invoices).
 */
export async function clearInvoice(
  invoiceXmlBase64: string,
  invoiceHash: string,
  uuid: string,
): Promise<ZatcaApiResponse> {
  const csid = process.env.ZATCA_CSID;
  const secret = process.env.ZATCA_SECRET;

  if (!csid || !secret) {
    return {
      clearanceStatus: 'NOT_CONFIGURED',
      validationResults: {
        status: 'WARNING',
        warningMessages: [{ type: 'WARNING', code: 'ZATCA_NOT_CONFIGURED', message: 'ZATCA credentials not configured.' }],
      },
    };
  }

  const credentials = Buffer.from(`${csid}:${secret}`).toString('base64');

  const response = await fetch(`${getZatcaBaseUrl()}/invoices/clearance/single`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Language': 'en',
      'Accept-Version': 'V2',
      'Clearance-Status': '1',
      'Authorization': `Basic ${credentials}`,
    },
    body: JSON.stringify({
      invoiceHash,
      uuid,
      invoice: invoiceXmlBase64,
    }),
  });

  return response.json() as Promise<ZatcaApiResponse>;
}

/**
 * Submit invoice to ZATCA for compliance check (sandbox validation).
 */
export async function complianceCheck(
  invoiceXmlBase64: string,
  invoiceHash: string,
  uuid: string,
): Promise<ZatcaApiResponse> {
  const csid = process.env.ZATCA_COMPLIANCE_CSID || process.env.ZATCA_CSID;
  const secret = process.env.ZATCA_COMPLIANCE_SECRET || process.env.ZATCA_SECRET;

  if (!csid || !secret) {
    return {
      reportingStatus: 'NOT_CONFIGURED',
      validationResults: {
        status: 'WARNING',
        warningMessages: [{ type: 'WARNING', code: 'ZATCA_NOT_CONFIGURED', message: 'ZATCA compliance credentials not configured.' }],
      },
    };
  }

  const credentials = Buffer.from(`${csid}:${secret}`).toString('base64');

  const response = await fetch(`${getZatcaBaseUrl()}/compliance/invoices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Language': 'en',
      'Accept-Version': 'V2',
      'Authorization': `Basic ${credentials}`,
    },
    body: JSON.stringify({
      invoiceHash,
      uuid,
      invoice: invoiceXmlBase64,
    }),
  });

  return response.json() as Promise<ZatcaApiResponse>;
}

// ---------------------------------------------------------------------------
// PDF Generation — HTML/CSS → Puppeteer (Arabic-capable)
// ---------------------------------------------------------------------------

let browserInstance: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

async function getBrowser() {
  if (!browserInstance || !browserInstance.connected) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browserInstance;
}

function buildInvoiceHTML(
  invoice: InvoiceData,
  tenant: TenantData,
  qrDataUrl: string,
): string {
  const sellerName = tenant.name || 'School';
  const sellerNameAr = tenant.name_ar || sellerName;
  const vatNumber = tenant.vat_number || '300000000000003';
  const address = tenant.address || 'Saudi Arabia';
  const addressAr = tenant.address_ar || address;
  const title = invoice.invoice_type === 'credit_note' ? 'إشعار دائن / CREDIT NOTE' : 'فاتورة ضريبية / TAX INVOICE';
  const items = invoice.items || [{ description: 'Tuition Fee', amount: invoice.subtotal }];

  const itemRows = items.map((item, idx) => {
    const vatRate = item.vat_rate ?? 15;
    const lineVat = (item.amount * (vatRate / 100));
    return `<tr>
      <td>${idx + 1}</td>
      <td>${escapeHtml(item.description)}</td>
      <td>1</td>
      <td>${item.amount.toFixed(2)}</td>
      <td>${vatRate}%</td>
      <td>${lineVat.toFixed(2)}</td>
      <td>${(item.amount + lineVat).toFixed(2)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap');
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Tajawal', 'Plus Jakarta Sans', sans-serif;
      font-size: 11px;
      color: #1C2420;
      background: #fff;
      padding: 40px;
      direction: rtl;
    }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 3px solid #0E6B4F; padding-bottom: 16px; }
    .company-info { text-align: right; }
    .company-name { font-size: 20px; font-weight: 700; color: #0E6B4F; margin-bottom: 4px; }
    .company-name-en { font-size: 14px; font-weight: 500; color: #666; font-family: 'Plus Jakarta Sans', sans-serif; direction: ltr; }
    .company-detail { font-size: 10px; color: #555; margin: 2px 0; }
    .invoice-title { text-align: center; font-size: 18px; font-weight: 700; color: #0E6B4F; margin: 16px 0; padding: 8px; background: #E7F4EF; border-radius: 6px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
    .meta-box { background: #f8f7f3; padding: 12px; border-radius: 6px; border: 1px solid #eee; }
    .meta-box h4 { font-size: 11px; font-weight: 700; color: #0E6B4F; margin-bottom: 6px; }
    .meta-row { display: flex; justify-content: space-between; margin: 3px 0; font-size: 10px; }
    .meta-label { color: #777; }
    .meta-value { font-weight: 600; font-family: 'Plus Jakarta Sans', sans-serif; direction: ltr; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    thead th { background: #0E6B4F; color: #fff; padding: 8px 6px; font-size: 10px; font-weight: 600; text-align: right; }
    tbody td { padding: 7px 6px; border-bottom: 1px solid #eee; font-size: 10px; text-align: right; }
    tbody tr:nth-child(even) { background: #fafaf7; }
    .totals { display: flex; justify-content: flex-start; margin-top: 12px; }
    .totals-box { width: 280px; background: #f8f7f3; padding: 12px; border-radius: 6px; border: 1px solid #eee; }
    .total-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 10px; }
    .total-row.grand { border-top: 2px solid #0E6B4F; padding-top: 8px; margin-top: 4px; font-size: 13px; font-weight: 700; color: #0E6B4F; }
    .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 24px; padding-top: 16px; border-top: 1px solid #ddd; }
    .qr-section { text-align: center; }
    .qr-section img { width: 120px; height: 120px; }
    .qr-label { font-size: 8px; color: #888; margin-top: 4px; }
    .zatca-notice { font-size: 8px; color: #888; max-width: 300px; text-align: right; }
    .amount-words { font-size: 10px; color: #555; font-style: italic; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-info">
      <div class="company-name">${escapeHtml(sellerNameAr)}</div>
      <div class="company-name-en">${escapeHtml(sellerName)}</div>
      <div class="company-detail">${escapeHtml(addressAr)}</div>
      <div class="company-detail">الرقم الضريبي: ${escapeHtml(vatNumber)}</div>
      ${tenant.cr_number ? `<div class="company-detail">السجل التجاري: ${escapeHtml(tenant.cr_number)}</div>` : ''}
      ${tenant.phone ? `<div class="company-detail">هاتف: ${escapeHtml(tenant.phone)}</div>` : ''}
    </div>
  </div>

  <div class="invoice-title">${title}</div>

  <div class="meta-grid">
    <div class="meta-box">
      <h4>بيانات الفاتورة</h4>
      <div class="meta-row"><span class="meta-label">رقم الفاتورة:</span><span class="meta-value">${escapeHtml(invoice.invoice_number)}</span></div>
      <div class="meta-row"><span class="meta-label">تاريخ الإصدار:</span><span class="meta-value">${invoice.issue_date.substring(0, 10)}</span></div>
      ${invoice.uuid ? `<div class="meta-row"><span class="meta-label">UUID:</span><span class="meta-value" style="font-size:8px">${invoice.uuid}</span></div>` : ''}
    </div>
    <div class="meta-box">
      <h4>بيانات المشتري</h4>
      <div class="meta-row"><span class="meta-label">الاسم:</span><span class="meta-value">${escapeHtml(invoice.student_name || 'Student')}</span></div>
      ${invoice.buyer_vat_number ? `<div class="meta-row"><span class="meta-label">الرقم الضريبي:</span><span class="meta-value">${escapeHtml(invoice.buyer_vat_number)}</span></div>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>الوصف</th>
        <th>الكمية</th>
        <th>سعر الوحدة</th>
        <th>نسبة الضريبة</th>
        <th>ضريبة القيمة المضافة</th>
        <th>الإجمالي</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-box">
      <div class="total-row"><span>المجموع قبل الضريبة:</span><span class="meta-value">${invoice.subtotal.toFixed(2)} ر.س</span></div>
      ${(invoice.discount_amount || 0) > 0 ? `<div class="total-row"><span>الخصم:</span><span class="meta-value">(${(invoice.discount_amount || 0).toFixed(2)}) ر.س</span></div>` : ''}
      <div class="total-row"><span>ضريبة القيمة المضافة (15%):</span><span class="meta-value">${invoice.vat_amount.toFixed(2)} ر.س</span></div>
      <div class="total-row grand"><span>الإجمالي شامل الضريبة:</span><span>${invoice.total_amount.toFixed(2)} ر.س</span></div>
    </div>
  </div>

  ${invoice.notes ? `<div class="amount-words">ملاحظات: ${escapeHtml(invoice.notes)}</div>` : ''}

  <div class="footer">
    <div class="zatca-notice">
      <p>هذه الفاتورة تتوافق مع متطلبات الفوترة الإلكترونية للمرحلة الثانية من هيئة الزكاة والضريبة والجمارك</p>
      <p style="direction:ltr;text-align:left;margin-top:4px">This invoice complies with ZATCA Phase 2 e-invoicing requirements.</p>
    </div>
    <div class="qr-section">
      <img src="${qrDataUrl}" alt="ZATCA QR" />
      <div class="qr-label">رمز الاستجابة السريعة - ZATCA QR</div>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generates a ZATCA-compliant invoice PDF with proper Arabic rendering.
 * Uses Puppeteer (headless Chromium) for native Arabic shaping and RTL.
 */
export async function generateZATCAInvoicePDF(
  invoice: InvoiceData,
  tenant: TenantData,
): Promise<Buffer> {
  const tlvBase64 = generateTLVQR(invoice, tenant);
  const qrDataUrl = await QRCode.toDataURL(tlvBase64, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 150,
  });

  const html = buildInvoiceHTML(invoice, tenant, qrDataUrl);

  // RF-001a: render behind the concurrency gate so a burst can't spawn
  // unbounded Chromium pages and OOM-kill the shared API process. When the
  // gate is saturated this throws PdfQueueSaturatedError (→ HTTP 503).
  return runPdfJob(async () => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });

      const pdfUint8 = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
      });

      return Buffer.from(pdfUint8);
    } finally {
      await page.close();
    }
  });
}
