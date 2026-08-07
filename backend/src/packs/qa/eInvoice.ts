/**
 * src/packs/qa/eInvoice.ts
 *
 * Qatar e-invoicing is intentionally a stub. A draft law was approved by the
 * Council of Ministers on 6 May 2026 but has not been enacted; no format,
 * schema, clearance model or phase dates have been published.
 */

import { NotImplementedInJurisdiction } from '../../lib/jurisdiction.js';
import type { EInvoiceService } from '../contract/CountryPack.js';

function stub(method: string) {
  return (..._args: unknown[]) => {
    throw new NotImplementedInJurisdiction(
      'QA',
      `EInvoiceService.${method} — Qatar e-invoicing draft law is not yet enacted; no format or schema is available`,
    );
  };
}

export const qaEInvoice: EInvoiceService = {
  generateUBLXml: stub('generateUBLXml'),
  generateInvoiceHash: stub('generateInvoiceHash'),
  signInvoice: stub('signInvoice'),
  generateTLVQR: stub('generateTLVQR'),
  buildInvoiceHTML: stub('buildInvoiceHTML'),
  generatePDF: stub('generatePDF'),
};
