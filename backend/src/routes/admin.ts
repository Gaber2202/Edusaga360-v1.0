import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import crypto from 'crypto';
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.js';
import { getInfobipConfig, sendInviteEmail, sendPasswordResetEmail } from '../services/email.js';

export const adminRouter = Router();

// Router-level auth guard — ensures every current and future admin endpoint
// requires a valid token even if the caller omits it in index.ts.
adminRouter.use(authMiddleware);

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://edusaga-360-production.vercel.app';

// ─── Authorization ──────────────────────────────────────────────────────────

async function requirePlatformOwner(req: AuthenticatedRequest, res: any): Promise<boolean> {
  // Primary: JWT app_metadata claim (set by Supabase Auth admin)
  if (req.user?.is_platform_owner === true) return true;

  // Fallback: check users table directly via service role key.
  // Matches on auth_id (verified JWT sub — never on email or user_metadata).
  // Any DB error or missing row → DENY (fail-closed).
  if (!req.user?.id) { res.status(403).json({ message: 'Platform owner access required' }); return false; }

  const { data, error } = await supabase
    .from('users')
    .select('is_platform_owner, user_role')
    .eq('auth_id', req.user.id)
    .single();

  if (error || !data) { res.status(403).json({ message: 'Platform owner access required' }); return false; }

  const allowed =
    data.is_platform_owner === true ||
    ['edusaga_superadmin', 'edusaga_staff', 'creator'].includes(data.user_role ?? '');

  if (!allowed) { res.status(403).json({ message: 'Platform owner access required' }); return false; }
  return true;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface AuthInfo {
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
  banned_until?: string | null;
  created_at?: string;
}

/** Build a map of auth_user_id → auth metadata (last login, email confirmation, ban). */
async function getAuthMap(): Promise<Record<string, AuthInfo>> {
  const map: Record<string, AuthInfo> = {};
  const perPage = 1000;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users?.length) break;
    for (const u of data.users as any[]) {
      map[u.id] = {
        last_sign_in_at: u.last_sign_in_at ?? null,
        email_confirmed_at: u.email_confirmed_at ?? null,
        banned_until: u.banned_until ?? null,
        created_at: u.created_at,
      };
    }
    if (data.users.length < perPage) break;
  }
  return map;
}

/** Decorate a DB user row with derived, presentation-friendly fields. */
function mapUser(row: any, auth?: AuthInfo) {
  const status = row.status ?? 'active';
  const bannedUntil = auth?.banned_until ? new Date(auth.banned_until) : null;
  return {
    ...row,
    status,
    is_active: status === 'active',
    is_suspended: status === 'suspended',
    full_name: row.name || row.email,
    created_date: row.created_at, // back-compat alias for older clients
    last_sign_in_at: auth?.last_sign_in_at ?? null,
    email_confirmed: auth ? !!auth.email_confirmed_at : null,
    auth_banned: bannedUntil ? bannedUntil.getTime() > Date.now() : false,
  };
}

