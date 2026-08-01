import type { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { MoyasarClient, type MoyasarInvoiceItem } from './moyasarClient.js';
import { toMinorUnits, toMajorUnits, roundToMinorUnits, getMinorUnits } from '../../lib/money.js';
import { getTenantComplianceData } from '../tenant.js';
import { createReceiptForPayment } from '../receipt.js';

export interface MoyasarLinkOptions {
  tenantId: string;
  invoiceId: string;
  installmentId?: string | null;
  studentFirstName?: string;
  callbackUrl: string;
  successUrl?: string;
  backUrl?: string;
  sourceType?: 'creditcard' | 'mada' | 'applepay' | 'stcpay' | 'samsungpay';
}

export type MoyasarLinkResult = {
  ok: true;
  moyasarInvoiceId: string;
  paymentUrl: string;
  status: string;
  amountMinor: number;
  expiresAt?: string;
} | {
  ok: false;
  error: string;
};

export async function getMoyasarClientForTenant(_tenantId: string): Promise<MoyasarClient | null> {
  const secretKey = process.env.MOYASAR_SECRET_KEY_TEST || process.env.MOYASAR_API_KEY;
  if (!secretKey) return null;
  return new MoyasarClient({ secretKey });
}

export function idempotencyKeyForInvoice(tenantId: string, invoiceId: string, version: number): string {
  return `tenant:${tenantId}:inv:${invoiceId}:v${version}`;
}

export function resolvePaymentExpiryHours(_tenantId: string): number {
  return Number(process.env.MOYASAR_LINK_EXPIRY_HOURS ?? 168);
}

export async function createOrRefreshMoyasarLink(
  supabase: SupabaseClient,
  options: MoyasarLinkOptions,
): Promise<MoyasarLinkResult> {
  const client = await getMoyasarClientForTenant(options.tenantId);
  if (!client) return { ok: false, error: 'moyasar_not_configured' };

  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('invoice_number, total_amount, paid_amount, due_date, branch_id, guardian_id, status, document_type, currency_code')
    .eq('id', options.invoiceId)
    .eq('tenant_id', options.tenantId)
    .single();
  if (invErr || !invoice) return { ok: false, error: 'invoice_not_found' };
  if (['paid', 'cancelled', 'draft', 'quotation', 'proforma'].includes(invoice.status as string) || invoice.document_type !== 'invoice') {
    return { ok: false, error: 'invoice_not_payable' };
  }

  const currencyCode = (invoice.currency_code as string) || 'SAR';
  const minorUnits = await getMinorUnits(supabase, currencyCode);
  const balance = roundToMinorUnits((Number(invoice.total_amount) || 0) - (Number(invoice.paid_amount) || 0), minorUnits);
  if (balance <= 0) return { ok: false, error: 'invoice_fully_paid' };

  const amountMinor = toMinorUnits(balance, minorUnits);

  // Cancel any active previous Moyasar invoice for this EduSaga invoice/installment.
  await cancelActiveMoyasarInvoices(supabase, client, options.tenantId, options.invoiceId, options.installmentId, 'amount_changed_or_reissued');

  const expiryHours = resolvePaymentExpiryHours(options.tenantId);
  const expiredAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

  const description = `رسوم دراسية — Term 1 Tuition — ${options.studentFirstName || 'Student'}`;
  const metadata: Record<string, string> = {
    tenant_id: options.tenantId,
    edusaga_invoice_id: options.invoiceId,
    ...(options.installmentId ? { installment_id: options.installmentId } : {}),
    guardian_id: (invoice.guardian_id as string) || '',
  };

  const { data: prev } = await supabase
    .from('moyasar_invoices')
    .select('id')
    .eq('tenant_id', options.tenantId)
    .eq('edusaga_invoice_id', options.invoiceId)
    .is('edusaga_installment_id', options.installmentId || null)
    .maybeSingle();

  const nextVersion = (prev?.id ? await supabase.from('moyasar_invoices').select('version').eq('id', prev.id).single().then(({ data }) => (data?.version as number) ?? 1) : 1) + 1;

  const idempotencyKey = idempotencyKeyForInvoice(options.tenantId, options.invoiceId, nextVersion);
  const res = await client.createInvoice({
    amount: amountMinor,
    currency: currencyCode,
    description,
    callback_url: options.callbackUrl,
    success_url: options.successUrl,
    back_url: options.backUrl,
    expired_at: expiredAt,
    metadata,
  }, idempotencyKey);

  if (!res.ok || !res.data) {
    return { ok: false, error: res.error?.message || 'moyasar_create_failed' };
  }

  const moyasarData = res.data as Record<string, unknown>;
  const moyasarId = moyasarData.id as string;
  const paymentUrl = moyasarData.url as string;
  const status = (moyasarData.status as string) || 'initiated';

  const { error: insertErr } = await supabase.from('moyasar_invoices').insert({
    tenant_id: options.tenantId,
    moyasar_id: moyasarId,
    edusaga_invoice_id: options.invoiceId,
    edusaga_installment_id: options.installmentId || null,
    amount_minor: amountMinor,
    currency_code: currencyCode,
    status,
    payment_url: paymentUrl,
    callback_url: options.callbackUrl,
    success_url: options.successUrl,
    back_url: options.backUrl,
    expired_at: expiredAt,
    metadata,
    version: nextVersion,
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  return { ok: true, moyasarInvoiceId: moyasarId, paymentUrl, status, amountMinor, expiresAt: expiredAt };
}

export interface PaymentLinkOptions {
  tenantId: string;
  invoiceId: string;
  installmentId?: string | null;
  callbackUrl?: string;
  successUrl?: string;
  backUrl?: string;
  sourceType?: 'creditcard' | 'mada' | 'applepay' | 'stcpay' | 'samsungpay';
}

export async function getOrCreateMoyasarLink(
  supabase: SupabaseClient,
  options: PaymentLinkOptions,
): Promise<MoyasarLinkResult> {
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('invoice_number, total_amount, paid_amount, due_date, branch_id, guardian_id, status, document_type, student_name, student_id, currency_code')
    .eq('id', options.invoiceId)
    .eq('tenant_id', options.tenantId)
    .single();
  if (invErr || !invoice) return { ok: false, error: 'invoice_not_found' };

  if (['paid', 'cancelled', 'draft', 'quotation', 'proforma'].includes(invoice.status as string) || invoice.document_type !== 'invoice') {
    return { ok: false, error: 'invoice_not_payable' };
  }

  const currencyCode = (invoice.currency_code as string) || 'SAR';
  const minorUnits = await getMinorUnits(supabase, currencyCode);
  const balance = roundToMinorUnits((Number(invoice.total_amount) || 0) - (Number(invoice.paid_amount) || 0), minorUnits);
  if (balance <= 0) return { ok: false, error: 'invoice_fully_paid' };

  // Re-use an active, non-expired Moyasar link if one already exists.
  const { data: existing } = await supabase
    .from('moyasar_invoices')
    .select('moyasar_id, payment_url, amount_minor, status, expired_at')
    .eq('tenant_id', options.tenantId)
    .eq('edusaga_invoice_id', options.invoiceId)
    .is('edusaga_installment_id', options.installmentId || null)
    .in('status', ['initiated', 'on_hold'])
    .gt('expired_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.payment_url) {
    return {
      ok: true,
      moyasarInvoiceId: existing.moyasar_id as string,
      paymentUrl: existing.payment_url as string,
      status: existing.status as string,
      amountMinor: existing.amount_minor as number,
      expiresAt: existing.expired_at as string | undefined,
    };
  }

  const baseUrl = options.callbackUrl || process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
  return createOrRefreshMoyasarLink(supabase, {
    tenantId: options.tenantId,
    invoiceId: options.invoiceId,
    installmentId: options.installmentId,
    callbackUrl: `${baseUrl}/api/public/billing/moyasar/webhook`,
    successUrl: options.successUrl || `${baseUrl}/payment/result?status=success`,
    backUrl: options.backUrl || `${baseUrl}/payment/result?status=pending`,
    sourceType: options.sourceType,
    studentFirstName: (invoice.student_name as string) || 'Student',
  });
}

export interface MoyasarBulkResultItem {
  invoice_id: string;
  moyasar_invoice_id?: string;
  payment_url?: string;
  status?: string;
  error?: string;
}

export type MoyasarBulkResult = {
  ok: true;
  total: number;
  successful: number;
  failed: number;
  results: MoyasarBulkResultItem[];
} | {
  ok: false;
  error: string;
};

const BULK_CHUNK_SIZE = 50;

export async function bulkCreateMoyasarInvoices(
  supabase: SupabaseClient,
  tenantId: string,
  invoiceIds: string[],
  callbackUrl: string,
  successUrl?: string,
  backUrl?: string,
): Promise<MoyasarBulkResult> {
  const client = await getMoyasarClientForTenant(tenantId);
  if (!client) return { ok: false, error: 'moyasar_not_configured' };

  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('id, invoice_number, total_amount, paid_amount, status, document_type, guardian_id, student_id, currency_code')
    .in('id', invoiceIds)
    .eq('tenant_id', tenantId)
    .eq('document_type', 'invoice');
  if (invErr || !invoices) return { ok: false, error: invErr?.message || 'invoice_load_failed' };

  const { data: students } = await supabase
    .from('students')
    .select('id, name_en, name_ar')
    .in('id', (invoices as any[]).map((i) => i.student_id).filter(Boolean));

  const studentMap = new Map((students as any[] ?? []).map((s) => [s.id, s.name_en || s.name_ar || 'Student']));

  const { data: currencyRows } = await supabase.from('currencies').select('code, minor_units');
  const minorUnitsMap = new Map<string, number>(
    (currencyRows as any[] ?? []).map((c) => [c.code as string, Number(c.minor_units) ?? 2]),
  );

  const results: MoyasarBulkResultItem[] = [];
  const expiryHours = resolvePaymentExpiryHours(tenantId);
  const expiredAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

  for (let i = 0; i < invoices.length; i += BULK_CHUNK_SIZE) {
    const chunk = (invoices as any[]).slice(i, i + BULK_CHUNK_SIZE);
    const items: MoyasarInvoiceItem[] = [];
    const itemMap = new Map<string, any>();

    for (const inv of chunk) {
      const currencyCode = (inv.currency_code as string) || 'SAR';
      const minorUnits = minorUnitsMap.get(currencyCode) ?? 2;
      const balance = roundToMinorUnits((Number(inv.total_amount) || 0) - (Number(inv.paid_amount) || 0), minorUnits);
      if (balance <= 0 || ['paid', 'cancelled', 'draft', 'quotation', 'proforma'].includes(inv.status)) {
        results.push({ invoice_id: inv.id, error: 'invoice_not_payable_or_paid' });
        continue;
      }
      const amountMinor = toMinorUnits(balance, minorUnits);
      const metadata: Record<string, string> = {
        tenant_id: tenantId,
        edusaga_invoice_id: inv.id,
        guardian_id: inv.guardian_id || '',
      };
      const item: MoyasarInvoiceItem = {
        amount: amountMinor,
        currency: currencyCode,
        description: `رسوم دراسية — Term 1 Tuition — ${studentMap.get(inv.student_id) || 'Student'}`,
        callback_url: callbackUrl,
        success_url: successUrl,
        back_url: backUrl,
        expired_at: expiredAt,
        metadata,
      };
      items.push(item);
      itemMap.set(inv.id, { inv, amountMinor, item, currencyCode });
    }

    if (items.length === 0) continue;

    const idempotencyKey = `tenant:${tenantId}:bulk:${i / BULK_CHUNK_SIZE}:v1`;
    const res = await client.bulkCreateInvoices(items, idempotencyKey);
    if (!res.ok) {
      for (const invId of itemMap.keys()) {
        results.push({ invoice_id: invId, error: res.error?.message || 'bulk_request_failed' });
      }
      continue;
    }

    const resData = res.data as Record<string, unknown>;
    const createdInvoices = Array.isArray(resData) ? resData : (Array.isArray(resData.invoices) ? resData.invoices : []);
    const sourceInvIds = Array.from(itemMap.keys());
    for (let idx = 0; idx < createdInvoices.length; idx++) {
      const m = createdInvoices[idx] as Record<string, unknown>;
      const moyasarId = m.id as string;
      const paymentUrl = m.url as string | undefined;
      const status = m.status as string | undefined;
      const meta = (m.metadata as Record<string, string> | undefined) || {};
      // Prefer metadata mapping, fall back to request order.
      const invId = meta.edusaga_invoice_id || meta.invoice_id || sourceInvIds[idx];
      const ctx = invId ? itemMap.get(invId) : undefined;
      if (!invId || !ctx) {
        if (sourceInvIds[idx]) results.push({ invoice_id: sourceInvIds[idx], error: 'bulk_response_mismatch' });
        continue;
      }
      await supabase.from('moyasar_invoices').insert({
        tenant_id: tenantId,
        moyasar_id: moyasarId,
        edusaga_invoice_id: invId,
        amount_minor: ctx.amountMinor ?? 0,
        currency_code: ctx.currencyCode,
        status: status || 'initiated',
        payment_url: paymentUrl,
        callback_url: callbackUrl,
        success_url: successUrl,
        back_url: backUrl,
        expired_at: expiredAt,
        metadata: { ...meta, tenant_id: tenantId, edusaga_invoice_id: invId },
        version: 1,
      });
      results.push({ invoice_id: invId, moyasar_invoice_id: moyasarId, payment_url: paymentUrl, status });
    }

    if (createdInvoices.length < sourceInvIds.length) {
      for (let idx = createdInvoices.length; idx < sourceInvIds.length; idx++) {
        results.push({ invoice_id: sourceInvIds[idx], error: 'missing_in_bulk_response' });
      }
    }
  }

  const successful = results.filter((r) => r.moyasar_invoice_id).length;
  return { ok: true, total: invoiceIds.length, successful, failed: results.length - successful, results };
}

export async function cancelActiveMoyasarInvoices(
  supabase: SupabaseClient,
  client: MoyasarClient,
  tenantId: string,
  invoiceId: string,
  installmentId: string | null | undefined,
  reason: string,
): Promise<void> {
  let q = supabase
    .from('moyasar_invoices')
    .select('id, moyasar_id, status')
    .eq('tenant_id', tenantId)
    .eq('edusaga_invoice_id', invoiceId)
    .in('status', ['initiated', 'paid', 'on_hold']);
  if (installmentId) q = q.eq('edusaga_installment_id', installmentId);
  else q = q.is('edusaga_installment_id', null);

  const { data: active } = await q;
  for (const row of active ?? []) {
    if (['initiated', 'on_hold'].includes(row.status as string)) {
      await client.cancelInvoice(row.moyasar_id as string);
    }
    await supabase
      .from('moyasar_invoices')
      .update({ status: 'canceled', cancelled_at: new Date().toISOString(), cancelled_reason: reason })
      .eq('id', row.id)
      .eq('tenant_id', tenantId);
  }
}

export interface MoyasarWebhookPayload {
  id: string;
  type: string;
  live?: boolean;
  data: Record<string, unknown>;
  secret_token?: string;
}

export function verifyWebhookSecret(presented: string | undefined, expected: string | undefined): boolean {
  if (!expected) return false;
  const a = Buffer.from(presented || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function processMoyasarWebhook(
  supabase: SupabaseClient,
  payload: MoyasarWebhookPayload,
  options?: { skipSecret?: boolean },
): Promise<{ received: boolean; applied?: boolean; already_processed?: boolean; invoice_status?: string; error?: string }> {
  const expectedSecret = process.env.MOYASAR_WEBHOOK_SECRET;
  if (!options?.skipSecret && !verifyWebhookSecret(payload.secret_token, expectedSecret)) {
    return { received: false, error: 'invalid_signature' };
  }

  const eventId = payload.id;
  const eventType = payload.type;
  const data = payload.data;

  const moyasarPaymentId = data.id as string;
  const metadata = (data.metadata as Record<string, string>) || {};
  let invoiceId: string | undefined = metadata.edusaga_invoice_id || metadata.invoice_id;
  let tenantId = metadata.tenant_id || '';
  const installmentId = metadata.installment_id || null;
  let invoiceStatus: string | undefined;

  // Fallback: if metadata is stripped (e.g. bulk invoices), resolve via moyasar_invoices table.
  if (data.invoice_id) {
    const { data: moyasarInvoice } = await supabase
      .from('moyasar_invoices')
      .select('edusaga_invoice_id, tenant_id')
      .eq('moyasar_id', data.invoice_id as string)
      .maybeSingle();
    if (moyasarInvoice) {
      if (!invoiceId) invoiceId = (moyasarInvoice.edusaga_invoice_id as string) || undefined;
      if (!tenantId) tenantId = (moyasarInvoice.tenant_id as string) || '';
    }
  }

  // Replay/idempotency guard (after tenant resolution).
  const { data: existing } = await supabase
    .from('moyasar_webhook_events')
    .select('id')
    .eq('tenant_id', tenantId || '00000000-0000-0000-0000-000000000000')
    .eq('event_id', eventId)
    .maybeSingle();
  if (existing) return { received: true, applied: true, already_processed: true };

  if (!tenantId) return { received: false, error: 'missing_tenant_id' };

  await supabase.from('moyasar_webhook_events').insert({
    tenant_id: tenantId,
    event_id: eventId,
    event_type: eventType,
    moyasar_payment_id: moyasarPaymentId || null,
    moyasar_invoice_id: (data.invoice_id as string) || null,
    payload,
    processed_at: new Date().toISOString(),
  });

  if (!['payment_paid', 'payment_failed', 'payment_captured', 'payment_refunded', 'payment_voided', 'payment_authorized', 'payment_abandoned', 'payment_expired', 'payment_verified'].includes(eventType)) {
    return { received: true };
  }

  if (!invoiceId || !tenantId) return { received: false, error: 'missing_invoice_id' };

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single();
  if (!invoice) return { received: false, error: 'invoice_not_found' };

  // Resolve the local moyasar_invoices row id from the external Moyasar invoice id.
  const { data: moyasarInvoiceRow } = await supabase
    .from('moyasar_invoices')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('moyasar_id', data.invoice_id as string)
    .maybeSingle();

  const currencyCode = (invoice.currency_code as string) || 'SAR';
  const minorUnits = await getMinorUnits(supabase, currencyCode);
  const epsilon = 1 / (10 ** minorUnits);

  // Upsert moyasar payment record
  const paymentAmountMinor = Number(data.amount) || 0;
  const feeMinor = Number(data.fee) || 0;
  const { data: moyasarPmt } = await supabase
    .from('moyasar_payments')
    .upsert({
      tenant_id: tenantId,
      moyasar_payment_id: moyasarPaymentId,
      moyasar_invoice_id: (moyasarInvoiceRow?.id as string) || null,
      amount_minor: paymentAmountMinor,
      fee_minor: feeMinor,
      refunded_minor: Number(data.refunded) || 0,
      captured_minor: Number(data.captured) || 0,
      currency_code: currencyCode,
      status: data.status as string,
      payment_method: (data.source as Record<string, unknown>)?.type as string,
      metadata,
      payload: data,
    }, { onConflict: 'tenant_id,moyasar_payment_id' })
    .select()
    .single();

  if (eventType === 'payment_paid' || eventType === 'payment_captured') {
    const amountMajor = toMajorUnits(paymentAmountMinor, minorUnits);
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('reference', moyasarPaymentId)
      .maybeSingle();
    if (!existingPayment) {
      const newPaid = roundToMinorUnits(Number(invoice.paid_amount) + amountMajor, minorUnits);
      const newStatus = newPaid >= Number(invoice.total_amount) - epsilon ? 'paid' : 'partial';
      const { data: paymentRow } = await supabase.from('payments').insert({
        tenant_id: tenantId,
        invoice_id: invoiceId,
        amount: amountMajor,
        currency_code: currencyCode,
        method: 'online',
        reference: moyasarPaymentId,
        date: new Date().toISOString().split('T')[0],
        status: 'completed',
        branch_id: (invoice.branch_id as string) || null,
      }).select().single();
      invoiceStatus = newStatus;
      await supabase
        .from('invoices')
        .update({ paid_amount: newPaid, balance: roundToMinorUnits(Number(invoice.total_amount) - newPaid, minorUnits), status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', invoiceId)
        .eq('tenant_id', tenantId);

      // Auto-issue a bilingual receipt for the online payment.
      try {
        const tenantData = await getTenantComplianceData(tenantId);
        await createReceiptForPayment(
          supabase,
          invoice as any,
          { id: paymentRow?.id, amount: amountMajor, method: 'online', reference: moyasarPaymentId, date: new Date().toISOString().split('T')[0] },
          tenantData,
        );
      } catch (receiptErr) {
        console.warn('[moyasarService] receipt generation failed:', (receiptErr as Error).message);
      }

      // Stop active collection sequences for this invoice.
      await supabase
        .from('collection_messages')
        .update({ delivery_status: 'stopped', stopped_at: new Date().toISOString(), stop_reason: 'payment_received' })
        .eq('tenant_id', tenantId)
        .eq('invoice_id', invoiceId)
        .in('delivery_status', ['pending', 'scheduled', 'failed']);
    }
  } else if (eventType === 'payment_refunded') {
    // Refund without a credit note goes to review queue.
    const hasCreditNote = await supabase
      .from('invoices')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('parent_document_id', invoiceId)
      .eq('document_type', 'credit_note')
      .limit(1)
      .single()
      .then(({ data }) => !!data);
    if (!hasCreditNote) {
      await supabase.from('moyasar_refund_queue').insert({
        tenant_id: tenantId,
        edusaga_invoice_id: invoiceId,
        moyasar_payment_id: moyasarPaymentId,
        amount_minor: paymentAmountMinor,
        currency_code: currencyCode,
        status: 'pending_review',
        reason: 'refund_without_credit_note',
      });
    }
  } else if (['payment_failed', 'payment_abandoned', 'payment_expired'].includes(eventType)) {
    // Signal to YAMEN collection timeline
    await supabase.from('collection_actions_ledger').insert({
      tenant_id: tenantId,
      profile_id: null,
      action_type: 'payment_attempt_failed',
      actor: 'moyasar',
      reference_table: 'moyasar_payments',
      reference_id: moyasarPaymentId,
      input_snapshot: { event: eventType, moyasar_payment_id: moyasarPaymentId, invoice_id: invoiceId },
      decision: 'log_failure',
      outcome: { event_type: eventType },
    });
  }

  return { received: true, applied: true, invoice_status: invoiceStatus };
}

export async function reconcileMoyasarState(
  supabase: SupabaseClient,
  tenantId: string,
  since?: string,
): Promise<{ checked: number; drift: string[] }> {
  const client = await getMoyasarClientForTenant(tenantId);
  if (!client) return { checked: 0, drift: ['moyasar_not_configured'] };

  const sinceDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const res = await client.listPayments({ created_at_gte: sinceDate, per: '50' });
  if (!res.ok || !res.data) return { checked: 0, drift: [res.error?.message || 'list_failed'] };

  const payments = (res.data as { payments?: Record<string, unknown>[] }).payments || [];
  const drift: string[] = [];
  for (const p of payments) {
    const moyasarPaymentId = p.id as string;
    const { data: local } = await supabase
      .from('moyasar_payments')
      .select('id, status, amount_minor')
      .eq('tenant_id', tenantId)
      .eq('moyasar_payment_id', moyasarPaymentId)
      .maybeSingle();
    if (!local) {
      await processMoyasarWebhook(supabase, { id: `sweep-${moyasarPaymentId}`, type: `payment_${p.status}`, data: p }, { skipSecret: true });
      drift.push(`missed_payment:${moyasarPaymentId}:${p.status}`);
    } else if (local.status !== p.status) {
      await supabase.from('moyasar_payments').update({ status: p.status as string, updated_at: new Date().toISOString() }).eq('id', local.id).eq('tenant_id', tenantId);
      drift.push(`status_drift:${moyasarPaymentId}:${local.status}->${p.status}`);
    }
  }

  await supabase.from('collection_actions_ledger').insert({
    tenant_id: tenantId,
    action_type: 'moyasar_reconciliation',
    actor: 'system',
    reference_table: 'moyasar_payments',
    reference_id: 'sweep',
    input_snapshot: { checked: payments.length, since: sinceDate },
    decision: 'reconcile',
    outcome: { drift },
  });

  return { checked: payments.length, drift };
}

export async function requestMoyasarRefund(
  supabase: SupabaseClient,
  tenantId: string,
  edusagaPaymentId: string,
  amountSAR?: number,
): Promise<{ ok: boolean; moyasarPaymentId?: string; error?: string }> {
  const client = await getMoyasarClientForTenant(tenantId);
  if (!client) return { ok: false, error: 'moyasar_not_configured' };

  const { data: pmt } = await supabase
    .from('payments')
    .select('id, reference, amount, invoice_id, currency_code')
    .eq('tenant_id', tenantId)
    .eq('id', edusagaPaymentId)
    .single();
  if (!pmt) return { ok: false, error: 'payment_not_found' };

  const moyasarPaymentId = pmt.reference as string;
  if (!moyasarPaymentId) return { ok: false, error: 'not_a_moyasar_payment' };

  const { data: setting } = await supabase
    .from('tenant_compliance_settings')
    .select('refund_approval_threshold_sar')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const threshold = Number(setting?.refund_approval_threshold_sar) || 0;
  const refundAmountSAR = amountSAR ?? Number(pmt.amount);

  const currencyCode = (pmt.currency_code as string) || 'SAR';
  const minorUnits = await getMinorUnits(supabase, currencyCode);
  const refundMinor = toMinorUnits(refundAmountSAR, minorUnits);

  if (threshold > 0 && refundAmountSAR > threshold) {
    await supabase.from('moyasar_refund_queue').insert({
      tenant_id: tenantId,
      edusaga_invoice_id: pmt.invoice_id as string,
      edusaga_payment_id: edusagaPaymentId,
      moyasar_payment_id: moyasarPaymentId,
      amount_minor: refundMinor,
      currency_code: currencyCode,
      status: 'pending_review',
      reason: 'above_threshold',
    });
    return { ok: true, moyasarPaymentId };
  }

  const req = amountSAR ? { amount: refundMinor } : undefined;
  const res = await client.refundPayment(moyasarPaymentId, req);
  if (!res.ok) return { ok: false, error: res.error?.message || 'refund_failed' };

  await supabase.from('moyasar_refund_queue').insert({
    tenant_id: tenantId,
    edusaga_invoice_id: pmt.invoice_id as string,
    edusaga_payment_id: edusagaPaymentId,
    moyasar_payment_id: moyasarPaymentId,
    amount_minor: refundMinor,
    currency_code: currencyCode,
    status: 'approved',
    reason: 'below_threshold_auto',
  });

  return { ok: true, moyasarPaymentId };
}
