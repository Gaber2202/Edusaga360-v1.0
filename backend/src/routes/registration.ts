import { Router, Request } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import crypto from 'crypto';
import { sendEmail } from '../services/email.js';

export const registrationRouter = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ADMIN_EMAIL = 'info@edusaga360.com';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://edusaga-360-production.vercel.app';
const API_BASE_URL = process.env.API_BASE_URL || 'https://edusaga-360-production.up.railway.app';
// Onboarding setup links live for 7 days. 48h proved too short — approvals often
// land a day or two after registration, and schools rarely finish setup the same
// hour, so every pending school was hitting an expired link.
const ONBOARDING_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const newOnboardingToken = () => crypto.randomBytes(32).toString('hex');
const onboardingTokenExpiry = () => new Date(Date.now() + ONBOARDING_TOKEN_TTL_MS).toISOString();
// Secret used to sign approve/deny links so they can't be forged.
// Set ADMIN_LINK_SECRET in Railway env vars to a long random string.
const ADMIN_LINK_SECRET = process.env.ADMIN_LINK_SECRET || 'change-me-in-production';

/** Sign a registration action URL so it can't be guessed or forged. */
function signAdminAction(action: string, id: string): string {
  const sig = crypto.createHmac('sha256', ADMIN_LINK_SECRET).update(`${action}:${id}`).digest('hex').slice(0, 32);
  return `${API_BASE_URL}/api/registration/${action}/${id}?sig=${sig}`;
}

/** Verify the HMAC signature on an admin action request. */
function verifyAdminSig(action: string, id: string, sig: string | undefined): boolean {
  if (!sig) return false;
  const expected = crypto.createHmac('sha256', ADMIN_LINK_SECRET).update(`${action}:${id}`).digest('hex').slice(0, 32);
  // Constant-time comparison to prevent timing attacks
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); } catch { return false; }
}

/**
 * Authorize an admin registration action (approve / deny / resend). Accepts EITHER:
 *  - a valid HMAC signature — used by the approve/deny links in the admin email, OR
 *  - an authenticated platform owner / creator session — used by the super-admin
 *    dashboard, which sends the Supabase access token as a Bearer header.
 * The signing secret is never exposed to the browser, so the dashboard buttons
 * (Approve / Deny / Resend) rely on this authenticated path.
 */
async function authorizeAdminAction(req: Request, action: string, id: string): Promise<boolean> {
  if (verifyAdminSig(action, id, req.query.sig as string | undefined)) return true;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7));
      if (!error && user) {
        const meta = user.app_metadata || {};
        if (meta.is_platform_owner === true || meta.role === 'creator') return true;
      }
    } catch { /* fall through to deny */ }
  }
  return false;
}

const RegistrationRequestSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  school_name: z.string().min(1).max(200).optional(),
  school_name_en: z.string().min(1).max(200).optional(),
  school_name_ar: z.string().max(200).optional(),
  contact_name: z.string().min(1).max(200).optional(),
  contact_email: z.string().email().max(254).optional(),
  email: z.string().email().max(254).optional(),
  contact_phone: z.string().max(30).optional(),
  phone: z.string().max(30).optional(),
  school_type: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(10).default('SA'),
  estimated_students: z.string().max(50).optional(),
  student_count_range: z.string().max(50).optional(),
  how_heard: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});

