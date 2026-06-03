import { Router, Request } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import crypto from 'crypto';

export const registrationRouter = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ADMIN_EMAIL = 'info@edusaga360.com';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://edusaga-360-production.vercel.app';
const API_BASE_URL = process.env.API_BASE_URL || 'https://edusaga-360-production.up.railway.app';

const RegistrationRequestSchema = z.object({
  full_name: z.string().min(1).optional(),
  school_name: z.string().min(1).optional(),
  school_name_en: z.string().min(1).optional(),
  school_name_ar: z.string().optional(),
  contact_name: z.string().min(1).optional(),
  contact_email: z.string().email().optional(),
  email: z.string().email().optional(),
  contact_phone: z.string().optional(),
  phone: z.string().optional(),
  school_type: z.string().optional(),
  city: z.string().optional(),
  country: z.string().default('SA'),
  estimated_students: z.string().optional(),
  student_count_range: z.string().optional(),
  how_heard: z.string().optional(),
  notes: z.string().optional(),
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

    const onboardingToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

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

// Approval endpoint (called from email link)
registrationRouter.get('/approve/:id', async (req, res) => {
  try {
    const { id } = req.params;
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

    const { error: updateError } = await supabase
      .from('registration_requests')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) throw updateError;

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

// Denial endpoint (called from email link)
registrationRouter.get('/deny/:id', async (req, res) => {
  try {
    const { id } = req.params;
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

// Resend onboarding link endpoint (called from admin UI)
registrationRouter.get('/resend/:id', async (req, res) => {
  try {
    const { id } = req.params;
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

    // Generate a fresh token with a new 48-hour expiry
    const newToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

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
      `A new onboarding link has been sent to ${request.contact_email}. It is valid for 48 hours.`,
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

// Onboarding completion
registrationRouter.post('/onboarding/:token/complete', async (req, res) => {
  try {
    const { token } = req.params;
    const { password, school_logo, academic_year_start, num_grades, default_language } = req.body;

    const { data: request, error: fetchErr } = await supabase
      .from('registration_requests')
      .select('*')
      .eq('onboarding_token', token)
      .single();

    if (fetchErr || !request) {
      return res.status(404).json({ success: false, error: 'Invalid token' });
    }

    if (request.status !== 'approved') {
      return res.status(400).json({ success: false, error: 'Request is not approved' });
    }

    // Create auth user
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: request.contact_email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: request.contact_name,
        role: 'admin',
      },
    });

    if (authErr) throw authErr;

    // Create user in users table (schema uses name column, not first_name/last_name)
    await supabase.from('users').insert({
      auth_id: authData.user.id,
      email: request.contact_email,
      name: request.contact_name || '',
      user_role: 'admin',
      role: 'admin',
      tenant_id: request.tenant_id,
      status: 'active',
      created_at: new Date().toISOString(),
    });

    // Update tenant with onboarding data
    if (request.tenant_id) {
      await supabase.from('tenants').update({
        logo_url: school_logo || null,
        academic_year_start: academic_year_start || null,
        num_grades: num_grades || null,
        default_language: default_language || 'ar',
        status: 'active',
      }).eq('id', request.tenant_id);
    }

    // Mark request as completed
    await supabase.from('registration_requests').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      onboarding_token: null,
    }).eq('id', request.id);

    res.json({ success: true, redirect_url: FRONTEND_URL });
  } catch (err) {
    console.error('Onboarding completion error:', err);
    res.status(500).json({ success: false, error: 'Failed to complete onboarding' });
  }
});

// ── Email helpers ──────────────────────────────────────────────────────────────

async function sendAdminNotification(request: Record<string, string>) {
  const approveUrl = `${API_BASE_URL}/api/registration/approve/${request.id}`;
  const denyUrl = `${API_BASE_URL}/api/registration/deny/${request.id}`;

  console.log(`[EMAIL] Admin notification for: ${request.contact_email}`);
  console.log(`  Approve: ${approveUrl}`);
  console.log(`  Deny: ${denyUrl}`);

  // Use Resend/SendGrid if configured
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.log('[EMAIL] No RESEND_API_KEY configured, skipping email send');
    return;
  }

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

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `EduSaga 360 <${ADMIN_EMAIL}>`,
      to: [ADMIN_EMAIL],
      subject: `طلب تسجيل جديد — ${request.school_name_en || request.contact_name}`,
      html,
    }),
  });
}

async function sendWelcomeEmail(request: Record<string, string>) {
  const onboardingUrl = `${FRONTEND_URL}/onboarding/${request.onboarding_token}`;

  console.log(`[EMAIL] Welcome email to: ${request.contact_email}`);
  console.log(`  Onboarding URL: ${onboardingUrl}`);

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

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
          هذا الرابط صالح لمدة 48 ساعة. في حال انتهاء صلاحيته، يمكنك طلب رابط جديد.
        </p>
      </div>
      <div style="text-align: center; padding: 16px; color: #94a3b8; font-size: 11px; border-radius: 0 0 12px 12px; background: #f1f5f9;">
        EduSaga 360 — نظام إدارة المدارس المتكامل
      </div>
    </div>
  `;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `EduSaga 360 <${ADMIN_EMAIL}>`,
      to: [request.contact_email],
      subject: 'مرحباً بك في EduSaga 360 — أكمل إعداد حسابك',
      html,
    }),
  });
}

async function sendDenialEmail(request: Record<string, string>) {
  console.log(`[EMAIL] Denial email to: ${request.contact_email}`);

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

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

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `EduSaga 360 <${ADMIN_EMAIL}>`,
      to: [request.contact_email],
      subject: 'تحديث بخصوص طلبك — EduSaga 360',
      html,
    }),
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
