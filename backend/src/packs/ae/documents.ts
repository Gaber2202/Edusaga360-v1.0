/**
 * src/packs/ae/documents.ts
 *
 * Document rendering for the UAE is not yet implemented. Invoice PDFs will
 * be generated through the generic document pipeline once it is moved from the
 * frontend to the backend.
 */

import { NotImplementedInJurisdiction } from '../../lib/jurisdiction.js';
import type { DocumentsService } from '../contract/CountryPack.js';

function stub(method: string) {
  return async (..._args: unknown[]) => {
    throw new NotImplementedInJurisdiction(
      'AE',
      `DocumentsService.${method} — UAE document rendering pipeline not implemented; see generic renderer extraction (ADR-007)`,
    );
  };
}

export const aeDocuments: DocumentsService = {
  renderInvoicePdf: stub('renderInvoicePdf'),
  renderPayslipPdf: stub('renderPayslipPdf'),
};
