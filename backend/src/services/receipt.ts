import crypto from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { generateZATCAInvoicePDF, InvoiceData, TenantData } from './zatca.js';

function sar(n: number): number {
  return Math.round(n * 100) / 100;
}

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

/**
 * Generate and persist a bilingual payment receipt linked to an invoice.
 *
 * The receipt is stored in the `invoices` table with `document_type='receipt'`
 * and `parent_document_id` pointing to the paid invoice. It returns the created
 * row and a base64-encoded PDF.
 */
export async function createReceiptForPayment(
  supabase: SupabaseClient,
  invoice: InvoiceLikeRow,
  payment: { id: string; amount: number; method: string; reference?: string | null; date?: string },
  tenant: TenantData,
): Promise<{ receipt: Record<string, unknown>; pdf_base64: string }> {
  const today = payment.date || new Date().toISOString().split('T')[0];
  const receiptNumber = `RCP-${invoice.invoice_number}-${payment.id.slice(0, 8)}`;
  const buyerName = invoice.buyer_name || invoice.student_name || '';
  const amount = Number(payment.amount);

  const receiptData: InvoiceData = {
    invoice_number: receiptNumber,
    document_type: 'receipt',
    invoice_type: 'simplified',
    issue_date: today,
    subtotal: amount,
    discount_amount: 0,
    vat_amount: 0,
    total_amount: amount,
    paid_amount: amount,
    balance: 0,
    student_name: invoice.student_name || undefined,
    buyer_name: buyerName,
    buyer_vat_number: invoice.buyer_vat_number || undefined,
    buyer_address: invoice.buyer_address || undefined,
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

  const pdfBuffer = await generateZATCAInvoicePDF(receiptData, tenant);

  const insertPayload = {
    tenant_id: invoice.tenant_id,
    branch_id: invoice.branch_id ?? null,
    student_id: invoice.student_id ?? null,
    invoice_number: receiptNumber,
    academic_year: invoice.academic_year ?? null,
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
    zatca_status: 'not_applicable',
  };

  const { data: receipt, error } = await supabase
    .from('invoices')
    .insert(insertPayload)
    .select()
    .single();

  if (error) throw error;

  return { receipt: receipt as Record<string, unknown>, pdf_base64: pdfBuffer.toString('base64') };
}
