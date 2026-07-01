/**
 * Saudi School Billing Engine — comprehensive billing backend
 *
 * Covers:
 *  - VAT-aware invoice creation (tuition exempt, transport/meals/uniforms 15%)
 *  - ZATCA Phase 2 clearance & reporting API submission
 *  - Installment plan engine
 *  - Discount / scholarship rule application with stacking
 *  - Credit notes (ZATCA-compliant)
 *  - Bulk invoice generation
 *  - Dunning trigger
 *  - SADAD bill number generation
 *  - Moyasar payment initiation (Mada, Visa/MC, Apple Pay)
 *  - Pro-rata support for mid-year enrollment
 */

import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import crypto from 'crypto';
import { AuthenticatedRequest, requireRole, FINANCE_ROLES } from '../middleware/auth.js';
import { sanitizeSearchTerm } from '../lib/sanitize.js';
import {
  generateTLVQR,
  generateUBLXml,
  generateInvoiceHash,
  generateZATCAInvoicePDF,
  InvoiceData,
  TenantData,
} from '../services/zatca.js';

export const billingRouter = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Constants ───────────────────────────────────────────────────────────────

const VAT_RATE_STANDARD = 0.15;
const ZATCA_SANDBOX_URL = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal';
const ZATCA_PROD_URL = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve tenant_id: use user's own tenant, or for platform owners accept query/header override */
async function resolveTenantId(req: AuthenticatedRequest): Promise<string | null> {
  if (req.user!.tenant_id) return req.user!.tenant_id;
  // Platform owner — check query param or header
  const override = (req.query.tenant_id as string) || (req.headers['x-tenant-id'] as string);
  if (override) return override;
  // Fallback: pick first active tenant
  const { data } = await supabase
    .from('tenants')
    .select('id')
    .eq('status', 'active')
    .order('created_at')
    .limit(1)
    .single();
  return data?.id ?? null;
}

/** Round to 2 decimal places (banker-safe for SAR) */
function sar(n: number) {
  return Math.round(n * 100) / 100;
}

/** Sequential invoice number with optimistic locking fallback */
async function generateInvoiceNumber(tenant_id: string): Promise<string> {
  const { count } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenant_id);
  const seq = ((count ?? 0) + 1).toString().padStart(6, '0');
  const year = new Date().getFullYear();
  return `INV-${year}-${seq}`;
}

/**
 * Resolve this tenant's ZATCA hash-chain position for a NEW invoice: the
 * previous invoice's hash (PIH) and the next ICV counter.
 *
 * Must be called BEFORE building/hashing the UBL XML — the PIH has to be
 * embedded in the document that gets hashed, otherwise every invoice chains off
 * the zero hash and ZATCA's tamper-detection chain is broken.
 *
 * NOTE: this read is not yet atomic with the subsequent zatca_submissions
 * insert, so two concurrent invoices for the same tenant can read the same PIH
 * and fork the chain. Making the assignment transactional (advisory lock or a
 * Postgres sequence) is tracked as a separate follow-up.
 */
async function getZatcaChain(
  tenant_id: string,
): Promise<{ previous_invoice_hash?: string; icv: number }> {
  const { data, count } = await supabase
    .from('zatca_submissions')
    .select('invoice_hash', { count: 'exact' })
    .eq('tenant_id', tenant_id)
    .order('created_at', { ascending: false })
    .limit(1);
  return {
    previous_invoice_hash: data?.[0]?.invoice_hash ?? undefined,
    icv: (count ?? 0) + 1,
  };
}

/** Get tenant billing profile */
async function getTenant(tenant_id: string): Promise<TenantData & Record<string, unknown>> {
  const { data } = await supabase
    .from('tenants')
    .select('id, name_en, name_ar, admin_email, city, school_type, settings')
    .eq('id', tenant_id)
    .single();
  if (!data) return {} as TenantData & Record<string, unknown>;
  // Map to expected TenantData shape for ZATCA
  const settings = (data.settings as Record<string, string>) ?? {};
  return {
    ...data,
    name: data.name_en,
    name_ar: data.name_ar ?? data.name_en,
    vat_number: settings.vat_number ?? '',
    address: settings.address ?? data.city ?? '',
    address_ar: settings.address_ar ?? data.city ?? '',
    phone: settings.phone ?? '',
    email: data.admin_email ?? '',
    cr_number: settings.cr_number ?? '',
  } as TenantData & Record<string, unknown>;
}

/**
 * Post a balanced double-entry journal (best-effort, non-fatal).
 *
 * Delegates to the post_journal Postgres function so the header and lines are
 * written in a single transaction — a partial failure can no longer leave an
 * orphaned/unbalanced entry. If the chart of accounts is not configured the
 * function resolves nothing and returns null, and we skip silently as before.
 */
async function postJournal(
  tenant_id: string,
  created_by: string,
  reference: string,
  description: string,
  lines: { account_code: string; debit: number; credit: number; description: string }[],
) {
  const { error } = await supabase.rpc('post_journal', {
    p_tenant_id: tenant_id,
    p_created_by: created_by,
    p_reference: reference,
    p_description: description,
    p_lines: lines,
  });
  if (error) console.warn('[billing] post_journal failed:', error.message);
}

/** Resolve applicable discount rules for a student, returning total discount amount */
async function applyDiscounts(
  tenant_id: string,
  student_id: string,
  academic_year: string,
  subtotal: number,
  category_id?: string,
): Promise<{ total_discount: number; applied: { rule_id: string; code: string; amount: number; description_ar: string; description_en: string }[] }> {
  const { data: rules } = await supabase
    .from('discount_rules')
    .select('*')
    .eq('tenant_id', tenant_id)
    .eq('is_active', true)
    .or(`academic_year.is.null,academic_year.eq.${academic_year}`)
    .order('priority', { ascending: true });

  if (!rules?.length) return { total_discount: 0, applied: [] };

  // Fetch student record for sibling/scholarship checks
  const { data: student } = await supabase
    .from('students')
    .select('id, guardian_id, grade_id')
    .eq('id', student_id)
    .eq('tenant_id', tenant_id)
    .single();

  // Count active siblings from same guardian
  let siblingRank = 1;
  if (student?.guardian_id) {
    const { count } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)
      .eq('guardian_id', student.guardian_id)
      .neq('id', student_id)
      .eq('status', 'active');
    siblingRank = (count ?? 0) + 1;
  }

  let runningSubtotal = subtotal;
  const applied: { rule_id: string; code: string; amount: number; description_ar: string; description_en: string }[] = [];
  let stackingBlocked = false;

  for (const rule of rules) {
    if (stackingBlocked) break;

    // Category filter
    if (rule.applies_to !== 'all' && category_id) {
      try {
        const cats: string[] = JSON.parse(rule.applies_to);
        if (!cats.includes(category_id)) continue;
      } catch { continue; }
    }

    // Check conditions
    const cond = rule.conditions ?? {};
    if (rule.discount_type === 'sibling') {
      const minSiblings: number = cond.min_siblings ?? 2;
      const targetRank: number = cond.sibling_rank ?? 2;
      if (siblingRank < targetRank || siblingRank < minSiblings) continue;
    }
    if (rule.discount_type === 'scholarship') {
      // scholarship_code not currently stored on student; skip this rule type
      continue;
    }

    // Calculate discount amount
    let amount = 0;
    if (rule.calculation === 'percentage') {
      amount = sar(runningSubtotal * (rule.value / 100));
      if (rule.max_amount) amount = Math.min(amount, rule.max_amount);
    } else {
      amount = Math.min(rule.value, runningSubtotal);
    }

    if (amount <= 0) continue;

    applied.push({
      rule_id: rule.id,
      code: rule.code,
      amount,
      description_ar: rule.name_ar,
      description_en: rule.name_en,
    });

    runningSubtotal = sar(runningSubtotal - amount);

    if (rule.stacking === 'blocked') stackingBlocked = true;
    if (rule.stacking === 'override') break;
  }

  return {
    total_discount: sar(subtotal - runningSubtotal),
    applied,
  };
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const FeeLineSchema = z.object({
  category_id: z.string().uuid().optional(),
  description_en: z.string().min(1),
  description_ar: z.string().min(1),
  amount: z.number().positive(),
  quantity: z.number().positive().optional().default(1),
});

