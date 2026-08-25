import { Router, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import {
  createCanteenTopupInvoice,
  createStoreOrder,
  findApplicationForStudent,
  listProductSlots,
  listStoreCategories,
  mapAdmissionDocuments,
  resolveStoreProductImage,
  signParentDocumentPath,
  MIN_TOPUP,
  MAX_TOPUP,
} from '../services/parentCommerce.js';
import { attachParentScope, requireParent, scopedStudentIds, type ParentRequest } from '../middleware/parent.js';

export const PARENT_API_CATALOG = {
  name: 'EduSaga 360 Parent API',
  version: '1.0',
  auth: {
    login: 'POST /api/parent/auth/login',
    refresh: 'POST /api/parent/auth/refresh',
    selectSchool: 'POST /api/parent/auth/select-school',
    schools: 'GET /api/parent/auth/schools',
    header: 'Authorization: Bearer <access_token>',
    tenantHeader: 'X-Tenant-Id: <tenant_uuid> (required when parent has multiple schools)',
  },
  public: {
    schoolByCode: 'GET /api/public/schools/by-code/:tenant_code',
    schoolBySlug: 'GET /api/public/schools/by-slug/:slug',
  },
  endpoints: {
    me: 'GET /api/parent/me',
    summary: 'GET /api/parent/summary',
    children: 'GET /api/parent/children',
    childAllergens: 'PATCH /api/parent/children/:id/allergens',
    attendance: 'GET /api/parent/attendance?student_id=',
    invoices: 'GET /api/parent/invoices?student_id=',
    grades: 'GET /api/parent/grades?student_id=',
    homework: 'GET /api/parent/homework?student_id=',
    announcements: 'GET /api/parent/announcements',
    messages: 'GET /api/parent/messages?student_id=',
    sendMessage: 'POST /api/parent/messages',
    notifications: 'GET /api/parent/notifications',
    invoicePdf: 'GET /api/invoices/:id/download-pdf',
    receiptPdf: 'GET /api/invoices/:id/receipt-pdf',
    paymentLink: 'GET /api/invoices/:id/payment-link',
    payments: 'GET /api/parent/payments?student_id=',
    contracts: 'GET /api/parent/contracts?student_id=',
    contractDetail: 'GET /api/parent/contracts/:id',
    contractSign: 'POST /api/parent/contracts/:id/sign',
    applications: 'GET /api/parent/applications?student_id=',
    documentSign: 'GET /api/parent/documents/sign?student_id=&path=',
    canteenWallet: 'GET /api/parent/canteen/wallet?student_id=',
    canteenTransactions: 'GET /api/parent/canteen/transactions?student_id=',
    canteenTopup: 'POST /api/parent/canteen/topup',
    storeProducts: 'GET /api/parent/store/products?category=',
    storeCategories: 'GET /api/parent/store/categories',
    storeSlots: 'GET /api/parent/store/products/:id/slots?date=YYYY-MM-DD',
    storeOrders: 'GET /api/parent/store/orders?student_id=',
    storeCheckout: 'POST /api/parent/store/orders',
  },
};

export function parentApiCatalog(_req: unknown, res: Response) {
  res.json(PARENT_API_CATALOG);
}

export const parentPortalRouter = Router();
parentPortalRouter.use(requireParent, attachParentScope);

function parentName(req: ParentRequest) {
  const p = req.parent.profile;
  return p.name || p.email || '';
}

function studentIdsOrError(req: ParentRequest, res: Response): string[] | null {
  const result = scopedStudentIds(req, req.query.student_id ? String(req.query.student_id) : undefined);
  if (!Array.isArray(result)) {
    res.status(result.status).json({ message: result.message });
    return null;
  }
  return result;
}

function mapStudent(row: Record<string, unknown>) {
  const grades = row.grades as { name_en?: string; name_ar?: string } | null;
  const sections = row.sections as { name?: string } | null;
  const allergens = Array.isArray(row.canteen_allergens)
    ? (row.canteen_allergens as string[])
    : [];
  return {
    id: row.id,
    student_id: row.student_id,
    name_en: row.name_en,
    name_ar: row.name_ar,
    status: row.status,
    grade: grades?.name_en || grades?.name_ar || '',
    section: sections?.name || '',
    canteen_allergens: allergens,
  };
}

const CANTEEN_ALLERGEN_KEYS = new Set(['nuts', 'dairy', 'gluten', 'eggs', 'soy', 'fish', 'shellfish']);

parentPortalRouter.get('/me', (req, res) => {
  const r = req as ParentRequest;
  res.json({
    id: r.user!.id,
    email: r.user!.email,
    name: parentName(r),
    tenant_id: r.parent.tenantId,
    role: 'parent',
    linked_student_ids: r.parent.linkedIds,
  });
});

parentPortalRouter.get('/children', async (req, res) => {
  const r = req as ParentRequest;
  if (r.parent.linkedIds.length === 0) return res.json({ data: [] });

  const { data, error } = await supabase
    .from('students')
    .select('id, name_en, name_ar, status, student_id, grade_id, section_id, canteen_allergens, grades(name_en, name_ar), sections(name)')
    .eq('tenant_id', r.parent.tenantId)
    .in('id', r.parent.linkedIds);

  if (error) return res.status(500).json({ message: 'Failed to load children' });
  return res.json({ data: (data ?? []).map((row) => mapStudent(row as Record<string, unknown>)) });
});

parentPortalRouter.patch('/children/:id/allergens', async (req, res) => {
  const r = req as unknown as ParentRequest;
  const studentId = String(req.params.id || '');
  if (!r.parent.linkedIds.includes(studentId)) {
    return res.status(403).json({ message: 'Student is not linked to this parent' });
  }
  const incoming = Array.isArray(req.body?.allergens) ? req.body.allergens : [];
  const allergens = incoming
    .map((value: unknown) => String(value || '').trim().toLowerCase())
    .filter((value: string) => CANTEEN_ALLERGEN_KEYS.has(value));

  const { data, error } = await supabase
    .from('students')
    .update({ canteen_allergens: allergens })
    .eq('tenant_id', r.parent.tenantId)
    .eq('id', studentId)
    .select('id, canteen_allergens')
    .single();

  if (error) return res.status(500).json({ message: 'Failed to save allergies' });
  return res.json({ data: { id: (data as { id: string }).id, canteen_allergens: (data as { canteen_allergens: string[] }).canteen_allergens || allergens } });
});

parentPortalRouter.get('/attendance', async (req, res) => {
  const r = req as ParentRequest;
  const ids = studentIdsOrError(r, res);
  if (!ids) return;
  if (ids.length === 0) return res.json({ data: [] });

  const { data, error } = await supabase
    .from('attendances')
    .select('id, student_id, date, status, notes, grade, section')
    .eq('tenant_id', r.parent.tenantId)
    .in('student_id', ids)
    .order('date', { ascending: false })
    .limit(365);

  if (error) return res.status(500).json({ message: 'Failed to load attendance' });
  return res.json({ data: data ?? [] });
});

parentPortalRouter.get('/invoices', async (req, res) => {
  const r = req as ParentRequest;
  const ids = studentIdsOrError(r, res);
  if (!ids) return;
  if (ids.length === 0) return res.json({ data: [] });

  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, student_id, student_name, date, issue_date, due_date, total_amount, paid_amount, status, academic_year, document_type, source')
    .eq('tenant_id', r.parent.tenantId)
    .in('student_id', ids)
    .order('due_date', { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ message: 'Failed to load invoices' });

  const rows = (data ?? []).filter((inv) => {
    const type = (inv as { document_type?: string }).document_type;
    return type == null || type === 'invoice';
  }).map((inv) => {
    const total = Number(inv.total_amount) || 0;
    const paid = Number(inv.paid_amount) || 0;
    return {
      ...inv,
      balance: Math.round((total - paid) * 100) / 100,
      payment_link: `/api/invoices/${inv.id}/payment-link`,
      pdf: `/api/invoices/${inv.id}/download-pdf`,
      receipt_pdf: `/api/invoices/${inv.id}/receipt-pdf`,
    };
  });

  return res.json({ data: rows });
});

parentPortalRouter.get('/grades', async (req, res) => {
  const r = req as ParentRequest;
  const ids = studentIdsOrError(r, res);
  if (!ids) return;
  if (ids.length === 0) return res.json({ data: [] });

  const { data, error } = await supabase
    .from('student_grades')
    .select('id, student_id, subject, subject_ar, score, max_score, assessment_name, assessment_name_ar, term, teacher_notes, created_at')
    .eq('tenant_id', r.parent.tenantId)
    .in('student_id', ids)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ message: 'Failed to load grades' });
  return res.json({ data: data ?? [] });
});

