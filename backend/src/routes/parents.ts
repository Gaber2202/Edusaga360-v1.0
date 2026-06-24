import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import crypto from 'crypto';
import { sendEmail, isEmailConfigured } from '../services/email.js';

export const parentsRouter = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PARENT_PORTAL_URL = process.env.PARENT_PORTAL_URL || 'https://edusaga-360-parent-portal.vercel.app';

const InviteParentSchema = z.object({
  guardian_name_en: z.string().min(1).max(200),
  guardian_name_ar: z.string().max(200).optional(),
  guardian_email: z.string().email().max(254),
  guardian_phone: z.string().max(30).optional(),
  guardian_relationship: z.string().max(50).optional(),
  guardian_national_id: z.string().max(30).optional(),
  student_id: z.string().uuid(),
  student_name: z.string().max(200).optional(),
  tenant_id: z.string().uuid(),
  school_name: z.string().max(200).optional(),
});

/**
 * POST /api/parents/invite
 * Called by the school app when a student is enrolled with guardian info.
 * Creates a guardian record, a Supabase Auth user (invited via email),
 * and a users table record with role=parent and linked_student_ids.
 */
parentsRouter.post('/invite', async (req, res) => {
  try {
    const parsed = InviteParentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION',
        message: 'Validation failed',
        errors: parsed.error.flatten(),
      });
    }

    const d = parsed.data;

    // 1. Check if a parent user already exists for this email + tenant
    const { data: existingUsers } = await supabase
      .from('users')
      .select('id, linked_student_ids')
      .eq('email', d.guardian_email.toLowerCase())
      .eq('tenant_id', d.tenant_id)
      .eq('user_role', 'parent')
      .limit(1);

    const existingParent = existingUsers?.[0];

    if (existingParent) {
      // Parent already exists — just link the new student
      const currentIds = existingParent.linked_student_ids || [];
      if (!currentIds.includes(d.student_id)) {
        const updatedIds = [...currentIds, d.student_id];
        await supabase
          .from('users')
          .update({ linked_student_ids: updatedIds })
          .eq('id', existingParent.id);
      }

      return res.json({
        success: true,
        message: 'Student linked to existing parent account',
        parent_user_id: existingParent.id,
        already_existed: true,
      });
    }

    // 2. Create or find guardian record
    const { data: guardian, error: guardianError } = await supabase
      .from('guardians')
      .insert({
        tenant_id: d.tenant_id,
        name_en: d.guardian_name_en,
        name_ar: d.guardian_name_ar || '',
        email: d.guardian_email.toLowerCase(),
        phone: d.guardian_phone || '',
        relation: d.guardian_relationship || 'parent',
        national_id: d.guardian_national_id || '',
      })
      .select()
      .single();

    if (guardianError) {
      console.error('Guardian insert error:', guardianError);
      // If duplicate, try to find existing
      if (guardianError.code === '23505') {
        const { data: existing } = await supabase
          .from('guardians')
          .select('*')
          .eq('email', d.guardian_email.toLowerCase())
          .eq('tenant_id', d.tenant_id)
          .limit(1);
        if (existing?.[0]) {
          // continue with existing guardian
        }
      } else {
        throw guardianError;
      }
    }

    // 3. Link guardian to student
    if (guardian?.id) {
      await supabase
        .from('students')
        .update({ guardian_id: guardian.id })
        .eq('id', d.student_id);
    }

    // 4. Create Supabase Auth user via invite (sends magic link email)
    //    Check if auth user already exists first
    const { data: existingAuthUsers } = await supabase.auth.admin.listUsers();
    const existingAuth = existingAuthUsers?.users?.find(
      u => u.email?.toLowerCase() === d.guardian_email.toLowerCase()
    );

    let authUserId: string;

    if (existingAuth) {
      authUserId = existingAuth.id;
      // Update metadata
      await supabase.auth.admin.updateUserById(authUserId, {
        user_metadata: {
          ...existingAuth.user_metadata,
          role: 'parent',
          tenant_id: d.tenant_id,
        },
        app_metadata: {
          ...existingAuth.app_metadata,
          role: 'parent',
          tenant_id: d.tenant_id,
        },
      });
    } else {
      // Create new auth user with a temporary password
      const tempPassword = crypto.randomBytes(16).toString('hex');
      const { data: newAuth, error: authError } = await supabase.auth.admin.createUser({
        email: d.guardian_email.toLowerCase(),
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: d.guardian_name_en,
          role: 'parent',
          tenant_id: d.tenant_id,
        },
        app_metadata: {
          role: 'parent',
          tenant_id: d.tenant_id,
        },
      });

      if (authError) throw authError;
      authUserId = newAuth.user.id;

      // Generate password reset link so parent sets their own password
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: d.guardian_email.toLowerCase(),
        options: {
          redirectTo: `${PARENT_PORTAL_URL}/`,
        },
      });

      if (linkError) {
        console.error('Magic link generation error:', linkError);
      }

      // Send custom invitation email via Infobip
      const inviteToken = linkData?.properties?.hashed_token;
      await sendParentInviteEmail({
        email: d.guardian_email,
        parentName: d.guardian_name_en,
        studentName: d.student_name || '',
        schoolName: d.school_name || 'EduSaga 360',
        portalUrl: PARENT_PORTAL_URL,
        magicLink: linkData?.properties?.action_link || '',
        tempPassword,
      });
    }

    // 5. Create user record in users table
    const { data: parentUser, error: userError } = await supabase
      .from('users')
      .insert({
        auth_id: authUserId,
        tenant_id: d.tenant_id,
        email: d.guardian_email.toLowerCase(),
        name: d.guardian_name_en,
        name_ar: d.guardian_name_ar || '',
        user_role: 'parent',
        linked_student_ids: [d.student_id],
        status: 'active',
      })
      .select()
      .single();

    if (userError) {
      console.error('User insert error:', userError);
      // Try to continue even if user record fails
    }

    return res.status(201).json({
      success: true,
      message: 'Parent invited successfully',
      parent_user_id: parentUser?.id,
      guardian_id: guardian?.id,
      already_existed: false,
    });
  } catch (err) {
    console.error('Parent invite error:', err);
    const detail = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL',
      message: `Failed to invite parent: ${detail}`,
    });
  }
});