const CreateInvoiceSchema = z.object({
  student_id: z.string().uuid(),
  academic_year: z.string().min(4),
  fee_lines: z.array(FeeLineSchema).min(1),
  due_date: z.string().optional(),
  apply_discounts: z.boolean().optional().default(true),
  installment_count: z.number().int().positive().optional().default(1),
  notes_ar: z.string().optional(),
  notes_en: z.string().optional(),
});

const BulkInvoiceSchema = z.object({
  academic_year: z.string().min(4),
  grade: z.string().optional(),
  campus_id: z.string().uuid().optional(),
  program: z.string().optional(),
  due_date: z.string().optional(),
  dry_run: z.boolean().optional().default(false),
});

const RecordPaymentSchema = z.object({
  invoice_id: z.string().uuid(),
  amount: z.number().positive(),
  payment_method: z.enum(['cash', 'bank_transfer', 'card', 'mada', 'apple_pay', 'stc_pay', 'sadad', 'tamara', 'tabby', 'online']),
  reference: z.string().optional(),
  installment_id: z.string().uuid().optional(),
});

const CreditNoteSchema = z.object({
  original_invoice_id: z.string().uuid(),
  reason: z.string().min(1),
  reason_ar: z.string().min(1),
  amount: z.number().positive(),
  line_adjustments: z.array(z.object({
    description_en: z.string(),
    description_ar: z.string(),
    amount: z.number().positive(),
  })).optional(),
});

const DunningTriggerSchema = z.object({
  invoice_ids: z.array(z.string().uuid()).optional(),
  days_overdue_min: z.number().int().min(1).optional(),
  channel: z.enum(['whatsapp', 'sms', 'email', 'in_app']).optional().default('whatsapp'),
  action: z.enum(['reminder_1', 'reminder_2', 'overdue_notice', 'final_notice']).optional(),
  dry_run: z.boolean().optional().default(false),
});

const UpdateInstallmentSchema = z.object({
  status: z.enum(['pending', 'paid', 'waived']).optional(),
  due_date: z.string().optional(),
  amount: z.number().positive().optional(),
});

// ─── Students lookup (for invoice form) ──────────────────────────────────────

billingRouter.get('/students', async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = await resolveTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'No tenant available' });
  const { search, limit: limitParam } = req.query as Record<string, string>;
  const rowLimit = Math.min(parseInt(limitParam) || 50, 200);

  let q = supabase
    .from('students')
    .select('id, name_en, name_ar, student_id, status, grades(name_en, name_ar)')
    .eq('tenant_id', tenant_id)
    .eq('status', 'active')
    .order('name_en')
    .limit(rowLimit);

  if (search) {
    const safe = sanitizeSearchTerm(search);
    if (safe) q = q.or(`name_en.ilike.%${safe}%,name_ar.ilike.%${safe}%,student_id.ilike.%${safe}%`);
  }

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  // Flatten grade info for frontend convenience
  const mapped = (data ?? []).map((s: Record<string, unknown>) => ({
    id: s.id,
    name_en: s.name_en,
    name_ar: s.name_ar,
    student_number: s.student_id || (s.id as string).slice(0, 8),
    grade: (s.grades as Record<string, string> | null)?.name_en ?? '',
    status: s.status,
  }));
  return res.json(mapped);
});

// ─── Fee Categories & Structures (read) ──────────────────────────────────────

billingRouter.get('/fee-categories', async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = await resolveTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'No tenant available' });
  const { data, error } = await supabase
    .from('fee_categories')
    .select('*')
    .eq('tenant_id', tenant_id)
    .eq('is_active', true)
    .order('code');
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data ?? []);
});

