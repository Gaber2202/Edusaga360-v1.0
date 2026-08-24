/** Round a Saudi Riyal value to 2 decimal places. */
function sar(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface BuildInvoiceLineInput {
  category_id?: string | null;
  category_code?: string | null;
  description_en: string;
  description_ar: string;
  vat_treatment?: string | null;
  amount: number;
  quantity?: number;
}

export interface BuiltInvoiceLine {
  category_id: string | null;
  category_code: string;
  description_en: string;
  description_ar: string;
  vat_treatment: string;
  vat_category: 'standard' | 'zero_rated' | 'exempt' | 'out_of_scope';
  vat_category_code: string;
  quantity: number;
  unit_amount: number;
  unit_price_net: number;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  line_total_gross: number;
  total: number;
  discount: number;
}

export interface BuildInvoiceLinesResult {
  lines: BuiltInvoiceLine[];
  subtotal: number;
  discount_amount: number;
  vat_amount: number;
  total_amount: number;
}

export interface InvoiceItemData {
  description?: string;
  description_en?: string;
  description_ar?: string;
  quantity?: number;
  unit_price_net?: number;
  vat_rate?: number;
  vat_amount?: number;
  line_total_gross?: number;
  vat_category?: 'standard' | 'zero_rated' | 'exempt' | 'out_of_scope';
  vat_category_code?: string;
  discount?: number;
  amount?: number; // legacy gross-amount fallback
}


export interface VatSummaryEntry {
  rate: number;
  category: 'standard' | 'zero_rated' | 'exempt' | 'out_of_scope';
  category_code: string;
  taxable_amount: number;
  vat_amount: number;
}


export interface VatSummary {
  total_taxable: number;
  total_vat: number;
  rates: VatSummaryEntry[];
}


export interface InvoiceData {
  id?: string;
  invoice_number: string;
  document_type?: 'invoice' | 'quotation' | 'proforma' | 'credit_note' | 'debit_note' | 'receipt';
  invoice_type?: 'simplified' | 'standard'; // B2B/B2G vs B2C
  zatca_invoice_type?: 'simplified' | 'standard'; // alias used by legacy callers
  issue_date: string; // ISO date string yyyy-MM-dd or full ISO
  supply_date?: string;
  due_date?: string;
  subtotal: number;
  discount_amount?: number;
  vat_amount: number;
  total_amount: number;
  paid_amount?: number;
  balance?: number;
  student_name?: string;
  buyer_name?: string;
  student_id?: string;
  guardian_id?: string;
  buyer_vat_number?: string;
  buyer_address?: string;
  items?: InvoiceItemData[];
  vat_summary?: VatSummary;
  notes?: string;
  terms_and_conditions?: string;
  uuid?: string;
  icv?: number;
  previous_invoice_hash?: string;
  original_invoice_number?: string; // for credit/debit notes
  parent_document_id?: string;
}


export function categoryCode(category?: string): string {
  switch (category) {
    case 'zero_rated': return 'Z';
    case 'exempt': return 'E';
    case 'out_of_scope': return 'O';
    default: return 'S';
  }
}


// Saudi VAT timeline for effective dating. Re-issued historical invoices must
// reproduce the rate in force at the original issue date.
// Source: ZATCA public VAT guidance.
const SA_VAT_5_START = new Date('2018-01-01T00:00:00Z');
const SA_VAT_15_START = new Date('2020-07-01T00:00:00Z');

function historicalVatRate(asOf?: Date | string): number {
  if (!asOf) return 0.15;
  const d = typeof asOf === 'string' ? new Date(asOf) : asOf;
  if (Number.isNaN(d.getTime())) return 0.15;
  if (d < SA_VAT_5_START) return 0;
  if (d < SA_VAT_15_START) return 0.05;
  return 0.15;
}

export function vatRateForCategory(category: string, rate?: number, asOf?: Date | string): number {
  if (category === 'zero_rated') return 0;
  if (category === 'exempt') return 0;
  if (category === 'out_of_scope') return 0;
  if (rate == null) return historicalVatRate(asOf);
  // Treat provided percentages (>=1) as well as decimal fractions (<1) consistently.
  return rate >= 1 ? rate / 100 : rate;
}


export function percentValue(rate?: number): number {
  if (rate == null) return 15;
  return rate < 1 ? rate * 100 : rate;
}


function vatCategoryForTreatment(treatment: string): 'standard' | 'zero_rated' | 'exempt' | 'out_of_scope' {
  if (treatment === 'zero_rated') return 'zero_rated';
  if (treatment === 'exempt') return 'exempt';
  if (treatment === 'out_of_scope') return 'out_of_scope';
  return 'standard';
}

/**
 * Build ZATCA-ready invoice lines from raw fee lines and an optional document-level
 * discount. This deliberately reproduces the current routes/billing.ts arithmetic,
 * including the one-halala redistribution drift, so it can replace the inline code
 * without changing golden snapshots.
 */
export function buildInvoiceLines(
  rawLines: BuildInvoiceLineInput[],
  discountAmount = 0,
): BuildInvoiceLinesResult {
  let subtotal = 0;
  const preDiscountLines: BuiltInvoiceLine[] = rawLines.map((line) => {
    const treatment = line.vat_treatment ?? 'standard';
    const quantity = line.quantity ?? 1;
    const lineSubtotal = sar(line.amount * quantity);
    // Mirror createInvoiceForStudent (routes/billing.ts:1218): only the literal
    // string 'standard' is taxed at 15%; everything else is zero-rated.
    const vatRate = treatment === 'standard' ? 0.15 : 0;
    const preVat = sar(lineSubtotal * vatRate);
    const preTotal = sar(lineSubtotal + preVat);
    subtotal = sar(subtotal + lineSubtotal);
    return {
      category_id: line.category_id ?? null,
      category_code: line.category_code ?? 'MANUAL',
      description_en: line.description_en,
      description_ar: line.description_ar,
      vat_treatment: treatment,
      vat_category: vatCategoryForTreatment(treatment),
      vat_category_code: categoryCode(treatment),
      quantity,
      unit_amount: line.amount,
      unit_price_net: line.amount,
      subtotal: lineSubtotal,
      vat_rate: vatRate,
      vat_amount: preVat,
      line_total_gross: preTotal,
      total: preTotal,
      discount: 0,
    };
  });

  const taxableSubtotal = sar(subtotal - discountAmount);

  // Allocate net by ratio with unrounded intermediates; push all rounding
  // residual onto the last line so Σ line_total_gross === total_amount (#185).
  const targetVat = sar(
    preDiscountLines.reduce((sum, line) => sum + taxableSubtotal * (line.subtotal / (subtotal || 1)) * line.vat_rate, 0),
  );
  const totalAmount = sar(taxableSubtotal + targetVat);

  let allocatedNet = 0;
  let allocatedVat = 0;
  const lines = preDiscountLines.map((line, idx) => {
    const isLast = idx === preDiscountLines.length - 1;
    const lineRatio = line.subtotal / (subtotal || 1);
    let lineNet: number;
    let lineVat: number;
    if (isLast) {
      lineNet = sar(taxableSubtotal - allocatedNet);
      lineVat = sar(targetVat - allocatedVat);
    } else {
      lineNet = sar(taxableSubtotal * lineRatio);
      lineVat = sar(taxableSubtotal * lineRatio * line.vat_rate);
      allocatedNet = sar(allocatedNet + lineNet);
      allocatedVat = sar(allocatedVat + lineVat);
    }
    const lineTotalGross = sar(lineNet + lineVat);
    return {
      ...line,
      vat_amount: lineVat,
      line_total_gross: lineTotalGross,
      total: lineTotalGross,
      discount: 0,
    };
  });

  return {
    lines,
    subtotal,
    discount_amount: discountAmount,
    vat_amount: targetVat,
    total_amount: totalAmount,
  };
}


export function normalizeInvoiceItems(invoice: InvoiceData): Required<InvoiceItemData>[] {
  const raw = invoice.items && invoice.items.length > 0
    ? invoice.items
    : [{ description_en: 'Item', description_ar: 'بند', quantity: 1, unit_price_net: invoice.subtotal }];

  return raw.map((item, idx) => {
    const description_en = item.description_en || item.description || `Item ${idx + 1}`;
    const description_ar = item.description_ar || item.description_en || item.description || `بند ${idx + 1}`;
    const quantity = item.quantity ?? 1;
    const unit_price_net = item.unit_price_net ?? (item.amount ? sar(item.amount / quantity) : 0);
    const discount = item.discount ?? 0;
    const lineNet = sar(unit_price_net * quantity - discount);
    const vatCategory = (item.vat_category || 'standard') as NonNullable<InvoiceItemData['vat_category']>;
    const vatRate = vatRateForCategory(vatCategory, item.vat_rate, invoice.issue_date);
    const vatCategoryCode = item.vat_category_code || categoryCode(vatCategory);
    const vatAmount = vatRate > 0 ? sar(lineNet * vatRate) : 0;
    const lineTotalGross = sar(lineNet + vatAmount);
    return {
      description_en,
      description_ar,
      quantity,
      unit_price_net,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      line_total_gross: lineTotalGross,
      vat_category: vatCategory,
      vat_category_code: vatCategoryCode,
      discount,
      amount: item.amount ?? lineTotalGross,
      description: item.description ?? '',
    };
  });
}


export function computeVatSummary(invoice: InvoiceData): VatSummary {
  if (invoice.vat_summary) return invoice.vat_summary;
  const items = normalizeInvoiceItems(invoice);
  const map = new Map<string, VatSummaryEntry>();
  let totalTaxable = 0;
  let totalVat = 0;
  for (const item of items) {
    const key = `${item.vat_category_code}-${item.vat_rate}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        rate: item.vat_rate,
        category: item.vat_category,
        category_code: item.vat_category_code,
        taxable_amount: 0,
        vat_amount: 0,
      };
      map.set(key, entry);
    }
    const lineNet = sar(item.line_total_gross - item.vat_amount);
    entry.taxable_amount = sar(entry.taxable_amount + lineNet);
    entry.vat_amount = sar(entry.vat_amount + item.vat_amount);
    totalTaxable += lineNet;
    totalVat += item.vat_amount;
  }
  return {
    total_taxable: sar(totalTaxable),
    total_vat: sar(totalVat),
    rates: Array.from(map.values()),
  };
}