registrationRouter.post('/request', async (req: Request, res) => {
  try {
    const parsed = RegistrationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION',
        message: 'Validation failed',
        errors: parsed.error.flatten(),
      });
    }

    const d = parsed.data;
    const email = d.contact_email || d.email || '';
    const name = d.contact_name || d.full_name || '';
    const schoolName = d.school_name_en || d.school_name || '';

    if (!email) {
      return res.status(400).json({ success: false, error: 'VALIDATION', message: 'Email is required' });
    }

    const { data: existing } = await supabase
      .from('registration_requests')
      .select('id, status')
      .eq('contact_email', email)
      .in('status', ['pending', 'approved'])
      .single();

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'DUPLICATE',
        message: 'A registration request already exists for this email',
        existing_status: existing.status,
      });
    }

    const onboardingToken = newOnboardingToken();
    const tokenExpiresAt = onboardingTokenExpiry();

    const { data: request, error } = await supabase
      .from('registration_requests')
      .insert({
        contact_name: name,
        contact_email: email,
        contact_phone: d.contact_phone || d.phone || '',
        school_name_en: schoolName,
        school_name_ar: d.school_name_ar || '',
        school_type: d.school_type || '',
        city: d.city || '',
        country: d.country || 'SA',
        student_count_range: d.student_count_range || d.estimated_students || '',
        notes: d.how_heard ? `How heard: ${d.how_heard}` : (d.notes || ''),
        status: 'pending',
        onboarding_token: onboardingToken,
        token_expires_at: tokenExpiresAt,
      })
      .select()
      .single();

    if (error) throw error;

    // Send notification to admin (fire and forget)
    sendAdminNotification(request).catch(err => console.error('Failed to send admin notification:', err));

    res.status(201).json({
      success: true,
      message: 'Registration request submitted successfully',
      request_id: request.id,
    });
  } catch (err) {
    console.error('Failed to submit registration:', err);
    const detail = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: `Failed to submit registration request: ${detail}` });
  }
});

// Approval endpoint (called from email link — HMAC-signed)
registrationRouter.get('/approve/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await authorizeAdminAction(req, 'approve', id))) {
      return res.status(403).send(renderResultPage('Forbidden', 'Invalid or missing signature. This link may have been tampered with.', false));
    }
    const { data: request, error: fetchError } = await supabase
      .from('registration_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !request) {
      return res.status(404).send(renderResultPage('Request Not Found', 'This registration request was not found.', false));
    }

    if (request.status === 'approved') {
      return res.send(renderResultPage('Already Approved', `${request.school_name_en || request.contact_name} has already been approved.`, true));
    }

    // Mint a fresh onboarding token + expiry at approval time. The original
    // token's clock started at registration, so a delayed approval would email
    // an already-expired link (the cause of "invalid/expired" on the welcome
    // link). Resetting it here guarantees the school gets the full window.
    const freshToken = newOnboardingToken();
    const freshExpiry = onboardingTokenExpiry();

    const { error: updateError } = await supabase
      .from('registration_requests')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        onboarding_token: freshToken,
        token_expires_at: freshExpiry,
      })
      .eq('id', id);

    if (updateError) throw updateError;
    request.onboarding_token = freshToken;
    request.token_expires_at = freshExpiry;

    // Create tenant with trial status
    const tenantCode = `T-${Date.now().toString(36).toUpperCase()}`;
    const { data: tenant } = await supabase
      .from('tenants')
      .insert({
        name_en: request.school_name_en || request.contact_name,
        name_ar: request.school_name_ar || '',
        tenant_code: tenantCode,
        status: 'trial',
        plan: 'trial',
        plan_code: 'free_trial',
        admin_email: request.contact_email,
        city: request.city,
        school_type: request.school_type,
        trial_end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        created_date: new Date().toISOString(),
      })
      .select()
      .single();

    // Link request to tenant
    if (tenant) {
      await supabase.from('registration_requests').update({ tenant_id: tenant.id }).eq('id', id);
    }

    // Send welcome email to applicant (fire and forget)
    sendWelcomeEmail(request).catch(err => console.error('Failed to send welcome email:', err));

    res.send(renderResultPage(
      'Approved!',
      `${request.school_name_en || request.contact_name} has been approved. A welcome email has been sent to ${request.contact_email}.`,
      true
    ));
  } catch (err) {
    console.error('Approval error:', err);
    res.status(500).send(renderResultPage('Error', 'An error occurred during approval. Please try again.', false));
  }
});

