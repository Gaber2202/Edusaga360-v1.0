/**
 * src/packs/ae/payments.ts
 *
 * UAE payment gateway integrations are not yet implemented. The country has
 * CBUAE-licensed Retail Payment Services providers; onboarding a specific
 * gateway is a commercial task per school.
 */

import type { PaymentsService } from '../contract/CountryPack.js';

export const aePayments: PaymentsService = {};
