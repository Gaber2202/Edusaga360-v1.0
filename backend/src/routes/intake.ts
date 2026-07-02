/**
 * Parent Intake Automation — /api/intake
 *
 * WO-D: Automate student creation from parent intake submissions.
 * - On submit: always create student record
 * - All docs present → documents_complete → auto-advance pipeline
 * - Missing docs → pending_physical_verification → checklist + notify
 * - On-site finalization: staff uploads missing docs → auto-resume
 */

import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { AuthenticatedRequest, requireRole } from '../middleware/auth.js';

export const intakeRouter = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Default required documents for KSA schools
const DEFAULT_REQUIRED_DOCS = [
  { code: 'national_id',       label_ar: 'هوية وطنية / إقامة',       label_en: 'National ID / Iqama' },
  { code: 'birth_certificate',  label_ar: 'شهادة الميلاد',            label_en: 'Birth Certificate' },
  { code: 'vaccination_record', label_ar: 'سجل التطعيمات',            label_en: 'Vaccination Record' },
  { code: 'school_report',      label_ar: 'كشف درجات المدرسة السابقة', label_en: 'Prior School Report' },
  { code: 'photo',              label_ar: 'صورة شخصية',               label_en: 'Student Photo' },
];

// ─── GET /required-docs — Get default + tenant-configured required docs ──────

intakeRouter.get('/required-docs', async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'No tenant' });

  // Check if tenant has custom required docs in settings
  const { data: setting } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', `intake_required_docs_${tenantId}`)
    .single();

  return res.json(setting?.value ?? DEFAULT_REQUIRED_DOCS);
});

// ─── PUT /required-docs — Update required documents list ─────────────────────

intakeRouter.put('/required-docs', requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'No tenant' });

  const { documents } = req.body as { documents: Array<{ code: string; label_ar: string; label_en: string }> };
  if (!Array.isArray(documents)) return res.status(400).json({ error: 'documents must be an array' });

  await supabase.from('platform_settings').upsert({
    key: `intake_required_docs_${tenantId}`,
    value: documents,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });

  return res.json({ ok: true });
});

// ─── POST /submit — Parent submits intake form → auto-create student ─────────