/** Best-effort audit trail — never throws, never blocks the request. */
async function writeAudit(
  req: AuthenticatedRequest,
  entry: { action: string; target_type?: string; target_id?: string | null; target_label?: string | null; tenant_id?: string | null; metadata?: Record<string, unknown> },
): Promise<void> {
  try {
    await supabase.from('platform_audit_log').insert({
      actor_id: req.user?.id ?? null,
      actor_email: req.user?.email ?? null,
      action: entry.action,
      target_type: entry.target_type ?? null,
      target_id: entry.target_id ?? null,
      target_label: entry.target_label ?? null,
      tenant_id: entry.tenant_id ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch (e) {
    console.error('[audit] failed to record', entry.action, e);
  }
}

/** Merge new app_metadata onto a user's auth record without clobbering existing claims. */
async function patchAuthMetadata(authId: string, patch: Record<string, unknown>): Promise<void> {
  const { data } = await supabase.auth.admin.getUserById(authId);
  const existing = (data?.user?.app_metadata as Record<string, unknown>) ?? {};
  await supabase.auth.admin.updateUserById(authId, { app_metadata: { ...existing, ...patch } });
}

/** Recompute and persist a tenant's live seat count. */
async function syncSeatCount(tenantId: string): Promise<number> {
  const { count } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  const seats = count ?? 0;
  await supabase.from('tenants').update({ current_users: seats }).eq('id', tenantId);
  return seats;
}

// ─── Stats ──────────────────────────────────────────────────────────────────

adminRouter.get('/stats', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const [tenantsRes, usersRes] = await Promise.all([
    supabase.from('tenants').select('id, status, plan, plan_code, monthly_revenue, trial_end_date, converted_at, created_at'),
    supabase.from('users').select('id, status, created_at'),
  ]);
  const [invitesRes, requestsRes] = await Promise.allSettled([
    supabase.from('platform_invitations').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('tenant_user_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  const tenants = tenantsRes.data || [];
  const users = usersRes.data || [];
  const inviteCount = invitesRes.status === 'fulfilled' ? (invitesRes.value.count ?? 0) : 0;
  const requestCount = requestsRes.status === 'fulfilled' ? (requestsRes.value.count ?? 0) : 0;

  const now = Date.now();
  const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString();
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const in7Days = new Date(now + 7 * 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const activeTenants = tenants.filter(t => t.status === 'active');
  const trials = tenants.filter(t => t.status === 'trial');

  const mrr = activeTenants.reduce((sum, t) => sum + (Number(t.monthly_revenue) || 0), 0);
  const trialsExpiringSoon = trials.filter(t => t.trial_end_date && t.trial_end_date >= today && t.trial_end_date <= in7Days).length;
  const trialsExpired = trials.filter(t => t.trial_end_date && t.trial_end_date < today).length;
  const conversionsThisMonth = tenants.filter(t => t.converted_at && t.converted_at >= startOfMonth).length;

  return res.json({
    totalTenants: tenants.length,
    activeTenants: activeTenants.length,
    trialTenants: trials.length,
    suspendedTenants: tenants.filter(t => t.status === 'suspended').length,
    pendingTenants: tenants.filter(t => t.status === 'pending_approval').length,
    totalUsers: users.length,
    activeUsers: users.filter(u => (u.status ?? 'active') === 'active').length,
    suspendedUsers: users.filter(u => u.status === 'suspended').length,
    newTenantsThisMonth: tenants.filter(t => t.created_at >= thirtyDaysAgo).length,
    newUsersThisMonth: users.filter(u => u.created_at >= thirtyDaysAgo).length,
    pendingInvitations: inviteCount,
    pendingUserRequests: requestCount,
    mrr,
    arr: mrr * 12,
    trialsExpiringSoon,
    trialsExpired,
    conversionsThisMonth,
  });
});

// ─── Tenants ──────────────────────────────────────────────────────────────────

adminRouter.get('/tenants', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ message: error.message });

  // Attach live seat counts (single grouped pass) so the UI never shows stale numbers.
  const { data: counts } = await supabase.from('users').select('tenant_id');
  const seatMap: Record<string, number> = {};
  for (const row of counts || []) {
    if (row.tenant_id) seatMap[row.tenant_id] = (seatMap[row.tenant_id] || 0) + 1;
  }
  const tenants = (data || []).map(t => ({ ...t, user_count: seatMap[t.id] || 0 }));
  return res.json({ tenants });
});

adminRouter.get('/tenants/:id', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const id = String(req.params.id);
  const { data: tenant, error } = await supabase.from('tenants').select('*').eq('id', id).single();
  if (error || !tenant) return res.status(404).json({ message: 'Tenant not found' });
  const authMap = await getAuthMap();
  const { data: users } = await supabase
    .from('users')
    .select('id, auth_id, email, name, user_role, status, phone, is_platform_owner, is_trial_user, created_at')
    .eq('tenant_id', id)
    .order('created_at', { ascending: false });
  return res.json({
    tenant: { ...tenant, user_count: users?.length ?? 0 },
    users: (users || []).map(u => mapUser(u, authMap[u.auth_id])),
  });
});

const TENANT_PATCH_FIELDS = [
  'status', 'trial_end_date', 'max_users', 'max_students', 'max_employees',
  'plan', 'plan_code', 'ai_enabled', 'notes', 'billing_email', 'billing_cycle',
  'monthly_revenue', 'plan_renews_at', 'name_en', 'name_ar', 'admin_email', 'city',
];

adminRouter.patch('/tenants/:id', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const id = String(req.params.id);
  const updates: Record<string, unknown> = {};
  for (const key of TENANT_PATCH_FIELDS) {
    if (key in req.body) updates[key] = req.body[key] === '' ? null : req.body[key];
  }
  if (!Object.keys(updates).length) {
    return res.status(400).json({ message: 'No valid fields to update' });
  }
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('tenants').update(updates).eq('id', id).select().single();
  if (error) return res.status(500).json({ message: error.message });
  await writeAudit(req, { action: 'tenant.update', target_type: 'tenant', target_id: id, target_label: data.name_en, tenant_id: id, metadata: { fields: Object.keys(updates) } });
  return res.json({ tenant: data });
});

// Convert a trial (or any) tenant into a paying customer.
adminRouter.post('/tenants/:id/convert', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const id = String(req.params.id);
  const schema = z.object({
    plan_code: z.string().min(1),
    billing_cycle: z.enum(['monthly', 'annual']).default('monthly'),
    monthly_revenue: z.coerce.number().nonnegative().default(0),
    max_users: z.coerce.number().int().positive().optional(),
    max_students: z.coerce.number().int().positive().optional(),
    billing_email: z.string().email().optional(),
    plan_renews_at: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  const { plan_code, billing_cycle, monthly_revenue, max_users, max_students, billing_email, plan_renews_at } = parsed.data;

  const now = new Date();
  const renews = plan_renews_at
    ? new Date(plan_renews_at)
    : new Date(now.getTime() + (billing_cycle === 'annual' ? 365 : 30) * 86400000);

  const updates: Record<string, unknown> = {
    status: 'active',
    plan: plan_code,
    plan_code,
    billing_cycle,
    monthly_revenue,
    plan_started_at: now.toISOString(),
    plan_renews_at: renews.toISOString(),
    converted_at: now.toISOString(),
    converted_from_trial: true,
    trial_end_date: null,
    updated_at: now.toISOString(),
  };
  if (max_users) updates.max_users = max_users;
  if (max_students) updates.max_students = max_students;
  if (billing_email) updates.billing_email = billing_email;

  const { data, error } = await supabase.from('tenants').update(updates).eq('id', id).select().single();
  if (error) return res.status(500).json({ message: error.message });
  await writeAudit(req, {
    action: 'tenant.convert_to_paid', target_type: 'tenant', target_id: id, target_label: data.name_en, tenant_id: id,
    metadata: { plan_code, billing_cycle, monthly_revenue },
  });
  return res.json({ tenant: data });
});

adminRouter.post('/tenants/:id/extend-trial', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const id = String(req.params.id);
  const days = Math.min(365, Math.max(1, parseInt(req.body?.days, 10) || 14));
  const { data: tenant } = await supabase.from('tenants').select('trial_end_date, name_en').eq('id', id).single();
  const base = tenant?.trial_end_date && new Date(tenant.trial_end_date) > new Date()
    ? new Date(tenant.trial_end_date)
    : new Date();
  const newEnd = new Date(base.getTime() + days * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabase.from('tenants')
    .update({ trial_end_date: newEnd, status: 'trial', updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) return res.status(500).json({ message: error.message });
  await writeAudit(req, { action: 'tenant.extend_trial', target_type: 'tenant', target_id: id, target_label: tenant?.name_en, tenant_id: id, metadata: { days, new_end: newEnd } });
  return res.json({ tenant: data });
});

adminRouter.post('/tenants/:id/suspend', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const id = String(req.params.id);
  const { data, error } = await supabase.from('tenants')
    .update({ status: 'suspended', updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) return res.status(500).json({ message: error.message });
  await writeAudit(req, { action: 'tenant.suspend', target_type: 'tenant', target_id: id, target_label: data.name_en, tenant_id: id });
  return res.json({ tenant: data });
});

adminRouter.post('/tenants/:id/reactivate', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const id = String(req.params.id);
  // Returning a previously-paying tenant to 'active'; trials should re-enter via extend-trial.
  const { data, error } = await supabase.from('tenants')
    .update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) return res.status(500).json({ message: error.message });
  await writeAudit(req, { action: 'tenant.reactivate', target_type: 'tenant', target_id: id, target_label: data.name_en, tenant_id: id });
  return res.json({ tenant: data });
});

adminRouter.delete('/tenants/:id', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const id = String(req.params.id);
  const { data: tenant } = await supabase.from('tenants').select('name_en').eq('id', id).single();
  const { error } = await supabase.from('tenants').delete().eq('id', id);
  if (error) return res.status(500).json({ message: error.message });
  await writeAudit(req, { action: 'tenant.delete', target_type: 'tenant', target_id: id, target_label: tenant?.name_en, tenant_id: id });
  return res.json({ success: true });
});