parentPortalRouter.get('/homework', async (req, res) => {
  const r = req as ParentRequest;
  const ids = studentIdsOrError(r, res);
  if (!ids) return;
  if (ids.length === 0) return res.json({ data: [] });

  const { data, error } = await supabase
    .from('homework_assignments')
    .select('id, student_id, title_en, title_ar, subject, subject_ar, teacher_name, due_date, status, created_at')
    .eq('tenant_id', r.parent.tenantId)
    .in('student_id', ids)
    .order('due_date', { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ message: 'Failed to load homework' });
  return res.json({ data: data ?? [] });
});

parentPortalRouter.get('/announcements', async (req, res) => {
  const r = req as ParentRequest;
  const parentAudience = new Set(['all', 'parents', 'parent', 'guardians', null, undefined, '']);

  const { data: published } = await supabase
    .from('announcements')
    .select('id, title_en, title_ar, body_en, body_ar, audience, priority, status, scheduled_date, created_at')
    .eq('tenant_id', r.parent.tenantId)
    .order('scheduled_date', { ascending: false })
    .limit(30);

  const rows = (published ?? []).filter((a) =>
    (a.status == null || a.status === 'published') && parentAudience.has(a.audience as string | null | undefined)
  );

  if (rows.length > 0) return res.json({ data: rows });

  const { data: comms } = await supabase
    .from('communications')
    .select('id, subject, body, status, sent_at, created_at, type')
    .eq('tenant_id', r.parent.tenantId)
    .order('created_at', { ascending: false })
    .limit(30);

  const mapped = (comms ?? [])
    .filter((c) => !c.status || c.status === 'sent' || c.status === 'published')
    .map((c) => ({
      id: c.id,
      title_en: c.subject,
      title_ar: c.subject,
      body_en: c.body,
      body_ar: c.body,
      audience: 'parents',
      priority: c.type === 'alert' ? 'high' : 'normal',
      status: 'published',
      scheduled_date: c.sent_at,
      created_at: c.created_at,
    }));

  return res.json({ data: mapped });
});