async function sendParentInviteEmail(opts: {
  email: string;
  parentName: string;
  studentName: string;
  schoolName: string;
  portalUrl: string;
  magicLink: string;
  tempPassword: string;
}) {
  console.log(`[EMAIL] Parent invite for: ${opts.email}`);

  if (!isEmailConfigured()) {
    console.log('[EMAIL] Infobip not configured, skipping email send');
    console.log(`[EMAIL] Temp password for ${opts.email}: ${opts.tempPassword}`);
    console.log(`[EMAIL] Portal URL: ${opts.portalUrl}`);
    return;
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; direction: ltr;">
      <div style="background: linear-gradient(135deg, #059669, #0d9488); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">EduSaga 360</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Parent Portal Invitation</p>
      </div>
      <div style="background: white; padding: 32px; border: 1px solid #e2e8f0; border-top: 0;">
        <p style="color: #334155; font-size: 16px;">Dear ${opts.parentName},</p>
        <p style="color: #475569;">Your child <strong>${opts.studentName}</strong> has been enrolled at <strong>${opts.schoolName}</strong>. You now have access to the Parent Portal where you can:</p>
        <ul style="color: #475569; line-height: 1.8;">
          <li>View your child's academic progress and grades</li>
          <li>Track attendance records</li>
          <li>View fees and payment history</li>
          <li>Read school announcements</li>
          <li>Communicate with teachers</li>
        </ul>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${opts.portalUrl}" style="background: #059669; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Open Parent Portal</a>
        </div>
        <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="color: #334155; font-weight: 600; margin: 0 0 8px;">Your Login Credentials:</p>
          <p style="color: #475569; margin: 4px 0;">Email: <strong>${opts.email}</strong></p>
          <p style="color: #475569; margin: 4px 0;">Temporary Password: <strong>${opts.tempPassword}</strong></p>
          <p style="color: #ef4444; font-size: 13px; margin: 8px 0 0;">Please change your password after your first login.</p>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 13px; text-align: center;">This is an automated message from EduSaga 360.</p>
      </div>
    </div>

    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 32px auto 0; direction: rtl;">
      <div style="background: linear-gradient(135deg, #059669, #0d9488); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">EduSaga 360</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">دعوة بوابة ولي الأمر</p>
      </div>
      <div style="background: white; padding: 32px; border: 1px solid #e2e8f0; border-top: 0;">
        <p style="color: #334155; font-size: 16px;">عزيزي/عزيزتي ${opts.parentName}،</p>
        <p style="color: #475569;">تم تسجيل ابنك/ابنتك <strong>${opts.studentName}</strong> في <strong>${opts.schoolName}</strong>. يمكنك الآن الوصول إلى بوابة ولي الأمر حيث يمكنك:</p>
        <ul style="color: #475569; line-height: 1.8;">
          <li>متابعة التقدم الأكاديمي والدرجات</li>
          <li>تتبع سجلات الحضور</li>
          <li>عرض الرسوم وتاريخ الدفع</li>
          <li>قراءة إعلانات المدرسة</li>
          <li>التواصل مع المعلمين</li>
        </ul>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${opts.portalUrl}" style="background: #059669; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">فتح بوابة ولي الأمر</a>
        </div>
        <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="color: #334155; font-weight: 600; margin: 0 0 8px;">بيانات تسجيل الدخول:</p>
          <p style="color: #475569; margin: 4px 0;">البريد الإلكتروني: <strong>${opts.email}</strong></p>
          <p style="color: #475569; margin: 4px 0;">كلمة المرور المؤقتة: <strong>${opts.tempPassword}</strong></p>
          <p style="color: #ef4444; font-size: 13px; margin: 8px 0 0;">يرجى تغيير كلمة المرور بعد تسجيل الدخول الأول.</p>
        </div>
      </div>
    </div>
  `;

  try {
    await sendEmail({
      to: opts.email,
      subject: `${opts.schoolName} — Parent Portal Access | بوابة ولي الأمر`,
      html,
    });
    console.log(`[EMAIL] Parent invite sent to: ${opts.email}`);
  } catch (err) {
    console.error('[EMAIL] Failed to send parent invite:', err);
  }
}