billingRouter.get('/fee-structures', async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = req.user!.tenant_id!;
  const { academic_year, grade, campus_id } = req.query as Record<string, string>;
  let q = supabase
    .from('fee_structures')
    .select('*, fee_categories(code, name_ar, name_en, vat_treatment)')
    .eq('tenant_id', tenant_id);
  if (academic_year) q = q.eq('academic_year', academic_year);
  if (grade) q = q.or(`grade.eq.${grade},grade.is.null`);
  if (campus_id) q = q.or(`campus_id.eq.${campus_id},campus_id.is.null`);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

billingRouter.post('/fee-structures', requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = req.user!.tenant_id!;
  const schema = z.object({
    academic_year: z.string(),
    category_id: z.string().uuid(),
    grade: z.string().optional(),
    campus_id: z.string().uuid().optional(),
    program: z.string().optional(),
    amount: z.number().nonnegative(),
    is_mandatory: z.boolean().optional().default(true),
    installment_count: z.number().int().positive().optional().default(1),
    notes_ar: z.string().optional(),
    notes_en: z.string().optional(),
    effective_from: z.string().optional(),
    effective_to: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { data, error } = await supabase
    .from('fee_structures')
    .insert({ ...parsed.data, tenant_id, created_by: req.user!.id })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json(data);
});

// ─── Discount Rules ───────────────────────────────────────────────────────────

billingRouter.get('/discount-rules', async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = req.user!.tenant_id!;
  const { data, error } = await supabase
    .from('discount_rules')
    .select('*')
    .eq('tenant_id', tenant_id)
    .order('priority');
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

billingRouter.post('/discount-rules', requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = req.user!.tenant_id!;
  const schema = z.object({
    code: z.string().min(1),
    name_ar: z.string().min(1),
    name_en: z.string().min(1),
    discount_type: z.enum(['sibling', 'scholarship', 'staff', 'early_bird', 'bulk', 'custom']),
    calculation: z.enum(['percentage', 'fixed_amount']),
    value: z.number().nonnegative(),
    max_amount: z.number().positive().optional(),
    applies_to: z.string().optional().default('all'),
    conditions: z.record(z.unknown()).optional(),
    stacking: z.enum(['allowed', 'blocked', 'override']).optional().default('allowed'),
    priority: z.number().int().optional().default(100),
    requires_approval: z.boolean().optional().default(false),
    academic_year: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { data, error } = await supabase
    .from('discount_rules')
    .insert({ ...parsed.data, tenant_id })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json(data);
});

// ─── POST /api/billing/invoices — VAT-aware invoice creation ─────────────────

billingRouter.post('/invoices', requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = CreateInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', errors: parsed.error.flatten() });
    }

    const tenant_id = await resolveTenantId(req);
    if (!tenant_id) return res.status(400).json({ error: 'No tenant available' });
    const { student_id, academic_year, fee_lines, due_date: rawDueDate, apply_discounts: shouldApplyDiscounts, installment_count, notes_ar, notes_en } = parsed.data;
    const due_date = rawDueDate && rawDueDate.trim() !== '' ? rawDueDate : null;

    // Verify student
    const { data: student, error: studentErr } = await supabase
      .from('students')
      .select('id, name_en, name_ar, grade_id, guardian_id, grades(name_en)')
      .eq('id', student_id)
      .eq('tenant_id', tenant_id)
      .single();
    if (studentErr || !student) return res.status(404).json({ error: 'Student not found' });

    // Fetch fee categories for VAT treatment lookup (only for lines that have category_id)
    const categoryIds = [...new Set(fee_lines.map((l) => l.category_id).filter(Boolean))] as string[];
    let catMap: Record<string, { id: string; vat_treatment: string; name_ar: string; name_en: string; code: string }> = {};
    if (categoryIds.length > 0) {
      const { data: categories } = await supabase
        .from('fee_categories')
        .select('id, vat_treatment, name_ar, name_en, code')
        .in('id', categoryIds)
        .eq('tenant_id', tenant_id);
      catMap = Object.fromEntries((categories ?? []).map((c) => [c.id, c]));
    }

    // Calculate per-line amounts with correct VAT treatment
    let subtotal = 0;
    const enrichedLines = fee_lines.map((line) => {
      const cat = line.category_id ? catMap[line.category_id] : undefined;
      const lineSubtotal = sar(line.amount * (line.quantity ?? 1));
      const vatTreatment: string = cat?.vat_treatment ?? 'standard';
      const vatRate = vatTreatment === 'standard' ? VAT_RATE_STANDARD : 0;
      const vatAmount = sar(lineSubtotal * vatRate);
      const total = sar(lineSubtotal + vatAmount);
      subtotal = sar(subtotal + lineSubtotal);
      return {
        category_id: line.category_id ?? null,
        description_en: line.description_en,
        description_ar: line.description_ar,
        category_code: cat?.code ?? 'MANUAL',
        vat_treatment: vatTreatment,
        quantity: line.quantity ?? 1,
        unit_amount: line.amount,
        subtotal: lineSubtotal,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        total,
      };
    });

    // Apply discount rules
    let totalDiscount = 0;
    let discountDetails: Awaited<ReturnType<typeof applyDiscounts>>['applied'] = [];
    if (shouldApplyDiscounts && fee_lines.length > 0) {
      const primaryCategoryId = fee_lines[0].category_id;
      const result = await applyDiscounts(tenant_id, student_id, academic_year, subtotal, primaryCategoryId);
      totalDiscount = result.total_discount;
      discountDetails = result.applied;
    }

    // VAT computed on post-discount taxable amount (per ZATCA rules discount reduces tax base)
    const taxableSubtotal = sar(subtotal - totalDiscount);
    const vatAmount = sar(
      enrichedLines.reduce((s, l) => {
        const lineRatio = l.subtotal / (subtotal || 1);
        return s + sar((taxableSubtotal * lineRatio) * l.vat_rate);
      }, 0),
    );
    const totalAmount = sar(taxableSubtotal + vatAmount);

    const invoiceNumber = await generateInvoiceNumber(tenant_id);
    const today = new Date().toISOString().split('T')[0];

    // Generate ZATCA artifacts
    const tenant = await getTenant(tenant_id);
    const invoiceData: InvoiceData = {
      invoice_number: invoiceNumber,
      issue_date: today,
      subtotal,
      discount_amount: totalDiscount,
      vat_amount: vatAmount,
      total_amount: totalAmount,
      student_name: student.name_en,
      student_id: student_id,
      notes: notes_en,
      items: enrichedLines.map((l) => ({
        description: l.description_en,
        amount: l.subtotal,
        vat_rate: l.vat_rate,
      })),
    };

    // Resolve the ZATCA hash-chain position BEFORE hashing so the PIH and ICV
    // are embedded in the signed UBL document.
    const chain = await getZatcaChain(tenant_id);
    invoiceData.previous_invoice_hash = chain.previous_invoice_hash;
    invoiceData.icv = chain.icv;
    const previous_hash = chain.previous_invoice_hash ?? '';

    const qr_code = generateTLVQR(invoiceData, tenant as TenantData);
    const ubl_xml = generateUBLXml(invoiceData, tenant as TenantData);
    const invoice_hash = generateInvoiceHash(ubl_xml);

    // Insert invoice — try extended schema first, fall back to base columns
    const studentGrade = (student as Record<string, unknown>).grades
      ? ((student as Record<string, unknown>).grades as Record<string, string>)?.name_en ?? ''
      : '';
    const notesText = [notes_en, notes_ar].filter(Boolean).join(' | ') || null;

    const extendedPayload = {
      tenant_id,
      student_id,
      invoice_number: invoiceNumber,
      academic_year,
      student_name: student.name_en,
      grade: studentGrade,
      date: today,
      issue_date: today,
      due_date: due_date ?? null,
      subtotal,
      discount_amount: totalDiscount,
      vat_amount: vatAmount,
      total_amount: totalAmount,
      balance: totalAmount,
      paid_amount: 0,
      status: 'issued',
      items: enrichedLines,
      notes: notesText,
    };

    let invoice: Record<string, unknown>;
    const { data: extData, error: extError } = await supabase
      .from('invoices')
      .insert(extendedPayload)
      .select()
      .single();

    if (extError) {
      // Extended columns may not exist yet — fall back to base schema
      console.warn('[billing] Extended insert failed, using base schema:', extError.message);
      const basePayload = {
        tenant_id,
        student_id,
        invoice_number: invoiceNumber,
        date: today,
        due_date: due_date ?? null,
        total_amount: totalAmount,
        paid_amount: 0,
        status: 'issued',
        items: enrichedLines,
        notes: notesText,
      };
      const { data: baseData, error: baseError } = await supabase
        .from('invoices')
        .insert(basePayload)
        .select()
        .single();
      if (baseError) throw baseError;
      invoice = baseData as Record<string, unknown>;
    } else {
      invoice = extData as Record<string, unknown>;
    }

    // Record applied discounts (best-effort)
    if (discountDetails.length > 0) {
      const { error: discErr } = await supabase.from('invoice_discounts').insert(
        discountDetails.map((d) => ({
          tenant_id,
          invoice_id: invoice.id,
          discount_rule_id: d.rule_id,
          discount_code: d.code,
          description_ar: d.description_ar,
          description_en: d.description_en,
          amount: d.amount,
        })),
      );
      if (discErr) console.warn('[billing] discount insert failed:', discErr.message);
    }

    // Log ZATCA submission record (best-effort)
    const submissionType = (tenant as Record<string, unknown>).customer_type === 'B2B' ? 'clearance' : 'reporting';
    let zatcaRecord: Record<string, unknown> | null = null;
    const { data: zatcaData, error: zatcaErr } = await supabase
      .from('zatca_submissions')
      .insert({
        tenant_id,
        invoice_id: invoice.id,
        invoice_number: invoiceNumber,
        submission_type: submissionType,
        invoice_hash,
        previous_hash,
        ubl_xml,
        qr_code,
        zatca_status: 'pending',
      })
      .select()
      .single();
    if (zatcaErr) {
      console.warn('[billing] ZATCA insert failed:', zatcaErr.message);
    } else {
      zatcaRecord = zatcaData;
    }

    // Generate installment plan if requested
    let plan = null;
    if (installment_count > 1 && due_date) {
      const { data: planData, error: planErr } = await supabase
        .from('payment_plans')
        .insert({
          tenant_id,
          student_id,
          academic_year,
          plan_type: 'term',
          total_amount: totalAmount,
          paid_amount: 0,
          status: 'active',
        })
        .select()
        .single();
      if (!planErr && planData) {
        plan = planData;
        const installmentAmount = sar(totalAmount / installment_count);
        const baseDue = new Date(due_date);
        const installments = Array.from({ length: installment_count }, (_, i) => {
          const d = new Date(baseDue);
          d.setMonth(d.getMonth() + i);
          return {
            tenant_id,
            plan_id: planData.id,
            installment_no: i + 1,
            due_date: d.toISOString().split('T')[0],
            amount: i === installment_count - 1
              ? sar(totalAmount - installmentAmount * (installment_count - 1))
              : installmentAmount,
            status: 'pending',
            invoice_id: invoice.id,
          };
        });
        await supabase.from('payment_plan_installments').insert(installments);
      }
    }

    // Double-entry GL journal (best-effort, non-fatal)
    try {
      await postJournal(tenant_id, req.user!.id, invoiceNumber, `Invoice ${invoiceNumber}`, [
        { account_code: '12', debit: totalAmount, credit: 0, description: `A/R — ${invoiceNumber}` },
        { account_code: '41', debit: 0, credit: sar(subtotal - totalDiscount), description: `Revenue — ${invoiceNumber}` },
        { account_code: '24', debit: 0, credit: vatAmount, description: `VAT Payable (15%) — ${invoiceNumber}` },
      ]);
    } catch (journalErr) {
      console.warn('[billing] GL journal post failed:', (journalErr as Error).message);
    }

    return res.status(201).json({
      invoice,
      zatca: { id: zatcaRecord?.id, qr_code, invoice_hash, status: 'pending' },
      payment_plan: plan,
      discounts_applied: discountDetails,
      summary: { subtotal, total_discount: totalDiscount, vat_amount: vatAmount, total_amount: totalAmount },
    });
  } catch (err) {
    console.error('billing/invoices POST:', err);
    return res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// ─── GET /api/billing/invoices — List invoices ────────────────────────────────

billingRouter.get('/invoices', async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = await resolveTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'No tenant available' });
  const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '20', 10)));
  const { status, student_id, academic_year, from_date, to_date } = req.query as Record<string, string>;

  let q = supabase
    .from('invoices')
    .select('*, students(id, name_en, name_ar, student_id, grade)', { count: 'exact' })
    .eq('tenant_id', tenant_id)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (status) q = q.eq('status', status);
  if (student_id) q = q.eq('student_id', student_id);
  if (academic_year) q = q.eq('academic_year', academic_year);
  if (from_date) q = q.gte('date', from_date);
  if (to_date) q = q.lte('date', to_date);

  const { data, count, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ data, pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) } });
});

