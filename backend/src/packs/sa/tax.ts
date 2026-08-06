/**
 * src/packs/sa/tax.ts
 *
 * Saudi tax rules. Delegates to the existing ZATCA module; no logic duplication.
 */

import {
  buildInvoiceLines,
  computeVatSummary,
  categoryCode,
  vatRateForCategory,
  type BuildInvoiceLineInput,
  type InvoiceData,
} from './vat.js';
import type { TaxService } from '../contract/CountryPack.js';

export const saTax: TaxService = {
  standardVatRate: 0.15,
  vatRateForCategory,
  categoryCode,
  computeVatSummary: (invoice: unknown, _supabase?: unknown) => computeVatSummary(invoice as InvoiceData),
  buildInvoiceLines: (
    rawLines: unknown,
    discountAmount?: number,
    _supabase?: unknown,
    _issueDate?: string,
  ) => buildInvoiceLines(rawLines as BuildInvoiceLineInput[], discountAmount ?? 0),
};
