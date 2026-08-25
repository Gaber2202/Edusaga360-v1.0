/**
 * Public parent intake — /api/public/intake
 * Unauthenticated, rate-limited. Resolves school context from link_code.
 * SCRUM-113 / SCRUM-114
 */

import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase.js';
import { sendAdmissionsStageMessage } from '../services/admissionsMessaging.js';

export const publicIntakeRouter = Router();

const DEFAULT_REQUIRED_DOCS = [
  { code: 'national_id', label_ar: 'هوية وطنية / إقامة', label_en: 'National ID / Iqama' },
  { code: 'birth_certificate', label_ar: 'شهادة الميلاد', label_en: 'Birth Certificate' },
  { code: 'vaccination_record', label_ar: 'سجل التطعيمات', label_en: 'Vaccination Record' },
  { code: 'school_report', label_ar: 'كشف درجات المدرسة السابقة', label_en: 'Prior School Report' },
  { code: 'photo', label_ar: 'صورة شخصية', label_en: 'Student Photo' },
];

const DEFAULT_VISIBLE_FIELDS: Record<string, boolean> = {
  guardian_name_ar: true,
  guardian_name_en: true,
  guardian_email: true,
  guardian_whatsapp: true,
  guardian_phone: true,
  guardian_national_id: true,
  guardian_relationship: true,
  address: true,
  student_name_ar: true,
  student_name_en: true,
  date_of_birth: true,
  gender: true,
  nationality: true,
  national_id: true,
  applying_for_grade: true,
  academic_year: true,
  previous_school: true,
  has_special_needs: true,
  documents: true,
};

const intakeLimiter = process.env.VITEST
  ? ((_req: Request, _res: Response, next: NextFunction) => next())
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 60,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: 'Too many requests, please try again later.' },
    });

publicIntakeRouter.use(intakeLimiter);

async function loadActiveLink(linkCode: string) {
  const code = String(linkCode || '').trim();
  if (!code) return null;

  const { data: link, error } = await supabase
    .from('parent_intake_links')
    .select('*')
    .eq('link_code', code)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !link) return null;

  if (link.expires_date) {
    const exp = new Date(link.expires_date);
    if (!Number.isNaN(exp.getTime()) && exp < new Date()) return null;
  }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name_en, name_ar, logo_url, slug, tenant_code, status')
    .eq('id', link.tenant_id)
    .maybeSingle();

  if (!tenant || (tenant.status && tenant.status !== 'active' && tenant.status !== 'trial')) {
    return null;
  }

  let visibleFields = { ...DEFAULT_VISIBLE_FIELDS };
  if (link.visible_fields && typeof link.visible_fields === 'object') {
    visibleFields = { ...visibleFields, ...link.visible_fields };
  } else {
    const { data: setting } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', `intake_visible_fields_${link.tenant_id}`)
      .maybeSingle();
    if (setting?.value && typeof setting.value === 'object') {
      visibleFields = { ...visibleFields, ...setting.value };
    }
  }
  // Locked required fields always on
  for (const k of ['guardian_name_ar', 'guardian_name_en', 'guardian_email', 'guardian_whatsapp', 'applying_for_grade', 'academic_year', 'student_name_ar', 'documents']) {
    visibleFields[k] = true;
  }

  let requiredDocs = link.required_documents;
  if (!Array.isArray(requiredDocs) || requiredDocs.length === 0) {
    const { data: setting } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', `intake_required_docs_${link.tenant_id}`)
      .maybeSingle();
    requiredDocs = setting?.value ?? DEFAULT_REQUIRED_DOCS;
  }

  const { data: branch } = link.branch_id
    ? await supabase.from('branches').select('id, name_en, name_ar, name').eq('id', link.branch_id).maybeSingle()
    : { data: null };

  return { link, tenant, visibleFields, requiredDocs, branch };
}

// GET /by-code/:link_code — public intake context (logo, fields, grades)
publicIntakeRouter.get('/by-code/:link_code', async (req, res) => {
  const ctx = await loadActiveLink(String(req.params.link_code || ''));
  if (!ctx) return res.status(404).json({ message: 'Intake link not found or expired' });

  const { link, tenant, visibleFields, requiredDocs, branch } = ctx;

  // Fee structures visible in intake (optional; empty if none)
  const { data: feeStructures } = await supabase
    .from('fee_structures')
    .select('id, fee_type_code, fee_type_name_ar, fee_type_name_en, amount, grade, academic_year, branch_id, display_in_intake')
    .eq('tenant_id', link.tenant_id)
    .eq('is_active', true)
    .eq('display_in_intake', true);

  return res.json({
    link: {
      id: link.id,
      name_ar: link.name_ar,
      name_en: link.name_en,
      link_code: link.link_code,
      academic_year: link.academic_year,
      branch_id: link.branch_id,
      allowed_grades: link.allowed_grades || [],
      submission_count: link.submission_count || 0,
    },
    school: {
      name_en: tenant.name_en,
      name_ar: tenant.name_ar,
      logo_url: tenant.logo_url,
      slug: tenant.slug,
      tenant_code: tenant.tenant_code,
    },
    branch,
    visible_fields: visibleFields,
    required_documents: requiredDocs,
    fee_structures: feeStructures || [],
  });
});

