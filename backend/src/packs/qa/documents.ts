/**
 * src/packs/qa/documents.ts
 *
 * Document rendering for Qatar is not yet implemented. Invoice PDFs will be
 * generated through the generic document pipeline once it is extracted from the
 * Saudi ZATCA-specific renderer (see ADR-007 and issue #204).
 */

import { NotImplementedInJurisdiction } from '../../lib/jurisdiction.js';
import type { DocumentsService } from '../contract/CountryPack.js';

function stub(method: string) {
  return async (..._args: unknown[]) => {
    throw new NotImplementedInJurisdiction(
      'QA',
      `DocumentsService.${method} — Qatar document rendering pipeline not implemented; see generic renderer extraction (ADR-007)`,
    );
  };
}

export const qaDocuments: DocumentsService = {
  renderInvoicePdf: stub('renderInvoicePdf'),
  renderPayslipPdf: stub('renderPayslipPdf'),
};