// Denial endpoint (called from email link — HMAC-signed)
registrationRouter.get('/deny/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await authorizeAdminAction(req, 'deny', id))) {
      return res.status(403).send(renderResultPage('Forbidden', 'Invalid or missing signature. This link may have been tampered with.', false));
    }
    const { data: request, error: fetchError } = await supabase
      .from('registration_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !request) {
      return res.status(404).send(renderResultPage('Request Not Found', 'This registration request was not found.', false));
    }

    if (request.status === 'denied') {
      return res.send(renderResultPage('Already Denied', `${request.school_name_en || request.contact_name} has already been denied.`, true));
    }

    const { error: updateError } = await supabase
      .from('registration_requests')
      .update({
        status: 'denied',
        denied_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // Send denial email (fire and forget)
    sendDenialEmail(request).catch(err => console.error('Failed to send denial email:', err));

    res.send(renderResultPage(
      'Denied',
      `${request.school_name_en || request.contact_name} has been denied. A notification has been sent to ${request.contact_email}.`,
      true
    ));
  } catch (err) {
    console.error('Denial error:', err);
    res.status(500).send(renderResultPage('Error', 'An error occurred during denial. Please try again.', false));
  }
});

// Resend onboarding link endpoint (called from admin UI — requires valid HMAC sig)
registrationRouter.get('/resend/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await authorizeAdminAction(req, 'resend', id))) {
      return res.status(403).send(renderResultPage('Forbidden', 'Invalid or missing signature.', false));
    }
    const { data: request, error: fetchError } = await supabase
      .from('registration_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !request) {
      return res.status(404).send(renderResultPage('Request Not Found', 'This registration request was not found.', false));
    }

    if (request.status !== 'approved') {
      return res.status(400).send(renderResultPage('Not Approved', 'This request must be approved before resending the setup link.', false));
    }

    if (request.status === 'completed') {
      return res.send(renderResultPage('Already Completed', 'This school has already completed onboarding.', true));
    }

    // Generate a fresh token with a new expiry
    const newToken = newOnboardingToken();
    const tokenExpiresAt = onboardingTokenExpiry();

    const { error: updateError } = await supabase
      .from('registration_requests')
      .update({ onboarding_token: newToken, token_expires_at: tokenExpiresAt })
      .eq('id', id);

    if (updateError) throw updateError;

    // Reload with fresh token and resend welcome email
    const updatedRequest = { ...request, onboarding_token: newToken };
    sendWelcomeEmail(updatedRequest).catch(err => console.error('Failed to resend welcome email:', err));

    res.send(renderResultPage(
      'Link Resent',
      `A new onboarding link has been sent to ${request.contact_email}. It is valid for 7 days.`,
      true
    ));
  } catch (err) {
    console.error('Resend error:', err);
    res.status(500).send(renderResultPage('Error', 'An error occurred while resending the link. Please try again.', false));
  }
});

