/**
 * src/packs/sa/payments.ts
 *
 * Saudi payments adapter (Moyasar). Delegates to the existing Moyasar service.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createOrRefreshMoyasarLink,
  processMoyasarWebhook,
  requestMoyasarRefund,
  type MoyasarLinkOptions,
  type MoyasarLinkResult,
} from './moyasarService.js';
import type { PaymentsService, PaymentLinkOptions } from '../contract/CountryPack.js';

export type { MoyasarLinkResult };

function toMoyasarOptions(options: PaymentLinkOptions): MoyasarLinkOptions {
  return {
    ...options,
    sourceType: options.sourceType as MoyasarLinkOptions['sourceType'] | undefined,
  };
}

export const saPayments: PaymentsService = {
  createOrRefreshPaymentLink: async (supabase, options) =>
    createOrRefreshMoyasarLink(supabase as SupabaseClient, toMoyasarOptions(options)),

  processWebhook: async (supabase, payload, signature) => {
    const p = (payload ?? {}) as Record<string, unknown>;
    return processMoyasarWebhook(supabase as SupabaseClient, {
      ...p,
      secret_token: signature ?? p.secret_token,
    } as any);
  },

  refundPayment: async (supabase, tenantId, paymentId, amount) =>
    requestMoyasarRefund(supabase as SupabaseClient, tenantId, paymentId, amount),
};
