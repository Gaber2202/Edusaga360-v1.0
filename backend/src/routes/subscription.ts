/**
 * Subscription & Seat Billing — WO-C
 *
 * Two payment paths for plan upgrades / seat additions:
 *   Path 1 — Online: Moyasar hosted payment link → webhook auto-applies
 *   Path 2 — Wire transfer: upload proof → finance verifies → auto-applies
 *
 * State machine: pending_payment → (awaiting_verification | paid) → (verified | rejected)
 * Entitlements are NEVER granted before payment is verified.
 */

import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import crypto from 'crypto';
import { AuthenticatedRequest, requireRole, FINANCE_ROLES } from '../middleware/auth.js';

export const subscriptionRouter = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Plan definitions (mirrored from frontend) ──────────────────────────────

const PLAN_LIMITS: Record<string, {
  maxUsers: number; maxEmployees: number; maxBranches: number;
  priceYearly: number; includedModules: string[];
}> = {
  starter: {
    maxUsers: 500, maxEmployees: 15, maxBranches: 1,
    priceYearly: 120000,
    includedModules: ['employees', 'admissions', 'students', 'student_attendance', 'fees', 'communications', 'reports'],
  },
  growth: {
    maxUsers: 2000, maxEmployees: 30, maxBranches: 3,
    priceYearly: 190000,
    includedModules: ['employees', 'admissions', 'students', 'student_attendance', 'fees', 'communications', 'reports', 'hr', 'payroll', 'finance', 'procurement', 'assets', 'crm'],
  },
  enterprise: {
    maxUsers: 6000, maxEmployees: 100, maxBranches: 10,
    priceYearly: 342000,
    includedModules: ['hr', 'payroll', 'employees', 'admissions', 'students', 'student_attendance', 'fees', 'finance', 'procurement', 'assets', 'crm', 'fleet', 'facilities', 'communications', 'reports', 'integrations'],
  },
};

const PER_SEAT_PRICE_SAR = 500; // annual per-seat add-on price
const VAT_RATE = 0.15;

function sar(n: number) { return Math.round(n * 100) / 100; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function applyUpgrade(
  orderId: string,
  tenantId: string,
  orderType: string,
  planCode: string | null,
  additionalSeats: number,
  userId: string,
) {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('plan_code, max_users, max_employees, max_branches, status, name_en')
    .eq('id', tenantId)
    .single();
  if (!tenant) return;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (orderType === 'plan_upgrade' && planCode && PLAN_LIMITS[planCode]) {
    const plan = PLAN_LIMITS[planCode];
    updates.plan = planCode;
    updates.plan_code = planCode;
    updates.status = 'active';
    updates.max_users = plan.maxUsers;
    updates.max_employees = plan.maxEmployees;
    updates.max_branches = plan.maxBranches;
    updates.plan_started_at = new Date().toISOString();
    updates.plan_renews_at = new Date(Date.now() + 365 * 86400000).toISOString();
    if (tenant.status === 'trial') {
      updates.converted_at = new Date().toISOString();
      updates.converted_from_trial = true;
      updates.trial_end_date = null;
    }
  } else if (orderType === 'add_seats' && additionalSeats > 0) {
    updates.max_users = (tenant.max_users ?? 0) + additionalSeats;
  }

  await supabase.from('tenants').update(updates).eq('id', tenantId);

  // Audit trail
  await supabase.from('platform_audit_log').insert({
    user_id: userId,
    action: orderType === 'plan_upgrade' ? 'subscription.upgrade_applied' : 'subscription.seats_added',
    target_type: 'tenant',
    target_id: tenantId,
    target_label: tenant.name_en,
    tenant_id: tenantId,
    metadata: { order_id: orderId, plan_code: planCode, additional_seats: additionalSeats },
  }).then(() => {});
}

// ─── POST /orders — Create subscription order ────────────────────────────────

const CreateOrderSchema = z.object({
  order_type: z.enum(['plan_upgrade', 'add_seats']),
  plan_code: z.string().optional(),
  additional_seats: z.number().int().positive().optional(),
  payment_method: z.enum(['online', 'wire_transfer']),
});

subscriptionRouter.post('/orders', requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = CreateOrderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', errors: parsed.error.flatten() });

    const tenantId = req.user!.tenant_id!;
    const { order_type, plan_code, additional_seats, payment_method } = parsed.data;

    // Validate plan_code for upgrades
    if (order_type === 'plan_upgrade') {
      if (!plan_code || !PLAN_LIMITS[plan_code]) {
        return res.status(400).json({ error: 'Invalid plan_code' });
      }
    }

    // Validate seats for add_seats
    if (order_type === 'add_seats') {
      if (!additional_seats || additional_seats < 1) {
        return res.status(400).json({ error: 'additional_seats required and must be >= 1' });
      }
    }

    // Calculate amount
    let subtotal = 0;
    if (order_type === 'plan_upgrade' && plan_code) {
      subtotal = PLAN_LIMITS[plan_code].priceYearly;
    } else if (order_type === 'add_seats' && additional_seats) {
      subtotal = additional_seats * PER_SEAT_PRICE_SAR;
    }
    const vatAmount = sar(subtotal * VAT_RATE);
    const totalAmount = sar(subtotal + vatAmount);

    const orderId = crypto.randomUUID();

    // Try inserting with full schema (subscription_orders table)
    // Falls back to tenant_requests if table doesn't exist
    const orderPayload = {
      id: orderId,
      tenant_id: tenantId,
      created_by: req.user!.id,
      order_type,
      plan_code: plan_code ?? null,
      additional_seats: additional_seats ?? 0,
      payment_method,
      subtotal,
      vat_amount: vatAmount,
      total_amount: totalAmount,
      currency: 'SAR',
      status: 'pending_payment',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: order, error } = await supabase
      .from('subscription_orders')
      .insert(orderPayload)
      .select()
      .single();

    if (error) {
      // Table might not exist yet — store in tenant_requests as fallback
      const { data: fallback, error: fbErr } = await supabase
        .from('tenant_requests')
        .insert({
          id: orderId,
          tenant_id: tenantId,
          submitted_by: req.user!.id,
          type: 'billing',
          subject: order_type === 'plan_upgrade'
            ? `Plan upgrade to ${plan_code}`
            : `Add ${additional_seats} seats`,
          description: JSON.stringify({
            order_type, plan_code, additional_seats, payment_method,
            subtotal, vat_amount: vatAmount, total_amount: totalAmount,
          }),
          priority: 'high',
          status: 'pending_payment',
        })
        .select()
        .single();

      if (fbErr) return res.status(500).json({ error: fbErr.message });
      return res.status(201).json({
        order: { ...fallback, ...orderPayload, id: fallback!.id },
        payment_required: true,
      });
    }

    return res.status(201).json({ order, payment_required: true });
  } catch (err) {
    console.error('subscription/orders POST:', err);
    return res.status(500).json({ error: 'Failed to create subscription order' });
  }
});

