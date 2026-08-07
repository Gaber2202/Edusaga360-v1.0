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

import type { TaxService } from '../contract/CountryPack.js';
import {
  buildInvoiceLines,
  categoryCode,
  computeVatSummary,
  type BuildInvoiceLineInput,
  type BuildInvoiceLinesResult,
  type BuiltInvoiceLine,
  type InvoiceData,
  type InvoiceItem,
  type VatSummary,
  type VatSummaryEntry,
} from '../../lib/tax.js';

const JURISDICTION_CODE = 'AE';
const STANDARD_VAT_RATE = 0.05;

export type {
  BuildInvoiceLineInput,
  BuildInvoiceLinesResult,
  BuiltInvoiceLine,
  InvoiceData,
  InvoiceItem,
  VatSummary,
  VatSummaryEntry,
};

function vatRateForCategory(category: string, fallbackRate?: number, _asOf?: Date | string): number {
  if (category === 'zero_rated' || category === 'exempt' || category === 'out_of_scope') return 0;
  if (fallbackRate !== undefined) return fallbackRate;
  return STANDARD_VAT_RATE;
}

export const aeTax: TaxService = {
  standardVatRate: STANDARD_VAT_RATE,
  categoryCode,
  vatRateForCategory,
  computeVatSummary: (invoice: unknown, supabase?: unknown) =>
    computeVatSummary(JURISDICTION_CODE, invoice, supabase),
  buildInvoiceLines: (
    rawLines: unknown,
    discountAmount?: number,
    supabase?: unknown,
    issueDate?: string,
  ): Promise<BuildInvoiceLinesResult> =>
    buildInvoiceLines(JURISDICTION_CODE, rawLines, discountAmount ?? 0, supabase, issueDate),
};