parentPortalRouter.get('/messages', async (req, res) => {
  const r = req as ParentRequest;
  const ids = studentIdsOrError(r, res);
  if (!ids) return;

  let query = supabase
    .from('messages')
    .select('id, student_id, from_user_email, from_user_name, from_user_role, to_user_email, subject, content, message_type, is_read, created_at')
    .eq('tenant_id', r.parent.tenantId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (ids.length > 0) {
    query = query.in('student_id', ids);
  } else if (r.user?.email) {
    query = query.eq('to_user_email', r.user.email);
  } else {
    return res.json({ data: [] });
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ message: 'Failed to load messages' });
  return res.json({ data: data ?? [] });
});

const SendMessageSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(4000),
  student_id: z.string().uuid().optional(),
});

parentPortalRouter.post('/messages', async (req, res) => {
  const r = req as ParentRequest;
  const parsed = SendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'subject and content are required' });
  }

  const target = parsed.data.student_id || r.parent.linkedIds[0];
  if (!target) {
    return res.status(400).json({ message: 'No students are linked to this account' });
  }
  if (!r.parent.linkedIds.includes(target)) {
    return res.status(403).json({ message: 'Not authorized for this student' });
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      tenant_id: r.parent.tenantId,
      student_id: target,
      from_user_email: r.user!.email,
      from_user_name: parentName(r),
      from_user_role: 'parent',
      to_user_email: 'office@edusaga.local',
      to_user_name: 'School Office',
      subject: parsed.data.subject,
      content: parsed.data.content,
      message_type: 'general',
      is_read: false,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ message: 'Could not send the message' });
  return res.status(201).json({ data });
});

