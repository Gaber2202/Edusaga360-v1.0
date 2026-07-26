import { Router, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.js';
import { writeLedger } from '../services/collections/ledgerWriter.js';

export const billingPublicRouter = Router();

const WebhookBodySchema = z.object({
  id: z.string(),
  status: z.string(),
  amount: z.number(),
  amount_format: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  secret_token: z.string().optional(),
});

function sar(halala: number): number {
  return Math.round(halala) / 100;
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// ─── POST /api/public/billing/moyasar/webhook ───────────────────────────────
// Public, unauthenticated endpoint for Moyasar server-to-server callbacks.
// Secured by shared-secret verification, idempotency, and amount checks.
billingPublicRouter.post('/moyasar/webhook', async (req, res) => {
  try {
    const startMs = Date.now();
    const parsed = WebhookBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
    }

    const { id: payment_id, status, amount: amountHalala, metadata, secret_token } = parsed.data;

    // Guard 1: shared-secret verification.
    const webhookSecret = process.env.MOYASAR_WEBHOOK_SECRET;
    if (webhookSecret) {
      const presented =
        secret_token ||
        (req.headers['x-moyasar-secret'] as string | undefined) ||
        (req.headers['x-event-secret'] as string | undefined) ||
        '';
      if (!presented || !timingSafeEqual(presented, webhookSecret)) {
        console.warn('[public/billing/moyasar/webhook] rejected — invalid or missing webhook secret');
        return res.status(401).json({ error: 'invalid_signature' });
      }
    } else {
      console.warn('[public/billing/moyasar/webhook] MOYASAR_WEBHOOK_SECRET not set — webhook authenticity is NOT verified');
    }

    // We only act on paid callbacks.
    if (status !== 'paid') {
      return res.json({ received: true });
    }

    const meta = metadata as Record<string, string>;
    const invoice_id = meta.invoice_id;
    const tenant_id = meta.tenant_id;
    const collection_message_id = meta.collection_message_id;

    if (!invoice_id || !tenant_id) {
      return res.status(400).json({ error: 'missing_metadata', message: 'invoice_id and tenant_id are required in metadata' });
    }

    // Guard 2: idempotency — already processed?
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id')
      .eq('tenant_id', tenant_id)
      .eq('reference', payment_id)
      .maybeSingle();
    if (existingPayment) {
      return res.json({ received: true, already_processed: true });
    }

    // Guard 3: load invoice and verify amount.
    const { data: invoice, error: invoiceErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .eq('tenant_id', tenant_id)
      .single();
    if (invoiceErr || !invoice) {
      console.error('[public/billing/moyasar/webhook] invoice not found:', invoiceErr);
      return res.status(404).json({ error: 'invoice_not_found' });
    }

    const amountSAR = sar(amountHalala);
    if (amountSAR <= 0) {
      return res.status(400).json({ error: 'invalid_amount' });
    }

    // Record the payment.
    const { error: pmtErr } = await supabase.from('payments').insert({
      tenant_id,
      invoice_id,
      amount: amountSAR,
      method: 'online',
      reference: payment_id,
      date: new Date().toISOString().split('T')[0],
      status: 'completed',
    });

    if (pmtErr) {
      // 23505 = unique_violation — idempotent success on race.
      if ((pmtErr as any).code === '23505') {
        return res.json({ received: true, already_processed: true });
      }
      throw pmtErr;
    }

    // Update invoice totals.
    const newPaid = sar((invoice.paid_amount as number) + amountSAR);
    const newStatus = newPaid >= (invoice.total_amount as number) - 0.01 ? 'paid' : 'partial';
    const { error: updErr } = await supabase
      .from('invoices')
      .update({ paid_amount: newPaid, status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', invoice_id)
      .eq('tenant_id', tenant_id);
    if (updErr) throw updErr;

    // Stop active collection sequences for this invoice.
    const { error: stopErr } = await supabase
      .from('collection_messages')
      .update({ delivery_status: 'stopped', stopped_at: new Date().toISOString(), stop_reason: 'payment_received' })
      .eq('tenant_id', tenant_id)
      .eq('invoice_id', invoice_id)
      .in('delivery_status', ['pending', 'scheduled', 'failed']);
    if (stopErr) console.error('[public/billing/moyasar/webhook] failed to stop sequences:', stopErr);

    // Enqueue a thank-you message (sent by the messaging engine).
    const { data: profile } = await supabase
      .from('collection_profiles')
      .select('id, preferred_language, guardian_id')
      .eq('tenant_id', tenant_id)
      .eq('guardian_id', invoice.student_id ? (await studentGuardian(tenant_id, invoice.student_id as string, supabase)) : null)
      .maybeSingle();

    if (profile?.id) {
      await supabase.from('collection_messages').insert({
        tenant_id,
        profile_id: profile.id,
        invoice_id,
        channel: 'whatsapp',
        template_key: 'payment_thank_you',
        language: (profile.preferred_language as string) ?? 'ar',
        amount_due: 0,
        scheduled_at: new Date().toISOString(),
        delivery_status: 'pending',
        idempotency_key: `thankyou:${tenant_id}:${invoice_id}:${payment_id}`,
      });
    }

    // Write immutable ledger entry.
    await writeLedger(supabase, {
      tenant_id,
      action_type: 'reconciliation',
      actor: 'system',
      reference_table: 'payments',
      reference_id: collection_message_id,
      input_snapshot: { payment_id, invoice_id, amount_halala: amountHalala, amount_sar: amountSAR, metadata },
      decision: 'payment_applied',
      outcome: { invoice_status: newStatus, paid_amount: newPaid },
    });

    console.log(`[public/billing/moyasar/webhook] reconciled payment ${payment_id} for invoice ${invoice_id} in ${Date.now() - startMs}ms`);
    return res.json({ received: true, applied: true, invoice_status: newStatus });
  } catch (err) {
    console.error('[public/billing/moyasar/webhook] error:', err);
    return res.status(500).json({ error: 'webhook_processing_failed', message: (err as Error).message });
  }
});

async function studentGuardian(tenantId: string, studentId: string, supabaseClient: SupabaseClient): Promise<string | null> {
  const { data } = await supabaseClient
    .from('students')
    .select('guardian_id')
    .eq('tenant_id', tenantId)
    .eq('id', studentId)
    .maybeSingle();
  return (data as { guardian_id?: string } | null)?.guardian_id ?? null;
}