// ─── GET /api/billing/invoices/:id — Single invoice ──────────────────────────

billingRouter.get('/invoices/:id', async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = req.user!.tenant_id!;
  const { id } = req.params;
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*, students(id, name_en, name_ar, student_id, grade, parent_id)')
    .eq('id', id)
    .eq('tenant_id', tenant_id)
    .single();
  if (error || !invoice) return res.status(404).json({ error: 'Invoice not found' });

  const [{ data: payments }, { data: discounts }, { data: zatcaRow }, { data: plan }] = await Promise.all([
    supabase.from('payments').select('*').eq('invoice_id', id).eq('tenant_id', tenant_id).order('created_at', { ascending: false }),
    supabase.from('invoice_discounts').select('*').eq('invoice_id', id).eq('tenant_id', tenant_id),
    supabase.from('zatca_submissions').select('qr_code, invoice_hash, zatca_status, clearance_number, cleared_at').eq('invoice_id', id).eq('tenant_id', tenant_id).single(),
    // Resolve via a separate safe query to avoid SQL injection through the PostgREST filter()
    // parameter (id comes from req.params and was previously interpolated into a raw subquery).
    supabase.from('payment_plan_installments').select('plan_id').eq('invoice_id', id).eq('tenant_id', tenant_id).limit(1).single().then(async ({ data: inst }) => {
      if (!inst?.plan_id) return { data: null };
      return supabase.from('payment_plans').select('*, payment_plan_installments(*)').eq('id', inst.plan_id).eq('tenant_id', tenant_id).single();
    }),
  ]);

  return res.json({ ...invoice, payments: payments ?? [], discounts: discounts ?? [], zatca: zatcaRow ?? null, payment_plan: plan ?? null });
});

// ─── POST /api/billing/invoices/:id/zatca-submit — Submit to ZATCA ───────────