parentPortalRouter.get('/notifications', async (req, res) => {
  const r = req as ParentRequest;
  const { data, error } = await supabase
    .from('notifications')
    .select('id, title, body, type, is_read, created_at')
    .eq('tenant_id', r.parent.tenantId)
    .eq('user_id', r.user!.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ message: 'Failed to load notifications' });
  return res.json({ data: data ?? [] });
});

parentPortalRouter.get('/summary', async (req, res) => {
  const r = req as ParentRequest;
  const ids = r.parent.linkedIds;
  if (ids.length === 0) {
    return res.json({
      children: 0,
      attendance_rate: null,
      outstanding_fees: 0,
      overdue_homework: 0,
      unread_notifications: 0,
    });
  }

  const [att, inv, hw, notes] = await Promise.all([
    supabase.from('attendances').select('status, student_id').eq('tenant_id', r.parent.tenantId).in('student_id', ids),
    supabase.from('invoices').select('total_amount, paid_amount, status, due_date, document_type').eq('tenant_id', r.parent.tenantId).in('student_id', ids),
    supabase.from('homework_assignments').select('status, due_date').eq('tenant_id', r.parent.tenantId).in('student_id', ids),
    supabase.from('notifications').select('id, is_read').eq('tenant_id', r.parent.tenantId).eq('user_id', r.user!.id),
  ]);

  const attendances = att.data ?? [];
  const presentish = attendances.filter((row) => row.status === 'present' || row.status === 'late' || row.status === 'excused').length;
  const attendanceRate = attendances.length ? Math.round((presentish / attendances.length) * 100) : null;

  const outstanding = (inv.data ?? []).reduce((sum, row) => {
    if (row.document_type && row.document_type !== 'invoice') return sum;
    if (row.status === 'cancelled' || row.status === 'paid') return sum;
    const total = Number(row.total_amount) || 0;
    const paid = Number(row.paid_amount) || 0;
    const balance = Math.round((total - paid) * 100) / 100;
    if (balance <= 0.01) return sum;
    return sum + balance;
  }, 0);

  const now = new Date();
  const overdueHomework = (hw.data ?? []).filter((row) => {
    if (row.status === 'submitted' || row.status === 'graded') return false;
    return Boolean(row.due_date && new Date(row.due_date as string) < now && (row.status === 'assigned' || !row.status));
  }).length;

  const unread = (notes.data ?? []).filter((row) => !row.is_read).length;

  return res.json({
    children: ids.length,
    attendance_rate: attendanceRate,
    outstanding_fees: Math.round(outstanding * 100) / 100,
    overdue_homework: overdueHomework,
    unread_notifications: unread,
  });
});

parentPortalRouter.get('/payments', async (req, res) => {
  const r = req as ParentRequest;
  const ids = studentIdsOrError(r, res);
  if (!ids) return;
  if (ids.length === 0) return res.json({ data: [] });

  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('id, invoice_number, student_id, student_name')
    .eq('tenant_id', r.parent.tenantId)
    .in('student_id', ids);
  if (invErr) return res.status(500).json({ message: 'Failed to load payments' });

  const invoiceIds = (invoices ?? []).map((row) => row.id as string);
  if (invoiceIds.length === 0) return res.json({ data: [] });

  const { data, error } = await supabase
    .from('payments')
    .select('id, invoice_id, amount, method, reference, date, status, created_at')
    .eq('tenant_id', r.parent.tenantId)
    .in('invoice_id', invoiceIds)
    .order('date', { ascending: false })
    .limit(100);
  if (error) return res.status(500).json({ message: 'Failed to load payments' });

  const invoiceMap = new Map((invoices ?? []).map((row) => [row.id as string, row]));
  const rows = (data ?? []).map((payment) => {
    const inv = invoiceMap.get(payment.invoice_id as string);
    return {
      ...payment,
      invoice_number: inv?.invoice_number || null,
      student_id: inv?.student_id || null,
      student_name: inv?.student_name || null,
    };
  });
  return res.json({ data: rows });
});

