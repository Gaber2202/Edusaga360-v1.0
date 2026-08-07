/**
 * src/packs/qa/tax.ts
 *
 * Qatar tax rules. Qatar has not implemented VAT; all supplies are outside the
 * scope of a local VAT regime. The service returns zero-rate summaries and
 * correct invoice lines with no tax component.
 */

import type { TaxService } from '../contract/CountryPack.js';
import {
  buildInvoiceLines,
  categoryCode,
  computeVatSummary,
} from '../../lib/tax.js';

const JURISDICTION_CODE = 'QA';
const STANDARD_VAT_RATE = 0;

function vatRateForCategory(category: string, _fallbackRate?: number, _asOf?: Date | string): number {
  // Qatar has no VAT; every category is zero-rated/out of scope.
  return 0;
}

export const qaTax: TaxService = {
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
  ) => buildInvoiceLines(JURISDICTION_CODE, rawLines, discountAmount ?? 0, supabase, issueDate),
};