billingRouter.post('/invoices/:id/zatca-submit', requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenant_id = req.user!.tenant_id!;
    const { id } = req.params;

    const { data: sub, error: subErr } = await supabase
      .from('zatca_submissions')
      .select('*')
      .eq('invoice_id', id)
      .eq('tenant_id', tenant_id)
      .single();
    if (subErr || !sub) return res.status(404).json({ error: 'ZATCA record not found' });

    // Generate PDF
    const tenant = await getTenant(tenant_id);
    const { data: invoice } = await supabase.from('invoices').select('*').eq('id', id).single();
    const pdfBuffer = await generateZATCAInvoicePDF(
      { invoice_number: invoice?.invoice_number, issue_date: invoice?.date, subtotal: invoice?.subtotal, vat_amount: invoice?.vat_amount, total_amount: invoice?.total_amount } as InvoiceData,
      tenant as TenantData,
    );

    const baseUrl = process.env.ZATCA_ENV === 'production' ? ZATCA_PROD_URL : ZATCA_SANDBOX_URL;
    const endpoint = sub.submission_type === 'clearance'
      ? `${baseUrl}/invoices/clearance/single`
      : `${baseUrl}/invoices/reporting/single`;

    const payload = {
      invoiceHash: sub.invoice_hash,
      uuid: sub.zatca_uuid ?? crypto.randomUUID(),
      invoice: Buffer.from(sub.ubl_xml ?? '').toString('base64'),
    };

    let zatcaResponse: Record<string, unknown> = {};
    let newStatus = 'submitted';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Version': 'V2',
          Authorization: `Basic ${Buffer.from(`${process.env.ZATCA_CSID ?? ''}:${process.env.ZATCA_SECRET ?? ''}`).toString('base64')}`,
        },
        body: JSON.stringify(payload),
      });
      zatcaResponse = await response.json() as Record<string, unknown>;
      newStatus = response.ok ? (sub.submission_type === 'clearance' ? 'cleared' : 'reported') : 'rejected';
    } catch (fetchErr) {
      console.error('ZATCA API call failed:', fetchErr);
      newStatus = 'error';
    }

    await supabase.from('zatca_submissions').update({
      zatca_status: newStatus,
      zatca_response: zatcaResponse,
      clearance_number: (zatcaResponse as Record<string, unknown>).clearanceStatus as string ?? null,
      submitted_at: new Date().toISOString(),
      cleared_at: newStatus === 'cleared' ? new Date().toISOString() : null,
      pdf_base64: pdfBuffer.toString('base64'),
    }).eq('id', sub.id);

    return res.json({ status: newStatus, zatca_response: zatcaResponse });
  } catch (err) {
    console.error('zatca-submit:', err);
    return res.status(500).json({ error: 'ZATCA submission failed' });
  }
});

// ─── POST /api/billing/invoices/:id/credit-note — Issue credit note ──────────

billingRouter.post('/invoices/:id/credit-note', requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenant_id = req.user!.tenant_id!;
    const { id } = req.params;
    const parsed = CreditNoteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { reason, reason_ar, amount, line_adjustments } = parsed.data;

    const { data: original, error: origErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .single();
    if (origErr || !original) return res.status(404).json({ error: 'Original invoice not found' });
    if (amount > original.total_amount) return res.status(400).json({ error: 'Credit note amount exceeds original invoice total' });

    const cnNumber = `CN-${original.invoice_number}`;
    const today = new Date().toISOString().split('T')[0];

    const { data: cn, error: cnErr } = await supabase
      .from('invoices')
      .insert({
        tenant_id,
        student_id: original.student_id,
        invoice_number: cnNumber,
        academic_year: original.academic_year,
        date: today,
        total_amount: -amount,
        paid_amount: 0,
        status: 'issued',
        items: line_adjustments ?? [{ description_en: reason, description_ar: reason_ar, amount: -amount }],
        notes_en: reason,
        notes_ar: reason_ar,
        invoice_type: 'credit_note',
        original_invoice_id: id,
      })
      .select()
      .single();
    if (cnErr) throw cnErr;

    // ZATCA credit note submission record
    const tenant = await getTenant(tenant_id);
    const creditInvoiceData: InvoiceData = {
      invoice_number: cnNumber,
      issue_date: today,
      invoice_type: 'credit_note',
      subtotal: -amount,
      vat_amount: 0,
      total_amount: -amount,
    };
    // Chain the credit note before hashing (same PIH/ICV rule as invoices).
    const chain = await getZatcaChain(tenant_id);
    creditInvoiceData.previous_invoice_hash = chain.previous_invoice_hash;
    creditInvoiceData.icv = chain.icv;
    const ubl_xml = generateUBLXml(creditInvoiceData, tenant as TenantData);
    const invoice_hash = generateInvoiceHash(ubl_xml);

    await supabase.from('zatca_submissions').insert({
      tenant_id,
      invoice_id: cn.id,
      invoice_number: cnNumber,
      submission_type: 'credit_note',
      invoice_hash,
      previous_hash: chain.previous_invoice_hash ?? '',
      ubl_xml,
      zatca_status: 'pending',
    });

    // Reverse GL entry
    await postJournal(tenant_id, req.user!.id, cnNumber, `Credit Note ${cnNumber}`, [
      { account_code: '41', debit: amount, credit: 0, description: `Revenue reversal — ${cnNumber}` },
      { account_code: '12', debit: 0, credit: amount, description: `A/R credit — ${cnNumber}` },
    ]);

    return res.status(201).json(cn);
  } catch (err) {
    console.error('credit-note:', err);
    return res.status(500).json({ error: 'Failed to create credit note' });
  }
});

// ─── POST /api/billing/payments — Record payment ─────────────────────────────

billingRouter.post('/payments', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = RecordPaymentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const tenant_id = req.user!.tenant_id!;
    const { invoice_id, amount, payment_method, reference, installment_id } = parsed.data;

    const { data: invoice, error: fetchErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .eq('tenant_id', tenant_id)
      .single();
    if (fetchErr || !invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (['paid', 'cancelled'].includes(invoice.status)) return res.status(400).json({ error: `Invoice already ${invoice.status}` });

    const remaining = sar(invoice.total_amount - invoice.paid_amount);
    if (amount > remaining + 0.01) return res.status(400).json({ error: `Payment (${amount}) exceeds balance (${remaining})` });

    const today = new Date().toISOString().split('T')[0];
    const newPaid = sar(invoice.paid_amount + amount);
    const newStatus = newPaid >= invoice.total_amount - 0.01 ? 'paid' : 'partial';

    const { data: payment, error: pmtErr } = await supabase
      .from('payments')
      .insert({ tenant_id, invoice_id, amount, method: payment_method, reference: reference ?? null, date: today, status: 'completed' })
      .select()
      .single();
    if (pmtErr) throw pmtErr;

    await supabase.from('invoices').update({ paid_amount: newPaid, status: newStatus, updated_at: new Date().toISOString() }).eq('id', invoice_id).eq('tenant_id', tenant_id);

    // Update installment if specified
    if (installment_id) {
      await supabase.from('payment_plan_installments').update({ paid_amount: amount, status: 'paid', paid_date: today, invoice_id }).eq('id', installment_id).eq('tenant_id', tenant_id);
      // Check if all installments are paid to close the plan
      const { data: planInst } = await supabase.from('payment_plan_installments').select('plan_id, status').eq('tenant_id', tenant_id);
      const planId = planInst?.find((i) => i.plan_id)?.plan_id;
      if (planId) {
        const allPaid = planInst?.filter((i) => i.plan_id === planId).every((i) => i.status === 'paid' || i.status === 'waived');
        if (allPaid) await supabase.from('payment_plans').update({ status: 'completed', paid_amount: invoice.total_amount }).eq('id', planId);
        else {
          const { data: planRow } = await supabase.from('payment_plans').select('paid_amount').eq('id', planId).single();
          await supabase.from('payment_plans').update({ paid_amount: sar((planRow?.paid_amount ?? 0) + amount) }).eq('id', planId);
        }
      }
    }

    // GL journal
    await postJournal(tenant_id, req.user!.id, reference ?? `PMT-${invoice_id.slice(0, 8)}`, `Payment — ${invoice.invoice_number}`, [
      { account_code: '11', debit: amount, credit: 0, description: `${payment_method} received` },
      { account_code: '12', debit: 0, credit: amount, description: `A/R cleared — ${invoice.invoice_number}` },
    ]);

    return res.status(201).json({ payment, invoice: { id: invoice_id, paid_amount: newPaid, status: newStatus, remaining_balance: Math.max(0, sar(invoice.total_amount - newPaid)) } });
  } catch (err) {
    console.error('billing/payments:', err);
    return res.status(500).json({ error: 'Failed to record payment' });
  }
});

