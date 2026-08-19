import crypto from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import type { InvoiceData } from '../packs/sa/vat.js';
import type { TenantData } from '../types/tenant.js';

export interface InvoiceLikeRow {
  id: string;
  tenant_id: string;
  invoice_number: string;
  student_id?: string | null;
  student_name?: string | null;
  buyer_name?: string | null;
  buyer_vat_number?: string | null;
  buyer_address?: string | null;
  branch_id?: string | null;
  academic_year?: string | null;
  total_amount?: number | null;
}

export interface PaymentLike {
  id: string;
  amount: number;
  method: string;
  reference?: string | null;
  date?: string;
}

function asIsoDate(value?: string | null): string {
  const raw = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

export function buildReceiptInvoiceData(
  invoice: InvoiceLikeRow,
  payment: PaymentLike,
): InvoiceData {
  const today = asIsoDate(payment.date);
  const receiptNumber = `RCP-${invoice.invoice_number}-${payment.id.slice(0, 8)}`;
  const buyerName = invoice.buyer_name || invoice.student_name || '';
  const amount = Number(payment.amount);

  return {
    invoice_number: receiptNumber,
    document_type: 'receipt',
    invoice_type: 'simplified',
    issue_date: today,
    subtotal: amount,
    discount_amount: 0,
    vat_amount: 0,
    total_amount: amount,
    paid_amount: amount,
    student_name: invoice.student_name || undefined,
    buyer_name: buyerName,
    buyer_vat_number: invoice.buyer_vat_number || undefined,
    buyer_address: invoice.buyer_address || undefined,
    original_invoice_number: invoice.invoice_number,
    parent_document_id: invoice.id,
    notes: `Payment receipt for ${invoice.invoice_number}. Method: ${payment.method}. Ref: ${payment.reference || payment.id}`,
    items: [
      {
        description_en: `Payment received for invoice ${invoice.invoice_number}`,
        description_ar: `سند قبض للفاتورة رقم ${invoice.invoice_number}`,
        quantity: 1,
        unit_price_net: amount,
        vat_rate: 0,
        vat_category: 'out_of_scope',
        vat_category_code: 'O',
        discount: 0,
      },
    ],
    uuid: crypto.randomUUID(),
  };
}

/**
 * Generate and persist a bilingual payment receipt linked to an invoice.
 *
 * The receipt is stored in the `invoices` table with `document_type='receipt'`
 * and `parent_document_id` pointing to the paid invoice. Persist is best-effort:
 * the PDF is still returned if the insert fails.
 */
export async function createReceiptForPayment(
  supabase: SupabaseClient,
  invoice: InvoiceLikeRow,
  payment: PaymentLike,
  tenant: TenantData,
  currencyCode: string,
  renderInvoicePdf: (invoice: InvoiceData, tenant: TenantData) => Promise<Buffer>,
): Promise<{ receipt: Record<string, unknown> | null; pdf_base64: string }> {
  const receiptData = buildReceiptInvoiceData(invoice, payment);
  const pdfBuffer = await renderInvoicePdf(receiptData, tenant);
  const today = receiptData.issue_date;
  const amount = Number(payment.amount);

  const insertPayload = {
    tenant_id: invoice.tenant_id,
    currency_code: currencyCode,
    branch_id: invoice.branch_id ?? null,
    student_id: invoice.student_id ?? null,
    student_name: invoice.student_name ?? null,
    buyer_name: invoice.buyer_name || invoice.student_name || null,
    invoice_number: receiptData.invoice_number,
    academic_year: invoice.academic_year ?? null,
    issue_date: today,
    date: today,
    document_type: 'receipt',
    invoice_type: 'simplified',
    zatca_invoice_type: 'simplified',
    parent_document_id: invoice.id,
    original_invoice_number: invoice.invoice_number,
    subtotal: amount,
    discount_amount: 0,
    vat_amount: 0,
    total_amount: amount,
    paid_amount: amount,
    status: 'paid',
    items: receiptData.items,
    vat_summary: { total_taxable: amount, total_vat: 0, rates: [] },
    notes: receiptData.notes,
    zatca_uuid: receiptData.uuid,
    qr_code: null,
    invoice_hash: null,
    previous_invoice_hash: null,
    ubl_xml: null,
    zatca_status: 'pending',
  };

  const { data: receipt, error } = await supabase
    .from('invoices')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.warn('[receipt] persist failed, returning PDF only:', error.message);
    return { receipt: null, pdf_base64: pdfBuffer.toString('base64') };
  }

  return { receipt: receipt as Record<string, unknown>, pdf_base64: pdfBuffer.toString('base64') };
}
