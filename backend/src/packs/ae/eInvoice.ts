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

import type { EInvoiceService } from '../contract/CountryPack.js';

export const aeEInvoice: EInvoiceService = {};
