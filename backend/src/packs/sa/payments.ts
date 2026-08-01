/**
 * src/packs/sa/payments.ts
 *
 * Saudi payments adapter (Moyasar). Delegates to the existing Moyasar service.
 */

import {
  createOrRefreshMoyasarLink,
  processMoyasarWebhook,
  requestMoyasarRefund,
  type MoyasarLinkOptions,
  type MoyasarLinkResult,
} from '../../services/moyasar/moyasarService.js';
import type { PaymentsService } from '../contract/CountryPack.js';

export { MoyasarLinkOptions, MoyasarLinkResult };

export const saPayments: PaymentsService = {
  createOrRefreshPaymentLink: createOrRefreshMoyasarLink,
  processWebhook: processMoyasarWebhook,
  refundPayment: requestMoyasarRefund,
};