intakeRouter.post('/submit', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenant_id;

    const {
      intake_link_id,
      branch_id,
      // Guardian info
      guardian_name_ar, guardian_name_en, guardian_national_id,
      guardian_phone, guardian_email, guardian_relationship,
      // Student info
      student_name_ar, student_name_en, date_of_birth, gender,
      nationality, national_id, applying_for_grade, academic_year,
      // Documents + other
      documents, has_special_needs, special_care_notes,
      total_estimated_fees, tc_version_accepted,
      // Required docs configuration
      required_document_codes,
    } = req.body as Record<string, unknown>;

    if (!student_name_ar || !guardian_phone) {
      return res.status(400).json({ error: 'student_name_ar and guardian_phone are required' });
    }

    // Determine required docs
    let requiredCodes: string[] = [];
    if (Array.isArray(required_document_codes) && required_document_codes.length > 0) {
      requiredCodes = required_document_codes as string[];
    } else if (tenantId) {
      const { data: setting } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', `intake_required_docs_${tenantId}`)
        .single();
      const docList = setting?.value ?? DEFAULT_REQUIRED_DOCS;
      requiredCodes = docList.map((d: { code: string }) => d.code);
    } else {
      requiredCodes = DEFAULT_REQUIRED_DOCS.map(d => d.code);
    }

    // Check which docs are present
    const uploadedDocs = Array.isArray(documents) ? documents as Array<{ name: string; url: string; type: string; doc_code?: string }> : [];
    const uploadedCodes = uploadedDocs.map(d => d.doc_code).filter(Boolean);
    const missingDocs = requiredCodes.filter(code => !uploadedCodes.includes(code));
    const allDocsPresent = missingDocs.length === 0;

    const docStatus = allDocsPresent ? 'documents_complete' : 'pending_physical_verification';
    const pipelineStage = allDocsPresent ? 'under_review' : 'submitted';

    // Duplicate check: same national_id + same academic year + same branch
    if (national_id && branch_id && academic_year) {
      const { data: existing } = await supabase
        .from('applications')
        .select('id, application_number')
        .match({ national_id, branch_id, academic_year })
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

    // Create application record
    const applicationNumber = `APP-${Date.now().toString(36).toUpperCase()}`;
    const applicationData: Record<string, unknown> = {
      application_number: applicationNumber,
      branch_id,
      student_name_ar, student_name_en, date_of_birth, gender,
      nationality, national_id,
      applying_for_grade, academic_year,
      guardian_name_ar, guardian_name_en, guardian_national_id,
      guardian_phone, guardian_email, guardian_relationship,
      has_special_needs, special_care_notes,
      total_estimated_fees,
      source: 'parent_intake',
      intake_link_id,
      tc_version_accepted,
      tc_accepted_date: new Date().toISOString(),
      documents: uploadedDocs,
      status: 'submitted',
      pipeline_stage: pipelineStage,
      document_status: docStatus,
      missing_documents: missingDocs,
      submitted_at: new Date().toISOString(),
    };

    // Add tenant_id if available
    if (tenantId) applicationData.tenant_id = tenantId;

    const { data: application, error: appError } = await supabase
      .from('applications')
      .insert(applicationData)
      .select()
      .single();

    if (appError) {
      console.error('[intake/submit] Insert error:', appError);
      return res.status(500).json({ error: appError.message });
    }

    // Update intake link submission count
    if (intake_link_id) {
      const { data: link } = await supabase
        .from('parent_intake_links')
        .select('submission_count')
        .eq('id', intake_link_id)
        .single();

      await supabase.from('parent_intake_links')
        .update({ submission_count: (link?.submission_count || 0) + 1 })
        .eq('id', intake_link_id as string);
    }

    // Auto-create student record
    const studentData: Record<string, unknown> = {
      student_id: `STU-${Date.now().toString(36).toUpperCase()}`,
      name_ar: student_name_ar as string,
      name_en: (student_name_en as string) || '',
      date_of_birth, gender, nationality, national_id,
      grade: applying_for_grade,
      academic_year,
      branch_id,
      guardian_name_ar, guardian_name_en,
      guardian_phone, guardian_email,
      guardian_relationship, guardian_national_id,
      enrollment_date: new Date().toISOString().split('T')[0],
      status: allDocsPresent ? 'active' : 'pending_verification',
      application_id: application.id,
      has_special_needs,
      special_care_notes,
      doc_status: docStatus,
      missing_documents: missingDocs,
    };

    if (tenantId) studentData.tenant_id = tenantId;

    const { data: student, error: studentError } = await supabase
      .from('students')
      .insert(studentData)
      .select()
      .single();

    if (studentError) {
      console.error('[intake/submit] Student insert error:', studentError);
      // Application was created; student failed — log but don't fail the whole request
    }

    // If docs incomplete, create verification task for admissions staff
    if (!allDocsPresent) {
      await supabase.from('platform_audit_log').insert({
        user_id: req.user?.id ?? 'system',
        action: 'intake.pending_verification',
        target_type: 'application',
        target_id: application.id,
        target_label: applicationNumber,
        tenant_id: tenantId,
        metadata: {
          missing_documents: missingDocs,
          student_name: student_name_ar,
          guardian_phone,
          guardian_email,
        },
      }).then(() => {});

      // Create notification for admissions staff
      if (tenantId) {
        await supabase.from('notifications').insert({
          tenant_id: tenantId,
          type: 'intake_pending_verification',
          title_ar: `طلب قبول يتطلب مراجعة الوثائق: ${student_name_ar}`,
          title_en: `Intake needs document verification: ${student_name_ar}`,
          body_ar: `الوثائق الناقصة: ${missingDocs.length} مستند(ات). يرجى تحديد موعد للمراجعة الشخصية.`,
          body_en: `Missing documents: ${missingDocs.length} doc(s). Schedule an on-site verification.`,
          target_type: 'application',
          target_id: application.id,
          target_roles: ['admin', 'admissions'],
          is_read: false,
        }).then(() => {});
      }
    } else {
      // All docs present → log auto-advance
      await supabase.from('platform_audit_log').insert({
        user_id: req.user?.id ?? 'system',
        action: 'intake.documents_complete',
        target_type: 'application',
        target_id: application.id,
        target_label: applicationNumber,
        tenant_id: tenantId,
        metadata: { student_name: student_name_ar },
      }).then(() => {});
    }

    return res.status(201).json({
      application,
      student: student ?? null,
      document_status: docStatus,
      missing_documents: missingDocs,
      message: allDocsPresent
        ? 'Application submitted. All documents verified. Pipeline auto-advanced.'
        : `Application submitted. ${missingDocs.length} missing document(s). Please visit the school for verification.`,
    });
  } catch (err) {
    console.error('[intake/submit]:', err);
    return res.status(500).json({ error: 'Submission failed' });
  }
});

// ─── POST /verify-documents/:applicationId — Staff verifies missing docs ─────