// ─── Users per tenant ─────────────────────────────────────────────────────────

adminRouter.get('/tenants/:id/users', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const id = String(req.params.id);
  const authMap = await getAuthMap();
  const { data, error } = await supabase
    .from('users')
    .select('id, auth_id, email, name, user_role, status, phone, is_platform_owner, is_trial_user, created_at')
    .eq('tenant_id', id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ message: error.message });
  return res.json({ users: (data || []).map(u => mapUser(u, authMap[u.auth_id])) });
});

// ─── All users (search / filter / paginate) ────────────────────────────────────

adminRouter.get('/users', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const { tenant_id, role, status, search } = req.query as Record<string, string>;
  const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
  const pageSize = Math.min(200, Math.max(1, parseInt((req.query.pageSize as string) ?? '50', 10)));

  let q = supabase
    .from('users')
    .select('id, auth_id, email, name, user_role, status, is_platform_owner, is_trial_user, tenant_id, phone, created_at', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (tenant_id) q = q.eq('tenant_id', tenant_id);
  if (role) q = q.eq('user_role', role);
  if (status) q = q.eq('status', status);
  if (search) {
    const safe = search.replace(/[%,()]/g, ' ').trim();
    if (safe) q = q.or(`email.ilike.%${safe}%,name.ilike.%${safe}%`);
  }
  q = q.range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await q;
  if (error) return res.status(500).json({ message: error.message });

  const authMap = await getAuthMap();
  return res.json({
    users: (data || []).map(u => mapUser(u, authMap[u.auth_id])),
    total: count ?? (data?.length ?? 0),
    page,
    pageSize,
  });
});

