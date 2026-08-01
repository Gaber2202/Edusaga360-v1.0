/**
 * Public subscription routes — these must not require an authenticated user
 * because they are called by external payment providers (Moyasar webhooks).
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '../lib/supabase.js';
import { toMinorUnits } from '../lib/money.js';
import { applyUpgrade } from './subscription.js';

export const subscriptionPublicRouter = Router();

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// ─── POST /webhook/moyasar — Idempotent Moyasar webhook for subscriptions ────
//
// Payment integrity (PAY-01/PAY-02): a webhook body is attacker-controllable, so
// entitlements must never be granted on the body's word alone. Two guards:
//   1. Shared-secret check — when MOYASAR_WEBHOOK_SECRET is configured, the caller
//      must present the same token (Moyasar echoes the webhook "secret token" in
//      the payload's `secret_token`; we also accept it via header for flexibility).
//      Compared in constant time. If the env var is unset the check is skipped and
//      a warning is logged (see BLOCKERS.md — production MUST set this).
//   2. Amount check — the paid `amount` (minor units) must equal the order's
//      total_amount converted to minor units. A mismatch is treated as fraud/misroute
//      and rejected WITHOUT applying the upgrade.

subscriptionPublicRouter.post('/webhook/moyasar', async (req: Request, res: Response) => {
  try {
    const { id: payment_id, status, metadata, amount, secret_token } = req.body as Record<string, unknown>;

    // Guard 1 — shared-secret verification.
    const webhookSecret = process.env.MOYASAR_WEBHOOK_SECRET;
    if (webhookSecret) {
      const presented = (secret_token as string | undefined)
        || (req.headers['x-moyasar-secret'] as string | undefined)
        || (req.headers['x-event-secret'] as string | undefined)
        || '';
      if (!presented || !timingSafeEqual(presented, webhookSecret)) {
        console.warn('subscription/webhook: rejected — invalid or missing webhook secret');
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
    } else {
      console.warn('subscription/webhook: MOYASAR_WEBHOOK_SECRET not set — webhook authenticity is NOT verified');
    }

    if (status !== 'paid') return res.json({ received: true });

    const meta = metadata as Record<string, string> | undefined;
    if (!meta?.order_id || meta?.type !== 'subscription') {
      return res.json({ received: true }); // Not a subscription payment
    }

    const orderId = meta.order_id;
    const tenantId = meta.tenant_id;

    // Idempotency: check if already processed
    let order: Record<string, unknown> | null = null;
    let useSubscriptionTable = true;

    const { data } = await supabase
      .from('subscription_orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (data) {
      order = data;
    } else {
      useSubscriptionTable = false;
      const { data: fb } = await supabase
        .from('tenant_requests')
        .select('*')
        .eq('id', orderId)
        .single();
      if (fb) {
        const desc = typeof fb.description === 'string' ? JSON.parse(fb.description) : fb.description;
        order = { ...fb, total_amount: desc?.total_amount, order_type: desc?.order_type, plan_code: desc?.plan_code, additional_seats: desc?.additional_seats, currency: 'SAR' };
      }
    }

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'paid' || order.status === 'verified') {
      return res.json({ received: true, already_processed: true });
    }

    // Guard 2 — server-side amount verification. Never trust the webhook to imply
    // the correct amount was paid: compare Moyasar's minor units against the order total.
    const expectedMinor = toMinorUnits(Number(order.total_amount), 2);
    const paidMinor = Math.round(Number(amount));
    if (!Number.isFinite(expectedMinor) || expectedMinor <= 0 || paidMinor !== expectedMinor) {
      console.error(
        `subscription/webhook: amount mismatch for order ${orderId} — expected ${expectedMinor} minor, got ${paidMinor}. Upgrade NOT applied.`,
      );
      return res.status(400).json({ error: 'Amount mismatch — payment not applied' });
    }

    // Mark as paid
    if (useSubscriptionTable) {
      await supabase.from('subscription_orders')
        .update({
          status: 'paid',
          moyasar_payment_id: payment_id as string,
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);
    } else {
      await supabase.from('tenant_requests')
        .update({ status: 'paid' })
        .eq('id', orderId);
    }

    // Auto-apply the upgrade
    await applyUpgrade(
      orderId,
      tenantId,
      order.order_type as string,
      (order.plan_code as string) ?? null,
      (order.additional_seats as number) ?? 0,
      'system',
    );

    return res.json({ received: true, applied: true });
  } catch (err) {
    console.error('subscription/webhook:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});
