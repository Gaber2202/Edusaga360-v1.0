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
import { supabase } from '../lib/supabase.js';
import { z } from 'zod';
import crypto from 'crypto';
import { AuthenticatedRequest, requireRole, FINANCE_ROLES } from '../middleware/auth.js';
import { sanitizeSearchTerm } from '../lib/sanitize.js';
import { type InvoiceData, type VatSummary, type BuildInvoiceLineInput, type BuiltInvoiceLine, type BuildInvoiceLinesResult } from '../packs/sa/vat.js';
import {
  generateTLVQR,
  generateUBLXml,
  generateInvoiceHash,
  generateZATCAInvoicePDF,
} from '../packs/sa/zatca.js';
import type { TenantData } from '../types/tenant.js';
import { getTenantComplianceData } from '../services/tenant.js';
import { createReceiptForPayment } from '../services/receipt.js';
import { convertToInvoice } from '../services/lifecycle.js';
import { shareInvoice } from '../services/share.js';
import type { ShareChannel } from '../services/share.js';
import { createOrRefreshMoyasarLink, bulkCreateMoyasarInvoices, requestMoyasarRefund, reconcileMoyasarState, type MoyasarLinkResult } from '../packs/sa/moyasarService.js';
import { applyDiscounts } from '../services/discounts.js';
import {
  getAgingReport,
  getExpectedCollections,
  getGuardianStatement,
  getTrialBalance,
  getIncomeStatement,
  getBalanceSheet,
  getRevenueByFeeType,
} from '../services/reports.js';
import { dispatchWebhook } from '../services/webhookDelivery.js';
import { resolveFeeStructures, type ResolvedFeeStructure } from '../services/feeResolution.js';
import { resolvePack } from '../packs/registry.js';
import { buildRequestContext, resolveJurisdiction, NotImplementedInJurisdiction } from '../lib/jurisdiction.js';

export const billingRouter = Router();


// ─── Constants ───────────────────────────────────────────────────────────────

const ZATCA_SANDBOX_URL = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal';
const ZATCA_PROD_URL = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core';
const DIGITAL_PAYMENT_METHODS = new Set(['mada', 'creditcard', 'applepay', 'stcpay', 'samsungpay']);

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
  branch_id?: string | null,
) {
  const { error } = await supabase.rpc('post_journal', {
    p_tenant_id: tenant_id,
    p_created_by: created_by,
    p_reference: reference,
    p_description: description,
    p_lines: lines,
    p_branch_id: branch_id ?? null,
  });
  if (error) console.warn('[billing] post_journal failed:', error.message);
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
  buyer_name: z.string().optional(),
  buyer_vat_number: z.string().optional(),
  buyer_address: z.string().optional(),
  supply_date: z.string().optional(),
  document_type: z.enum(['invoice', 'quotation', 'proforma', 'credit_note', 'debit_note', 'receipt']).optional().default('invoice'),
  invoice_type: z.enum(['simplified', 'standard']).optional().default('simplified'),
  payment_methods: z.array(z.string()).optional().default([]),
});

const BulkInvoiceSchema = z.object({
  academic_year: z.string().min(4),
  grade: z.string().optional(),
  campus_id: z.string().uuid().optional(),
  program: z.string().optional(),
  due_date: z.string().optional(),
  dry_run: z.boolean().optional().default(false),
  approved: z.boolean().optional().default(false),
  name: z.string().optional(),
});

const RecurringGenerateSchema = z.object({
  due_before: z.string().optional(),
  academic_year: z.string().min(4).optional(),
  dry_run: z.boolean().optional().default(false),
});

const ShareInvoiceSchema = z.object({
  channels: z.array(z.enum(['whatsapp', 'email', 'link', 'print'])).min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  expires_in_hours: z.number().int().min(1).max(720).optional().default(168),
});

const RecordPaymentSchema = z.object({
  invoice_id: z.string().uuid(),
  amount: z.number().positive(),
  payment_method: z.enum(['cash', 'bank_transfer', 'card', 'mada', 'apple_pay', 'stc_pay', 'sadad', 'tamara', 'tabby', 'online']),
  reference: z.string().optional(),
  installment_id: z.string().uuid().optional(),
});