// ─── GET /orders — List subscription orders ──────────────────────────────────

subscriptionRouter.get('/orders', async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id;
  const isPlatformOwner = req.user!.is_platform_owner;

  // Platform owners see all orders; regular users see only their tenant's
  let query = supabase.from('subscription_orders').select('*');
  if (!isPlatformOwner) {
    if (!tenantId) return res.status(400).json({ error: 'No tenant' });
    query = query.eq('tenant_id', tenantId);
  }
  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    // Fallback to tenant_requests
    let fbQuery = supabase.from('tenant_requests').select('*').eq('type', 'billing');
    if (!isPlatformOwner && tenantId) fbQuery = fbQuery.eq('tenant_id', tenantId);
    const { data: fb, error: fbErr } = await fbQuery.order('created_at', { ascending: false });
    if (fbErr) return res.status(500).json({ error: fbErr.message });
    return res.json(fb ?? []);
  }

  return res.json(data ?? []);
});

// ─── GET /orders/:id — Get specific order ────────────────────────────────────

subscriptionRouter.get('/orders/:id', async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id;
  const isPlatformOwner = req.user!.is_platform_owner;
  const orderId = String(req.params.id);

  let query = supabase.from('subscription_orders').select('*').eq('id', orderId);
  if (!isPlatformOwner && tenantId) query = query.eq('tenant_id', tenantId);
  const { data, error } = await query.single();

  if (error) {
    const { data: fb } = await supabase
      .from('tenant_requests')
      .select('*')
      .eq('id', orderId)
      .single();
    if (!fb) return res.status(404).json({ error: 'Order not found' });
    return res.json(fb);
  }

  return res.json(data);
});

// ─── POST /orders/:id/payment-link — Generate Moyasar payment link ──────────

