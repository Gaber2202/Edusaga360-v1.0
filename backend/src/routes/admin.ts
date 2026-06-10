import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import crypto from 'crypto';
import https from 'https';
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.js';

async function sendInviteEmail(opts: {
  infobipKey: string;
  infobipBase: string;
  recipient_email: string;
  recipient_name: string;
  school_name?: string | null;
  inviteLink: string;
  message?: string | null;
}): Promise<void> {
  const { infobipKey, infobipBase, recipient_email, recipient_name, school_name, inviteLink, message } = opts;
  const schoolLine = school_name ? `<p>School: <strong>${school_name}</strong></p>` : '';
  const customMsg = message ? `<p style="color:#555">${message}</p>` : '';
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <h2 style="color:#059669">You're invited to EduSaga 360</h2>
      <p>Hi ${recipient_name},</p>
      ${customMsg}
      ${schoolLine}
      <p>Click the button below to set up your school's account and start your free trial:</p>
      <p style="text-align:center;margin:32px 0">
        <a href="${inviteLink}" style="background:#059669;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold">
          Accept Invitation
        </a>
      </p>
      <p style="font-size:12px;color:#999">This link expires in 7 days. If you did not expect this email, you can safely ignore it.</p>
    </div>`;

  const payload = JSON.stringify({
    messages: [{
      from: process.env.INFOBIP_SENDER_EMAIL || 'noreply@edusaga360.com',
      to: [{ to: recipient_email }],
      subject: `You're invited to try EduSaga 360`,
      htmlBody: html,
    }],
  });

  await new Promise<void>((resolve, reject) => {
    const url = new URL(`https://${infobipBase}/email/3/send`);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `App ${infobipKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`Infobip ${res.statusCode}: ${body}`));
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

export const adminRouter = Router();

// Router-level auth guard — ensures every current and future admin endpoint
// requires a valid token even if the caller omits it in index.ts.
adminRouter.use(authMiddleware);

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function isPlatformOwner(req: AuthenticatedRequest): boolean {
  return req.user?.is_platform_owner === true;
}

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

  // Fail-closed: error, missing row, or no matching flag → deny
  if (error || !data) { res.status(403).json({ message: 'Platform owner access required' }); return false; }

  const allowed =
    data.is_platform_owner === true ||
    ['edusaga_superadmin', 'edusaga_staff', 'creator'].includes(data.user_role ?? '');

  if (!allowed) { res.status(403).json({ message: 'Platform owner access required' }); return false; }
  return true;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

adminRouter.get('/stats', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const [tenantsRes, usersRes] = await Promise.all([
    supabase.from('tenants').select('id, status, plan, created_at'),
    supabase.from('users').select('id, is_active, created_date'),
  ]);
  // These tables may not exist yet if migrations haven't run — never crash stats
  const [invitesRes, requestsRes] = await Promise.allSettled([
    supabase.from('platform_invitations').select('id, status').eq('status', 'pending'),
    supabase.from('tenant_user_requests').select('id, status').eq('status', 'pending'),
  ]);
  const tenants = tenantsRes.data || [];
  const users = usersRes.data || [];
  const inviteCount = invitesRes.status === 'fulfilled' ? (invitesRes.value.data?.length ?? 0) : 0;
  const requestCount = requestsRes.status === 'fulfilled' ? (requestsRes.value.data?.length ?? 0) : 0;

  // Monthly growth (tenants created last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const newThisMonth = tenants.filter(t => t.created_at >= thirtyDaysAgo).length;

  return res.json({
    totalTenants: tenants.length,
    activeTenants: tenants.filter(t => t.status === 'active').length,
    trialTenants: tenants.filter(t => t.status === 'trial').length,
    suspendedTenants: tenants.filter(t => t.status === 'suspended').length,
    pendingTenants: tenants.filter(t => t.status === 'pending_approval').length,
    totalUsers: users.length,
    activeUsers: users.filter(u => u.is_active !== false).length,
    newTenantsThisMonth: newThisMonth,
    pendingInvitations: inviteCount,
    pendingUserRequests: requestCount,
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
  return res.json({ tenants: data || [] });
});

adminRouter.patch('/tenants/:id', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const { id } = req.params;
  const allowed = ['status', 'trial_end_date', 'max_users', 'max_students', 'max_employees', 'plan', 'plan_code', 'ai_enabled', 'notes'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }
  if (!Object.keys(updates).length) {
    return res.status(400).json({ message: 'No valid fields to update' });
  }
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('tenants').update(updates).eq('id', id).select().single();
  if (error) return res.status(500).json({ message: error.message });
  return res.json({ tenant: data });
});

adminRouter.delete('/tenants/:id', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const { id } = req.params;
  const { error } = await supabase.from('tenants').delete().eq('id', id);
  if (error) return res.status(500).json({ message: error.message });
  return res.json({ success: true });
});

// ─── Users per tenant ─────────────────────────────────────────────────────────

adminRouter.get('/tenants/:id/users', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const { id } = req.params;
  const { data, error } = await supabase
    .from('users')
    .select('id, email, first_name, last_name, user_role, is_active, created_date, phone, job_title')
    .eq('tenant_id', id)
    .order('created_date', { ascending: false });
  if (error) return res.status(500).json({ message: error.message });
  return res.json({ users: data || [] });
});

// ─── All users ────────────────────────────────────────────────────────────────

adminRouter.get('/users', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const { tenant_id } = req.query as Record<string, string>;
  let q = supabase
    .from('users')
    .select('id, email, first_name, last_name, user_role, is_active, tenant_id, created_date, phone, job_title')
    .order('created_date', { ascending: false })
    .limit(500);
  if (tenant_id) q = q.eq('tenant_id', tenant_id);
  const { data, error } = await q;
  if (error) return res.status(500).json({ message: error.message });
  return res.json({ users: data || [] });
});

adminRouter.patch('/users/:id', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const { id } = req.params;
  const schema = z.object({
    user_role: z.string().optional(),
    is_active: z.boolean().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    job_title: z.string().optional(),
    phone: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid fields', errors: parsed.error.flatten() });
  const updates = { ...parsed.data, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('users').update(updates).eq('id', id).select().single();
  if (error) return res.status(500).json({ message: error.message });
  return res.json({ user: data });
});

adminRouter.delete('/users/:id', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const { id } = req.params;
  // Deactivate rather than hard-delete to preserve audit trail
  const { data, error } = await supabase
    .from('users')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(500).json({ message: error.message });
  return res.json({ user: data });
});

// ─── Platform invitations ─────────────────────────────────────────────────────
// Invite a school/person to sign up for a trial — generates a unique link

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

  // Construct registration link (school clicks this to sign up)
  const frontendBase = process.env.FRONTEND_URL || 'https://edusaga-360-production.vercel.app';
  const inviteLink = `${frontendBase}/register?invite=${token}`;

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
  const { id } = req.params;
  const { data: inv, error } = await supabase
    .from('platform_invitations')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !inv) return res.status(404).json({ message: 'Invitation not found' });
  if (inv.status !== 'pending') return res.status(400).json({ message: 'Can only resend pending invitations' });

  const frontendBase = process.env.FRONTEND_URL || 'https://edusaga-360-production.vercel.app';
  const inviteLink = `${frontendBase}/register?invite=${inv.token}`;

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
  const { id } = req.params;
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
  const { id } = req.params;
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

// ─── Audit log ────────────────────────────────────────────────────────────────

adminRouter.get('/audit-log', async (req: AuthenticatedRequest, res) => {
  if (!await requirePlatformOwner(req, res)) return;
  const { tenant_id, limit: limitStr } = req.query as Record<string, string>;
  const limit = Math.min(200, parseInt(limitStr ?? '100', 10));
  let q = supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (tenant_id) q = q.eq('tenant_id', tenant_id);
  const { data, error } = await q;
  if (error) return res.status(500).json({ message: error.message });
  return res.json({ log: data || [] });
});