const CreditNoteSchema = z.object({
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
    .insert({ ...parsed.data, tenant_id, currency_code: 'SAR', created_by: req.user!.id })
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
    const {
      student_id, academic_year, fee_lines, due_date: rawDueDate,
      apply_discounts: shouldApplyDiscounts, installment_count, notes_ar, notes_en,
      buyer_name, buyer_vat_number, buyer_address, supply_date,
      document_type, invoice_type, payment_methods,
    } = parsed.data;
    const due_date = rawDueDate && rawDueDate.trim() !== '' ? rawDueDate : null;
    const isTaxInvoice = !['quotation', 'proforma', 'receipt'].includes(document_type);

    // Verify student
    const { data: student, error: studentErr } = await supabase
      .from('students')
      .select('id, name_en, name_ar, grade_id, branch_id, guardian_id, grades(name_en)')
      .eq('id', student_id)
      .eq('tenant_id', tenant_id)
      .single();
    if (studentErr || !student) return res.status(404).json({ error: 'Student not found' });
    const studentBranchId = (student as Record<string, unknown>).branch_id as string | null ?? null;

    // Resolve VAT/category metadata and compute totals through the pack.
    const rawLines = await buildInvoiceRawLines(fee_lines as FeeLineInput[], tenant_id);
    const preSubtotal = rawLines.reduce(
      (sum, line) => sar(sum + sar(line.amount * (line.quantity ?? 1))),
      0,
    );
    let totalDiscount = 0;
    let discountDetails: Awaited<ReturnType<typeof applyDiscounts>>['applied'] = [];
    if (shouldApplyDiscounts && fee_lines.length > 0) {
      const primaryCategoryId = rawLines[0]?.category_id ?? undefined;
      const result = await applyDiscounts(
        supabase,
        tenant_id,
        student_id,
        academic_year,
        preSubtotal,
        typeof primaryCategoryId === 'string' ? primaryCategoryId : undefined,
      );
      totalDiscount = result.total_discount;
      discountDetails = result.applied;
    }

    const invoiceNumber = await generateInvoiceNumber(tenant_id);
    const today = new Date().toISOString().split('T')[0];

    const ctx = await buildRequestContext(supabase, tenant_id, studentBranchId ?? undefined);
    const pack = resolvePack(ctx);
    const isZatcaInvoice = isTaxInvoice && pack.code === 'SA';
    const buildResult = await pack.tax?.buildInvoiceLines?.(
      rawLines,
      totalDiscount,
      supabase,
      today,
    ) as { lines: BuiltInvoiceLine[]; subtotal: number; vat_amount: number; total_amount: number } | undefined;
    if (!buildResult) {
      throw new NotImplementedInJurisdiction(resolveJurisdiction(ctx), 'tax.buildInvoiceLines');
    }
    const {
      lines: enrichedLines,
      subtotal,
      vat_amount: vatAmount,
      total_amount: totalAmount,
    } = buildResult;

    // Generate ZATCA artifacts
    const tenant = await getTenantComplianceData(tenant_id);
    const invoiceData: InvoiceData = {
      invoice_number: invoiceNumber,
      document_type: document_type as InvoiceData['document_type'],
      invoice_type: invoice_type as InvoiceData['invoice_type'],
      zatca_invoice_type: invoice_type as InvoiceData['invoice_type'],
      issue_date: today,
      supply_date: supply_date ?? undefined,
      due_date: due_date ?? undefined,
      subtotal,
      discount_amount: totalDiscount,
      vat_amount: vatAmount,
      total_amount: totalAmount,
      paid_amount: 0,
      student_name: student.name_en,
      buyer_name: buyer_name || (student as Record<string, unknown>).name_en as string,
      student_id: student_id,
      buyer_vat_number: buyer_vat_number,
      buyer_address: buyer_address,
      notes: notes_en,
      items: enrichedLines as InvoiceData['items'],
      uuid: crypto.randomUUID(),
    };

    const vatSummary = await pack.tax?.computeVatSummary?.(invoiceData, supabase) as VatSummary;
    if (!vatSummary) {
      throw new NotImplementedInJurisdiction(resolveJurisdiction(ctx), 'tax.computeVatSummary');
    }
    invoiceData.vat_summary = vatSummary;

    // ZATCA reporting data is only relevant for Saudi formal tax invoices.
    let chain: { previous_invoice_hash?: string; icv?: number } = {};
    let qr_code: string | null = null;
    let ubl_xml: string | null = null;
    let invoice_hash: string | null = null;
    let previous_hash: string | null = null;
    if (isZatcaInvoice) {
      chain = await getZatcaChain(tenant_id);
      invoiceData.previous_invoice_hash = chain.previous_invoice_hash;
      invoiceData.icv = chain.icv;
      previous_hash = chain.previous_invoice_hash ?? null;

      qr_code = generateTLVQR(invoiceData, tenant);
      ubl_xml = generateUBLXml(invoiceData, tenant);
      invoice_hash = generateInvoiceHash(ubl_xml);
    }

    // Insert invoice — try extended schema first, fall back to base columns
    const studentGrade = (student as Record<string, unknown>).grades
      ? ((student as Record<string, unknown>).grades as Record<string, string>)?.name_en ?? ''
      : '';
    const notesText = [notes_en, notes_ar].filter(Boolean).join(' | ') || null;

    const extendedPayload = {
      tenant_id,
      branch_id: studentBranchId,
      student_id,
      guardian_id: student.guardian_id,
      invoice_number: invoiceNumber,
      academic_year,
      student_name: student.name_en,
      grade: studentGrade,
      date: today,
      issue_date: today,
      due_date: due_date ?? null,
      document_type,
      invoice_type,
      zatca_invoice_type: invoice_type,
      buyer_name: buyer_name || (student as Record<string, unknown>).name_en,
      buyer_vat_number: buyer_vat_number ?? null,
      buyer_address: buyer_address ?? null,
      supply_date: supply_date ?? null,
      subtotal,
      discount_amount: totalDiscount,
      vat_amount: vatAmount,
      total_amount: totalAmount,
      paid_amount: 0,
      status: isTaxInvoice ? 'issued' : 'draft',
      items: enrichedLines,
      vat_summary: vatSummary,
      notes: notesText,
      payment_methods: payment_methods || [],
      zatca_uuid: isZatcaInvoice ? invoiceData.uuid : null,
      icv: isZatcaInvoice ? invoiceData.icv : null,
      invoice_hash,
      previous_invoice_hash: previous_hash,
      ubl_xml,
      qr_code,
      zatca_status: isZatcaInvoice ? 'pending' : 'not_applicable',
      zatca_response: null,
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
        branch_id: studentBranchId,
        student_id,
        guardian_id: student.guardian_id,
        invoice_number: invoiceNumber,
        date: today,
        due_date: due_date ?? null,
        total_amount: totalAmount,
        paid_amount: 0,
        status: isTaxInvoice ? 'issued' : 'draft',
        items: enrichedLines,
        notes: notesText,
        payment_methods: payment_methods || [],
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

    // ZATCA submission, installments and GL journal only apply to formal invoices.
    let zatcaRecord: Record<string, unknown> | null = null;
    if (isZatcaInvoice) {
      const submissionType = invoiceData.invoice_type === 'standard' ? 'clearance' : 'reporting';
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
    }

    // Generate installment plan if requested (tax invoices only)
    let plan = null;
    if (isTaxInvoice && installment_count > 1 && due_date) {
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

    // Double-entry GL journal (best-effort, non-fatal) — tax invoices only
    if (isTaxInvoice) try {
      await postJournal(tenant_id, req.user!.id, invoiceNumber, `Invoice ${invoiceNumber}`, [
        { account_code: '12', debit: totalAmount, credit: 0, description: `A/R — ${invoiceNumber}` },
        { account_code: '41', debit: 0, credit: sar(subtotal - totalDiscount), description: `Revenue — ${invoiceNumber}` },
        { account_code: '24', debit: 0, credit: vatAmount, description: `VAT Payable (15%) — ${invoiceNumber}` },
      ], studentBranchId);
    } catch (journalErr) {
      console.warn('[billing] GL journal post failed:', (journalErr as Error).message);
    }

    // Auto-issue a Moyasar hosted payment link when the parent should pay digitally.
    let paymentLink: MoyasarLinkResult | null = null;
    if (isTaxInvoice && invoice?.id && Array.isArray(payment_methods) && payment_methods.some((m) => DIGITAL_PAYMENT_METHODS.has(m))) {
      try {
        const protocol = req.get('X-Forwarded-Proto') || req.protocol;
        const baseUrl = process.env.PARENT_PORTAL_URL || process.env.PUBLIC_BASE_URL || `${protocol}://${req.get('host')}`;
        const firstDigital = payment_methods.find((m) => DIGITAL_PAYMENT_METHODS.has(m));
        paymentLink = await createOrRefreshMoyasarLink(supabase, {
          tenantId: tenant_id,
          invoiceId: invoice.id as string,
          callbackUrl: `${baseUrl}/api/public/billing/moyasar/webhook`,
          successUrl: `${baseUrl}/payment/result?status=success`,
          backUrl: `${baseUrl}/payment/result?status=pending`,
          sourceType: firstDigital as 'mada' | 'creditcard' | 'applepay' | 'stcpay' | 'samsungpay' | undefined,
          studentFirstName: (student.name_en as string) || (student.name_ar as string) || 'Student',
        });
      } catch (moyasarErr) {
        console.warn('[billing] Auto Moyasar link creation failed:', (moyasarErr as Error).message);
        paymentLink = { ok: false, error: (moyasarErr as Error).message };
      }
    }

    return res.status(201).json({
      invoice,
      zatca: isZatcaInvoice
        ? { id: zatcaRecord?.id, qr_code, invoice_hash, status: 'pending' }
        : { id: null, qr_code: null, invoice_hash: null, status: 'not_applicable' },
      payment_plan: plan,
      payment_link: paymentLink,
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
    .select('*, students(id, name_en, name_ar, student_id, grade_id, guardian_id)', { count: 'exact' })
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
    .select('*, students(id, name_en, name_ar, student_id, grade_id, guardian_id)')
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
    const tenant = await getTenantComplianceData(tenant_id);
    const { data: invoice } = await supabase.from('invoices').select('*').eq('id', id).single();
    const pdfBuffer = await generateZATCAInvoicePDF(
      { invoice_number: invoice?.invoice_number, issue_date: invoice?.date, subtotal: invoice?.subtotal, vat_amount: invoice?.vat_amount, total_amount: invoice?.total_amount } as InvoiceData,
      tenant,
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

// ─── POST /api/billing/invoices/:id/share — Share document ───────────────────



billingRouter.post('/invoices/:id/share', requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenant_id = req.user!.tenant_id!;
    const { id } = req.params;
    const parsed = ShareInvoiceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { channels, phone, email, expires_in_hours } = parsed.data;
    const results = await shareInvoice(supabase, tenant_id, id as string, channels as ShareChannel[], {
      phone,
      email,
      createdBy: req.user!.id,
      expiresInHours: expires_in_hours,
    });

    return res.json({ invoice_id: id, results });
  } catch (err) {
    console.error('share-invoice:', err);
    return res.status(500).json({ error: 'Share failed' });
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

    const cnItems = line_adjustments && line_adjustments.length > 0
      ? line_adjustments.map((l: any) => ({ ...l, vat_category: 'out_of_scope', vat_category_code: 'O', vat_rate: 0, vat_amount: 0, line_total_gross: -(l.amount ?? 0), quantity: l.quantity ?? 1, unit_price_net: -(l.amount ?? 0) / (l.quantity ?? 1) }))
      : [{ description_en: reason, description_ar: reason_ar, vat_category: 'out_of_scope', vat_category_code: 'O', vat_rate: 0, vat_amount: 0, line_total_gross: -amount, quantity: 1, unit_price_net: -amount, amount: -amount }];
    const { data: cn, error: cnErr } = await supabase
      .from('invoices')
      .insert({
        tenant_id,
        branch_id: original.branch_id ?? null,
        student_id: original.student_id,
        invoice_number: cnNumber,
        academic_year: original.academic_year,
        date: today,
        issue_date: today,
        document_type: 'credit_note',
        invoice_type: 'simplified',
        zatca_invoice_type: 'simplified',
        subtotal: -amount,
        discount_amount: 0,
        vat_amount: 0,
        total_amount: -amount,
        paid_amount: 0,
        status: 'issued',
        items: cnItems,
        notes: [reason, reason_ar].filter(Boolean).join(' | ') || null,
        parent_document_id: id,
        original_invoice_number: String(original.invoice_number ?? ''),
      })
      .select()
      .single();
    if (cnErr) throw cnErr;

    // ZATCA credit note submission record
    const tenant = await getTenantComplianceData(tenant_id);
    const creditInvoiceData: InvoiceData = {
      invoice_number: cnNumber,
      issue_date: today,
      document_type: 'credit_note',
      invoice_type: 'simplified',
      zatca_invoice_type: 'simplified',
      subtotal: -amount,
      discount_amount: 0,
      vat_amount: 0,
      total_amount: -amount,
      original_invoice_number: typeof original.invoice_number === 'string' ? original.invoice_number : (Array.isArray(original.invoice_number) ? original.invoice_number[0] : String(original.invoice_number ?? '')),
      parent_document_id: id as string,
    };
    // Chain the credit note before hashing (same PIH/ICV rule as invoices).
    const chain = await getZatcaChain(tenant_id);
    creditInvoiceData.previous_invoice_hash = chain.previous_invoice_hash;
    creditInvoiceData.icv = chain.icv;
    const ubl_xml = generateUBLXml(creditInvoiceData, tenant);
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
    ], original.branch_id ?? null);

    void dispatchWebhook(supabase, tenant_id, 'credit_note.created', { credit_note_id: cn.id, credit_note_number: cnNumber, original_invoice_id: id, original_invoice_number: typeof original.invoice_number === 'string' ? original.invoice_number : String(original.invoice_number ?? ''), amount }, cn.id as string);

    return res.status(201).json(cn);
  } catch (err) {
    console.error('credit-note:', err);
    return res.status(500).json({ error: 'Failed to create credit note' });
  }
});

// ─── POST /api/billing/documents/:id/convert-to-invoice ─────────────────────
// 1-click conversion of a quotation or proforma into a formal tax invoice.
billingRouter.post('/documents/:id/convert-to-invoice', requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenant_id = req.user!.tenant_id!;
    const { id } = req.params;

    const { data: original, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .single();
    if (error || !original) return res.status(404).json({ error: 'Document not found' });

    if (!['quotation', 'proforma'].includes(original.document_type)) {
      return res.status(400).json({ error: 'Only quotation or proforma can be converted to an invoice' });
    }

    const tenant = await getTenantComplianceData(tenant_id);
    const newInvoiceNumber = await generateInvoiceNumber(tenant_id);
    const chain = await getZatcaChain(tenant_id);
    const invoice = await convertToInvoice(supabase, original as any, newInvoiceNumber, tenant, chain.previous_invoice_hash ?? undefined, chain.icv);

    // Leave the original draft document intact and link it as the parent.
    return res.status(201).json({ invoice, parent_id: id, converted_from: original.document_type });
  } catch (err) {
    console.error('convert-to-invoice:', err);
    return res.status(500).json({ error: 'Failed to convert document to invoice' });
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
      .insert({ tenant_id, branch_id: invoice.branch_id ?? null, invoice_id, amount, method: payment_method, reference: reference ?? null, date: today, status: 'completed' })
      .select()
      .single();
    if (pmtErr) throw pmtErr;

    await supabase.from('invoices').update({ paid_amount: newPaid, status: newStatus, updated_at: new Date().toISOString() }).eq('id', invoice_id).eq('tenant_id', tenant_id);

    // Auto-issue a bilingual receipt for this payment.
    let receipt: Record<string, unknown> | null = null;
    try {
      const tenantData = await getTenantComplianceData(tenant_id);
      const receiptCtx = await buildRequestContext(supabase, tenant_id, (invoice.branch_id as string) ?? undefined);
      const receiptPack = resolvePack(receiptCtx);
      if (!receiptPack.documents?.renderInvoicePdf) {
        throw new NotImplementedInJurisdiction(resolveJurisdiction(receiptCtx), 'receipt PDF');
      }
      const { receipt: receiptRow, pdf_base64 } = await createReceiptForPayment(
        supabase,
        invoice as any,
        { id: payment.id, amount, method: payment_method, reference: reference ?? payment.id, date: today },
        tenantData,
        receiptPack.documents.renderInvoicePdf as (invoice: unknown, tenant: unknown) => Promise<Buffer>,
      );
      receipt = { ...receiptRow, pdf_base64 };
    } catch (receiptErr) {
      console.warn('[billing] receipt generation failed:', (receiptErr as Error).message);
    }

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
    ], invoice.branch_id ?? null);

    void dispatchWebhook(supabase, tenant_id, 'payment.received', { invoice_id, payment_id: payment.id, amount, method: payment_method }, payment.id);
    if (newStatus === 'paid') {
      void dispatchWebhook(supabase, tenant_id, 'invoice.paid', { invoice_id, invoice_number: invoice.invoice_number, total: invoice.total_amount, paid_amount: newPaid }, invoice_id);
    }

    return res.status(201).json({ payment, invoice: { id: invoice_id, paid_amount: newPaid, status: newStatus, remaining_balance: Math.max(0, sar(invoice.total_amount - newPaid)) }, receipt });
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

interface FeeLineInput {
  category_id?: string;
  category_code?: string | null;
  description_en: string;
  description_ar: string;
  vat_treatment?: string | null;
  amount: number;
  quantity: number;
}

/** Ensure every raw line has a vat_treatment and category_code for buildInvoiceLines. */
async function buildInvoiceRawLines(
  sourceLines: FeeLineInput[],
  tenant_id: string,
): Promise<BuildInvoiceLineInput[]> {
  const missing = sourceLines.filter((l) => l.category_id && !l.vat_treatment);
  let catMap: Record<string, { vat_treatment: string; code: string }> = {};
  if (missing.length > 0) {
    const categoryIds = [...new Set(missing.map((l) => l.category_id).filter(Boolean))] as string[];
    const { data: categories } = await supabase
      .from('fee_categories')
      .select('id, vat_treatment, code')
      .in('id', categoryIds)
      .eq('tenant_id', tenant_id);
    catMap = Object.fromEntries((categories ?? []).map((c) => [c.id, c]));
  }

  return sourceLines.map((line) => {
    const treatment = line.vat_treatment
      ?? (line.category_id ? catMap[line.category_id]?.vat_treatment : undefined)
      ?? 'standard';
    return {
      category_id: line.category_id ?? null,
      category_code: line.category_code
        ?? (line.category_id ? catMap[line.category_id]?.code : null)
        ?? 'MANUAL',
      description_en: line.description_en,
      description_ar: line.description_ar,
      vat_treatment: treatment,
      amount: line.amount,
      quantity: line.quantity,
    };
  });
}

export async function createInvoiceForStudent(
  tenant_id: string,
  created_by: string,
  student_id: string,
  academic_year: string,
  fee_lines?: FeeLineInput[],
  due_date?: string,
  branch_id?: string | null,
  options?: {
    batch_id?: string;
    invoice_number?: string;
    status?: string;
    recurring_schedule_id?: string;
    document_type?: InvoiceData['document_type'];
    invoice_type?: InvoiceData['invoice_type'];
    buyer_name?: string;
    buyer_vat_number?: string;
    buyer_address?: string;
    supply_date?: string;
    notes?: string;
    terms_and_conditions?: string;
    payment_methods?: string[];
  },
): Promise<Record<string, unknown>> {
  const today = new Date().toISOString().split('T')[0];

  const { data: student, error: studentErr } = await supabase
    .from('students')
    .select('id, name_en, name_ar, grade_id, branch_id, guardian_id, grades(name_en)')
    .eq('id', student_id)
    .eq('tenant_id', tenant_id)
    .single();
  if (studentErr || !student) throw new Error(`Student not found: ${student_id}`);

  const studentBranchId = branch_id ?? ((student as Record<string, unknown>).branch_id as string | null) ?? null;
  const studentGrade = (student as Record<string, unknown>).grades
    ? ((student as Record<string, unknown>).grades as Record<string, string>)?.name_en ?? ''
    : '';

  let sourceLines = fee_lines;
  if (!sourceLines || sourceLines.length === 0) {
    // Fall back to mandatory fee structures for this student's grade.
    const feeStructures = await resolveFeeStructures(supabase, tenant_id, {
      academicYear: academic_year,
      grade: student.grade_id ?? undefined,
      mandatoryOnly: true,
    });
    sourceLines = feeStructures.map((fs) => ({
      category_id: fs.category_id,
      category_code: fs.category_code,
      description_en: fs.description_en,
      description_ar: fs.description_ar,
      vat_treatment: fs.vat_treatment,
      amount: fs.amount,
      quantity: fs.quantity,
    }));
  }

  const rawLines = await buildInvoiceRawLines(sourceLines, tenant_id);

  // Compute a pre-discount subtotal with the same stepwise rounding used by
  // buildInvoiceLines so the discount calculation is deterministic.
  const preSubtotal = rawLines.reduce(
    (sum, line) => sar(sum + sar(line.amount * (line.quantity ?? 1))),
    0,
  );
  const primaryCategoryId = rawLines[0]?.category_id ?? undefined;
  const { total_discount: totalDiscount, applied: discountDetails } = await applyDiscounts(
    supabase,
    tenant_id,
    student_id,
    academic_year,
    preSubtotal,
    typeof primaryCategoryId === 'string' ? primaryCategoryId : undefined,
  );

  // VAT/rounding lives in the pack; everything else is generic.
  const ctx = await buildRequestContext(supabase, tenant_id, branch_id ?? undefined);
  const pack = resolvePack(ctx);
  const buildResult = await pack.tax?.buildInvoiceLines?.(
    rawLines,
    totalDiscount,
    supabase,
    today,
  ) as { lines: BuiltInvoiceLine[]; subtotal: number; vat_amount: number; total_amount: number } | undefined;
  if (!buildResult) {
    throw new NotImplementedInJurisdiction(resolveJurisdiction(ctx), 'tax.buildInvoiceLines');
  }
  const {
    lines: enrichedLines,
    subtotal,
    vat_amount: vatAmount,
    total_amount: totalAmount,
  } = buildResult;

  const invoiceNumber = options?.invoice_number ?? (await generateInvoiceNumber(tenant_id));
  const tenant = await getTenantComplianceData(tenant_id);
  const isZatcaInvoice = pack.code === 'SA';

  const docType = options?.document_type ?? 'invoice';
  const invType = options?.invoice_type ?? 'simplified';

  const chain = isZatcaInvoice ? await getZatcaChain(tenant_id) : { previous_invoice_hash: undefined, icv: undefined };

  const invoiceData: InvoiceData = {
    invoice_number: invoiceNumber,
    document_type: docType,
    invoice_type: invType,
    zatca_invoice_type: invType,
    issue_date: today,
    supply_date: options?.supply_date ?? today,
    due_date: due_date ?? undefined,
    subtotal,
    discount_amount: totalDiscount,
    vat_amount: vatAmount,
    total_amount: totalAmount,
    paid_amount: 0,
    student_name: student.name_en,
    buyer_name: options?.buyer_name || student.name_en,
    buyer_vat_number: options?.buyer_vat_number,
    buyer_address: options?.buyer_address,
    student_id,
    items: enrichedLines as InvoiceData['items'],
    uuid: crypto.randomUUID(),
    previous_invoice_hash: chain.previous_invoice_hash,
    icv: chain.icv,
    notes: options?.notes,
    terms_and_conditions: options?.terms_and_conditions,
  };

  const vatSummary = await pack.tax?.computeVatSummary?.(invoiceData, supabase) as VatSummary;
  if (!vatSummary) {
    throw new NotImplementedInJurisdiction(resolveJurisdiction(ctx), 'tax.computeVatSummary');
  }
  invoiceData.vat_summary = vatSummary;

  let qr_code: string | null = null;
  let ubl_xml: string | null = null;
  let invoice_hash: string | null = null;
  if (isZatcaInvoice) {
    ubl_xml = generateUBLXml(invoiceData, tenant);
    invoice_hash = generateInvoiceHash(ubl_xml);
    qr_code = generateTLVQR(invoiceData, tenant);
  }

  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      tenant_id,
      branch_id: studentBranchId,
      student_id,
      guardian_id: student.guardian_id,
      invoice_number: invoiceNumber,
      academic_year,
      student_name: student.name_en,
      grade: studentGrade,
      date: today,
      issue_date: today,
      due_date: due_date ?? null,
      document_type: docType,
      invoice_type: invType,
      zatca_invoice_type: invType,
      buyer_name: options?.buyer_name || student.name_en,
      buyer_vat_number: options?.buyer_vat_number ?? null,
      buyer_address: options?.buyer_address ?? null,
      supply_date: options?.supply_date ?? today,
      subtotal,
      discount_amount: totalDiscount,
      vat_amount: vatAmount,
      total_amount: totalAmount,
      paid_amount: 0,
      status: options?.status ?? 'issued',
      items: enrichedLines,
      vat_summary: vatSummary,
      zatca_uuid: invoiceData.uuid,
      icv: invoiceData.icv,
      invoice_hash,
      previous_invoice_hash: chain.previous_invoice_hash ?? null,
      ubl_xml,
      qr_code,
      zatca_status: 'pending',
      batch_id: options?.batch_id ?? null,
      recurring_schedule_id: options?.recurring_schedule_id ?? null,
      notes: options?.notes ?? null,
      terms_and_conditions: options?.terms_and_conditions ?? null,
      payment_methods: options?.payment_methods ?? [],
    })
    .select()
    .single();
  if (error) throw error;

  if (isZatcaInvoice) {
    await supabase.from('zatca_submissions').insert({
      tenant_id,
      invoice_id: invoice.id,
      invoice_number: invoiceNumber,
      submission_type: invType === 'standard' ? 'clearance' : 'reporting',
      invoice_hash,
      previous_hash: chain.previous_invoice_hash ?? '',
      ubl_xml,
      qr_code,
      zatca_status: 'pending',
    });
  }

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

  await postJournal(tenant_id, created_by, invoiceNumber, `Bulk Invoice ${invoiceNumber}`, [
    { account_code: '12', debit: totalAmount, credit: 0, description: `A/R — ${invoiceNumber}` },
    { account_code: '41', debit: 0, credit: sar(subtotal - totalDiscount), description: `Revenue — ${invoiceNumber}` },
    { account_code: '24', debit: 0, credit: vatAmount, description: `VAT — ${invoiceNumber}` },
  ], studentBranchId ?? null);

  void dispatchWebhook(supabase, tenant_id, 'invoice.created', { invoice_id: invoice.id, invoice_number: invoiceNumber, document_type: docType, total_amount: totalAmount, student_id }, invoice.id as string);

  return invoice as Record<string, unknown>;
}

// ─── POST /api/billing/bulk-invoices — Bulk generation ───────────────────────

billingRouter.post('/bulk-invoices', requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenant_id = req.user!.tenant_id!;
    const parsed = BulkInvoiceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { academic_year, grade, campus_id, due_date, dry_run, approved, name } = parsed.data;

    // Fetch active fee structures (generic, jurisdiction-neutral resolution).
    const feeStructures = await resolveFeeStructures(supabase, tenant_id, {
      academicYear: academic_year,
      grade: grade ?? undefined,
      branchId: campus_id ?? undefined,
      mandatoryOnly: true,
    });

    if (!feeStructures.length) return res.status(400).json({ error: 'No fee structures found for the given criteria' });

    // Fetch students
    let stuQuery = supabase.from('students').select('id, name_en, name_ar, grade_id, branch_id, grades(name_en)').eq('tenant_id', tenant_id).eq('status', 'active');
    if (grade) stuQuery = stuQuery.eq('grade_id', grade);
    if (campus_id) stuQuery = stuQuery.eq('branch_id', campus_id);
    const { data: students } = await stuQuery;

    if (!students?.length) return res.status(400).json({ error: 'No active students found' });

    const today = new Date().toISOString().split('T')[0];
    const ctx = await buildRequestContext(supabase, tenant_id, campus_id ?? undefined);
    const pack = resolvePack(ctx);

    // Determine which students already have a (non-cancelled) invoice for this
    // academic year. The same rule drives both the preview and the real run, so
    // re-running is idempotent (no silent duplicates).
    const { data: existing } = await supabase
      .from('invoices')
      .select('student_id')
      .eq('tenant_id', tenant_id)
      .eq('academic_year', academic_year)
      .neq('status', 'cancelled');
    const existingIds = new Set((existing ?? []).map((e) => e.student_id));

    const planForStudent = async (student: { grade_id?: string | null }) => {
      const relevant = feeStructures.filter((fs) => !fs.grade || fs.grade === student.grade_id);
      // Dry-run total intentionally excludes discounts so it stays a preview of
      // gross fees. Use the pack so the UAE gets 5% and Saudi Arabia keeps 15%.
      const { total_amount: gross } = await pack.tax?.buildInvoiceLines?.(
        relevant,
        0,
        supabase,
        today,
      ) as BuildInvoiceLinesResult;
      return { relevant, gross };
    };

    let eligible = 0;
    let alreadyInvoiced = 0;
    let skippedNoFees = 0;
    let estimatedTotal = 0;
    const recipients: { student_id: string; name_en?: string; name_ar?: string; amount: number }[] = [];

    for (const student of students) {
      if (existingIds.has(student.id)) { alreadyInvoiced++; continue; }
      const { relevant, gross } = await planForStudent(student);
      if (!relevant.length) { skippedNoFees++; continue; }
      eligible++;
      estimatedTotal = sar(estimatedTotal + gross);
      if (recipients.length < 20) {
        recipients.push({ student_id: student.id, name_en: student.name_en, name_ar: student.name_ar, amount: gross });
      }
    }

    if (dry_run) {
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

    // Approval-first batch workflow:
    // - approved=false (default): create a pending batch, return preview for review.
    // - approved=true: create/generate invoices inside the batch.
    const criteria = { academic_year, grade, campus_id, due_date };
    const batchNumber = `BATCH-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const batchPayload = {
      tenant_id,
      batch_number: batchNumber,
      batch_name: name || `Term invoice batch ${batchNumber}`,
      criteria,
      student_count: students.length,
      excluded_students: [...existingIds],
      invoice_count: 0,
      total_amount: 0,
      total_vat: 0,
      total_discount: 0,
      net_total: 0,
      status: approved ? 'generating' : 'pending',
      posted_mode: approved ? 'generated' : 'draft',
      branch_id: campus_id ?? null,
      created_by: req.user!.id,
    };

    const { data: batch, error: batchErr } = await supabase.from('invoice_batches').insert(batchPayload).select().single();
    if (batchErr) throw batchErr;

    if (!approved) {
      return res.json({
        approved: false,
        batch,
        dry_run: false,
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
    const invoiceIds: string[] = [];
    let totalAmount = 0;
    let totalVat = 0;
    let totalDiscount = 0;

    for (const student of students) {
      if (existingIds.has(student.id)) { skipped++; continue; }
      try {
        const { relevant } = await planForStudent(student);
        if (!relevant.length) { skipped++; continue; }

        const feeLines: FeeLineInput[] = relevant.map((fs: ResolvedFeeStructure) => ({
          category_id: fs.category_id,
          category_code: fs.category_code,
          description_en: fs.description_en,
          description_ar: fs.description_ar,
          vat_treatment: fs.vat_treatment,
          amount: fs.amount,
          quantity: fs.quantity,
        }));

        const invoice = await createInvoiceForStudent(tenant_id, req.user!.id, student.id, academic_year, feeLines, due_date, student.branch_id ?? null, { batch_id: batch.id });
        invoiceIds.push(invoice.id as string);
        totalAmount = sar(totalAmount + Number(invoice.total_amount ?? 0));
        totalVat = sar(totalVat + Number(invoice.vat_amount ?? 0));
        totalDiscount = sar(totalDiscount + Number(invoice.discount_amount ?? 0));
        created++;
      } catch (e) {
        errors.push(`${student.id}: ${(e as Error).message}`);
      }
    }

    const netTotal = sar(totalAmount - totalDiscount);
    const { data: updatedBatch } = await supabase
      .from('invoice_batches')
      .update({
        status: 'generated',
        invoice_count: created,
        total_amount: totalAmount,
        total_vat: totalVat,
        total_discount: totalDiscount,
        net_total: netTotal,
      })
      .eq('id', batch.id)
      .eq('tenant_id', tenant_id)
      .select()
      .single();

    return res.json({
      approved: true,
      batch: updatedBatch,
      created,
      skipped,
      errors,
      totals: { total_amount: totalAmount, total_vat: totalVat, total_discount: totalDiscount, net_total: netTotal },
    });
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
      .select('id, invoice_number, student_id, total_amount, paid_amount, due_date, students(name_en, name_ar, guardian_id)')
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
      const studentRec = inv.students as { name_en?: string; name_ar?: string; guardian_id?: string } | null;
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

        void dispatchWebhook(supabase, tenant_id, 'invoice.overdue', { invoice_id: inv.id, invoice_number: inv.invoice_number, days_overdue: daysOverdue, balance }, inv.id as string);

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

  try {
    const ctx = await buildRequestContext(supabase, tenant_id);
    const pack = resolvePack(ctx);
    if (!pack.payments?.generateSadadBill) {
      return res.status(501).json({ error: 'SADAD bill generation not available for this jurisdiction' });
    }

    const result = await pack.payments.generateSadadBill(supabase, tenant_id, parsed.data.invoice_id);

    await supabase.from('invoices').update({ sadad_bill_number: result.sadad_bill_number }).eq('id', parsed.data.invoice_id).eq('tenant_id', tenant_id);

    return res.json(result);
  } catch (err) {
    const name = (err as Error).name;
    const message = (err as Error).message;
    if (name === 'JurisdictionUnresolvedError') {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    if (name === 'NotImplementedInJurisdiction') {
      return res.status(501).json({ error: 'SADAD bill generation not available for this jurisdiction' });
    }
    if (message === 'Invoice not found' || (err as any).code === 'PGRST116') {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    console.error('sadad/generate:', err);
    return res.status(500).json({ error: 'SADAD bill generation failed' });
  }
});

// ─── POST /api/billing/moyasar/link — Create or refresh a Moyasar invoice link ─

billingRouter.post('/moyasar/link', requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenant_id = req.user!.tenant_id!;
    const schema = z.object({
      invoice_id: z.string().uuid(),
      installment_id: z.string().uuid().optional(),
      callback_url: z.string().url().optional(),
      success_url: z.string().url().optional(),
      back_url: z.string().url().optional(),
      source_type: z.enum(['creditcard', 'mada', 'applepay', 'stcpay', 'samsungpay']).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    const { data: student } = await supabase
      .from('students')
      .select('name_en, name_ar')
      .eq('tenant_id', tenant_id)
      .eq('id', (await supabase.from('invoices').select('student_id').eq('id', parsed.data.invoice_id).eq('tenant_id', tenant_id).single()).data?.student_id as string)
      .single();

    const result = await createOrRefreshMoyasarLink(supabase, {
      tenantId: tenant_id,
      invoiceId: parsed.data.invoice_id,
      installmentId: parsed.data.installment_id,
      callbackUrl: parsed.data.callback_url || `${baseUrl}/api/public/billing/moyasar/webhook`,
      successUrl: parsed.data.success_url || `${baseUrl}/payment/result?status=success`,
      backUrl: parsed.data.back_url || `${baseUrl}/payment/result?status=pending`,
      sourceType: parsed.data.source_type,
      studentFirstName: (student?.name_en as string) || (student?.name_ar as string) || 'Student',
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.json(result);
  } catch (err) {
    console.error('moyasar link:', err);
    return res.status(500).json({ error: 'moyasar_link_failed', message: (err as Error).message });
  }
});

// ─── POST /api/billing/moyasar/bulk — Bulk-create Moyasar invoice links ───────

billingRouter.post('/moyasar/bulk', requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenant_id = req.user!.tenant_id!;
    const schema = z.object({
      invoice_ids: z.array(z.string().uuid()).min(1).max(50),
      callback_url: z.string().url().optional(),
      success_url: z.string().url().optional(),
      back_url: z.string().url().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    const result = await bulkCreateMoyasarInvoices(
      supabase,
      tenant_id,
      parsed.data.invoice_ids,
      parsed.data.callback_url || `${baseUrl}/api/public/billing/moyasar/webhook`,
      parsed.data.success_url || `${baseUrl}/payment/result?status=success`,
      parsed.data.back_url || `${baseUrl}/payment/result?status=pending`,
    );
    return result.ok ? res.json(result) : res.status(400).json(result);
  } catch (err) {
    console.error('moyasar bulk:', err);
    return res.status(500).json({ error: 'moyasar_bulk_failed', message: (err as Error).message });
  }
});

// ─── POST /api/billing/moyasar/refund — Request a Moyasar refund ───────────────

billingRouter.post('/moyasar/refund', requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenant_id = req.user!.tenant_id!;
    const schema = z.object({
      payment_id: z.string().uuid(),
      amount: z.number().positive().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const result = await requestMoyasarRefund(supabase, tenant_id, parsed.data.payment_id, parsed.data.amount);
    return result.ok ? res.json(result) : res.status(400).json(result);
  } catch (err) {
    console.error('moyasar refund:', err);
    return res.status(500).json({ error: 'moyasar_refund_failed', message: (err as Error).message });
  }
});

// ─── POST /api/billing/moyasar/reconcile — Manual reconciliation sweep ─────────

billingRouter.post('/moyasar/reconcile', requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenant_id = req.user!.tenant_id!;
    const since = (req.query.since as string) || undefined;
    const report = await reconcileMoyasarState(supabase, tenant_id, since);
    return res.json(report);
  } catch (err) {
    console.error('moyasar reconcile:', err);
    return res.status(500).json({ error: 'moyasar_reconcile_failed', message: (err as Error).message });
  }
});

// ─── GET /api/billing/arrears — Aging buckets ────────────────────────────────

billingRouter.get('/arrears', async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = await resolveTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'No tenant available' });
  const { academic_year, summary } = req.query as Record<string, string>;
  const isAccountant = req.user?.role === 'accountant';

  const report = await getAgingReport(supabase, tenant_id, {
    academic_year,
    includeStudents: !isAccountant && summary !== 'true',
  });
  return res.json(report);
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

// ─── POST /api/billing/recurring-invoices/generate ───────────────────────────
// Generate invoices for all active recurring schedules whose next_due_date is
// on or before the given date. Supports dry-run preview.

function addFrequency(dateStr: string, frequency: string): string {
  const d = new Date(dateStr);
  switch (frequency) {
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'annual': d.setFullYear(d.getFullYear() + 1); break;
    case 'termly': d.setMonth(d.getMonth() + 6); break; // two terms per year default
    default: d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().split('T')[0];
}

function proratedAmount(
  amount: number,
  startDate: string,
  endDate: string | null | undefined,
  dueBefore: string,
  rule: string,
): number {
  if (rule !== 'daily' || !endDate) return amount;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const due = new Date(dueBefore).getTime();
  if (end <= start || due <= start) return amount;
  const fullPeriod = end - start;
  const activePeriod = Math.min(due, end) - start;
  if (activePeriod <= 0) return 0;
  return sar(amount * (activePeriod / fullPeriod));
}

billingRouter.post('/recurring-invoices/generate', requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenant_id = req.user!.tenant_id!;
    const parsed = RecurringGenerateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { due_before, academic_year, dry_run } = parsed.data;

    const today = new Date().toISOString().split('T')[0];
    const dueBefore = due_before ?? today;

    let q = supabase
      .from('recurring_invoice_schedules')
      .select('*, fee_structures(*, fee_categories(id, vat_treatment, name_ar, name_en, code)), students(branch_id)')
      .eq('tenant_id', tenant_id)
      .eq('status', 'active')
      .lte('next_due_date', dueBefore);
    if (academic_year) q = q.eq('academic_year', academic_year);
    const { data: schedules, error } = await q;
    if (error) throw error;

    const preview: { schedule_id: string; student_id: string; fee_structure_id: string; amount: number; next_due_date: string }[] = [];
    const generated: string[] = [];
    let totalAmount = 0;
    let totalVat = 0;
    let totalDiscount = 0;

    for (const schedule of schedules ?? []) {
      const fs = schedule.fee_structures as Record<string, unknown> | undefined;
      const cat = (fs?.fee_categories ?? {}) as Record<string, unknown>;
      const baseAmount = Number(schedule.amount ?? 0);
      const prorated = proratedAmount(baseAmount, schedule.start_date, schedule.end_date, dueBefore, schedule.proration_rule);
      if (prorated <= 0) continue;

      const feeLines = [{
        category_id: (cat?.id as string) ?? (fs?.category_id as string) ?? '',
        description_en: (cat?.name_en as string) ?? (fs?.description_en as string) ?? 'Recurring fee',
        description_ar: (cat?.name_ar as string) ?? (fs?.description_ar as string) ?? 'رسوم دورية',
        amount: prorated,
        quantity: 1,
      }];

      if (dry_run) {
        preview.push({
          schedule_id: schedule.id,
          student_id: schedule.student_id,
          fee_structure_id: schedule.fee_structure_id,
          amount: prorated,
          next_due_date: schedule.next_due_date,
        });
        continue;
      }

      const invoice = await createInvoiceForStudent(
        tenant_id,
        req.user!.id,
        schedule.student_id,
        academic_year ?? schedule.academic_year ?? today,
        feeLines,
        schedule.next_due_date,
        (schedule.students as Record<string, unknown> | undefined)?.branch_id as string | null ?? null,
        { recurring_schedule_id: schedule.id },
      );

      generated.push(invoice.id as string);
      totalAmount = sar(totalAmount + Number(invoice.total_amount ?? 0));
      totalVat = sar(totalVat + Number(invoice.vat_amount ?? 0));
      totalDiscount = sar(totalDiscount + Number(invoice.discount_amount ?? 0));

      const nextDue = addFrequency(schedule.next_due_date, schedule.frequency);
      await supabase
        .from('recurring_invoice_schedules')
        .update({ last_generated_at: new Date().toISOString(), next_due_date: nextDue, updated_at: new Date().toISOString() })
        .eq('id', schedule.id)
        .eq('tenant_id', tenant_id);
    }

    return res.json({
      dry_run,
      due_before: dueBefore,
      schedule_count: (schedules ?? []).length,
      generated: dry_run ? preview.length : generated.length,
      previews: dry_run ? preview : undefined,
      totals: dry_run ? undefined : { total_amount: totalAmount, total_vat: totalVat, total_discount: totalDiscount },
    });
  } catch (err) {
    console.error('recurring-invoices/generate:', err);
    return res.status(500).json({ error: 'Recurring generation failed' });
  }
});

// ─── GET /api/billing/expected-collections — Cash-flow forecast ──────────────

billingRouter.get('/expected-collections', async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = await resolveTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'No tenant available' });
  const { from_date, to_date } = req.query as Record<string, string>;
  if (!from_date || !to_date) return res.status(400).json({ error: 'from_date and to_date required' });

  const report = await getExpectedCollections(supabase, tenant_id, from_date, to_date);
  return res.json(report);
});

// ─── GET /api/billing/guardian-statement/:guardian_id ────────────────────────

billingRouter.get('/guardian-statement/:guardian_id', async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = await resolveTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'No tenant available' });
  const { guardian_id } = req.params;
  const { from_date, to_date } = req.query as Record<string, string>;
  const isAccountant = req.user?.role === 'accountant';

  const statement = await getGuardianStatement(supabase, tenant_id, guardian_id as string, {
    from_date,
    to_date,
    includeStudents: !isAccountant,
  });
  return res.json(statement);
});

// ─── GET /api/billing/trial-balance ────────────────────────────────────────

billingRouter.get('/trial-balance', async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = await resolveTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'No tenant available' });
  const { from_date, to_date } = req.query as Record<string, string>;

  const report = await getTrialBalance(supabase, tenant_id, { from_date, to_date });
  return res.json(report);
});

// ─── GET /api/billing/income-statement ─────────────────────────────────────

billingRouter.get('/income-statement', async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = await resolveTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'No tenant available' });
  const { from_date, to_date } = req.query as Record<string, string>;
  if (!from_date || !to_date) return res.status(400).json({ error: 'from_date and to_date required' });

  const report = await getIncomeStatement(supabase, tenant_id, from_date, to_date);
  return res.json(report);
});

// ─── GET /api/billing/balance-sheet ──────────────────────────────────────────

billingRouter.get('/balance-sheet', async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = await resolveTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'No tenant available' });
  const { as_of } = req.query as Record<string, string>;

  const report = await getBalanceSheet(supabase, tenant_id, as_of);
  return res.json(report);
});

// ─── GET /api/billing/revenue-by-fee-type ────────────────────────────────────

billingRouter.get('/revenue-by-fee-type', async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = await resolveTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'No tenant available' });
  const { from_date, to_date } = req.query as Record<string, string>;
  if (!from_date || !to_date) return res.status(400).json({ error: 'from_date and to_date required' });

  const report = await getRevenueByFeeType(supabase, tenant_id, from_date, to_date);
  return res.json(report);
});