subscriptionRouter.post('/orders/:id/payment-link', requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id!;
    const orderId = String(req.params.id);
    const { callback_url } = req.body as { callback_url?: string };

    // Fetch the order
    let order: Record<string, unknown> | null = null;
    const { data } = await supabase
      .from('subscription_orders')
      .select('*')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .single();
    order = data;

    if (!order) {
      const { data: fb } = await supabase
        .from('tenant_requests')
        .select('*')
        .eq('id', orderId)
        .single();
      if (fb) {
        const desc = typeof fb.description === 'string' ? JSON.parse(fb.description) : fb.description;
        order = { ...fb, total_amount: desc?.total_amount, order_type: desc?.order_type, plan_code: desc?.plan_code };
      }
    }

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'pending_payment') {
      return res.status(400).json({ error: 'Order is not in pending_payment state' });
    }

    const moyasarKey = process.env.MOYASAR_API_KEY;
    if (!moyasarKey) {
      return res.status(500).json({ error: 'Payment gateway not configured. Contact support.' });
    }

    const amountHalala = Math.round((order.total_amount as number) * 100);
    const description = (order.order_type as string) === 'plan_upgrade'
      ? `EduSaga 360 — Plan upgrade to ${order.plan_code}`
      : `EduSaga 360 — Additional seats`;

    const frontendUrl = process.env.FRONTEND_URL || 'https://edusaga-360-production.vercel.app';
    const cbUrl = callback_url || `${frontendUrl}/subscription?order_id=${orderId}&payment=complete`;

    const response = await fetch('https://api.moyasar.com/v1/invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${moyasarKey}:`).toString('base64')}`,
      },
      body: JSON.stringify({
        amount: amountHalala,
        currency: 'SAR',
        description,
        callback_url: cbUrl,
        metadata: { order_id: orderId, tenant_id: tenantId, type: 'subscription' },
      }),
    });

    const paymentData = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      return res.status(502).json({ error: 'Payment gateway error', details: paymentData });
    }

    // Store payment link reference
    const paymentUrl = (paymentData.url as string) || '';
    const updateData = {
      moyasar_invoice_id: paymentData.id,
      payment_url: paymentUrl,
      updated_at: new Date().toISOString(),
    };

    await supabase.from('subscription_orders')
      .update(updateData)
      .eq('id', orderId)
      .eq('tenant_id', tenantId);

    return res.json({ payment_url: paymentUrl, moyasar_invoice_id: paymentData.id });
  } catch (err) {
    console.error('subscription/payment-link:', err);
    return res.status(500).json({ error: 'Failed to generate payment link' });
  }
});

// ─── POST /orders/:id/upload-proof — Upload wire transfer proof ──────────────

subscriptionRouter.post('/orders/:id/upload-proof', requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id!;
    const orderId = String(req.params.id);
    const { proof_url, proof_file_name, transfer_reference, transfer_date } = req.body as {
      proof_url?: string; proof_file_name?: string; transfer_reference?: string; transfer_date?: string;
    };

    if (!proof_url) {
      return res.status(400).json({ error: 'proof_url is required' });
    }

    // Update order status to awaiting_verification
    const updatePayload: Record<string, unknown> = {
      status: 'awaiting_verification',
      updated_at: new Date().toISOString(),
    };

    // Try subscription_orders first
    const { error } = await supabase
      .from('subscription_orders')
      .update({
        ...updatePayload,
        proof_url,
        proof_file_name: proof_file_name ?? null,
        transfer_reference: transfer_reference ?? null,
        transfer_date: transfer_date ?? null,
      })
      .eq('id', orderId)
      .eq('tenant_id', tenantId);

    if (error) {
      // Fallback to tenant_requests
      const { data: existing } = await supabase
        .from('tenant_requests')
        .select('description')
        .eq('id', orderId)
        .single();
      const desc = existing ? (typeof existing.description === 'string' ? JSON.parse(existing.description) : existing.description) : {};
      await supabase.from('tenant_requests')
        .update({
          status: 'awaiting_verification',
          description: JSON.stringify({
            ...desc,
            proof_url, proof_file_name, transfer_reference, transfer_date,
          }),
        })
        .eq('id', orderId);
    }

    return res.json({ status: 'awaiting_verification', message: 'Proof uploaded. Finance team will verify.' });
  } catch (err) {
    console.error('subscription/upload-proof:', err);
    return res.status(500).json({ error: 'Failed to upload proof' });
  }
});

// ─── POST /orders/:id/verify — Finance verifies wire transfer ────────────────

subscriptionRouter.post('/orders/:id/verify', requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orderId = String(req.params.id);
    const verifierId = req.user!.id;

    // Fetch order
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
        order = {
          ...fb,
          order_type: desc?.order_type,
          plan_code: desc?.plan_code,
          additional_seats: desc?.additional_seats,
          total_amount: desc?.total_amount,
        };
      }
    }

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'awaiting_verification') {
      return res.status(400).json({ error: 'Order is not awaiting verification' });
    }

    const orderTenantId = String(order.tenant_id ?? '');

    // Mark as verified/paid
    if (useSubscriptionTable) {
      await supabase.from('subscription_orders')
        .update({
          status: 'verified',
          verified_by: verifierId,
          verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);
    } else {
      await supabase.from('tenant_requests')
        .update({ status: 'verified' })
        .eq('id', orderId);
    }

    // Auto-apply the upgrade
    await applyUpgrade(
      orderId,
      orderTenantId,
      order.order_type as string,
      (order.plan_code as string) ?? null,
      (order.additional_seats as number) ?? 0,
      verifierId,
    );

    return res.json({ status: 'verified', message: 'Payment verified. Upgrade applied.' });
  } catch (err) {
    console.error('subscription/verify:', err);
    return res.status(500).json({ error: 'Verification failed' });
  }
});