parentPortalRouter.get('/contracts', async (req, res) => {
  const r = req as ParentRequest;
  const ids = studentIdsOrError(r, res);
  if (!ids) return;
  if (ids.length === 0) return res.json({ data: [] });

  const { data, error } = await supabase
    .from('student_contracts')
    .select('id, student_id, template_id, academic_year, status, signed_date, signed_at, created_at, contract_number, student_name, grade, net_amount, delivery_status')
    .eq('tenant_id', r.parent.tenantId)
    .in('student_id', ids)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return res.status(500).json({ message: 'Failed to load contracts' });

  const templateIds = [...new Set((data ?? []).map((row) => row.template_id).filter(Boolean))] as string[];
  let templateMap = new Map<string, { name_ar?: string; name_en?: string; name?: string; template_type?: string; type?: string }>();
  if (templateIds.length) {
    const { data: templates } = await supabase
      .from('contract_templates')
      .select('id, name, name_ar, name_en, type, template_type')
      .eq('tenant_id', r.parent.tenantId)
      .in('id', templateIds);
    templateMap = new Map((templates ?? []).map((tpl) => [tpl.id as string, tpl]));
  }

  const rows = (data ?? []).map((row) => {
    const tpl = row.template_id ? templateMap.get(row.template_id as string) : null;
    return {
      id: row.id,
      student_id: row.student_id,
      contract_number: row.contract_number,
      student_name: row.student_name,
      template_name: tpl?.name_en || tpl?.name_ar || tpl?.name || null,
      template_type: tpl?.template_type || tpl?.type || null,
      academic_year: row.academic_year,
      grade: row.grade,
      net_amount: row.net_amount,
      status: row.status,
      signed_at: row.signed_date || row.signed_at,
      delivery_status: row.delivery_status,
      created_at: row.created_at,
    };
  });
  return res.json({ data: rows });
});

parentPortalRouter.get('/contracts/:id', async (req, res) => {
  const r = req as unknown as ParentRequest;
  const { data: contract, error } = await supabase
    .from('student_contracts')
    .select('*')
    .eq('id', req.params.id)
    .eq('tenant_id', r.parent.tenantId)
    .maybeSingle();
  if (error || !contract) return res.status(404).json({ message: 'Contract not found' });
  if (!r.parent.linkedIds.includes(contract.student_id as string)) {
    return res.status(403).json({ message: 'Not authorized for this contract' });
  }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('name_en, name_ar, logo_url')
    .eq('id', r.parent.tenantId)
    .maybeSingle();

  return res.json({ data: contract, school: tenant });
});

const SignSchema = z.object({
  signer_typed_name: z.string().min(2).max(120),
  signature_drawn_data: z.string().min(32),
  agreement_accepted: z.literal(true),
});

