/**
 * src/packs/ae/tax.ts
 *
 * UAE VAT rules. Rates are loaded from jurisdiction_tax_rules; no rate or
 * threshold is hardcoded. Verified parameters:
 *   - standard VAT rate 5% (Federal Decree-Law No. 8 of 2017)
 *   - zero-rated qualifying educational services (FTA VAT Education Guide)
 *   - exempt local passenger transport (FTA VAT Education Guide)
 *   - standard-rated uniforms/electronics/food/recreational trips
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { roundToMinorUnits } from '../../lib/money.js';
import type { TaxService } from '../contract/CountryPack.js';

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

const JURISDICTION_CODE = 'AE';

function categoryCode(category?: string): string {
  switch (category) {
    case 'zero_rated': return 'Z';
    case 'exempt': return 'E';
    case 'out_of_scope': return 'O';
    default: return 'S';
  }
}

function categoryFromString(category?: string): VatSummaryEntry['category'] {
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
  asOf: string,
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('jurisdiction_tax_rules')
    .select('category, rate')
    .eq('jurisdiction_code', JURISDICTION_CODE)
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
  invoice: unknown,
  supabase?: unknown,
): Promise<VatSummary> {
  const inv = invoice as InvoiceData;
  if (inv.vat_summary) return inv.vat_summary;

  const asOf = (inv.issue_date ?? new Date().toISOString().slice(0, 10)).slice(0, 10);

  if (!supabase) {
    // Without a database client we cannot read the effective-dated rates.
    throw new Error('AE computeVatSummary requires a supabase client');
  }

  const rates = await loadVatRates(supabase as SupabaseClient, asOf);

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

export const aeTax: TaxService = {
  categoryCode,
  computeVatSummary,
};
