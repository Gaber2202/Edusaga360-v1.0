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
  reconcileMoyasarState,
  type MoyasarLinkOptions,
  type MoyasarLinkResult,
} from './moyasarService.js';
import type { PaymentsService, PaymentLinkOptions, SadadBillResult } from '../contract/CountryPack.js';

export type { MoyasarLinkResult };

async function generateSadadBill(
  supabase: SupabaseClient,
  tenantId: string,
  invoiceId: string,
): Promise<SadadBillResult> {
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('invoice_number, total_amount, due_date')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single();
  if (error || !invoice) throw error ?? new Error('Invoice not found');

  const companyCode = process.env.SADAD_COMPANY_CODE ?? '000';
  const seq = String(invoice.invoice_number ?? '').replace(/\D/g, '').padStart(9, '0');
  const sadadBillNumber = `${companyCode}${seq}`;

  return {
    sadad_bill_number: sadadBillNumber,
    amount: Number(invoice.total_amount ?? 0),
    due_date: (invoice.due_date as string | null) ?? null,
    payment_instructions: {
      ar: `لسداد الفاتورة عبر سداد، استخدم رقم الفاتورة: ${sadadBillNumber}`,
      en: `To pay via SADAD, use bill number: ${sadadBillNumber}`,
    },
  };
}

function toMoyasarOptions(options: PaymentLinkOptions): MoyasarLinkOptions {
  return {
    ...options,
    sourceType: options.sourceType as MoyasarLinkOptions['sourceType'] | undefined,
  };
}

export const saPayments: PaymentsService = {
  generateSadadBill: async (supabase, tenantId, invoiceId) =>
    generateSadadBill(supabase as SupabaseClient, tenantId, invoiceId),

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

  reconcilePaymentState: async (supabase, tenantId, since) =>
    reconcileMoyasarState(supabase as SupabaseClient, tenantId, since),
};