// Onboarding token validation
registrationRouter.get('/onboarding/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { data: request, error } = await supabase
      .from('registration_requests')
      .select('*')
      .eq('onboarding_token', token)
      .single();

    if (error || !request) {
      return res.status(404).json({ success: false, error: 'Invalid onboarding token' });
    }

    // The account was already set up with this link. Tell the client explicitly
    // so it can send them to sign in instead of showing a scary "invalid link".
    if (request.status === 'completed') {
      return res.status(409).json({ success: false, error: 'ALREADY_COMPLETED', message: 'This school account has already been set up. Please sign in.' });
    }

    if (request.status !== 'approved') {
      return res.status(400).json({ success: false, error: 'Request is not approved' });
    }

    const tokenExpired = request.token_expires_at && new Date(request.token_expires_at) < new Date();
    if (tokenExpired) {
      return res.status(410).json({ success: false, error: 'TOKEN_EXPIRED', message: 'Onboarding link has expired' });
    }

    res.json({
      success: true,
      request: {
        id: request.id,
        school_name: request.school_name_en,
        contact_name: request.contact_name,
        contact_email: request.contact_email,
        tenant_id: request.tenant_id,
      },
    });
  } catch (err) {
    console.error('Onboarding token error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Self-service link renewal. A user who lands on an expired setup link can get a
// working one without contacting support. Keyed on the token they already hold
// (proof they were the intended recipient): we renew that SAME token's expiry —
// so the link in their browser AND inbox works again, and repeat clicks are
// idempotent — then re-deliver it by email. Responds generically to avoid
// leaking token validity. Throttled by the router-level registrationLimiter.
registrationRouter.post('/onboarding/:token/resend', async (req, res) => {
  const generic = { success: true, message: 'If this setup link is recognized, it has been renewed and re-sent to the school’s contact email.' };
  try {
    const { token } = req.params;
    const { data: request } = await supabase
      .from('registration_requests')
      .select('*')
      .eq('onboarding_token', token)
      .single();

    // Only renew an approved, not-yet-completed request.
    if (request && request.status === 'approved') {
      const { error: updateError } = await supabase
        .from('registration_requests')
        .update({ token_expires_at: onboardingTokenExpiry() })
        .eq('id', request.id)
        .eq('status', 'approved');
      if (!updateError) {
        sendWelcomeEmail(request).catch(err => console.error('Failed to resend onboarding email:', err));
      }
    }

    return res.json(generic);
  } catch (err) {
    console.error('Onboarding self-resend error:', err);
    return res.json(generic);
  }
});

const OnboardingCompleteSchema = z.object({
  password: z.string()
    .min(10, 'Password must be at least 10 characters')
    .max(128, 'Password too long')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[a-z]/, 'Must contain a lowercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
  // All remaining fields are genuinely optional — accept empty/missing gracefully
  school_logo: z.string().max(500).optional().transform(v => (v && v.trim()) || undefined),
  academic_year_start: z.string().max(20).optional().transform(v => v || undefined),
  num_grades: z.union([
    z.number().int().min(1).max(30),
    z.string().regex(/^\d+$/).transform(Number),
    z.literal('').transform(() => undefined),
  ]).optional(),
  default_language: z.enum(['ar', 'en']).default('ar'),
});

// Onboarding completion
registrationRouter.post('/onboarding/:token/complete', async (req, res) => {
  try {
    const { token } = req.params;

    const parsed = OnboardingCompleteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'VALIDATION', errors: parsed.error.flatten() });
    }
    const { password, school_logo, academic_year_start, num_grades, default_language } = parsed.data;

    const { data: request, error: fetchErr } = await supabase
      .from('registration_requests')
      .select('*')
      .eq('onboarding_token', token)
      .single();

    if (fetchErr || !request) {
      return res.status(404).json({ success: false, error: 'Invalid token' });
    }

    // Idempotent: if setup already finished, report success so a double submit
    // (or a retried request) signs the admin in instead of erroring.
    if (request.status === 'completed') {
      return res.json({ success: true, alreadyCompleted: true });
    }

    if (request.status !== 'approved') {
      return res.status(400).json({ success: false, error: 'Request is not approved' });
    }

    // Enforce token expiry on completion (not just on the GET validation step)
    if (request.token_expires_at && new Date(request.token_expires_at) < new Date()) {
      return res.status(410).json({ success: false, error: 'TOKEN_EXPIRED', message: 'Onboarding link has expired. Please request a new one.' });
    }

    // Create auth user — privileged claims go in app_metadata (not user-writable)
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: request.contact_email,
      password,
      email_confirm: true,
      user_metadata: { full_name: request.contact_name },
      app_metadata: {
        role: 'admin',
        user_role: 'admin',
        tenant_id: request.tenant_id,
        is_platform_owner: false,
      },
    });

    if (authErr) throw authErr;

    // Create the tenant admin in the users table. IMPORTANT: only real columns.
    // The table has `user_role` (NOT `role`) and has no `is_trial_user` column —
    // writing unknown columns makes PostgREST reject the whole insert, which used
    // to fail silently and leave the school with no user row.
    const { error: userInsertErr } = await supabase.from('users').insert({
      auth_id: authData.user.id,
      email: request.contact_email,
      name: request.contact_name || '',
      user_role: 'admin',
      tenant_id: request.tenant_id,
      status: 'active',
      created_at: new Date().toISOString(),
    });
    if (userInsertErr) console.error('Onboarding: failed to create users row:', userInsertErr.message);

    // Update tenant with onboarding data. Keep status as 'trial' (set at
    // approval, with a 14-day trial_end_date) so the trial is preserved and the
    // tenant is visible under the "trial" filter in the admin portal. Ensure a
    // trial window and full module access exist even if approval missed them.
    if (request.tenant_id) {
      const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      // IMPORTANT: only real columns. `max_users` does NOT exist on tenants —
      // including it made the ENTIRE update fail silently, leaving
      // onboarding_completed=false, which then trapped the admin in the
      // onboarding redirect ("invalid link") and blocked every module.
      const { error: tenantUpdateErr } = await supabase.from('tenants').update({
        logo_url: school_logo || null,
        academic_year_start: academic_year_start || null,
        num_grades: num_grades || null,
        default_language: default_language || 'ar',
        status: 'trial',
        plan: 'trial',
        plan_code: 'free_trial',
        trial_end_date: trialEnd,
        enabled_modules: [],        // empty = all modules enabled during trial
        onboarding_completed: true,
      }).eq('id', request.tenant_id);
      // onboarding_completed is essential — surface failures instead of hiding them.
      if (tenantUpdateErr) console.error('Onboarding: failed to update tenant:', tenantUpdateErr.message);
    }

    // Mark request as completed. Keep the onboarding_token so a later revisit of
    // the link resolves to ALREADY_COMPLETED (and the admin is sent to sign in)
    // rather than a 404 "invalid link". The status check above prevents reuse.
    await supabase.from('registration_requests').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', request.id);

    res.json({ success: true, redirect_url: FRONTEND_URL });
  } catch (err) {
    console.error('Onboarding completion error:', err);
    res.status(500).json({ success: false, error: 'Failed to complete onboarding' });
  }
});