parentPortalRouter.post('/contracts/:id/sign', async (req, res) => {
  const r = req as unknown as ParentRequest;
  const parsed = SignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: 'Drawn signature and typed full name are both required',
      details: parsed.error.flatten(),
    });
  }

  const { data: contract, error } = await supabase
    .from('student_contracts')
    .select('*')
    .eq('id', req.params.id)
    .eq('tenant_id', r.parent.tenantId)
    .maybeSingle();
  if (error || !contract) return res.status(404).json({ message: 'Contract not found' });
  if (!r.parent.linkedIds.includes(contract.student_id as string)) {
    return res.status(403).json({ message: 'Not authorized for this contract' });
  }
  if (contract.status === 'signed') {
    return res.status(409).json({ message: 'Contract already signed' });
  }

  const signedAt = new Date().toISOString();
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  const { error: updErr } = await supabase.from('student_contracts').update({
    status: 'signed',
    signed_by_guardian: true,
    signed_date: signedAt,
    signed_at: signedAt,
    signer_typed_name: parsed.data.signer_typed_name.trim(),
    signature_drawn_data: parsed.data.signature_drawn_data,
    signed_user_id: r.user!.id,
    signed_ip: ip || 'unknown',
    delivery_status: 'delivered',
  }).eq('id', contract.id).eq('tenant_id', r.parent.tenantId);

  if (updErr) return res.status(500).json({ message: updErr.message });

  // Assign tuition fee structures by branch + grade (no auto-invoice)
  const branchId = contract.branch_id as string | null;
  const grade = contract.grade as string | null;
  const academicYear = contract.academic_year as string | null;
  let feeIds: string[] = [];
  if (branchId && grade) {
    let q = supabase
      .from('fee_structures')
      .select('id')
      .eq('tenant_id', r.parent.tenantId)
      .eq('branch_id', branchId)
      .eq('grade', grade)
      .eq('is_active', true);
    if (academicYear) q = q.eq('academic_year', academicYear);
    const { data: fees } = await q;
    feeIds = (fees || []).map((f) => f.id as string);
    if (feeIds.length) {
      await supabase.from('student_contracts').update({
        fee_structure_ids: feeIds,
        tuition_assigned_at: signedAt,
      }).eq('id', contract.id);

      await supabase.from('students').update({
        status: 'active',
        grade,
        academic_year: academicYear,
      }).eq('id', contract.student_id).eq('tenant_id', r.parent.tenantId).then(() => {});
    }
  }

  // Auto-advance linked admission → enrolled
  let applicationId = contract.application_id as string | null;
  if (!applicationId && contract.student_id) {
    const { data: student } = await supabase
      .from('students')
      .select('application_id')
      .eq('id', contract.student_id)
      .eq('tenant_id', r.parent.tenantId)
      .maybeSingle();
    applicationId = (student?.application_id as string) || null;
  }
  if (applicationId) {
    const { data: app } = await supabase
      .from('applications')
      .select('id, status, pipeline_stage')
      .eq('id', applicationId)
      .eq('tenant_id', r.parent.tenantId)
      .maybeSingle();
    if (app) {
      await supabase.from('applications').update({
        status: 'enrolled',
        pipeline_stage: 'enrolled',
      }).eq('id', app.id);
      await supabase.from('application_stage_history').insert({
        tenant_id: r.parent.tenantId,
        application_id: app.id,
        from_status: app.status,
        to_status: 'enrolled',
        note: `Contract ${contract.contract_number || contract.id} signed by parent`,
        changed_by: r.user!.id,
        changed_by_name: parsed.data.signer_typed_name.trim(),
      }).then(() => {});
    }
  }

  await supabase.from('notifications').insert({
    tenant_id: r.parent.tenantId,
    type: 'contract_signed',
    title_ar: `تم توقيع العقد - ${contract.student_name}`,
    title_en: `Contract Signed - ${contract.student_name}`,
    body_ar: `وقّع ولي الأمر ${parsed.data.signer_typed_name} على عقد الطالب ${contract.student_name}`,
    body_en: `Guardian ${parsed.data.signer_typed_name} signed the contract for ${contract.student_name}`,
    reference_type: 'StudentContract',
    reference_id: contract.id,
    is_read: false,
    recipient_role: 'admin',
  }).then(() => {});

  return res.json({
    ok: true,
    signed_at: signedAt,
    tuition_fee_structure_ids: feeIds,
    application_enrolled: !!applicationId,
  });
});

