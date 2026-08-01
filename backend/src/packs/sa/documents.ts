/**
 * src/packs/sa/documents.ts
 *
 * Saudi document renderer. Only backend-resident documents are implemented:
 *   - ZATCA invoice PDF
 *   - payslip PDF
 *
 * Category A (HR letters / contracts) and Category B (regulatory filings) are
 * left as typed TODOs per ADR-006 and Task 8b.
 */

import { generateZATCAInvoicePDF } from '../../services/zatca.js';
import { generatePayslipPdf, type PayslipData } from '../../routes/payslipPdf.js';
import { NotImplementedInJurisdiction } from '../../lib/jurisdiction.js';
import type { DocumentsService } from '../contract/CountryPack.js';

export type { PayslipData };

export const saDocuments: DocumentsService = {
  renderInvoicePdf: generateZATCAInvoicePDF,
  renderPayslipPdf: (payslipData: unknown) => generatePayslipPdf(payslipData as PayslipData),

  buildDocument: () => {
    throw new NotImplementedInJurisdiction('SA', 'DocumentsService.buildDocument — Category A/B, see ADR-006 / Task 8b');
  },

  renderPdf: () => {
    throw new NotImplementedInJurisdiction('SA', 'DocumentsService.renderPdf — Category A/B, see ADR-006 / Task 8b');
  },
};