// POST /submit — anonymous parent submission
publicIntakeRouter.post('/submit', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const linkCode = String(body.link_code || '');
    const ctx = await loadActiveLink(linkCode);
    if (!ctx) return res.status(404).json({ error: 'Intake link not found or expired' });

    const { link, tenant } = ctx;
    const tenantId = tenant.id as string;

    const guardian_name_ar = String(body.guardian_name_ar || '').trim();
    const guardian_name_en = String(body.guardian_name_en || '').trim();
    const guardian_email = String(body.guardian_email || '').trim();
    const guardian_whatsapp = String(body.guardian_whatsapp || body.guardian_phone || '').trim();
    const guardian_phone = String(body.guardian_phone || guardian_whatsapp || '').trim();
    const student_name_ar = String(body.student_name_ar || '').trim();
    const applying_for_grade = String(body.applying_for_grade || '').trim();
    const academic_year = String(body.academic_year || link.academic_year || '').trim();

    if (!guardian_name_ar || !guardian_name_en || !guardian_email || !guardian_whatsapp || !student_name_ar || !applying_for_grade || !academic_year) {
      return res.status(400).json({
        error: 'missing_required_fields',
        message: 'Parent name (AR+EN), email, WhatsApp, student name, grade, and academic year are required',
      });
    }

    const allowedGrades = Array.isArray(link.allowed_grades) ? link.allowed_grades as string[] : [];
    if (allowedGrades.length > 0 && !allowedGrades.includes(applying_for_grade)) {
      return res.status(400).json({ error: 'grade_not_allowed', message: 'Grade is not allowed for this intake link' });
    }

    let requiredCodes: string[] = [];
    if (Array.isArray(body.required_document_codes) && (body.required_document_codes as string[]).length > 0) {
      requiredCodes = body.required_document_codes as string[];
    } else if (Array.isArray(ctx.requiredDocs)) {
      requiredCodes = (ctx.requiredDocs as Array<{ code: string }>).map((d) => d.code);
    }

    const uploadedDocs = Array.isArray(body.documents)
      ? (body.documents as Array<{ name: string; url: string; type: string; doc_code?: string }>)
      : [];
    const uploadedCodes = uploadedDocs.map((d) => d.doc_code).filter(Boolean) as string[];
    const missingDocs = requiredCodes.filter((code) => !uploadedCodes.includes(code));
    const allDocsPresent = missingDocs.length === 0;
    const docStatus = allDocsPresent ? 'documents_complete' : 'pending_physical_verification';
    const pipelineStage = allDocsPresent ? 'under_review' : 'submitted';

    const national_id = body.national_id ? String(body.national_id) : null;
    const branch_id = (body.branch_id as string) || link.branch_id;

    if (national_id && branch_id && academic_year) {
      const { data: existing } = await supabase
        .from('applications')
        .select('id, application_number')
        .match({ tenant_id: tenantId, national_id, branch_id, academic_year })
        .not('status', 'in', '("rejected","withdrawn")')
        .limit(1);
      if (existing && existing.length > 0) {
        return res.status(409).json({
          error: 'duplicate',
          message: 'An application with this national ID already exists for this academic year',
          existing_application: existing[0].application_number,
        });
      }
    }

    const applicationNumber = `APP-${Date.now().toString(36).toUpperCase()}`;
    const applicationData: Record<string, unknown> = {
      tenant_id: tenantId,
      application_number: applicationNumber,
      branch_id,
      student_name_ar,
      student_name_en: body.student_name_en || '',
      date_of_birth: body.date_of_birth || null,
      gender: body.gender || null,
      nationality: body.nationality || null,
      national_id,
      applying_for_grade,
      academic_year,
      previous_school: body.previous_school || null,
      guardian_name_ar,
      guardian_name_en,
      guardian_national_id: body.guardian_national_id || null,
      guardian_phone,
      guardian_whatsapp,
      guardian_email,
      guardian_relationship: body.guardian_relationship || 'guardian',
      address: body.address || null,
      has_special_needs: !!body.has_special_needs,
      special_care_notes: body.special_care_notes || null,
      total_estimated_fees: body.total_estimated_fees || null,
      source: 'parent_intake',
      intake_link_id: link.id,
      tc_version_accepted: body.tc_version_accepted || null,
      tc_accepted_date: new Date().toISOString(),
      documents: uploadedDocs,
      status: 'submitted',
      pipeline_stage: pipelineStage,
      document_status: docStatus,
      missing_documents: missingDocs,
      submitted_at: new Date().toISOString(),
    };

    const { data: application, error: appError } = await supabase
      .from('applications')
      .insert(applicationData)
      .select()
      .single();

    if (appError) {
      console.error('[public/intake/submit] Insert error:', appError);
      return res.status(500).json({ error: appError.message });
    }

    await supabase
      .from('parent_intake_links')
      .update({ submission_count: (link.submission_count || 0) + 1 })
      .eq('id', link.id);

    await supabase.from('application_stage_history').insert({
      tenant_id: tenantId,
      application_id: application.id,
      from_status: null,
      to_status: 'submitted',
      note: 'Parent intake submission',
      changed_by_name: guardian_email,
    }).then(() => {});

    const studentData: Record<string, unknown> = {
      tenant_id: tenantId,
      student_id: `STU-${Date.now().toString(36).toUpperCase()}`,
      name_ar: student_name_ar,
      name_en: String(body.student_name_en || ''),
      date_of_birth: body.date_of_birth || null,
      gender: body.gender || null,
      nationality: body.nationality || null,
      national_id,
      grade: applying_for_grade,
      academic_year,
      branch_id,
      guardian_name_ar,
      guardian_name_en,
      guardian_phone,
      guardian_email,
      guardian_relationship: body.guardian_relationship || 'guardian',
      guardian_national_id: body.guardian_national_id || null,
      enrollment_date: new Date().toISOString().split('T')[0],
      status: allDocsPresent ? 'active' : 'pending_verification',
      application_id: application.id,
      has_special_needs: !!body.has_special_needs,
      special_care_notes: body.special_care_notes || null,
      doc_status: docStatus,
      missing_documents: missingDocs,
    };

    const { data: student, error: studentError } = await supabase
      .from('students')
      .insert(studentData)
      .select()
      .single();

    if (studentError) {
      console.error('[public/intake/submit] Student insert error:', studentError);
    }

    if (!allDocsPresent && tenantId) {
      await supabase.from('notifications').insert({
        tenant_id: tenantId,
        type: 'intake_pending_verification',
        title_ar: `طلب قبول يتطلب مراجعة الوثائق: ${student_name_ar}`,
        title_en: `Intake needs document verification: ${student_name_ar}`,
        body_ar: `الوثائق الناقصة: ${missingDocs.length} مستند(ات).`,
        body_en: `Missing documents: ${missingDocs.length} doc(s).`,
        target_type: 'application',
        target_id: application.id,
        target_roles: ['admin', 'admissions'],
        is_read: false,
      }).then(() => {});
    }

    // SCRUM-115: bilingual WhatsApp to parent
    try {
      await sendAdmissionsStageMessage({
        tenantId,
        application,
        event: 'welcome',
      });
      if (!allDocsPresent) {
        await sendAdmissionsStageMessage({
          tenantId,
          application: { ...application, missing_documents: missingDocs },
          event: 'documents_missing',
          extra: { missing_docs: missingDocs.join(', ') },
        });
      }
    } catch (notifyErr) {
      console.warn('[public/intake/submit] WhatsApp notify skipped:', notifyErr);
    }

    return res.status(201).json({
      ok: true,
      application,
      student: student || null,
      missing_documents: missingDocs,
      document_status: docStatus,
    });
  } catch (err) {
    console.error('[public/intake/submit]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /upload — public doc upload gated by valid link_code
publicIntakeRouter.post('/upload', async (req, res) => {
  try {
    const linkCode = String(req.headers['x-intake-link-code'] || req.query.link_code || '');
    const ctx = await loadActiveLink(linkCode);
    if (!ctx) return res.status(404).json({ error: 'Intake link not found or expired' });

    // Expect multipart parsed elsewhere — if body has base64 fallback:
    const { filename, content_type, data_base64 } = req.body as {
      filename?: string;
      content_type?: string;
      data_base64?: string;
    };

    if (!data_base64) {
      return res.status(400).json({
        error: 'data_base64_required',
        message: 'Send JSON { filename, content_type, data_base64 } with a valid x-intake-link-code header',
      });
    }

    const buf = Buffer.from(data_base64, 'base64');
    if (buf.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large (max 10MB)' });
    }

    const safeExt = (filename || 'bin').split('.').pop()?.toLowerCase() || 'bin';
    if (!['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'].includes(safeExt)) {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    const path = `${ctx.tenant.id}/intake/${ctx.link.id}/${randomUUID()}.${safeExt === 'jpeg' ? 'jpg' : safeExt}`;
    const { error: uploadError } = await supabase.storage
      .from('tenant-files')
      .upload(path, buf, {
        contentType: content_type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      console.error('[public/intake/upload]', uploadError);
      return res.status(500).json({ error: uploadError.message });
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from('tenant-files')
      .createSignedUrl(path, 60 * 60);

    if (signedError) {
      return res.status(500).json({ error: signedError.message });
    }

    return res.json({ path, signedUrl: signed?.signedUrl });
  } catch (err) {
    console.error('[public/intake/upload]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