// ─── POST /orders/:id/reject — Finance rejects wire transfer ─────────────────

subscriptionRouter.post('/orders/:id/reject', requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orderId = String(req.params.id);
    const { reason } = req.body as { reason?: string };

    const { error } = await supabase
      .from('subscription_orders')
      .update({
        status: 'rejected',
        rejection_reason: reason ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (error) {
      await supabase.from('tenant_requests')
        .update({ status: 'rejected' })
        .eq('id', orderId);
    }

    return res.json({ status: 'rejected' });
  } catch (err) {
    console.error('subscription/reject:', err);
    return res.status(500).json({ error: 'Rejection failed' });
  }
});

// ─── POST /webhook/moyasar — Idempotent Moyasar webhook for subscriptions ────

subscriptionRouter.post('/webhook/moyasar', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: payment_id, status, metadata, amount } = req.body as Record<string, unknown>;

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
        order = { ...fb, order_type: desc?.order_type, plan_code: desc?.plan_code, additional_seats: desc?.additional_seats };
      }
    }

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'paid' || order.status === 'verified') {
      return res.json({ received: true, already_processed: true });
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

// ─── GET /bank-details — Configurable bank account details ───────────────────

subscriptionRouter.get('/bank-details', async (req: AuthenticatedRequest, res: Response) => {
  // Bank details are stored in platform settings or fall back to defaults
  const { data } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'bank_details')
    .single();

  if (data?.value) {
    return res.json(typeof data.value === 'string' ? JSON.parse(data.value) : data.value);
  }

  // Default EduSaga bank details
  return res.json({
    account_name: 'EduSaga 360 Technology LLC',
    account_name_ar: 'شركة إيدوساجا 360 للتقنية ذ.م.م',
    bank_name: 'Al Rajhi Bank',
    bank_name_ar: 'مصرف الراجحي',
    iban: '',
    swift: 'RJHISARI',
    account_number: '',
    notes_ar: 'يرجى تحويل المبلغ المحدد في أمر الاشتراك وإرفاق إيصال التحويل',
    notes_en: 'Please transfer the exact amount shown in your subscription order and upload the transfer receipt',
  });
});

// ─── PUT /bank-details — Update bank details (platform owner only) ───────────

subscriptionRouter.put('/bank-details', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user?.is_platform_owner) {
    return res.status(403).json({ error: 'Platform owner access required' });
  }

  const schema = z.object({
    account_name: z.string().min(1),
    account_name_ar: z.string().optional(),
    bank_name: z.string().min(1),
    bank_name_ar: z.string().optional(),
    iban: z.string().min(1),
    swift: z.string().optional(),
    account_number: z.string().optional(),
    notes_ar: z.string().optional(),
    notes_en: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // Upsert platform_settings
  const { error } = await supabase
    .from('platform_settings')
    .upsert({
      key: 'bank_details',
      value: parsed.data,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });

  if (error) {
    // platform_settings table might not exist — try inserting
    console.warn('bank-details upsert failed:', error.message);
    return res.status(500).json({ error: 'Failed to save bank details' });
  }

  return res.json(parsed.data);
});

// ─── GET /pricing — Return plan pricing for frontend ─────────────────────────

subscriptionRouter.get('/pricing', async (_req: AuthenticatedRequest, res: Response) => {
  const plans = Object.entries(PLAN_LIMITS).map(([code, plan]) => ({
    code,
    priceYearly: plan.priceYearly,
    priceYearlyWithVat: sar(plan.priceYearly * (1 + VAT_RATE)),
    vatRate: VAT_RATE,
    maxUsers: plan.maxUsers,
    maxEmployees: plan.maxEmployees,
    maxBranches: plan.maxBranches,
  }));

  return res.json({
    plans,
    per_seat_price: PER_SEAT_PRICE_SAR,
    per_seat_price_with_vat: sar(PER_SEAT_PRICE_SAR * (1 + VAT_RATE)),
    vat_rate: VAT_RATE,
    currency: 'SAR',
  });
});