// ── Email helpers ──────────────────────────────────────────────────────────────

async function sendAdminNotification(request: Record<string, string>) {
  // Use HMAC-signed URLs so only the holder of ADMIN_LINK_SECRET can approve/deny
  const approveUrl = signAdminAction('approve', request.id);
  const denyUrl = signAdminAction('deny', request.id);

  console.log(`[EMAIL] Admin notification queued for: ${request.contact_email}`);

  const html = `
    <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px;">
      <div style="background: #0f172a; color: white; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 20px;">EduSaga 360</h1>
        <p style="margin: 4px 0 0; font-size: 12px; color: #94a3b8;">طلب تسجيل جديد</p>
      </div>
      <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none;">
        <h2 style="color: #1e293b; font-size: 18px;">طلب تسجيل مدرسة جديدة</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 8px 0; color: #64748b;">الاسم:</td><td style="padding: 8px 0; font-weight: 600;">${request.contact_name}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">المدرسة:</td><td style="padding: 8px 0; font-weight: 600;">${request.school_name_en}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">البريد:</td><td style="padding: 8px 0; font-weight: 600;">${request.contact_email}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">الهاتف:</td><td style="padding: 8px 0; font-weight: 600;">${request.contact_phone}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">المدينة:</td><td style="padding: 8px 0; font-weight: 600;">${request.city}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">النوع:</td><td style="padding: 8px 0; font-weight: 600;">${request.school_type}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">عدد الطلاب:</td><td style="padding: 8px 0; font-weight: 600;">${request.student_count_range}</td></tr>
        </table>
        <div style="margin-top: 24px; text-align: center;">
          <a href="${approveUrl}" style="display: inline-block; background: #10b981; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 0 8px;">قبول ✓</a>
          <a href="${denyUrl}" style="display: inline-block; background: #ef4444; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 0 8px;">رفض ✗</a>
        </div>
      </div>
      <div style="text-align: center; padding: 16px; color: #94a3b8; font-size: 11px; border-radius: 0 0 12px 12px; background: #f1f5f9;">
        EduSaga 360 — نظام إدارة المدارس المتكامل
      </div>
    </div>
  `;

  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `طلب تسجيل جديد — ${request.school_name_en || request.contact_name}`,
    html,
  });
}

