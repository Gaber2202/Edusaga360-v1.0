import crypto from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import type { InvoiceData, InvoiceItemData, VatSummary } from '../packs/sa/vat.js';
import type { TenantData } from '../types/tenant.js';
import { buildRequestContext, NotImplementedInJurisdiction } from '../lib/jurisdiction.js';
import { resolvePack } from '../packs/registry.js';

function sar(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface InvoiceRow {
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
  grade?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  supply_date?: string | null;
  subtotal?: number | null;
  discount_amount?: number | null;
  vat_amount?: number | null;
  total_amount?: number | null;
  notes?: string | null;
  items?: unknown;
  invoice_type?: string | null;
  zatca_invoice_type?: string | null;
}

function itemsFromRow(row: InvoiceRow): InvoiceItemData[] {
  const raw = Array.isArray(row.items) ? row.items : [];
  return raw.map((it: any) => ({
    description_en: it.description_en || it.description,
    description_ar: it.description_ar || it.description,
    quantity: it.quantity ?? 1,
    unit_price_net: it.unit_price_net ?? (it.subtotal != null ? sar(it.subtotal / (it.quantity || 1)) : 0),
    vat_rate: it.vat_rate ?? 0,
    vat_amount: it.vat_amount ?? 0,
    line_total_gross: it.line_total_gross ?? it.total ?? sar((it.subtotal ?? 0) + (it.vat_amount ?? 0)),
    vat_category: it.vat_category || 'standard',
    vat_category_code: it.vat_category_code || 'S',
    discount: it.discount ?? 0,
  }));
}

/**
 * Convert a quotation or proforma into a formal tax invoice.
 *
 * The original document is left untouched. A new `invoices` row is created with
 * `document_type='invoice'`, a fresh invoice number, and fresh ZATCA artifacts.
 * The original row id is stored as `parent_document_id` for traceability.
 */
export async function convertToInvoice(
  supabase: SupabaseClient,
  original: InvoiceRow,
  newInvoiceNumber: string,
  tenant: TenantData,
  previousInvoiceHash?: string,
  icv?: number,
): Promise<Record<string, unknown>> {
  const today = new Date().toISOString().split('T')[0];
  const items = itemsFromRow(original);
  const subtotal = sar(items.reduce((s, it) => s + (it.quantity ?? 1) * (it.unit_price_net ?? 0) - (it.discount ?? 0), 0));
  const discount = Number(original.discount_amount ?? 0);
  const vatAmount = sar(items.reduce((s, it) => s + (it.vat_amount ?? 0), 0));
  const totalAmount = sar(subtotal - discount + vatAmount);

  const invoiceData: InvoiceData = {
    invoice_number: newInvoiceNumber,
    document_type: 'invoice',
    invoice_type: (original.invoice_type as InvoiceData['invoice_type']) || 'simplified',
    zatca_invoice_type: (original.zatca_invoice_type as InvoiceData['invoice_type']) || (original.invoice_type as InvoiceData['invoice_type']) || 'simplified',
    issue_date: today,
    supply_date: original.supply_date ?? today,
    due_date: original.due_date ?? undefined,
    subtotal,
    discount_amount: discount,
    vat_amount: vatAmount,
    total_amount: totalAmount,
    paid_amount: 0,
    student_name: original.student_name || undefined,
    buyer_name: original.buyer_name || original.student_name || undefined,
    student_id: original.student_id ?? undefined,
    buyer_vat_number: original.buyer_vat_number || undefined,
    buyer_address: original.buyer_address || undefined,
    notes: original.notes || undefined,
    items,
    uuid: crypto.randomUUID(),
    previous_invoice_hash: previousInvoiceHash,
    icv,
    parent_document_id: original.id,
  };

  const ctx = await buildRequestContext(supabase, original.tenant_id, original.branch_id ?? undefined);
  const pack = resolvePack(ctx);

  if (!pack.tax?.computeVatSummary) {
    throw new NotImplementedInJurisdiction(ctx.tenant.jurisdictionCode, 'VAT summary');
  }
  if (!pack.eInvoice?.generateUBLXml || !pack.eInvoice?.generateInvoiceHash || !pack.eInvoice?.generateTLVQR) {
    throw new NotImplementedInJurisdiction(ctx.tenant.jurisdictionCode, 'e-invoice generation');
  }

  const vatSummary = pack.tax.computeVatSummary(invoiceData) as VatSummary;
  invoiceData.vat_summary = vatSummary;
  invoiceData.vat_amount = vatSummary.total_vat;
  invoiceData.total_amount = sar(subtotal - discount + vatSummary.total_vat);

  const ubl_xml = pack.eInvoice.generateUBLXml(invoiceData, tenant);
  const invoice_hash = pack.eInvoice.generateInvoiceHash(ubl_xml);
  const qr_code = pack.eInvoice.generateTLVQR(invoiceData, tenant, invoice_hash);

  const payload = {
    tenant_id: original.tenant_id,
    branch_id: original.branch_id ?? null,
    student_id: original.student_id ?? null,
    invoice_number: newInvoiceNumber,
    academic_year: original.academic_year ?? null,
    grade: original.grade ?? null,
    date: today,
    issue_date: today,
    due_date: original.due_date ?? null,
    supply_date: original.supply_date ?? null,
    document_type: 'invoice',
    invoice_type: invoiceData.invoice_type,
    zatca_invoice_type: invoiceData.zatca_invoice_type,
    parent_document_id: original.id,
    original_invoice_number: original.invoice_number,
    student_name: original.student_name,
    buyer_name: original.buyer_name || original.student_name,
    buyer_vat_number: original.buyer_vat_number ?? null,
    buyer_address: original.buyer_address ?? null,
    subtotal,
    discount_amount: discount,
    vat_amount: invoiceData.vat_amount,
    total_amount: invoiceData.total_amount,
    paid_amount: 0,
    status: 'issued',
    items,
    vat_summary: vatSummary,
    notes: original.notes,
    zatca_uuid: invoiceData.uuid,
    icv,
    invoice_hash,
    previous_invoice_hash: previousInvoiceHash ?? null,
    ubl_xml,
    qr_code,
    zatca_status: 'pending',
    zatca_response: null,
  };

  const { data, error } = await supabase.from('invoices').insert(payload).select().single();
  if (error) throw error;
  return data as Record<string, unknown>;
}
