/**
 * src/lib/tax.ts
 *
 * Generic, DB-driven VAT invoice-line and summary calculations used by country
 * packs that do not need Saudi-specific legacy rounding. Each pack supplies its
 * jurisdiction code; rates are read from jurisdiction_tax_rules.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { roundToMinorUnits } from './money.js';

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

export interface InvoiceItem {
  description_en?: string;
  description_ar?: string;
  vat_category?: 'standard' | 'zero_rated' | 'exempt' | 'out_of_scope' | string;
  vat_rate?: number;
  quantity?: number;
  unit_price_net?: number;
  amount?: number;
  discount?: number;
}

export interface InvoiceData {
  issue_date?: string;
  items?: InvoiceItem[];
  vat_summary?: VatSummary;
  subtotal?: number;
  vat_amount?: number;
  total_amount?: number;
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

export function categoryCode(category?: string): string {
  switch (category) {
    case 'zero_rated':
      return 'Z';
    case 'exempt':
      return 'E';
    case 'out_of_scope':
      return 'O';
    default:
      return 'S';
  }
}

export function categoryFromString(category?: string): VatSummaryEntry['category'] {
  if (category === 'zero_rated') return 'zero_rated';
  if (category === 'exempt') return 'exempt';
  if (category === 'out_of_scope') return 'out_of_scope';
  return 'standard';
}

interface TaxRuleRow {
  category?: string;
  rate?: number | string;
}

async function loadVatRates(
  supabase: SupabaseClient,
  jurisdictionCode: string,
  asOf: string,
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('jurisdiction_tax_rules')
    .select('category, rate')
    .eq('jurisdiction_code', jurisdictionCode)
    .eq('rule_type', 'vat_rate')
    .lte('effective_from', asOf)
    .gte('effective_to', asOf);

  if (error) throw error;

  const rates: Record<string, number> = {};
  for (const row of (data ?? []) as TaxRuleRow[]) {
    const cat = row.category ?? 'standard';
    const r = typeof row.rate === 'string' ? parseFloat(row.rate) : Number(row.rate);
    rates[cat] = Number.isFinite(r) ? r : 0;
  }
  return rates;
}

export async function computeVatSummary(
  jurisdictionCode: string,
  invoice: unknown,
  supabase?: unknown,
): Promise<VatSummary> {
  const inv = invoice as InvoiceData;
  if (inv.vat_summary) return inv.vat_summary;

  const asOf = (inv.issue_date ?? new Date().toISOString().slice(0, 10)).slice(0, 10);

  if (!supabase) {
    throw new Error(`${jurisdictionCode} computeVatSummary requires a supabase client`);
  }

  const rates = await loadVatRates(supabase as SupabaseClient, jurisdictionCode, asOf);

  const map = new Map<string, VatSummaryEntry>();
  let totalTaxable = 0;
  let totalVat = 0;

  for (const item of inv.items ?? []) {
    const category = categoryFromString(item.vat_category);
    const categoryCodeStr = categoryCode(item.vat_category);
    const rate = rates[category] ?? 0;

    const quantity = Number(item.quantity ?? 1);
    const unitPrice = Number(item.unit_price_net ?? item.amount ?? 0);
    const discount = Number(item.discount ?? 0);

    const net = roundToMinorUnits(unitPrice * quantity - discount, 2);
    const vat = rate > 0 ? roundToMinorUnits(net * rate, 2) : 0;

    const key = `${categoryCodeStr}-${rate}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        rate,
        category,
        category_code: categoryCodeStr,
        taxable_amount: 0,
        vat_amount: 0,
      };
      map.set(key, entry);
    }

    entry.taxable_amount = roundToMinorUnits(entry.taxable_amount + net, 2);
    entry.vat_amount = roundToMinorUnits(entry.vat_amount + vat, 2);
    totalTaxable = roundToMinorUnits(totalTaxable + net, 2);
    totalVat = roundToMinorUnits(totalVat + vat, 2);
  }

  return {
    total_taxable: roundToMinorUnits(totalTaxable, 2),
    total_vat: roundToMinorUnits(totalVat, 2),
    rates: Array.from(map.values()),
  };
}

export async function buildInvoiceLines(
  jurisdictionCode: string,
  rawLines: unknown,
  discountAmount = 0,
  supabase?: unknown,
  issueDate?: string,
): Promise<BuildInvoiceLinesResult> {
  const lines = Array.isArray(rawLines) ? (rawLines as BuildInvoiceLineInput[]) : [];
  const asOf = issueDate ?? new Date().toISOString().slice(0, 10);

  if (!supabase) {
    throw new Error(`${jurisdictionCode} buildInvoiceLines requires a supabase client`);
  }

  const rates = await loadVatRates(supabase as SupabaseClient, jurisdictionCode, asOf);

  const preDiscountLines = lines.map((line) => {
    const treatment = line.vat_treatment ?? 'standard';
    const category = categoryFromString(treatment);
    const quantity = line.quantity ?? 1;
    const lineSubtotal = roundToMinorUnits(line.amount * quantity, 2);
    const vatRate = rates[category] ?? 0;
    const preVat = roundToMinorUnits(lineSubtotal * vatRate, 2);
    const preTotal = roundToMinorUnits(lineSubtotal + preVat, 2);
    return {
      category_id: line.category_id ?? null,
      category_code: line.category_code ?? 'MANUAL',
      description_en: line.description_en,
      description_ar: line.description_ar,
      vat_treatment: treatment,
      vat_category: category,
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

  const subtotal = roundToMinorUnits(
    preDiscountLines.reduce((sum, line) => roundToMinorUnits(sum + line.subtotal, 2), 0),
    2,
  );

  const totalDiscount = roundToMinorUnits(discountAmount, 2);

  // Allocate discount exactly: round proportional shares, then distribute the
  // remainder (positive or negative) to the largest share first.
  const shares: { index: number; rawShare: number; share: number }[] = [];
  let allocated = 0;
  if (totalDiscount !== 0 && subtotal > 0) {
    for (let i = 0; i < preDiscountLines.length; i++) {
      const rawShare = (preDiscountLines[i].subtotal / subtotal) * totalDiscount;
      const share = roundToMinorUnits(rawShare, 2);
      shares.push({ index: i, rawShare, share });
      allocated = roundToMinorUnits(allocated + share, 2);
    }
  }
  let remainder = roundToMinorUnits(totalDiscount - allocated, 2);
  if (remainder !== 0 && shares.length > 0) {
    shares.sort((a, b) => b.rawShare - a.rawShare);
    const unit = remainder > 0 ? 0.01 : -0.01;
    let i = 0;
    while (Math.abs(remainder) >= 0.005 && i < shares.length * 1000) {
      shares[i % shares.length].share = roundToMinorUnits(shares[i % shares.length].share + unit, 2);
      remainder = roundToMinorUnits(remainder - unit, 2);
      i++;
    }
  }

  const lineDiscounts = new Map<number, number>();
  for (const s of shares) {
    lineDiscounts.set(s.index, s.share);
  }

  let vatAmount = 0;
  let totalAmount = 0;
  const builtLines: BuiltInvoiceLine[] = preDiscountLines.map((line, index) => {
    const lineDiscount = lineDiscounts.get(index) ?? 0;
    const lineTaxable = roundToMinorUnits(line.subtotal - lineDiscount, 2);
    const lineVat = roundToMinorUnits(lineTaxable * line.vat_rate, 2);
    const lineTotalGross = roundToMinorUnits(lineTaxable + lineVat, 2);
    vatAmount = roundToMinorUnits(vatAmount + lineVat, 2);
    totalAmount = roundToMinorUnits(totalAmount + lineTotalGross, 2);
    return {
      ...line,
      discount: lineDiscount,
      vat_amount: lineVat,
      line_total_gross: lineTotalGross,
      total: lineTotalGross,
    };
  });

  return {
    lines: builtLines,
    subtotal,
    discount_amount: totalDiscount,
    vat_amount: vatAmount,
    total_amount: totalAmount,
  };
}
