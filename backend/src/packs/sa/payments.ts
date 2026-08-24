/**
 * src/packs/sa/payments.ts
 *
 * Saudi payments adapter (Moyasar). Delegates to the existing Moyasar service.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createOrRefreshMoyasarLink,
  getOrCreateMoyasarLink,
  processMoyasarWebhook,
  requestMoyasarRefund,
  reconcileMoyasarState,
  bulkCreateMoyasarInvoices,
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

  // Tenant-scoped company code (#190). Prefer per-tenant settings; fall back to
  // a stable 3-digit discriminator derived from tenant_id so two tenants never
  // share the default '000' collision window.
  const { data: tenant } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .maybeSingle();
  const settings = (tenant?.settings as Record<string, unknown> | null) ?? {};
  const configured = typeof settings.sadad_company_code === 'string'
    ? settings.sadad_company_code.replace(/\D/g, '').slice(0, 3)
    : '';
  const tenantDisc = tenantId.replace(/-/g, '').slice(0, 3).replace(/[a-f]/gi, (c) => String((parseInt(c, 16) % 10)));
  const companyCode = (configured || process.env.SADAD_COMPANY_CODE || tenantDisc || '001').padStart(3, '0').slice(0, 3);
  const seq = String(invoice.invoice_number ?? '').replace(/\D/g, '').padStart(9, '0');
  let sadadBillNumber = `${companyCode}${seq}`;

  // Uniqueness check — bump a suffix digit if collision (same tenant or cross-tenant).
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = attempt === 0
      ? sadadBillNumber
      : `${companyCode}${seq.slice(0, 8)}${attempt % 10}`;
    const { data: clash } = await supabase
      .from('invoices')
      .select('id')
      .eq('sadad_bill_number', candidate)
      .neq('id', invoiceId)
      .maybeSingle();
    if (!clash) {
      sadadBillNumber = candidate;
      break;
    }
  }

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

  getOrCreatePaymentLink: async (supabase, options) =>
    getOrCreateMoyasarLink(supabase as SupabaseClient, toMoyasarOptions(options)) as Promise<MoyasarLinkResult>,

  bulkCreatePaymentLinks: async (supabase, tenantId, invoiceIds, callbackUrl, successUrl, backUrl) =>
    bulkCreateMoyasarInvoices(
      supabase as SupabaseClient,
      tenantId,
      invoiceIds,
      callbackUrl,
      successUrl,
      backUrl,
    ),

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
