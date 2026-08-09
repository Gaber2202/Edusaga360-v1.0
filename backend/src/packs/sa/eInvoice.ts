/**
 * src/packs/sa/eInvoice.ts
 *
 * Saudi e-invoicing (ZATCA) adapter. Re-uses the existing backend ZATCA service.
 */

import {
  generateUBLXml,
  generateInvoiceHash,
  signInvoice,
  generatePIH,
  generateTLVQR,
  buildInvoiceHTML,
  generateZATCAInvoicePDF,
  reportInvoice,
  clearInvoice,
  complianceCheck,
} from './zatca.js';
import type { EInvoiceService } from '../contract/CountryPack.js';

export const saEInvoice: EInvoiceService = {
  generateUBLXml,
  generateInvoiceHash,
  signInvoice,
  generatePIH,
  generateTLVQR,
  buildInvoiceHTML,
  generatePDF: generateZATCAInvoicePDF,
  reportInvoice,
  clearInvoice,
  complianceCheck,
};