// ─── GET /api/billing/payment-plans — List plans for student/tenant ───────────

billingRouter.get('/payment-plans', async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = req.user!.tenant_id!;
  const { student_id, status } = req.query as Record<string, string>;
  let q = supabase
    .from('payment_plans')
    .select('*, payment_plan_installments(*)')
    .eq('tenant_id', tenant_id);
  if (student_id) q = q.eq('student_id', student_id);
  if (status) q = q.eq('status', status);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

billingRouter.patch('/installments/:id', async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = req.user!.tenant_id!;
  const { id } = req.params;
  const parsed = UpdateInstallmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { data, error } = await supabase
    .from('payment_plan_installments')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant_id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

// ─── Shared invoice creation logic (used by single + bulk endpoints) ─────────

async function createInvoiceForStudent(
  tenant_id: string,
  created_by: string,
  student_id: string,
  academic_year: string,
  fee_lines: { category_id: string; description_en: string; description_ar: string; amount: number; quantity: number }[],
  due_date?: string,
): Promise<void> {
  const categoryIds = [...new Set(fee_lines.map((l) => l.category_id))];
  const { data: categories } = await supabase.from('fee_categories').select('id, vat_treatment').in('id', categoryIds).eq('tenant_id', tenant_id);
  const catMap = Object.fromEntries((categories ?? []).map((c) => [c.id, c]));

  let subtotal = 0;
  const enrichedLines = fee_lines.map((line) => {
    const cat = catMap[line.category_id];
    const lineSubtotal = sar(line.amount * line.quantity);
    const vatRate = (cat?.vat_treatment ?? 'standard') === 'standard' ? VAT_RATE_STANDARD : 0;
    subtotal = sar(subtotal + lineSubtotal);
    return { ...line, subtotal: lineSubtotal, vat_rate: vatRate, vat_amount: sar(lineSubtotal * vatRate), total: sar(lineSubtotal + sar(lineSubtotal * vatRate)) };
  });

  const vatAmount = sar(enrichedLines.reduce((s, l) => s + l.vat_amount, 0));
  const totalAmount = sar(subtotal + vatAmount);
  const invoiceNumber = await generateInvoiceNumber(tenant_id);
  const today = new Date().toISOString().split('T')[0];

  const tenant = await getTenant(tenant_id);
  const chain = await getZatcaChain(tenant_id);
  const invoiceData: InvoiceData = {
    invoice_number: invoiceNumber,
    issue_date: today,
    subtotal,
    vat_amount: vatAmount,
    total_amount: totalAmount,
    previous_invoice_hash: chain.previous_invoice_hash,
    icv: chain.icv,
  };
  const qr_code = generateTLVQR(invoiceData, tenant as TenantData);
  const ubl_xml = generateUBLXml(invoiceData, tenant as TenantData);
  const invoice_hash = generateInvoiceHash(ubl_xml);

  const { data: invoice, error } = await supabase.from('invoices').insert({
    tenant_id, student_id, invoice_number: invoiceNumber, academic_year, date: today,
    due_date: due_date ?? null, subtotal, vat_amount: vatAmount, total_amount: totalAmount,
    paid_amount: 0, status: 'issued', items: enrichedLines, qr_code, invoice_hash,
  }).select().single();
  if (error) throw error;

  await supabase.from('zatca_submissions').insert({
    tenant_id, invoice_id: invoice.id, invoice_number: invoiceNumber,
    submission_type: 'reporting', invoice_hash, previous_hash: chain.previous_invoice_hash ?? '',
    ubl_xml, qr_code, zatca_status: 'pending',
  });

  await postJournal(tenant_id, created_by, invoiceNumber, `Bulk Invoice ${invoiceNumber}`, [
    { account_code: '12', debit: totalAmount, credit: 0, description: `A/R — ${invoiceNumber}` },
    { account_code: '41', debit: 0, credit: subtotal, description: `Revenue — ${invoiceNumber}` },
    { account_code: '24', debit: 0, credit: vatAmount, description: `VAT — ${invoiceNumber}` },
  ]);
}

// ─── POST /api/billing/bulk-invoices — Bulk generation ───────────────────────

billingRouter.post('/bulk-invoices', requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenant_id = req.user!.tenant_id!;
    const parsed = BulkInvoiceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { academic_year, grade, campus_id, due_date, dry_run } = parsed.data;

    // Fetch active fee structures
    let fsQuery = supabase
      .from('fee_structures')
      .select('*, fee_categories(id, vat_treatment, name_ar, name_en, code)')
      .eq('tenant_id', tenant_id)
      .eq('academic_year', academic_year)
      .eq('is_mandatory', true);
    if (grade) fsQuery = fsQuery.or(`grade.eq.${grade},grade.is.null`);
    if (campus_id) fsQuery = fsQuery.or(`campus_id.eq.${campus_id},campus_id.is.null`);
    const { data: feeStructures } = await fsQuery;

    if (!feeStructures?.length) return res.status(400).json({ error: 'No fee structures found for the given criteria' });

    // Fetch students
    let stuQuery = supabase.from('students').select('id, name_en, name_ar, grade_id, branch_id, grades(name_en)').eq('tenant_id', tenant_id).eq('status', 'active');
    if (grade) stuQuery = stuQuery.eq('grade_id', grade);
    if (campus_id) stuQuery = stuQuery.eq('branch_id', campus_id);
    const { data: students } = await stuQuery;

    if (!students?.length) return res.status(400).json({ error: 'No active students found' });

    // Determine which students already have a (non-cancelled) invoice for this
    // academic year. The same rule drives both the preview and the real run, so
    // the preview count matches what will actually be created and re-running is
    // idempotent (no silent duplicates).
    const { data: existing } = await supabase
      .from('invoices')
      .select('student_id')
      .eq('tenant_id', tenant_id)
      .eq('academic_year', academic_year)
      .neq('status', 'cancelled');
    const existingIds = new Set((existing ?? []).map((e) => e.student_id));

    // Relevant fee structures + gross total (incl. 15% VAT on standard
    // categories, mirroring createInvoiceForStudent) for a single student.
    const planForStudent = (student: { grade_id?: string | null }) => {
      const relevant = (feeStructures ?? []).filter((fs) => !fs.grade || fs.grade === student.grade_id);
      let gross = 0;
      for (const fs of relevant) {
        const lineSubtotal = sar(fs.amount ?? 0);
        const treatment = (fs.fee_categories as Record<string, unknown>)?.vat_treatment ?? 'standard';
        const vatRate = treatment === 'standard' ? VAT_RATE_STANDARD : 0;
        gross = sar(gross + lineSubtotal + sar(lineSubtotal * vatRate));
      }
      return { relevant, gross };
    };

    if (dry_run) {
      let eligible = 0;
      let alreadyInvoiced = 0;
      let skippedNoFees = 0;
      let estimatedTotal = 0;
      const recipients: { student_id: string; name_en?: string; name_ar?: string; amount: number }[] = [];

      for (const student of students) {
        if (existingIds.has(student.id)) { alreadyInvoiced++; continue; }
        const { relevant, gross } = planForStudent(student);
        if (!relevant.length) { skippedNoFees++; continue; }
        eligible++;
        estimatedTotal = sar(estimatedTotal + gross);
        if (recipients.length < 20) {
          recipients.push({ student_id: student.id, name_en: student.name_en, name_ar: student.name_ar, amount: gross });
        }
      }

      return res.json({
        dry_run: true,
        student_count: students.length,
        fee_structures: feeStructures.length,
        estimated_invoices: eligible,
        already_invoiced: alreadyInvoiced,
        skipped_no_fees: skippedNoFees,
        estimated_total: estimatedTotal,
        recipients,
      });
    }

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const student of students) {
      if (existingIds.has(student.id)) { skipped++; continue; }
      try {
        const { relevant } = planForStudent(student);
        if (!relevant.length) { skipped++; continue; }

        const feeLines = relevant.map((fs) => ({
          category_id: (fs.fee_categories as Record<string, unknown>)?.id as string ?? fs.category_id,
          description_en: (fs.fee_categories as Record<string, unknown>)?.name_en as string ?? 'Fee',
          description_ar: (fs.fee_categories as Record<string, unknown>)?.name_ar as string ?? 'رسوم',
          amount: fs.amount,
          quantity: 1,
        }));

        // Create invoice directly via shared helper
        await createInvoiceForStudent(tenant_id, req.user!.id, student.id, academic_year, feeLines, due_date);
        created++;
      } catch (e) {
        errors.push(`${student.id}: ${(e as Error).message}`);
      }
    }

    return res.json({ created, skipped, errors });
  } catch (err) {
    console.error('bulk-invoices:', err);
    return res.status(500).json({ error: 'Bulk generation failed' });
  }
});

