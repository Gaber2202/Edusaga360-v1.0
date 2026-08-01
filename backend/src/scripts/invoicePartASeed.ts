import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { InvoiceData } from '../services/vat.js';
import {
  generateZATCAInvoicePDF,
  generateUBLXml,
  generateTLVQR,
  generateInvoiceHash,
  TenantData,
} from '../services/zatca.js';

const tenant: TenantData = {
  legal_name_ar: 'مدارس النور الدولية',
  legal_name_en: 'Al Noor International Schools',
  vat_number: '300000000000003',
  cr_number: '1010101010',
  address_ar: 'طريق الملك فهد، الرياض',
  address_en: 'King Fahd Road, Riyadh',
  city: 'Riyadh',
  country_code: 'SA',
  country_subentity_code: 'SA-01',
  phone: '+966501234567',
  email: 'finance@alnoor.edu.sa',
};

const invoice: InvoiceData = {
  invoice_number: 'INV-2026-000008',
  document_type: 'invoice',
  invoice_type: 'simplified',
  zatca_invoice_type: 'simplified',
  uuid: crypto.randomUUID(),
  issue_date: '2026-01-15T08:30:00.000Z',
  supply_date: '2026-01-15',
  due_date: '2026-02-15',
  subtotal: 1200.0,
  discount_amount: 0,
  vat_amount: 180.0,
  total_amount: 1380.0,
  paid_amount: 200.0,
  balance: 1180.0,
  student_name: 'سارة أحمد',
  buyer_name: 'عبدالله الفارسي (ولي الأمر)',
  buyer_address: 'حي العليا، الرياض',
  notes: 'تم سداد مبلغ 200 ريال مقدماً',
  items: [
    {
      description_en: 'Tuition Fee - Spring Term 2026',
      description_ar: 'رسوم الدراسة - الفصل الدراسي الثاني 2026',
      quantity: 1,
      unit_price_net: 1000.0,
      vat_rate: 15,
      vat_category: 'standard',
      vat_category_code: 'S',
      discount: 0,
    },
    {
      description_en: 'School Transport',
      description_ar: 'خدمة النقل المدرسي',
      quantity: 1,
      unit_price_net: 200.0,
      vat_rate: 15,
      vat_category: 'standard',
      vat_category_code: 'S',
      discount: 0,
    },
  ],
};

function decodeTLV(base64: string): Record<number, Buffer> {
  const buf = Buffer.from(base64, 'base64');
  const fields: Record<number, Buffer> = {};
  let i = 0;
  while (i < buf.length) {
    const tag = buf[i];
    i += 1;
    let len = 0;
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

async function main() {
  const outDir = '/tmp/seed-invoice-part-a';
  fs.mkdirSync(outDir, { recursive: true });

  const ublXml = generateUBLXml(invoice, tenant);
  const invoiceHash = generateInvoiceHash(ublXml);
  const qrBase64 = generateTLVQR(invoice, tenant);
  const pdfBuffer = await generateZATCAInvoicePDF(invoice, tenant);

  const xmlPath = path.join(outDir, 'INV-2026-000008.xml');
  const pdfPath = path.join(outDir, 'INV-2026-000008.pdf');

  fs.writeFileSync(xmlPath, ublXml, 'utf8');
  fs.writeFileSync(pdfPath, pdfBuffer);

  const fields = decodeTLV(qrBase64);

  console.log('\n=== EduSaga 360 — Enterprise Invoicing Part A Seed ===\n');
  console.log('Invoice:', invoice.invoice_number);
  console.log('Seller (AR):', tenant.legal_name_ar);
  console.log('Seller (EN):', tenant.legal_name_en);
  console.log('VAT TRN:', tenant.vat_number);
  console.log('Buyer:', invoice.buyer_name);
  console.log('Subtotal:', invoice.subtotal.toFixed(2), 'SAR');
  console.log('VAT 15%:', invoice.vat_amount.toFixed(2), 'SAR');
  console.log('Total:', invoice.total_amount.toFixed(2), 'SAR');
  console.log('Paid:', invoice.paid_amount?.toFixed(2), 'SAR');
  console.log('Balance:', invoice.balance?.toFixed(2), 'SAR');
  console.log('Invoice hash:', invoiceHash);
  console.log('\n--- TLV QR decoded ---');
  console.log('  0x01 Seller:', fields[0x01]?.toString('utf8'));
  console.log('  0x02 VAT TRN:', fields[0x02]?.toString('utf8'));
  console.log('  0x03 Timestamp:', fields[0x03]?.toString('utf8'));
  console.log('  0x04 Total:', fields[0x04]?.toString('utf8'));
  console.log('  0x05 VAT:', fields[0x05]?.toString('utf8'));
  console.log('\nOutput files:');
  console.log(' ', xmlPath);
  console.log(' ', pdfPath);
  console.log('\nSeed generation complete.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
