/**
 * src/packs/ae/eInvoice.ts
 *
 * UAE e-invoicing is intentionally a stub.
 *
 * B2C parent invoices are excluded from the UAE mandate. B2B billing, when it
 * applies, must be issued through a Ministry of Finance Accredited Service
 * Provider in PINT-AE format; there is no self-issued QR or hash chain to
 * build in this codebase. Do not build this by analogy to ZATCA.
 */

import { NotImplementedInJurisdiction } from '../../lib/jurisdiction.js';
import type { EInvoiceService } from '../contract/CountryPack.js';

function stub(method: string) {
  return (..._args: unknown[]) => {
    throw new NotImplementedInJurisdiction(
      'AE',
      `EInvoiceService.${method} — UAE e-invoicing requires a Ministry of Finance Accredited Service Provider (PINT-AE); self-issued QR/hash chains are not supported`,
    );
  };
}

export const aeEInvoice: EInvoiceService = {
  generateUBLXml: stub('generateUBLXml'),
  generateInvoiceHash: stub('generateInvoiceHash'),
  signInvoice: stub('signInvoice'),
  generateTLVQR: stub('generateTLVQR'),
  buildInvoiceHTML: stub('buildInvoiceHTML'),
  generatePDF: stub('generatePDF'),
};