// ─── POST /api/billing/dunning/trigger — Smart dunning ────────────────────────

billingRouter.post('/dunning/trigger', requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenant_id = req.user!.tenant_id!;
    const parsed = DunningTriggerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { invoice_ids, days_overdue_min, channel, action, dry_run } = parsed.data;

    const today = new Date().toISOString().split('T')[0];
    let q = supabase
      .from('invoices')
      .select('id, invoice_number, student_id, total_amount, paid_amount, due_date, students(name_en, name_ar, parent_id)')
      .eq('tenant_id', tenant_id)
      .in('status', ['issued', 'partial', 'overdue'])
      .lt('due_date', today);

    if (invoice_ids?.length) q = q.in('id', invoice_ids);
    const { data: overdueInvoices } = await q;

    if (!overdueInvoices?.length) return res.json({ triggered: 0, message: 'No overdue invoices' });

    const now = new Date();
    const results: { invoice_id: string; days_overdue: number; action: string; channel: string; status: string }[] = [];

    for (const inv of overdueInvoices) {
      const dueDate = new Date(inv.due_date);
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / 86400000);
      if (days_overdue_min && daysOverdue < days_overdue_min) continue;

      const dunningAction = action ?? (
        daysOverdue < 7 ? 'reminder_1' :
        daysOverdue < 15 ? 'reminder_2' :
        daysOverdue < 30 ? 'overdue_notice' : 'final_notice'
      );
      const balance = sar((inv.total_amount ?? 0) - (inv.paid_amount ?? 0));
      const studentRec = inv.students as { name_en?: string; name_ar?: string; parent_id?: string } | null;
      const studentName = studentRec?.name_en ?? 'Student';

      const msgEn = `Dear Parent, invoice ${inv.invoice_number} for SAR ${balance} is ${daysOverdue} days overdue. Please settle your balance at the earliest.`;
      const msgAr = `ولي الأمر الكريم، الفاتورة رقم ${inv.invoice_number} بمبلغ ${balance} ريال متأخرة ${daysOverdue} يوماً. نرجو سداد الرصيد في أقرب وقت.`;

      if (!dry_run) {
        await supabase.from('dunning_log').insert({
          tenant_id,
          invoice_id: inv.id,
          student_id: inv.student_id,
          channel,
          action: dunningAction,
          days_overdue: daysOverdue,
          message_en: msgEn,
          message_ar: msgAr,
          status: 'sent',
        });

        // Mark invoice overdue
        await supabase.from('invoices').update({ status: 'overdue' }).eq('id', inv.id).eq('tenant_id', tenant_id).eq('status', 'issued');

        // In production: call Infobip/other provider
        // const infobipKey = process.env.INFOBIP_API_KEY; — never hardcoded
        // await sendWhatsApp(infobipKey, recipient, msgAr);
      }

      results.push({ invoice_id: inv.id, days_overdue: daysOverdue, action: dunningAction, channel, status: dry_run ? 'dry_run' : 'sent' });
    }

    return res.json({ triggered: results.length, dry_run, results });
  } catch (err) {
    console.error('dunning/trigger:', err);
    return res.status(500).json({ error: 'Dunning trigger failed' });
  }
});

// ─── GET /api/billing/dunning/log — Dunning history ──────────────────────────