async function sendWelcomeEmail(request: Record<string, string>) {
  const onboardingUrl = `${FRONTEND_URL}/onboarding/${request.onboarding_token}`;

  // Do NOT log the onboarding URL — it contains a secret token
  console.log(`[EMAIL] Welcome email queued for: ${request.contact_email}`);

  const html = `
    <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px;">
      <div style="background: #0f172a; color: white; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 20px;">EduSaga 360</h1>
        <p style="margin: 4px 0 0; font-size: 12px; color: #94a3b8;">مرحباً بك!</p>
      </div>
      <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none;">
        <h2 style="color: #1e293b; font-size: 18px;">أهلاً ${request.contact_name}! 🎉</h2>
        <p style="color: #475569; line-height: 1.6;">
          تم قبول طلب تسجيل مدرستك في منصة EduSaga 360. يمكنك الآن إعداد حسابك والبدء في استخدام المنصة.
        </p>
        <p style="color: #475569; line-height: 1.6;">
          انقر على الزر أدناه لإتمام عملية الإعداد:
        </p>
        <div style="margin: 24px 0; text-align: center;">
          <a href="${onboardingUrl}" style="display: inline-block; background: #10b981; color: white; padding: 14px 40px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 16px;">إعداد الحساب</a>
        </div>
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">
          هذا الرابط صالح لمدة 7 أيام. في حال انتهاء صلاحيته، يمكنك طلب رابط جديد من صفحة الإعداد.
        </p>
      </div>
      <div style="text-align: center; padding: 16px; color: #94a3b8; font-size: 11px; border-radius: 0 0 12px 12px; background: #f1f5f9;">
        EduSaga 360 — نظام إدارة المدارس المتكامل
      </div>
    </div>
  `;

  await sendEmail({
    to: request.contact_email,
    subject: 'مرحباً بك في EduSaga 360 — أكمل إعداد حسابك',
    html,
  });
}

async function sendDenialEmail(request: Record<string, string>) {
  console.log(`[EMAIL] Denial email to: ${request.contact_email}`);

  const html = `
    <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px;">
      <div style="background: #0f172a; color: white; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 20px;">EduSaga 360</h1>
      </div>
      <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none;">
        <h2 style="color: #1e293b; font-size: 18px;">أهلاً ${request.contact_name}</h2>
        <p style="color: #475569; line-height: 1.6;">
          شكراً لاهتمامك بمنصة EduSaga 360. بعد مراجعة طلبك، لم نتمكن من قبوله في الوقت الحالي.
        </p>
        <p style="color: #475569; line-height: 1.6;">
          إذا كنت تعتقد أن هناك خطأ أو ترغب في المحاولة مرة أخرى، يرجى التواصل معنا عبر البريد الإلكتروني: <a href="mailto:${ADMIN_EMAIL}" style="color: #3b82f6;">${ADMIN_EMAIL}</a>
        </p>
      </div>
      <div style="text-align: center; padding: 16px; color: #94a3b8; font-size: 11px; border-radius: 0 0 12px 12px; background: #f1f5f9;">
        EduSaga 360 — نظام إدارة المدارس المتكامل
      </div>
    </div>
  `;

  await sendEmail({
    to: request.contact_email,
    subject: 'تحديث بخصوص طلبك — EduSaga 360',
    html,
  });
}

function renderResultPage(title: string, message: string, success: boolean) {
  const color = success ? '#10b981' : '#ef4444';
  const icon = success ? '✓' : '✗';
  return `
    <!DOCTYPE html>
    <html dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title} — EduSaga 360</title>
    <style>
      body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background: #0f172a; color: white; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
      .card { background: white; color: #1e293b; border-radius: 16px; padding: 48px; max-width: 480px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.3); }
      .icon { width: 64px; height: 64px; border-radius: 50%; background: ${color}20; color: ${color}; display: flex; align-items: center; justify-content: center; font-size: 32px; margin: 0 auto 16px; }
      h1 { font-size: 24px; margin: 0 0 12px; }
      p { color: #64748b; line-height: 1.6; }
    </style></head>
    <body><div class="card"><div class="icon">${icon}</div><h1>${title}</h1><p>${message}</p></div></body></html>
  `;
}
