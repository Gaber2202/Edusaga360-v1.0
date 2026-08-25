/**
 * Staff contracts API — SCRUM-116–118
 * GET  /api/contracts/templates
 * POST /api/contracts/templates/seed-defaults
 * GET  /api/contracts/:id/pdf
 * POST /api/contracts/:id/share
 * POST /api/contracts/:id/generate-invoice  (staff-only, no auto on create)
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { AuthenticatedRequest, requireRole } from '../middleware/auth.js';
import { buildRequestContext, resolveJurisdiction } from '../lib/jurisdiction.js';
import { renderEnrollmentContractPdf } from '../services/contractPdf.js';
import { shareContractBothChannels } from '../services/contractShare.js';

export const contractsRouter = Router();

const PACK_DEFAULTS: Record<string, { name_en: string; name_ar: string; content_en: string; content_ar: string }> = {
  SA: {
    name_en: 'Standard Enrollment Contract (KSA)',
    name_ar: 'عقد التسجيل القياسي (السعودية)',
    content_en: '<h2>Student Enrollment & Tuition Contract (KSA)</h2><p>Contract {{contract_number}} — {{student_name}} / {{guardian_name}}. Fees: {{total_fees}}. Governed by Kingdom of Saudi Arabia applicable education regulations and PDPL.</p>',
    content_ar: '<h2>عقد التسجيل والرسوم الدراسية (السعودية)</h2><p>العقد {{contract_number}} — {{student_name}} / {{guardian_name}}. الرسوم: {{total_fees}}. يخضع لأنظمة التعليم في المملكة العربية السعودية ونظام حماية البيانات الشخصية.</p>',
  },
  AE: {
    name_en: 'Standard Enrollment Contract (UAE)',
    name_ar: 'عقد التسجيل القياسي (الإمارات)',
    content_en: '<h2>Student Enrollment & Tuition Contract (UAE)</h2><p>Contract {{contract_number}} — {{student_name}} / {{guardian_name}}. Fees: {{total_fees}}. Governed by applicable UAE education authority rules and PDPL-equivalent privacy obligations.</p>',
    content_ar: '<h2>عقد التسجيل والرسوم الدراسية (الإمارات)</h2><p>العقد {{contract_number}} — {{student_name}} / {{guardian_name}}. الرسوم: {{total_fees}}. يخضع لأنظمة الجهات التعليمية المختصة في دولة الإمارات.</p>',
  },
  QA: {
    name_en: 'Standard Enrollment Contract (Qatar)',
    name_ar: 'عقد التسجيل القياسي (قطر)',
    content_en: '<h2>Student Enrollment & Tuition Contract (Qatar)</h2><p>Contract {{contract_number}} — {{student_name}} / {{guardian_name}}. Fees: {{total_fees}}. Governed by State of Qatar Ministry of Education and Higher Education regulations.</p>',
    content_ar: '<h2>عقد التسجيل والرسوم الدراسية (قطر)</h2><p>العقد {{contract_number}} — {{student_name}} / {{guardian_name}}. الرسوم: {{total_fees}}. يخضع لأنظمة وزارة التربية والتعليم والتعليم العالي في دولة قطر.</p>',
  },
};

async function tenantJurisdiction(tenantId: string, branchId?: string | null): Promise<string> {
  const ctx = await buildRequestContext(supabase, tenantId, branchId || undefined);
  return resolveJurisdiction(ctx);
}

contractsRouter.get('/templates', requireRole(['admin', 'admissions', 'branch_manager', 'finance']), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id!;
  const jurisdiction = await tenantJurisdiction(tenantId, req.query.branch_id as string | undefined);

  const { data, error } = await supabase
    .from('contract_templates')
    .select('*')
    .eq('tenant_id', tenantId)
    .or(`jurisdiction_code.eq.${jurisdiction},jurisdiction_code.is.null`)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // Hide templates tagged for a different jurisdiction
  const filtered = (data || []).filter((t) => {
    const code = t.jurisdiction_code as string | null;
    return !code || code === jurisdiction;
  });

  return res.json({ jurisdiction, data: filtered });
});

contractsRouter.post('/templates/seed-defaults', requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id!;
  const jurisdiction = await tenantJurisdiction(tenantId);
  const pack = PACK_DEFAULTS[jurisdiction] || PACK_DEFAULTS.SA;

  const { data: existing } = await supabase
    .from('contract_templates')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('jurisdiction_code', jurisdiction)
    .eq('is_default', true)
    .limit(1);

  if (existing && existing.length > 0) {
    return res.json({ ok: true, seeded: false, message: 'Default already exists', jurisdiction });
  }

  const { data, error } = await supabase.from('contract_templates').insert({
    tenant_id: tenantId,
    jurisdiction_code: jurisdiction,
    source: 'platform',
    template_code: `TPL-${jurisdiction}-DEFAULT`,
    template_type: 'enrollment',
    name_en: pack.name_en,
    name_ar: pack.name_ar,
    content_en: pack.content_en,
    content_ar: pack.content_ar,
    version: '1.0',
    is_default: true,
    is_active: true,
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ ok: true, seeded: true, jurisdiction, template: data });
});

contractsRouter.get('/:id/pdf', requireRole(['admin', 'admissions', 'branch_manager', 'finance']), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id!;
  const { data: contract, error } = await supabase
    .from('student_contracts')
    .select('*')
    .eq('id', req.params.id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !contract) return res.status(404).json({ error: 'Contract not found' });

  const { data: tenant } = await supabase
    .from('tenants')
    .select('name_en, name_ar, logo_url, jurisdiction_code, localization')
    .eq('id', tenantId)
    .maybeSingle();

  const currency = (tenant?.localization as { currency_code?: string } | null)?.currency_code || 'SAR';
  const pdf = await renderEnrollmentContractPdf({
    schoolNameEn: tenant?.name_en,
    schoolNameAr: tenant?.name_ar,
    logoUrl: tenant?.logo_url,
    contractNumber: contract.contract_number,
    studentName: contract.student_name,
    guardianName: contract.guardian_name,
    academicYear: contract.academic_year,
    grade: contract.grade,
    netAmount: contract.net_amount,
    currencyCode: currency,
    contentEn: contract.generated_content_en,
    contentAr: contract.generated_content_ar,
    signerTypedName: contract.signer_typed_name,
    signedDate: contract.signed_date,
    jurisdictionCode: tenant?.jurisdiction_code,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="contract-${contract.contract_number || contract.id}.pdf"`);
  return res.send(pdf);
});

contractsRouter.post('/:id/share', requireRole(['admin', 'admissions', 'branch_manager']), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id!;
  const { data: contract, error } = await supabase
    .from('student_contracts')
    .select('*')
    .eq('id', req.params.id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !contract) return res.status(404).json({ error: 'Contract not found' });

  const { data: tenant } = await supabase
    .from('tenants')
    .select('name_en, name_ar, logo_url, jurisdiction_code')
    .eq('id', tenantId)
    .maybeSingle();

  const result = await shareContractBothChannels(supabase, {
    tenantId,
    contract,
    tenant: tenant || undefined,
    sentBy: req.user?.email || req.user?.id,
  });

  if (!result.bothSucceeded) {
    return res.status(502).json({
      error: 'both_channels_required',
      message: 'Email AND WhatsApp must both succeed',
      ...result,
    });
  }

  return res.json({ ok: true, ...result });
});

const InvoiceSchema = z.object({
  installment_index: z.number().int().min(0).default(0),
});

contractsRouter.post('/:id/generate-invoice', requireRole(['admin', 'finance', 'admissions']), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id!;
  const parsed = InvoiceSchema.safeParse(req.body || {});
  const installmentIndex = parsed.success ? parsed.data.installment_index : 0;

  const { data: contract, error } = await supabase
    .from('student_contracts')
    .select('*')
    .eq('id', req.params.id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !contract) return res.status(404).json({ error: 'Contract not found' });
  if (contract.status !== 'signed') {
    return res.status(400).json({ error: 'Contract must be signed before generating invoices' });
  }

  const schedule = Array.isArray(contract.payment_schedule) ? contract.payment_schedule as Array<{ due_date?: string; amount?: number }> : [];
  const installment = schedule[installmentIndex] || { amount: contract.net_amount, due_date: new Date().toISOString().slice(0, 10) };
  const services = Array.isArray(contract.services) ? contract.services as Array<{ service_name?: string; service_type?: string; net_amount?: number }> : [];

  const invoiceData = {
    tenant_id: tenantId,
    invoice_number: `INV-${Date.now().toString(36).toUpperCase()}`,
    student_id: contract.student_id,
    student_name: contract.student_name,
    contract_id: contract.id,
    branch_id: contract.branch_id,
    grade: contract.grade,
    academic_year: contract.academic_year,
    installment_number: installmentIndex + 1,
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: installment.due_date || new Date().toISOString().slice(0, 10),
    items: services.map((s) => ({
      description: s.service_name,
      description_ar: s.service_name,
      amount: (s.net_amount || 0) / Math.max(schedule.length, 1),
      fee_type: s.service_type,
    })),
    subtotal: installment.amount || contract.net_amount,
    total_amount: installment.amount || contract.net_amount,
    status: 'issued',
  };

  const { data: invoice, error: invErr } = await supabase.from('invoices').insert(invoiceData).select().single();
  if (invErr) return res.status(500).json({ error: invErr.message });
  return res.status(201).json({ ok: true, invoice });
});