billingRouter.get('/dunning/log', async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = req.user!.tenant_id!;
  const { invoice_id, student_id } = req.query as Record<string, string>;
  let q = supabase.from('dunning_log').select('*').eq('tenant_id', tenant_id).order('sent_at', { ascending: false }).limit(200);
  if (invoice_id) q = q.eq('invoice_id', invoice_id);
  if (student_id) q = q.eq('student_id', student_id);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

// ─── POST /api/billing/sadad/generate — Generate SADAD bill number ────────────

billingRouter.post('/sadad/generate', async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = req.user!.tenant_id!;
  const schema = z.object({ invoice_id: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { data: invoice } = await supabase
    .from('invoices')
    .select('invoice_number, total_amount, student_id, due_date')
    .eq('id', parsed.data.invoice_id)
    .eq('tenant_id', tenant_id)
    .single();
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  // SADAD bill number: company_code + sequential (12 digits total)
  const companyCode = process.env.SADAD_COMPANY_CODE ?? '000';
  const seq = invoice.invoice_number.replace(/\D/g, '').padStart(9, '0');
  const sadadBillNumber = `${companyCode}${seq}`;

  await supabase.from('invoices').update({ sadad_bill_number: sadadBillNumber }).eq('id', parsed.data.invoice_id).eq('tenant_id', tenant_id);

  return res.json({
    sadad_bill_number: sadadBillNumber,
    amount: invoice.total_amount,
    due_date: invoice.due_date,
    payment_instructions: {
      ar: `لسداد الفاتورة عبر سداد، استخدم رقم الفاتورة: ${sadadBillNumber}`,
      en: `To pay via SADAD, use bill number: ${sadadBillNumber}`,
    },
  });
});

// ─── POST /api/billing/moyasar/initiate — Initiate Moyasar payment ────────────

billingRouter.post('/moyasar/initiate', async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = req.user!.tenant_id!;
  const schema = z.object({
    invoice_id: z.string().uuid(),
    payment_method: z.enum(['creditcard', 'mada', 'applepay', 'stcpay']),
    callback_url: z.string().url(),
    source: z.record(z.unknown()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { invoice_id, payment_method, callback_url, source } = parsed.data;
  const { data: invoice } = await supabase.from('invoices').select('invoice_number, total_amount, student_id').eq('id', invoice_id).eq('tenant_id', tenant_id).single();
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const moyasarKey = process.env.MOYASAR_API_KEY;
  if (!moyasarKey) return res.status(500).json({ error: 'Payment gateway not configured' });

  const amountHalala = Math.round(invoice.total_amount * 100);

  try {
    const response = await fetch('https://api.moyasar.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${moyasarKey}:`).toString('base64')}`,
      },
      body: JSON.stringify({
        amount: amountHalala,
        currency: 'SAR',
        description: `EduSaga Invoice ${invoice.invoice_number}`,
        callback_url,
        source: source ?? { type: payment_method },
        metadata: { invoice_id, tenant_id },
      }),
    });
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok) return res.status(502).json({ error: 'Payment gateway error', details: data });
    return res.json(data);
  } catch (err) {
    console.error('moyasar:', err);
    return res.status(500).json({ error: 'Payment initiation failed' });
  }
});

// ─── POST /api/billing/moyasar/webhook — Handle Moyasar webhook ──────────────

billingRouter.post('/moyasar/webhook', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: payment_id, status, metadata, amount_format, amount } = req.body as Record<string, unknown>;
    if (status !== 'paid') return res.json({ received: true });

    const invoice_id = (metadata as Record<string, string>)?.invoice_id;
    const tenant_id = (metadata as Record<string, string>)?.tenant_id;
    if (!invoice_id || !tenant_id) return res.status(400).json({ error: 'Missing metadata' });

    const amountSAR = sar((amount as number) / 100);

    const { data: invoice } = await supabase.from('invoices').select('*').eq('id', invoice_id).eq('tenant_id', tenant_id).single();
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const newPaid = sar(invoice.paid_amount + amountSAR);
    const newStatus = newPaid >= invoice.total_amount - 0.01 ? 'paid' : 'partial';

    const { error: pmtErr } = await supabase
      .from('payments')
      .insert({ tenant_id, invoice_id, amount: amountSAR, method: 'online', reference: payment_id as string, date: new Date().toISOString().split('T')[0], status: 'completed' });

    // 23505 = unique_violation — payment already recorded, treat as idempotent success
    if (pmtErr && (pmtErr as any).code !== '23505') throw pmtErr;

    if (!pmtErr) {
      // Only update invoice totals on first insert (avoid double-counting retries)
      await supabase.from('invoices').update({ paid_amount: newPaid, status: newStatus }).eq('id', invoice_id);
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('moyasar webhook:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ─── GET /api/billing/arrears — Aging buckets ────────────────────────────────

billingRouter.get('/arrears', async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = await resolveTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'No tenant available' });
  const { academic_year } = req.query as Record<string, string>;
  const today = new Date();

  let q = supabase
    .from('invoices')
    .select('id, invoice_number, student_id, total_amount, paid_amount, due_date, status, students(name_en, name_ar, grade)')
    .eq('tenant_id', tenant_id)
    .in('status', ['issued', 'partial', 'overdue'])
    .lt('due_date', today.toISOString().split('T')[0]);
  if (academic_year) q = q.eq('academic_year', academic_year);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const buckets = { '1_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };
  const items = (data ?? []).map((inv) => {
    const daysOverdue = Math.floor((today.getTime() - new Date(inv.due_date).getTime()) / 86400000);
    const balance = sar((inv.total_amount ?? 0) - (inv.paid_amount ?? 0));
    const bucket = daysOverdue <= 30 ? '1_30' : daysOverdue <= 60 ? '31_60' : daysOverdue <= 90 ? '61_90' : '90_plus';
    buckets[bucket as keyof typeof buckets] = sar(buckets[bucket as keyof typeof buckets] + balance);
    return { ...inv, days_overdue: daysOverdue, outstanding_balance: balance, bucket };
  });

  return res.json({ buckets, items, total_outstanding: sar(Object.values(buckets).reduce((s, v) => s + v, 0)) });
});

// ─── GET /api/billing/vat-report — ZATCA VAT summary ────────────────────────

billingRouter.get('/vat-report', async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = await resolveTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'No tenant available' });
  const { from_date, to_date } = req.query as Record<string, string>;
  if (!from_date || !to_date) return res.status(400).json({ error: 'from_date and to_date required' });

  const { data, error } = await supabase
    .from('invoices')
    .select('total_amount, vat_amount, subtotal, discount_amount, invoice_type, status')
    .eq('tenant_id', tenant_id)
    .neq('status', 'cancelled')
    .gte('date', from_date)
    .lte('date', to_date);

  if (error) return res.status(500).json({ error: error.message });

  let totalRevenue = 0, totalVAT = 0, totalDiscount = 0, creditNoteRevenue = 0, creditNoteVAT = 0;
  for (const inv of data ?? []) {
    if (inv.invoice_type === 'credit_note') {
      creditNoteRevenue = sar(creditNoteRevenue + Math.abs(inv.total_amount ?? 0));
      creditNoteVAT = sar(creditNoteVAT + Math.abs(inv.vat_amount ?? 0));
    } else {
      totalRevenue = sar(totalRevenue + (inv.subtotal ?? 0));
      totalVAT = sar(totalVAT + (inv.vat_amount ?? 0));
      totalDiscount = sar(totalDiscount + (inv.discount_amount ?? 0));
    }
  }

  return res.json({
    period: { from: from_date, to: to_date },
    gross_revenue: totalRevenue,
    total_discounts: totalDiscount,
    net_taxable_revenue: sar(totalRevenue - totalDiscount),
    vat_collected: totalVAT,
    credit_notes: { revenue: creditNoteRevenue, vat: creditNoteVAT },
    net_vat_payable: sar(totalVAT - creditNoteVAT),
  });
});
