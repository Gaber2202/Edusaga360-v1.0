/** Round a Saudi Riyal value to 2 decimal places. */
function sar(n: number): number {
  return Math.round(n * 100) / 100;
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


export function vatRateForCategory(category: string, rate?: number): number {
  if (category === 'zero_rated') return 0;
  if (category === 'exempt') return 0;
  if (category === 'out_of_scope') return 0;
  if (rate == null) return 0.15;
  // Treat provided percentages (>=1) as well as decimal fractions (<1) consistently.
  return rate >= 1 ? rate / 100 : rate;
}


export function percentValue(rate?: number): number {
  if (rate == null) return 15;
  return rate < 1 ? rate * 100 : rate;
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
    const vatRate = vatRateForCategory(vatCategory, item.vat_rate);
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