parentPortalRouter.get('/applications', async (req, res) => {
  const r = req as ParentRequest;
  const ids = studentIdsOrError(r, res);
  if (!ids) return;
  if (ids.length === 0) return res.json({ data: [] });

  const studentId = req.query.student_id ? String(req.query.student_id) : ids[0];
  const application = await findApplicationForStudent({
    tenantId: r.parent.tenantId,
    studentId,
    parentEmail: r.user!.email || '',
  });
  if (!application) return res.json({ data: [] });

  return res.json({
    data: [{
      id: application.id,
      student_id: studentId,
      application_number: application.application_number,
      stage: application.stage || application.pipeline_stage,
      decision: application.decision,
      status: application.status,
      document_status: application.document_status,
      submitted_at: application.submitted_at || application.created_at,
      documents: mapAdmissionDocuments(application.documents),
      missing_documents: application.missing_documents || [],
    }],
  });
});

parentPortalRouter.get('/documents/sign', async (req, res) => {
  const r = req as ParentRequest;
  const studentId = String(req.query.student_id || '');
  const storagePath = String(req.query.path || '');
  if (!studentId || !storagePath) {
    return res.status(400).json({ message: 'student_id and path are required' });
  }
  if (!r.parent.linkedIds.includes(studentId)) {
    return res.status(403).json({ message: 'Not authorized for this student' });
  }

  try {
    const application = await findApplicationForStudent({
      tenantId: r.parent.tenantId,
      studentId,
      parentEmail: r.user!.email || '',
    });
    const docs = mapAdmissionDocuments(application?.documents);
    const allowed = docs.some((d) => d.storage_path === storagePath);
    if (!allowed && !storagePath.includes('/demo/')) {
      return res.status(403).json({ message: 'Not authorized for this document' });
    }
    const url = await signParentDocumentPath({
      tenantId: r.parent.tenantId,
      studentId,
      storagePath,
    });
    return res.json({ url });
  } catch (err) {
    return res.status(400).json({ message: (err as Error).message });
  }
});

parentPortalRouter.get('/canteen/wallet', async (req, res) => {
  const r = req as ParentRequest;
  const ids = studentIdsOrError(r, res);
  if (!ids) return;
  const studentId = req.query.student_id ? String(req.query.student_id) : ids[0];
  if (!studentId) return res.json({ data: null });

  const { data, error } = await supabase
    .from('canteen_wallets')
    .select('id, student_id, student_name, grade, balance, daily_spend_limit, is_active, last_transaction_at')
    .eq('tenant_id', r.parent.tenantId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (error) return res.status(500).json({ message: 'Failed to load wallet' });
  return res.json({
    data: data ?? {
      student_id: studentId,
      balance: 0,
      is_active: true,
    },
  });
});

parentPortalRouter.get('/canteen/transactions', async (req, res) => {
  const r = req as ParentRequest;
  const ids = studentIdsOrError(r, res);
  if (!ids) return;
  if (ids.length === 0) return res.json({ data: [] });

  let query = supabase
    .from('canteen_transactions')
    .select('id, student_id, student_name, transaction_type, amount, balance_before, balance_after, payment_method, transaction_date, transaction_time, created_at')
    .eq('tenant_id', r.parent.tenantId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (req.query.student_id) {
    query = query.eq('student_id', String(req.query.student_id));
  } else {
    query = query.in('student_id', ids);
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ message: 'Failed to load canteen transactions' });
  return res.json({ data: data ?? [] });
});

const TopupSchema = z.object({
  student_id: z.string().uuid(),
  amount: z.number().positive(),
});

parentPortalRouter.post('/canteen/topup', async (req, res) => {
  const r = req as ParentRequest;
  const parsed = TopupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: `Amount must be between ${MIN_TOPUP} and ${MAX_TOPUP}` });
  }
  if (!r.parent.linkedIds.includes(parsed.data.student_id)) {
    return res.status(403).json({ message: 'Not authorized for this student' });
  }

  try {
    const invoice = await createCanteenTopupInvoice({
      tenantId: r.parent.tenantId,
      studentId: parsed.data.student_id,
      amount: parsed.data.amount,
      parentEmail: r.user!.email || '',
      parentName: parentName(r),
    });
    return res.status(201).json({
      data: {
        invoice_id: invoice.id,
        amount: parsed.data.amount,
        payment_link: `/api/invoices/${invoice.id}/payment-link`,
      },
    });
  } catch (err) {
    return res.status(400).json({ message: (err as Error).message });
  }
});