adminRouter.get('/users/:id', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const id = String(req.params.id);
  const { data: user, error } = await supabase.from('users').select('*').eq('id', id).single();
  if (error || !user) return res.status(404).json({ message: 'User not found' });
  let auth: AuthInfo | undefined;
  if (user.auth_id) {
    const { data } = await supabase.auth.admin.getUserById(user.auth_id);
    if (data?.user) {
      auth = {
        last_sign_in_at: (data.user as any).last_sign_in_at,
        email_confirmed_at: (data.user as any).email_confirmed_at,
        banned_until: (data.user as any).banned_until,
        created_at: data.user.created_at,
      };
    }
  }
  let tenant = null;
  if (user.tenant_id) {
    const { data } = await supabase.from('tenants').select('id, name_en, name_ar, status, plan_code, tenant_code').eq('id', user.tenant_id).single();
    tenant = data;
  }
  return res.json({ user: mapUser(user, auth), tenant });
});

// Create a user inside a tenant and send them an invite (password-setup) email.
adminRouter.post('/users', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const schema = z.object({
    tenant_id: z.string().uuid(),
    email: z.string().email(),
    name: z.string().min(1).max(200),
    user_role: z.string().min(1).max(50),
    phone: z.string().max(40).optional(),
    send_invite: z.boolean().optional().default(true),
    force: z.boolean().optional().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  const { tenant_id, email, name, user_role, phone, send_invite, force } = parsed.data;

  const { data: tenant } = await supabase.from('tenants').select('id, name_en, status, max_users').eq('id', tenant_id).single();
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

  // Enforce the seat cap unless the platform owner explicitly overrides it.
  const { count: seatCount } = await supabase.from('users').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant_id);
  const cap = tenant.max_users ?? 5;
  if (!force && (seatCount ?? 0) >= cap) {
    return res.status(409).json({ message: `Seat limit reached (${seatCount}/${cap}). Increase the plan's seats or override.`, code: 'LIMIT_REACHED' });
  }

  // Reuse an existing auth account if the email is already registered.
  const tempPassword = crypto.randomBytes(12).toString('base64') + 'Aa1!';
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: name },
    app_metadata: { role: user_role, user_role, tenant_id, is_platform_owner: false },
  });

  let authId = authData?.user?.id;
  if (authErr || !authId) {
    // Already-registered email → look it up and reuse rather than failing hard.
    const { data: existing } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = existing?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
    if (!found) return res.status(409).json({ message: authErr?.message || 'Could not create auth user' });
    authId = found.id;
  }

  const { data: created, error: insErr } = await supabase.from('users').insert({
    auth_id: authId,
    tenant_id,
    email,
    name,
    user_role,
    phone: phone ?? null,
    status: 'active',
    is_trial_user: tenant.status === 'trial',
    invited_by: req.user!.id,
  }).select().single();
  if (insErr) return res.status(500).json({ message: insErr.message });

  await syncSeatCount(tenant_id);

  let inviteSent = false;
  let actionLink: string | null = null;
  if (send_invite) {
    // Generate ONE recovery link (a single valid token) and email that exact
    // link via Infobip. We deliberately do not also call resetPasswordForEmail:
    // it would mint a competing token and invalidate the action_link returned
    // below — leaving both the email and the copyable link dead.
    const { data: linkData } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${FRONTEND_URL}/reset-password` },
    }).catch(() => ({ data: null } as any));
    actionLink = (linkData as any)?.properties?.action_link ?? null;
    const infobip = getInfobipConfig();
    if (actionLink && infobip) {
      await sendPasswordResetEmail({ ...infobip, recipient_email: email, recipient_name: name, actionLink, isInvite: true })
        .then(() => { inviteSent = true; })
        .catch((e) => console.error('invite email failed:', e));
    }
  }

  await writeAudit(req, { action: 'user.create', target_type: 'user', target_id: created.id, target_label: email, tenant_id, metadata: { user_role } });
  return res.status(201).json({ user: mapUser(created), invite_sent: inviteSent, action_link: actionLink });
});

adminRouter.patch('/users/:id', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const id = String(req.params.id);
  const schema = z.object({
    name: z.string().max(200).optional(),
    user_role: z.string().max(50).optional(),
    phone: z.string().max(40).optional(),
    status: z.enum(['active', 'inactive', 'suspended']).optional(),
    is_active: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid fields', errors: parsed.error.flatten() });

  const { data: before } = await supabase.from('users').select('auth_id, status, email, tenant_id').eq('id', id).single();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.user_role !== undefined) updates.user_role = parsed.data.user_role;
  if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.is_active !== undefined) updates.status = parsed.data.is_active ? 'active' : 'inactive';

  const { data, error } = await supabase.from('users').update(updates).eq('id', id).select().single();
  if (error) return res.status(500).json({ message: error.message });

  // Keep the auth claim in sync so RBAC reflects the new role immediately.
  if (parsed.data.user_role && before?.auth_id) {
    await patchAuthMetadata(before.auth_id, { role: parsed.data.user_role, user_role: parsed.data.user_role }).catch(() => {});
  }
  await writeAudit(req, { action: 'user.update', target_type: 'user', target_id: id, target_label: before?.email, tenant_id: before?.tenant_id, metadata: { fields: Object.keys(updates) } });
  return res.json({ user: mapUser(data) });
});

// Lifecycle: activate / deactivate / suspend. Deactivation also bans the auth login.
async function setUserStatus(req: AuthenticatedRequest, res: any, id: string, status: 'active' | 'inactive' | 'suspended') {
  const { data: before } = await supabase.from('users').select('auth_id, email, tenant_id, is_platform_owner').eq('id', id).single();
  if (!before) return res.status(404).json({ message: 'User not found' });
  if (before.is_platform_owner && status !== 'active') {
    return res.status(403).json({ message: 'Cannot deactivate a platform owner account' });
  }
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
    deactivated_at: status === 'active' ? null : new Date().toISOString(),
  };
  const { data, error } = await supabase.from('users').update(updates).eq('id', id).select().single();
  if (error) return res.status(500).json({ message: error.message });

  if (before.auth_id) {
    // ban_duration 'none' clears any ban; a long duration blocks login entirely.
    await supabase.auth.admin.updateUserById(before.auth_id, {
      ban_duration: status === 'active' ? 'none' : '876000h',
    }).catch((e) => console.error('auth ban toggle failed:', e));
  }
  await writeAudit(req, { action: `user.${status === 'active' ? 'activate' : status === 'suspended' ? 'suspend' : 'deactivate'}`, target_type: 'user', target_id: id, target_label: before.email, tenant_id: before.tenant_id });
  return res.json({ user: mapUser(data) });
}

adminRouter.post('/users/:id/activate', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  return setUserStatus(req, res, String(req.params.id), 'active');
});
adminRouter.post('/users/:id/deactivate', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  return setUserStatus(req, res, String(req.params.id), 'inactive');
});
adminRouter.post('/users/:id/suspend', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  return setUserStatus(req, res, String(req.params.id), 'suspended');
});

// Generate a single-use password-reset link, email it (when Infobip is
// configured), and always return that SAME link so the admin has a reliable
// copyable fallback to share manually. We must not also call
// resetPasswordForEmail — a second token would invalidate this one.
adminRouter.post('/users/:id/reset-password', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const id = String(req.params.id);
  const { data: user } = await supabase.from('users').select('email, name, tenant_id').eq('id', id).single();
  if (!user?.email) return res.status(404).json({ message: 'User not found' });

  const { data: linkData } = await supabase.auth.admin.generateLink({
    type: 'recovery', email: user.email, options: { redirectTo: `${FRONTEND_URL}/reset-password` },
  }).catch(() => ({ data: null } as any));
  const actionLink = (linkData as any)?.properties?.action_link ?? null;

  let emailSent = false;
  const infobip = getInfobipConfig();
  if (actionLink && infobip) {
    await sendPasswordResetEmail({ ...infobip, recipient_email: user.email, recipient_name: user.name, actionLink })
      .then(() => { emailSent = true; })
      .catch((e) => console.error('reset email send failed:', e));
  }

  await writeAudit(req, { action: 'user.reset_password', target_type: 'user', target_id: id, target_label: user.email, tenant_id: user.tenant_id });
  return res.json({ email_sent: emailSent, action_link: actionLink });
});

// Generate a one-time magic sign-in link (support / "log in as") — platform owner only.
adminRouter.post('/users/:id/magic-link', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const id = String(req.params.id);
  const { data: user } = await supabase.from('users').select('email, tenant_id').eq('id', id).single();
  if (!user?.email) return res.status(404).json({ message: 'User not found' });
  const { data: linkData, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink', email: user.email, options: { redirectTo: FRONTEND_URL },
  });
  if (error) return res.status(500).json({ message: error.message });
  await writeAudit(req, { action: 'user.magic_link', target_type: 'user', target_id: id, target_label: user.email, tenant_id: user.tenant_id });
  return res.json({ action_link: (linkData as any)?.properties?.action_link ?? null });
});

adminRouter.delete('/users/:id', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const id = String(req.params.id);
  const hard = req.query.hard === 'true';
  const { data: before } = await supabase.from('users').select('auth_id, email, tenant_id, is_platform_owner').eq('id', id).single();
  if (!before) return res.status(404).json({ message: 'User not found' });
  if (before.is_platform_owner) return res.status(403).json({ message: 'Cannot delete a platform owner account' });

  if (hard) {
    await supabase.from('users').delete().eq('id', id);
    if (before.auth_id) await supabase.auth.admin.deleteUser(before.auth_id).catch(() => {});
    if (before.tenant_id) await syncSeatCount(before.tenant_id);
    await writeAudit(req, { action: 'user.delete_hard', target_type: 'user', target_id: id, target_label: before.email, tenant_id: before.tenant_id });
    return res.json({ success: true, hard: true });
  }

  // Soft delete: deactivate + ban auth login, preserving the audit trail.
  const { data, error } = await supabase.from('users')
    .update({ status: 'inactive', deactivated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) return res.status(500).json({ message: error.message });
  if (before.auth_id) await supabase.auth.admin.updateUserById(before.auth_id, { ban_duration: '876000h' }).catch(() => {});
  await writeAudit(req, { action: 'user.deactivate', target_type: 'user', target_id: id, target_label: before.email, tenant_id: before.tenant_id });
  return res.json({ user: mapUser(data) });
});

// Bulk lifecycle / role actions across selected users.
adminRouter.post('/users/bulk', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const schema = z.object({
    ids: z.array(z.string().uuid()).min(1).max(500),
    action: z.enum(['activate', 'deactivate', 'suspend', 'delete', 'set_role']),
    user_role: z.string().max(50).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  const { ids, action, user_role } = parsed.data;

  // Never let a bulk action touch a platform-owner row.
  const { data: rows } = await supabase.from('users').select('id, auth_id, is_platform_owner, tenant_id').in('id', ids);
  const targets = (rows || []).filter(r => !r.is_platform_owner);
  const targetIds = targets.map(r => r.id);
  if (!targetIds.length) return res.json({ updated: 0 });

  if (action === 'set_role') {
    if (!user_role) return res.status(400).json({ message: 'user_role required for set_role' });
    await supabase.from('users').update({ user_role, updated_at: new Date().toISOString() }).in('id', targetIds);
    for (const r of targets) if (r.auth_id) await patchAuthMetadata(r.auth_id, { role: user_role, user_role }).catch(() => {});
  } else if (action === 'delete' || action === 'deactivate' || action === 'suspend') {
    const status = action === 'suspend' ? 'suspended' : 'inactive';
    await supabase.from('users').update({ status, deactivated_at: new Date().toISOString(), updated_at: new Date().toISOString() }).in('id', targetIds);
    for (const r of targets) if (r.auth_id) await supabase.auth.admin.updateUserById(r.auth_id, { ban_duration: '876000h' }).catch(() => {});
  } else if (action === 'activate') {
    await supabase.from('users').update({ status: 'active', deactivated_at: null, updated_at: new Date().toISOString() }).in('id', targetIds);
    for (const r of targets) if (r.auth_id) await supabase.auth.admin.updateUserById(r.auth_id, { ban_duration: 'none' }).catch(() => {});
  }

  const tenantIds = [...new Set(targets.map(r => r.tenant_id).filter(Boolean))] as string[];
  for (const tid of tenantIds) await syncSeatCount(tid);
  await writeAudit(req, { action: `user.bulk_${action}`, target_type: 'user', target_id: null, metadata: { count: targetIds.length, user_role } });
  return res.json({ updated: targetIds.length });
});

// ─── Platform invitations ─────────────────────────────────────────────────────

adminRouter.get('/invitations', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const { data, error } = await supabase
    .from('platform_invitations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ message: error.message });
  return res.json({ invitations: data || [] });
});

adminRouter.post('/invitations', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const schema = z.object({
    recipient_email: z.string().email(),
    recipient_name: z.string().min(1),
    school_name: z.string().optional(),
    message: z.string().optional(),
    plan_code: z.string().optional().default('free_trial'),
    expires_days: z.number().int().positive().optional().default(7),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });

  const { recipient_email, recipient_name, school_name, message, plan_code, expires_days } = parsed.data;
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expires_days * 86400000).toISOString();

  const { data, error } = await supabase
    .from('platform_invitations')
    .insert({
      recipient_email,
      recipient_name,
      school_name: school_name ?? null,
      message: message ?? null,
      plan_code,
      token,
      expires_at: expiresAt,
      status: 'pending',
      invited_by: req.user!.id,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ message: error.message });

  const inviteLink = `${FRONTEND_URL}/register?invite=${token}`;

  let emailSent = false;
  const infobipKey = process.env.INFOBIP_API_KEY;
  const infobipBase = process.env.INFOBIP_BASE_URL;
  if (infobipKey && infobipBase) {
    try {
      await sendInviteEmail({ infobipKey, infobipBase, recipient_email, recipient_name, school_name, inviteLink, message });
      emailSent = true;
    } catch (emailErr) {
      console.error('Infobip send failed:', emailErr);
    }
  }

  await writeAudit(req, { action: 'invitation.create', target_type: 'invitation', target_id: data.id, target_label: recipient_email, metadata: { plan_code } });
  return res.status(201).json({
    invitation: data,
    invite_link: inviteLink,
    email_sent: emailSent,
    note: emailSent
      ? 'Invitation created and email sent via Infobip.'
      : 'Invitation created. Configure INFOBIP_API_KEY and INFOBIP_BASE_URL in Railway to auto-send emails.',
  });
});

adminRouter.post('/invitations/:id/resend', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const id = String(req.params.id);
  const { data: inv, error } = await supabase
    .from('platform_invitations')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !inv) return res.status(404).json({ message: 'Invitation not found' });
  if (inv.status !== 'pending') return res.status(400).json({ message: 'Can only resend pending invitations' });

  const inviteLink = `${FRONTEND_URL}/register?invite=${inv.token}`;

  let emailSent = false;
  const infobipKey = process.env.INFOBIP_API_KEY;
  const infobipBase = process.env.INFOBIP_BASE_URL;
  if (infobipKey && infobipBase) {
    try {
      await sendInviteEmail({
        infobipKey, infobipBase,
        recipient_email: inv.recipient_email,
        recipient_name: inv.recipient_name,
        school_name: inv.school_name,
        inviteLink,
        message: inv.message,
      });
      emailSent = true;
    } catch (emailErr) {
      console.error('Infobip resend failed:', emailErr);
    }
  }

  return res.json({ email_sent: emailSent, invite_link: inviteLink });
});

adminRouter.patch('/invitations/:id', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const id = String(req.params.id);
  const schema = z.object({
    status: z.enum(['pending', 'accepted', 'expired', 'revoked']),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid status' });
  const { data, error } = await supabase
    .from('platform_invitations')
    .update({ status: parsed.data.status })
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(500).json({ message: error.message });
  return res.json({ invitation: data });
});

adminRouter.delete('/invitations/:id', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const id = String(req.params.id);
  const { error } = await supabase.from('platform_invitations').delete().eq('id', id);
  if (error) return res.status(500).json({ message: error.message });
  return res.json({ success: true });
});

// ─── User requests (platform owner approves/rejects trial user invites) ───────

adminRouter.get('/user-requests', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const { status } = req.query as Record<string, string>;
  let q = supabase
    .from('tenant_user_requests')
    .select('*, tenants(name_en, name_ar, tenant_code)')
    .order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return res.status(500).json({ message: error.message });
  return res.json({ requests: data || [] });
});

// ─── Audit log (platform-owner actions) ────────────────────────────────────────

adminRouter.get('/audit-log', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const { tenant_id, action, target_type, search } = req.query as Record<string, string>;
  const limit = Math.min(500, parseInt((req.query.limit as string) ?? '200', 10));
  let q = supabase
    .from('platform_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (tenant_id) q = q.eq('tenant_id', tenant_id);
  if (action) q = q.eq('action', action);
  if (target_type) q = q.eq('target_type', target_type);
  if (search) {
    const safe = search.replace(/[%,()]/g, ' ').trim();
    if (safe) q = q.or(`actor_email.ilike.%${safe}%,target_label.ilike.%${safe}%,action.ilike.%${safe}%`);
  }
  const { data, error } = await q;
  if (error) return res.status(500).json({ message: error.message });
  return res.json({ log: data || [] });
});
