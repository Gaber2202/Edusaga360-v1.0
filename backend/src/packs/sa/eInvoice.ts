/**
 * src/packs/sa/eInvoice.ts
 *
 * Saudi e-invoicing (ZATCA) adapter. Re-uses the existing backend ZATCA service.
 */

import {
  generateUBLXml,
  generateInvoiceHash,
  signInvoice,
  generateTLVQR,
  buildInvoiceHTML,
  generateZATCAInvoicePDF,
} from '../../services/zatca.js';
import type { EInvoiceService } from '../contract/CountryPack.js';

export const saEInvoice: EInvoiceService = {
  generateUBLXml,
  generateInvoiceHash,
  signInvoice,
  generateTLVQR,
  buildInvoiceHTML,
  generatePDF: generateZATCAInvoicePDF,
};
