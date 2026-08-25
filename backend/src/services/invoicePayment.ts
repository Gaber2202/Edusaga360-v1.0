/**
 * Shared invoice payment recording — payments row, invoice balance, receipt, GL journal, webhooks.
 * Used by billing routes and in-school store order collection.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.js';
import { buildRequestContext, resolveJurisdiction, NotImplementedInJurisdiction } from '../lib/jurisdiction.js';
import { resolvePack } from '../packs/registry.js';
import { getTenantComplianceData } from './tenant.js';
import { createReceiptForPayment } from './receipt.js';
import { dispatchWebhook } from './webhookDelivery.js';

export const PAYMENT_METHODS = [
  'cash',
  'bank_transfer',
  'card',
  'mada',
  'apple_pay',
  'stc_pay',
  'sadad',
  'tamara',
  'tabby',
  'online',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

function sar(n: number): number {
  return Math.round(n * 100) / 100;
}

async function postJournal(
  client: SupabaseClient,
  tenant_id: string,
  created_by: string,
  reference: string,
  description: string,
  lines: { account_code: string; debit: number; credit: number; description: string }[],
  branch_id?: string | null,
): Promise<string | null> {
  const { data, error } = await client.rpc('post_journal', {
    p_tenant_id: tenant_id,
    p_created_by: created_by,
    p_reference: reference,
    p_description: description,
    p_lines: lines,
    p_branch_id: branch_id ?? null,
  });
  if (error) throw new Error(error.message || 'post_journal failed');
  return data as string | null;
}

export interface RecordInvoicePaymentInput {
  tenantId: string;
  userId: string;
  invoiceId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  reference?: string;
  installmentId?: string;
  client?: SupabaseClient;
}

export interface RecordInvoicePaymentResult {
  payment: Record<string, unknown>;
  invoice: {
    id: string;
    paid_amount: number;
    status: string;
    remaining_balance: number;
    invoice_number?: string;
    total_amount?: number;
    source?: string;
    student_id?: string;
    tenant_id?: string;
    branch_id?: string | null;
  };
  receipt: Record<string, unknown> | null;
  invoiceFullyPaid: boolean;
}

export async function recordInvoicePayment(
  opts: RecordInvoicePaymentInput,
): Promise<RecordInvoicePaymentResult> {
  const client = opts.client ?? supabase;
  const { tenantId, userId, invoiceId, amount, paymentMethod, reference, installmentId } = opts;

  const { data: invoice, error: fetchErr } = await client
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single();
  if (fetchErr || !invoice) throw new Error('Invoice not found');
  if (['paid', 'cancelled'].includes(String(invoice.status))) {
    throw new Error(`Invoice already ${invoice.status}`);
  }

  const totalAmount = Number(invoice.total_amount) || 0;
  const paidAmount = Number(invoice.paid_amount) || 0;
  const remaining = sar(totalAmount - paidAmount);
  if (amount > remaining + 0.01) {
    throw new Error(`Payment (${amount}) exceeds balance (${remaining})`);
  }

  const today = new Date().toISOString().split('T')[0];
  const newPaid = sar(paidAmount + amount);
  const newStatus = newPaid >= totalAmount - 0.01 ? 'paid' : 'partial';
  const ctx = await buildRequestContext(client, tenantId, (invoice.branch_id as string) ?? undefined);
  const pack = resolvePack(ctx);

  const { data: payment, error: pmtErr } = await client
    .from('payments')
    .insert({
      tenant_id: tenantId,
      currency_code: pack.currencyCode,
      branch_id: invoice.branch_id ?? null,
      invoice_id: invoiceId,
      amount,
      method: paymentMethod,
      reference: reference ?? null,
      date: today,
      status: 'completed',
    })
    .select()
    .single();
  if (pmtErr) throw pmtErr;

  await client
    .from('invoices')
    .update({ paid_amount: newPaid, status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId);

  let receipt: Record<string, unknown> | null = null;
  try {
    const tenantData = await getTenantComplianceData(client, tenantId);
    const receiptCtx = await buildRequestContext(client, tenantId, (invoice.branch_id as string) ?? undefined);
    const receiptPack = resolvePack(receiptCtx);
    if (!receiptPack.documents?.renderInvoicePdf) {
      throw new NotImplementedInJurisdiction(resolveJurisdiction(receiptCtx), 'receipt PDF');
    }
    const { receipt: receiptRow, pdf_base64 } = await createReceiptForPayment(
      client,
      invoice as Parameters<typeof createReceiptForPayment>[1],
      {
        id: payment.id as string,
        amount,
        method: paymentMethod,
        reference: reference ?? (payment.id as string),
        date: today,
      },
      tenantData,
      receiptPack.currencyCode,
      receiptPack.documents.renderInvoicePdf as (invoice: unknown, tenant: unknown) => Promise<Buffer>,
    );
    receipt = { ...receiptRow, pdf_base64 };
  } catch (receiptErr) {
    console.warn('[invoicePayment] receipt generation failed:', (receiptErr as Error).message);
  }

  if (installmentId) {
    await client
      .from('payment_plan_installments')
      .update({ paid_amount: amount, status: 'paid', paid_date: today, invoice_id: invoiceId })
      .eq('id', installmentId)
      .eq('tenant_id', tenantId);
    const { data: planInst } = await client
      .from('payment_plan_installments')
      .select('plan_id, status')
      .eq('tenant_id', tenantId);
    const planId = planInst?.find((i) => i.plan_id)?.plan_id;
    if (planId) {
      const allPaid = planInst
        ?.filter((i) => i.plan_id === planId)
        .every((i) => i.status === 'paid' || i.status === 'waived');
      if (allPaid) {
        await client
          .from('payment_plans')
          .update({ status: 'completed', paid_amount: totalAmount })
          .eq('id', planId);
      } else {
        const { data: planRow } = await client
          .from('payment_plans')
          .select('paid_amount')
          .eq('id', planId)
          .single();
        await client
          .from('payment_plans')
          .update({ paid_amount: sar((Number(planRow?.paid_amount) ?? 0) + amount) })
          .eq('id', planId);
      }
    }
  }

  await postJournal(
    client,
    tenantId,
    userId,
    reference ?? `PMT-${invoiceId.slice(0, 8)}`,
    `Payment — ${invoice.invoice_number}`,
    [
      { account_code: '11', debit: amount, credit: 0, description: `${paymentMethod} received` },
      { account_code: '12', debit: 0, credit: amount, description: `A/R cleared — ${invoice.invoice_number}` },
    ],
    (invoice.branch_id as string) ?? null,
  );

  void dispatchWebhook(
    client,
    tenantId,
    'payment.received',
    { invoice_id: invoiceId, payment_id: payment.id, amount, method: paymentMethod },
    payment.id as string,
  );
  if (newStatus === 'paid') {
    void dispatchWebhook(
      client,
      tenantId,
      'invoice.paid',
      {
        invoice_id: invoiceId,
        invoice_number: invoice.invoice_number,
        total: totalAmount,
        paid_amount: newPaid,
      },
      invoiceId,
    );
  }

  return {
    payment: payment as Record<string, unknown>,
    invoice: {
      id: invoiceId,
      paid_amount: newPaid,
      status: newStatus,
      remaining_balance: Math.max(0, sar(totalAmount - newPaid)),
      invoice_number: invoice.invoice_number as string | undefined,
      total_amount: totalAmount,
      source: invoice.source as string | undefined,
      student_id: invoice.student_id as string | undefined,
      tenant_id: tenantId,
      branch_id: (invoice.branch_id as string | null) ?? null,
    },
    receipt,
    invoiceFullyPaid: newStatus === 'paid',
  };
}
