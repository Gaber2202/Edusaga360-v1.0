/**
 * src/packs/qa/payments.ts
 *
 * Qatar payment gateway integrations are not yet implemented. The school must
 * contract a QCB-licensed Retail Payment Services provider and complete
 * onboarding before this service is enabled.
 */

import { NotImplementedInJurisdiction } from '../../lib/jurisdiction.js';
import type { PaymentsService } from '../contract/CountryPack.js';

function stub(method: string) {
  return async (..._args: unknown[]) => {
    throw new NotImplementedInJurisdiction(
      'QA',
      `PaymentsService.${method} — Qatar payment gateway not configured; choose a QCB-licensed provider and complete onboarding`,
    );
  };
}

export const qaPayments: PaymentsService = {
  createOrRefreshPaymentLink: stub('createOrRefreshPaymentLink'),
  getOrCreatePaymentLink: stub('getOrCreatePaymentLink'),
  processWebhook: stub('processWebhook'),
  refundPayment: stub('refundPayment'),
  generateSadadBill: stub('generateSadadBill'),
  reconcilePaymentState: stub('reconcilePaymentState'),
};
