import { Router, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { AuthenticatedRequest, requireRole, FINANCE_ROLES, STAFF_ROLES } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { createInternalOrAuthMiddleware } from '../middleware/internalAuth.js';
import { authMiddleware } from '../middleware/auth.js';
import { SegmentationRunner } from '../services/collections/runner.js';
import { CollectionMessenger } from '../services/collections/messenger.js';

export const collectionsRouter = Router();

const internalOrAuth = createInternalOrAuthMiddleware(authMiddleware);

const RunSegmentationSchema = z.object({
  tenant_id: z.string().uuid().optional(),
});

const callbackUrl = `${process.env.FRONTEND_URL ?? 'https://parentportal.edusaga360.com'}/payment/complete`;

// ─── POST /api/collections/run-segmentation ───────────────────────────────────
// Triggered by finance officers manually or by an internal scheduler.
// Requires either an internal service token or a finance role.
collectionsRouter.post(
  '/run-segmentation',
  internalOrAuth,
  tenantMiddleware,
  requireRole([...FINANCE_ROLES, 'system']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tenantId = req.user!.tenant_id!;
      const runner = new SegmentationRunner(supabase);
      const result = await runner.runForTenant(tenantId);
      return res.json({ ok: true, result });
    } catch (err) {
      console.error('[collections/run-segmentation] error:', err);
      return res.status(500).json({ error: 'segmentation_failed', message: (err as Error).message });
    }
  },
);

// ─── POST /api/collections/enqueue-reminders ─────────────────────────────────
// Queues the next reminder for every overdue profile in the tenant.
collectionsRouter.post(
  '/enqueue-reminders',
  internalOrAuth,
  tenantMiddleware,
  requireRole([...FINANCE_ROLES, 'system']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tenantId = req.user!.tenant_id!;
      const messenger = new CollectionMessenger(supabase, callbackUrl);
      const result = await messenger.enqueueRemindersForTenant(tenantId);
      return res.json({ ok: true, result });
    } catch (err) {
      console.error('[collections/enqueue-reminders] error:', err);
      return res.status(500).json({ error: 'enqueue_failed', message: (err as Error).message });
    }
  },
);

// ─── POST /api/collections/send-pending ───────────────────────────────────────
// Immediately dispatches pending messages whose scheduled_at has passed and that
// are inside the tenant send window.
collectionsRouter.post(
  '/send-pending',
  internalOrAuth,
  tenantMiddleware,
  requireRole([...FINANCE_ROLES, 'system']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const messenger = new CollectionMessenger(supabase, callbackUrl);
      const result = await messenger.sendPendingMessages(Number(req.query.limit ?? 100));
      return res.json({ ok: true, result });
    } catch (err) {
      console.error('[collections/send-pending] error:', err);
      return res.status(500).json({ error: 'send_failed', message: (err as Error).message });
    }
  },
);

// ─── GET /api/collections/profiles ────────────────────────────────────────────
collectionsRouter.get('/profiles', authMiddleware, tenantMiddleware, requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id!;
    const { segment, page = '1', limit = '50' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, Number(page));
    const pageSize = Math.min(100, Math.max(1, Number(limit)));
    const offset = (pageNum - 1) * pageSize;

    let q = supabase
      .from('collection_profiles')
      .select('*, guardians(name_en, name_ar, phone, email)')
      .eq('tenant_id', tenantId)
      .order('outstanding_balance', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (segment) q = q.eq('current_segment', segment);

    const { data, error, count } = await q;
    if (error) throw error;
    return res.json({ data, page: pageNum, page_size: pageSize, count });
  } catch (err) {
    console.error('[collections/profiles] error:', err);
    return res.status(500).json({ error: 'profiles_failed', message: (err as Error).message });
  }
});

// ─── GET /api/collections/profiles/:id/timeline ───────────────────────────────
collectionsRouter.get('/profiles/:id/timeline', authMiddleware, tenantMiddleware, requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id!;
    const profileId = req.params.id;

    const { data: profile, error: profileErr } = await supabase
      .from('collection_profiles')
      .select('*, guardians(name_en, name_ar, phone, email), students(name_en, name_ar)')
      .eq('id', profileId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (profileErr) throw profileErr;
    if (!profile) return res.status(404).json({ error: 'not_found' });

    const [{ data: messages }, { data: segments }, { data: ledger }, { data: approvals }, { data: offers }] = await Promise.all([
      supabase.from('collection_messages').select('*').eq('profile_id', profileId).order('created_at', { ascending: false }),
      supabase.from('collection_segments').select('*').eq('profile_id', profileId).order('created_at', { ascending: false }),
      supabase.from('agent_actions_ledger').select('*').eq('reference_id', profileId).order('created_at', { ascending: false }),
      supabase.from('agent_approval_queue').select('*').eq('reference_id', profileId).order('created_at', { ascending: false }),
      supabase.from('installment_plan_offers').select('*').eq('profile_id', profileId).order('created_at', { ascending: false }),
    ]);

    return res.json({
      profile,
      timeline: [
        ...(messages ?? []).map((m) => ({ type: 'message', ...m })),
        ...(segments ?? []).map((s) => ({ type: 'segment', ...s })),
        ...(ledger ?? []).map((l) => ({ type: 'ledger', ...l })),
        ...(approvals ?? []).map((a) => ({ type: 'approval', ...a })),
        ...(offers ?? []).map((o) => ({ type: 'offer', ...o })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    });
  } catch (err) {
    console.error('[collections/timeline] error:', err);
    return res.status(500).json({ error: 'timeline_failed', message: (err as Error).message });
  }
});

// ─── GET /api/collections/settings ─────────────────────────────────────────────
collectionsRouter.get('/settings', authMiddleware, tenantMiddleware, requireRole(STAFF_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id!;
    const { data, error } = await supabase.from('collection_settings').select('*').eq('tenant_id', tenantId).maybeSingle();
    if (error) throw error;
    return res.json({ data });
  } catch (err) {
    console.error('[collections/settings] error:', err);
    return res.status(500).json({ error: 'settings_failed', message: (err as Error).message });
  }
});

