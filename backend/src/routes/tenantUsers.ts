import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { z } from 'zod';
import crypto from 'crypto';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { isAssignableRoleCode } from '../lib/appRoles.js';

export const tenantUsersRouter = Router();


const TRIAL_USER_CAP = 3; // total users allowed per tenant during trial (incl. admin)

const RequestSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(254),
  requested_role: z.string().max(50).default('hr_officer'),
});

/** Count how many user "slots" a tenant has consumed: active users + pending requests. */
async function countConsumedSlots(tenantId: string): Promise<number> {
  const [usersRes, pendingRes] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase.from('tenant_user_requests').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'pending'),
  ]);
  return (usersRes.count ?? 0) + (pendingRes.count ?? 0);
}

// ── Tenant admin: request a new user ────────────────────────────────────────
tenantUsersRouter.post('/request', async (req: AuthenticatedRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
    // Only the tenant admin may request additional users.
    if (req.user!.role !== 'admin' && !req.user!.is_platform_owner) {
      return res.status(403).json({ error: 'Only the school admin can request new users' });
    }

    const parsed = RequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION', errors: parsed.error.flatten() });
    }
    const { name, email, requested_role } = parsed.data;
    if (!isAssignableRoleCode(requested_role)) {
      return res.status(400).json({ error: 'INVALID_ROLE', message: 'Requested role is not assignable' });
    }

    // Enforce the trial cap (active users + pending requests).
    const { data: tenant } = await supabase.from('tenants').select('max_users, status').eq('id', tenantId).single();
    const cap = tenant?.max_users ?? TRIAL_USER_CAP;
    const consumed = await countConsumedSlots(tenantId);
    if (consumed >= cap) {
      return res.status(409).json({
        error: 'LIMIT_REACHED',
        message: `Your plan allows up to ${cap} users. You currently have ${consumed}.`,
      });
    }

    const { data: created, error } = await supabase.from('tenant_user_requests').insert({
      tenant_id: tenantId,
      requested_by: req.user!.id,
      name,
      email,
      requested_role,
      status: 'pending',
    }).select().single();

    if (error) {
      if ((error as any).code === '23505') {
        return res.status(409).json({ error: 'DUPLICATE', message: 'A pending request already exists for this email' });
      }
      throw error;
    }

    res.status(201).json({ success: true, request: created });
  } catch (err) {
    console.error('tenant-users/request failed:', err);
    res.status(500).json({ error: 'Failed to submit user request' });
  }
});

// ── Tenant admin: list own tenant's requests ────────────────────────────────
tenantUsersRouter.get('/requests', async (req: AuthenticatedRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
    const { data, error } = await supabase.from('tenant_user_requests')
      .select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ requests: data ?? [] });
  } catch (err) {
    console.error('tenant-users/requests failed:', err);
    res.status(500).json({ error: 'Failed to load requests' });
  }
});

// ── Platform owner: list all pending requests across tenants ─────────────────
tenantUsersRouter.get('/pending', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user!.is_platform_owner) return res.status(403).json({ error: 'Forbidden' });
    const { data, error } = await supabase.from('tenant_user_requests')
      .select('*, tenants(name_en, name_ar, tenant_code)')
      .eq('status', 'pending').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ requests: data ?? [] });
  } catch (err) {
    console.error('tenant-users/pending failed:', err);
    res.status(500).json({ error: 'Failed to load pending requests' });
  }
});

// ── Platform owner: approve a request (creates the auth user) ────────────────
tenantUsersRouter.post('/requests/:id/approve', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user!.is_platform_owner) return res.status(403).json({ error: 'Forbidden' });
    const { id } = req.params;

    const { data: reqRow, error: fetchErr } = await supabase
      .from('tenant_user_requests').select('*').eq('id', id).single();
    if (fetchErr || !reqRow) return res.status(404).json({ error: 'Request not found' });
    if (reqRow.status !== 'pending') return res.status(400).json({ error: 'Request already reviewed' });

    // Re-check the cap at approval time.
    const { data: tenant } = await supabase.from('tenants').select('max_users').eq('id', reqRow.tenant_id).single();
    const cap = tenant?.max_users ?? TRIAL_USER_CAP;
    const { count: userCount } = await supabase.from('users')
      .select('id', { count: 'exact', head: true }).eq('tenant_id', reqRow.tenant_id);
    if ((userCount ?? 0) >= cap) {
      return res.status(409).json({ error: 'LIMIT_REACHED', message: `Tenant already has ${userCount} users (cap ${cap}).` });
    }

    // Create the auth user with a temporary password; they reset on first login.
    const tempPassword = crypto.randomBytes(12).toString('base64') + 'Aa1!';
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: reqRow.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: reqRow.name },
      app_metadata: {
        role: reqRow.requested_role,
        user_role: reqRow.requested_role,
        tenant_id: reqRow.tenant_id,
        is_platform_owner: false,
      },
    });
    if (authErr) {
      return res.status(409).json({ error: 'AUTH_CREATE_FAILED', message: authErr.message });
    }

    await supabase.from('users').insert({
      auth_id: authData.user.id,
      email: reqRow.email,
      name: reqRow.name || '',
      user_role: reqRow.requested_role,
      tenant_id: reqRow.tenant_id,
      status: 'active',
      is_trial_user: true,
      invited_by: req.user!.id,
    });

    // Keep the tenant's live seat counter in sync.
    {
      const { count } = await supabase.from('users')
        .select('id', { count: 'exact', head: true }).eq('tenant_id', reqRow.tenant_id);
      await supabase.from('tenants').update({ current_users: count ?? 0 }).eq('id', reqRow.tenant_id);
    }

    // Send a password-reset email so the new user can set their own password.
    await supabase.auth.resetPasswordForEmail(reqRow.email, {
      redirectTo: `${process.env.FRONTEND_URL || 'https://edusaga-360-production.vercel.app'}/reset-password`,
    }).catch((e) => console.error('reset email failed:', e));

    await supabase.from('tenant_user_requests').update({
      status: 'approved',
      reviewed_by: req.user!.id,
      reviewed_at: new Date().toISOString(),
      created_user_id: authData.user.id,
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    res.json({ success: true });
  } catch (err) {
    console.error('tenant-users approve failed:', err);
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

// ── Platform owner: reject a request ─────────────────────────────────────────
tenantUsersRouter.post('/requests/:id/reject', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user!.is_platform_owner) return res.status(403).json({ error: 'Forbidden' });
    const { id } = req.params;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 500) : null;

    const { data: reqRow } = await supabase.from('tenant_user_requests').select('status').eq('id', id).single();
    if (!reqRow) return res.status(404).json({ error: 'Request not found' });
    if (reqRow.status !== 'pending') return res.status(400).json({ error: 'Request already reviewed' });

    await supabase.from('tenant_user_requests').update({
      status: 'rejected',
      rejection_reason: reason,
      reviewed_by: req.user!.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    res.json({ success: true });
  } catch (err) {
    console.error('tenant-users reject failed:', err);
    res.status(500).json({ error: 'Failed to reject request' });
  }
});
