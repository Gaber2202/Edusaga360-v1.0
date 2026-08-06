/**
 * src/packs/sa/tax.ts
 *
 * Saudi tax rules. Delegates to the existing ZATCA module; no logic duplication.
 */

import {
  computeVatSummary,
  categoryCode,
  vatRateForCategory,
  type InvoiceData,
} from './vat.js';
import type { TaxService } from '../contract/CountryPack.js';

export const saTax: TaxService = {
  standardVatRate: 0.15,
  vatRateForCategory,
  categoryCode,
  computeVatSummary: (invoice: unknown, _supabase?: unknown) => computeVatSummary(invoice as InvoiceData),
};