const UpdateSettingsSchema = z.object({
  is_enabled: z.boolean().optional(),
  send_window_start: z.string().optional(),
  send_window_end: z.string().optional(),
  min_down_payment_pct: z.number().min(0).max(100).optional(),
  max_installments: z.number().int().min(1).optional(),
  segment_rules: z.record(z.unknown()).optional(),
  escalation_config: z.record(z.unknown()).optional(),
  kill_switch_activated_at: z.string().datetime().nullable().optional(),
}).strict();

// ─── PUT /api/collections/settings ───────────────────────────────────────────
collectionsRouter.put('/settings', authMiddleware, tenantMiddleware, requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id!;
    const parsed = UpdateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
    }

    const payload: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() };
    const { data, error } = await supabase
      .from('collection_settings')
      .upsert({ tenant_id: tenantId, ...payload }, { onConflict: 'tenant_id' })
      .select()
      .single();
    if (error) throw error;
    return res.json({ data });
  } catch (err) {
    console.error('[collections/settings] error:', err);
    return res.status(500).json({ error: 'settings_failed', message: (err as Error).message });
  }
});

// ─── POST /api/collections/kill-switch ────────────────────────────────────────
// Instantly pause/resume the agent for this tenant.
collectionsRouter.post('/kill-switch', authMiddleware, tenantMiddleware, requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id!;
    const schema = z.object({ active: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });

    const killSwitch = parsed.data.active ? null : new Date().toISOString();
    const { data, error } = await supabase
      .from('collection_settings')
      .upsert({ tenant_id: tenantId, kill_switch_activated_at: killSwitch, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' })
      .select()
      .single();
    if (error) throw error;
    return res.json({ ok: true, data });
  } catch (err) {
    console.error('[collections/kill-switch] error:', err);
    return res.status(500).json({ error: 'kill_switch_failed', message: (err as Error).message });
  }
});

// ─── GET /api/collections/approval-queue ──────────────────────────────────────
collectionsRouter.get('/approval-queue', authMiddleware, tenantMiddleware, requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id!;
    const { status } = req.query as Record<string, string>;
    let q = supabase.from('agent_approval_queue').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return res.json({ data });
  } catch (err) {
    console.error('[collections/approval-queue] error:', err);
    return res.status(500).json({ error: 'approval_queue_failed', message: (err as Error).message });
  }
});

// ─── POST /api/collections/approval-queue/:id/resolve ─────────────────────────
const ResolveQueueSchema = z.object({
  action: z.enum(['approve', 'reject', 'edit']),
  notes: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
});

collectionsRouter.post('/approval-queue/:id/resolve', authMiddleware, tenantMiddleware, requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id!;
    const queueId = req.params.id;
    const parsed = ResolveQueueSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });

    const { action, notes, payload } = parsed.data;
    const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'edited';

    const { data: existing } = await supabase
      .from('agent_approval_queue')
      .select('*')
      .eq('id', queueId)
      .eq('tenant_id', tenantId)
      .single();
    if (!existing) return res.status(404).json({ error: 'not_found' });

    const update: Record<string, unknown> = {
      status,
      resolution_notes: notes,
      finance_officer_id: req.user!.id,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (payload) update.payload = { ...(existing.payload as Record<string, unknown>), ...payload };

    const { data, error } = await supabase
      .from('agent_approval_queue')
      .update(update)
      .eq('id', queueId)
      .eq('tenant_id', tenantId)
      .select()
      .single();
    if (error) throw error;

    await supabase.from('agent_actions_ledger').insert({
      tenant_id: tenantId,
      action_type: 'approval',
      actor: 'user',
      reference_table: 'agent_approval_queue',
      reference_id: queueId,
      input_snapshot: { queue_id: queueId, action },
      decision: status,
      outcome: { notes, payload },
    });

    return res.json({ data });
  } catch (err) {
    console.error('[collections/approval-queue/resolve] error:', err);
    return res.status(500).json({ error: 'resolve_failed', message: (err as Error).message });
  }
});