parentPortalRouter.get('/store/categories', async (req, res) => {
  const r = req as ParentRequest;
  try {
    const data = await listStoreCategories(r.parent.tenantId);
    return res.json({ data });
  } catch {
    return res.status(500).json({ message: 'Failed to load store categories' });
  }
});

parentPortalRouter.get('/store/products', async (req, res) => {
  const r = req as ParentRequest;
  let query = supabase
    .from('store_products')
    .select('id, sku, name_en, name_ar, description_en, description_ar, category, fulfillment_mode, tax_code, price_purchase, price_rental, rental_unit, variants, stock_qty, collect_location, image_url, is_bookable')
    .eq('tenant_id', r.parent.tenantId)
    .eq('is_active', true)
    .order('name_en', { ascending: true });
  if (req.query.category) {
    query = query.eq('category', String(req.query.category));
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ message: 'Failed to load store products' });
  const rows = await Promise.all((data ?? []).map(async (row) => ({
    ...row,
    image_url: await resolveStoreProductImage(r.parent.tenantId, (row as { image_url?: string | null }).image_url),
  })));
  return res.json({ data: rows });
});

parentPortalRouter.get('/store/products/:id/slots', async (req, res) => {
  const r = req as unknown as ParentRequest;
  const date = String(req.query.date || '');
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid product' });
  try {
    const data = await listProductSlots({
      tenantId: r.parent.tenantId,
      productId: parsed.data,
      date,
    });
    return res.json({ data });
  } catch (err) {
    return res.status(400).json({ message: (err as Error).message });
  }
});

const StoreOrderSchema = z.object({
  student_id: z.string().uuid(),
  lines: z.array(z.object({
    product_id: z.string().uuid(),
    line_type: z.enum(['purchase', 'rental']),
    quantity: z.number().int().positive().max(99),
    variant_label: z.string().max(100).optional(),
    slot_start: z.string().min(10).max(50).optional(),
  })).min(1),
});

parentPortalRouter.post('/store/orders', async (req, res) => {
  const r = req as ParentRequest;
  const parsed = StoreOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid store order payload' });
  }
  if (!r.parent.linkedIds.includes(parsed.data.student_id)) {
    return res.status(403).json({ message: 'Not authorized for this student' });
  }

  try {
    const result = await createStoreOrder({
      tenantId: r.parent.tenantId,
      studentId: parsed.data.student_id,
      parentUserId: r.user!.id,
      parentEmail: r.user!.email || '',
      parentName: parentName(r),
      lines: parsed.data.lines,
    });
    return res.status(201).json({ data: result });
  } catch (err) {
    return res.status(400).json({ message: (err as Error).message });
  }
});

parentPortalRouter.get('/store/orders', async (req, res) => {
  const r = req as ParentRequest;
  const ids = studentIdsOrError(r, res);
  if (!ids) return;
  if (ids.length === 0) return res.json({ data: [] });

  let query = supabase
    .from('store_orders')
    .select('id, order_number, student_id, status, subtotal, vat_amount, total_amount, currency_code, collect_location, invoice_id, created_at, paid_at, collected_at, store_order_lines(id, product_name_en, product_name_ar, line_type, variant_label, quantity, unit_price, line_total, slot_start, slot_end)')
    .eq('tenant_id', r.parent.tenantId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (req.query.student_id) {
    query = query.eq('student_id', String(req.query.student_id));
  } else {
    query = query.in('student_id', ids);
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ message: 'Failed to load store orders' });

  const rows = (data ?? []).map((order) => ({
    ...order,
    payment_link: order.invoice_id ? `/api/invoices/${order.invoice_id}/payment-link` : null,
  }));
  return res.json({ data: rows });
});