intakeRouter.post('/verify-documents/:applicationId', requireRole(['admin', 'admissions', 'branch_manager']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const applicationId = String(req.params.applicationId);
    const verifierId = req.user!.id;
    const { verified_documents } = req.body as {
      verified_documents: Array<{
        doc_code: string;
        url: string;
        name: string;
        verified_by: string;
        verified_at: string;
      }>;
    };

    if (!Array.isArray(verified_documents) || verified_documents.length === 0) {
      return res.status(400).json({ error: 'verified_documents array required' });
    }

    // Fetch current application — RF-006: scope to the caller's tenant so a
    // staff user cannot verify/mutate another tenant's application by guessing
    // its id (IDOR). A cross-tenant id now resolves to 404, not another school's
    // record.
    const { data: app, error: appError } = await supabase
      .from('applications')
      .select('*')
      .eq('id', applicationId)
      .eq('tenant_id', req.user!.tenant_id)
      .single();

    if (appError || !app) return res.status(404).json({ error: 'Application not found' });

    // Merge new verified docs with existing documents
    const existingDocs = Array.isArray(app.documents) ? app.documents : [];
    const newDocs = verified_documents.map(d => ({
      ...d,
      verified_by: verifierId,
      verified_at: new Date().toISOString(),
    }));

    const allDocs = [...existingDocs, ...newDocs];
    const verifiedCodes = allDocs.map((d: { doc_code?: string }) => d.doc_code).filter(Boolean);

    // Check remaining missing docs
    const previousMissing = Array.isArray(app.missing_documents) ? app.missing_documents : [];
    const stillMissing = previousMissing.filter((code: string) => !verifiedCodes.includes(code));
    const allComplete = stillMissing.length === 0;

    const newDocStatus = allComplete ? 'documents_complete' : 'pending_physical_verification';
    const newPipelineStage = allComplete ? 'under_review' : app.pipeline_stage;

    // Update application — RF-006: keep the write tenant-scoped (defence in depth).
    await supabase.from('applications').update({
      documents: allDocs,
      document_status: newDocStatus,
      missing_documents: stillMissing,
      pipeline_stage: newPipelineStage,
      ...(allComplete ? { document_verified_at: new Date().toISOString(), document_verified_by: verifierId } : {}),
    }).eq('id', applicationId).eq('tenant_id', req.user!.tenant_id);

    // Update student record if exists — RF-006: scope by tenant, not just the
    // body-derived application_number, so we never flip another tenant's student.
    if (app.application_number) {
      await supabase.from('students').update({
        doc_status: newDocStatus,
        missing_documents: stillMissing,
        ...(allComplete ? { status: 'active' } : {}),
      }).eq('application_id', applicationId).eq('tenant_id', req.user!.tenant_id);
    }

    // Audit
    await supabase.from('platform_audit_log').insert({
      user_id: verifierId,
      action: allComplete ? 'intake.verification_complete' : 'intake.partial_verification',
      target_type: 'application',
      target_id: applicationId,
      target_label: app.application_number,
      tenant_id: req.user!.tenant_id,
      metadata: {
        verified_docs: newDocs.map((d: { doc_code: string }) => d.doc_code),
        still_missing: stillMissing,
      },
    }).then(() => {});

    // If complete, notify
    if (allComplete && req.user!.tenant_id) {
      await supabase.from('notifications').insert({
        tenant_id: req.user!.tenant_id,
        type: 'intake_verification_complete',
        title_ar: `اكتملت مراجعة الوثائق: ${app.student_name_ar}`,
        title_en: `Document verification complete: ${app.student_name_ar}`,
        body_ar: 'تم التحقق من جميع المستندات. الطلب ينتقل تلقائياً لمراجعة الوثائق.',
        body_en: 'All documents verified. Application auto-advanced to Docs Review.',
        target_type: 'application',
        target_id: applicationId,
        target_roles: ['admin', 'admissions'],
        is_read: false,
      }).then(() => {});
    }

    return res.json({
      status: newDocStatus,
      missing_documents: stillMissing,
      pipeline_stage: newPipelineStage,
      message: allComplete
        ? 'All documents verified. Pipeline auto-resumed.'
        : `${stillMissing.length} document(s) still missing.`,
    });
  } catch (err) {
    console.error('[intake/verify-documents]:', err);
    return res.status(500).json({ error: 'Verification failed' });
  }
});

// ─── GET /pending-verifications — List applications pending physical verification

intakeRouter.get('/pending-verifications', requireRole(['admin', 'admissions', 'branch_manager']), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'No tenant' });

  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('document_status', 'pending_physical_verification')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data ?? []);
});
