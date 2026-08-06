/**
 * src/packs/ae/payments.ts
 *
 * UAE payment gateway integrations are not yet implemented. The country has
 * CBUAE-licensed Retail Payment Services providers; onboarding a specific
 * gateway is a commercial task per school.
 */

import { NotImplementedInJurisdiction } from '../../lib/jurisdiction.js';
import type { PaymentsService } from '../contract/CountryPack.js';

function stub(method: string) {
  return async (..._args: unknown[]) => {
    throw new NotImplementedInJurisdiction(
      'AE',
      `PaymentsService.${method} — UAE payment gateway not configured; choose a CBUAE-licensed provider and complete onboarding`,
    );
  };
}

export const aePayments: PaymentsService = {
  createOrRefreshPaymentLink: stub('createOrRefreshPaymentLink'),
  getOrCreatePaymentLink: stub('getOrCreatePaymentLink'),
  processWebhook: stub('processWebhook'),
  refundPayment: stub('refundPayment'),
  generateSadadBill: stub('generateSadadBill'),
  reconcilePaymentState: stub('reconcilePaymentState'),
};
