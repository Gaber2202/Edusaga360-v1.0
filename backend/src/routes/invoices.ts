import { Router, Response } from 'express';
import { supabase } from '../lib/supabase.js';
import crypto from 'crypto';
import { z } from 'zod';
import { AuthenticatedRequest, requireRole, FINANCE_ROLES } from '../middleware/auth.js';
import type { InvoiceData } from '../packs/sa/vat.js';
import { buildRequestContext, NotImplementedInJurisdiction, resolveJurisdiction } from '../lib/jurisdiction.js';
import { resolvePack } from '../packs/registry.js';
import type { TenantData } from '../types/tenant.js';
import { getTenantComplianceData } from '../services/tenant.js';
import { PdfQueueSaturatedError } from '../lib/pdfConcurrency.js';
import { createReceiptForPayment, buildReceiptInvoiceData } from '../services/receipt.js';

export const invoiceRouter = Router();

async function resolveTenantId(req: AuthenticatedRequest): Promise<string | null> {
  if (req.user?.tenant_id) return req.user.tenant_id;
  const override = (req.query.tenant_id as string) || (req.headers['x-tenant-id'] as string);
  if (override) return override;
  const { data } = await supabase
    .from('tenants')
    .select('id')
    .eq('status', 'active')
    .order('created_at')
    .limit(1)
    .single();
  return data?.id ?? null;
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const InvoiceItemSchema = z.object({
  description: z.string().optional(),
  description_en: z.string().optional(),
  description_ar: z.string().optional(),
  amount: z.number().min(0).optional(),
  quantity: z.number().min(0).optional().default(1),
  unit_price_net: z.number().min(0).optional(),
  vat_rate: z.number().optional(),
  vat_amount: z.number().min(0).optional(),
  line_total_gross: z.number().min(0).optional(),
  vat_category: z.enum(['standard', 'zero_rated', 'exempt', 'out_of_scope']).optional().default('standard'),
  vat_category_code: z.string().optional(),
  discount: z.number().min(0).optional().default(0),
});

const GenerateZATCASchema = z.object({
  invoice_id: z.string().optional(),
  invoice_number: z.string(),
  issue_date: z.string(),
  document_type: z.enum(['invoice', 'quotation', 'proforma', 'credit_note', 'debit_note', 'receipt']).optional().default('invoice'),
  invoice_type: z.enum(['simplified', 'standard']).optional().default('simplified'),
  zatca_invoice_type: z.enum(['simplified', 'standard']).optional(),
  subtotal: z.number().min(0),
  discount_amount: z.number().min(0).optional().default(0),
  vat_amount: z.number().min(0),
  total_amount: z.number().min(0),
  paid_amount: z.number().min(0).optional(),
  student_name: z.string().optional(),
  buyer_name: z.string().optional(),
  student_id: z.string().optional(),
  buyer_vat_number: z.string().optional(),
  buyer_address: z.string().optional(),
  due_date: z.string().optional(),
  supply_date: z.string().optional(),
  items: z.array(InvoiceItemSchema).optional(),
  notes: z.string().optional(),
  terms_and_conditions: z.string().optional(),
});


/**
 * Get the next ICV (Invoice Counter Value) for a tenant and increment it.
 * Uses the zatca_invoices table to track the counter.
 */
async function getNextICV(tenantId: string): Promise<number> {
  const { data } = await supabase
    .from('zatca_invoices')
    .select('icv')
    .eq('tenant_id', tenantId)
    .order('icv', { ascending: false })
    .limit(1);

  return (data?.[0]?.icv || 0) + 1;
}

/**
 * Get the previous invoice hash for PIH chaining.
 */
async function getPreviousInvoiceHash(tenantId: string): Promise<string | undefined> {
  const { data } = await supabase
    .from('zatca_invoices')
    .select('invoice_hash')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1);

  return data?.[0]?.invoice_hash || undefined;
}

// ---------------------------------------------------------------------------
// POST /api/invoices/generate-zatca
// ---------------------------------------------------------------------------

invoiceRouter.post('/generate-zatca', requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = GenerateZATCASchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: parsed.error.flatten(),
      });
    }

    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID not found' });
    }

    const tenant = await getTenantComplianceData(supabase, tenantId);
    const ctx = await buildRequestContext(supabase, tenantId);
    const pack = resolvePack(ctx);
    if (
      !pack.eInvoice?.generateUBLXml ||
      !pack.eInvoice.generateInvoiceHash ||
      !pack.eInvoice.signInvoice ||
      !pack.eInvoice.generatePIH ||
      !pack.eInvoice.generateTLVQR ||
      !pack.eInvoice.generatePDF ||
      !pack.eInvoice.reportInvoice ||
      !pack.eInvoice.clearInvoice
    ) {
      throw new NotImplementedInJurisdiction(resolveJurisdiction(ctx), 'ZATCA e-invoice generation');
    }

    const icv = await getNextICV(tenantId);
    const previousHash = await getPreviousInvoiceHash(tenantId);
    const uuid = crypto.randomUUID();

    const invoice: InvoiceData = {
      ...parsed.data,
      uuid,
      icv,
      previous_invoice_hash: previousHash,
    };

    // Generate ZATCA artifacts through the jurisdiction pack.
    const ubl_xml = pack.eInvoice.generateUBLXml!(invoice, tenant);
    const invoice_hash = pack.eInvoice.generateInvoiceHash!(ubl_xml);
    const signature = pack.eInvoice.signInvoice!(invoice_hash);
    const pih = pack.eInvoice.generatePIH!(previousHash);
    const qr_code = pack.eInvoice.generateTLVQR!(invoice, tenant, signature);

    // Generate PDF with proper Arabic rendering
    const pdfBuffer = await pack.eInvoice.generatePDF!(invoice, tenant);
    const pdf_base64 = pdfBuffer.toString('base64');

    // Submit to ZATCA API based on invoice type
    const isSimplified = (invoice.invoice_type || invoice.zatca_invoice_type || 'simplified') === 'simplified';
    const xmlBase64 = Buffer.from(ubl_xml, 'utf8').toString('base64');

    let zatcaResponse = null;
    let zatcaStatus = 'generated';

    try {
      if (isSimplified) {
        zatcaResponse = await pack.eInvoice.reportInvoice!(xmlBase64, invoice_hash, uuid);
        zatcaStatus = zatcaResponse.reportingStatus === 'REPORTED' ? 'reported' : 'generated';
      } else {
        zatcaResponse = await pack.eInvoice.clearInvoice!(xmlBase64, invoice_hash, uuid);
        zatcaStatus = zatcaResponse.clearanceStatus === 'CLEARED' ? 'cleared' : 'generated';
      }
    } catch {
      // ZATCA API failure is non-fatal — we still store the invoice locally
      zatcaStatus = 'api_error';
    }

    // Upsert zatca_invoices record
    const zatcaRecord = {
      invoice_id: parsed.data.invoice_id || parsed.data.invoice_number,
      invoice_number: parsed.data.invoice_number,
      seller_name: tenant.name || 'School',
      vat_number: tenant.vat_number || '300000000000003',
      invoice_total: parsed.data.total_amount,
      vat_amount: parsed.data.vat_amount,
      qr_code,
      invoice_hash,
      ubl_xml,
      signature,
      uuid,
      icv,
      pih,
      zatca_status: zatcaStatus,
      zatca_response: zatcaResponse ? JSON.stringify(zatcaResponse) : null,
      cleared_xml: zatcaResponse?.clearedInvoice || null,
      tenant_id: tenantId,
      created_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from('zatca_invoices')
      .upsert(zatcaRecord, { onConflict: 'invoice_number,tenant_id' });

    if (upsertError) {
      console.error('Failed to upsert zatca_invoices:', upsertError);
    }

    return res.status(200).json({
      qr_code,
      invoice_hash,
      ubl_xml,
      pdf_base64,
      uuid,
      icv,
      signature,
      zatca_status: zatcaStatus,
      zatca_response: zatcaResponse,
    });
  } catch (err) {
    if (err instanceof NotImplementedInJurisdiction || (err as any).name === 'NotImplementedInJurisdiction') {
      return res.status(501).json({ message: (err as Error).message, code: 501, feature: (err as any).feature });
    }
    console.error('Failed to generate ZATCA invoice:', err);
    return res.status(500).json({ message: 'Failed to generate ZATCA invoice' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/invoices/zatca-compliance-check
// ---------------------------------------------------------------------------

invoiceRouter.post('/zatca-compliance-check', requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = GenerateZATCASchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
    }

    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID not found' });
    }

    const tenant = await getTenantComplianceData(supabase, tenantId);
    const ctx = await buildRequestContext(supabase, tenantId);
    const pack = resolvePack(ctx);
    if (!pack.eInvoice?.generateUBLXml || !pack.eInvoice.generateInvoiceHash || !pack.eInvoice.complianceCheck) {
      throw new NotImplementedInJurisdiction(resolveJurisdiction(ctx), 'ZATCA compliance check');
    }

    const uuid = crypto.randomUUID();

    const invoice: InvoiceData = { ...parsed.data, uuid, icv: 1 };
    const xml = pack.eInvoice.generateUBLXml!(invoice, tenant);
    const hash = pack.eInvoice.generateInvoiceHash!(xml);
    const xmlBase64 = Buffer.from(xml, 'utf8').toString('base64');

    const result = await pack.eInvoice.complianceCheck!(xmlBase64, hash, uuid);

    return res.status(200).json({ uuid, invoice_hash: hash, compliance_result: result });
  } catch (err) {
    if (err instanceof NotImplementedInJurisdiction || (err as any).name === 'NotImplementedInJurisdiction') {
      return res.status(501).json({ message: (err as Error).message, code: 501, feature: (err as any).feature });
    }
    console.error('ZATCA compliance check failed:', err);
    return res.status(500).json({ message: 'Compliance check failed' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/invoices/:id/zatca-status
// ---------------------------------------------------------------------------

invoiceRouter.get('/:id/zatca-status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = await resolveTenantId(req);

    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID not found' });
    }

    const { data, error } = await supabase
      .from('zatca_invoices')
      .select('zatca_status, qr_code, invoice_hash, uuid, icv, signature, cleared_xml, zatca_response, created_at')
      .eq('invoice_id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !data) {
      return res.status(404).json({ message: 'ZATCA record not found for this invoice' });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('Failed to get ZATCA status:', err);
    return res.status(500).json({ message: 'Failed to get ZATCA status' });
  }
});

function invoiceOutstanding(invoice: Record<string, unknown>): number {
  const total = Number(invoice.total_amount) || 0;
  const paid = Number(invoice.paid_amount) || 0;
  return Math.round((total - paid) * 100) / 100;
}

async function assertParentOwnsStudent(
  req: AuthenticatedRequest,
  studentId: string | null | undefined,
): Promise<boolean> {
  if (req.user?.role !== 'parent') return true;
  const { data: parent } = await supabase
    .from('users')
    .select('linked_student_ids')
    .eq('auth_id', req.user.id)
    .single();
  const linked: string[] = (parent?.linked_student_ids as string[] | null) ?? [];
  return Boolean(studentId && linked.includes(studentId));
}

function sendPdf(res: Response, pdfBuffer: Buffer, filename: string, inline: boolean) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${filename}"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  return res.send(pdfBuffer);
}

async function loadInvoiceForPdf(req: AuthenticatedRequest, id: string) {
  let tenantId = req.user?.tenant_id || (req.headers['x-tenant-id'] as string) || (req.query.tenant_id as string);

  let invoiceQuery = supabase.from('invoices').select('*').eq('id', id);
  if (tenantId) invoiceQuery = invoiceQuery.eq('tenant_id', tenantId);
  const { data: invoiceRow, error: invoiceError } = await invoiceQuery.single();

  if (invoiceRow && !tenantId && req.user?.is_platform_owner) {
    tenantId = invoiceRow.tenant_id as string;
  }

  return { tenantId: tenantId as string | undefined, invoiceRow, invoiceError };
}

// ---------------------------------------------------------------------------
// GET /api/invoices/:id/download-pdf
// ---------------------------------------------------------------------------

invoiceRouter.get('/:id/download-pdf', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId, invoiceRow, invoiceError } = await loadInvoiceForPdf(req, id);

    if (invoiceError || !invoiceRow || !tenantId) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (!(await assertParentOwnsStudent(req, invoiceRow.student_id as string | undefined))) {
      return res.status(403).json({ message: 'Not authorized to access this invoice' });
    }

    const tenant = await getTenantComplianceData(supabase, tenantId);
    const ctx = await buildRequestContext(supabase, tenantId, (invoiceRow.branch_id as string) ?? undefined);
    const pack = resolvePack(ctx);
    if (!pack.documents?.renderInvoicePdf) {
      throw new NotImplementedInJurisdiction(resolveJurisdiction(ctx), 'invoice PDF');
    }
    const pdfBuffer = await pack.documents.renderInvoicePdf!(invoiceRow, tenant);
    const inline = req.query.inline === '1' || req.query.inline === 'true';
    return sendPdf(res, pdfBuffer, `invoice-${invoiceRow.invoice_number}.pdf`, inline);
  } catch (err) {
    if (err instanceof NotImplementedInJurisdiction || (err as any).name === 'NotImplementedInJurisdiction') {
      return res.status(501).json({ message: (err as Error).message, code: 501, feature: (err as any).feature });
    }
    if (err instanceof PdfQueueSaturatedError) {
      res.setHeader('Retry-After', '5');
      return res.status(503).json({ message: err.message, code: err.code });
    }
    console.error('Failed to generate invoice PDF:', err);
    return res.status(500).json({ message: 'Failed to generate invoice PDF' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/invoices/:id/receipt-pdf — payment receipt in the same bill layout
// ---------------------------------------------------------------------------

invoiceRouter.get('/:id/receipt-pdf', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId, invoiceRow, invoiceError } = await loadInvoiceForPdf(req, id);

    if (invoiceError || !invoiceRow || !tenantId) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (!(await assertParentOwnsStudent(req, invoiceRow.student_id as string | undefined))) {
      return res.status(403).json({ message: 'Not authorized to access this invoice' });
    }

    if (invoiceRow.status === 'cancelled') {
      return res.status(400).json({ message: 'Receipt is not available for a cancelled invoice' });
    }
    const paidInFull = invoiceRow.status === 'paid' || invoiceOutstanding(invoiceRow as Record<string, unknown>) <= 0.01;
    if (!paidInFull) {
      return res.status(400).json({ message: 'Receipt is only available for paid invoices' });
    }

    const tenant = await getTenantComplianceData(supabase, tenantId);
    const ctx = await buildRequestContext(supabase, tenantId, (invoiceRow.branch_id as string) ?? undefined);
    const pack = resolvePack(ctx);
    if (!pack.documents?.renderInvoicePdf) {
      throw new NotImplementedInJurisdiction(resolveJurisdiction(ctx), 'receipt PDF');
    }

    const { data: existingReceipt } = await supabase
      .from('invoices')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('parent_document_id', id)
      .eq('document_type', 'receipt')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const today = new Date().toISOString().slice(0, 10);
    let pdfBuffer: Buffer;

    if (existingReceipt) {
      pdfBuffer = await pack.documents.renderInvoicePdf!(
        {
          ...existingReceipt,
          document_type: 'receipt',
          issue_date: existingReceipt.issue_date || existingReceipt.date || today,
        },
        tenant,
      );
    } else {
      const { data: payment } = await supabase
        .from('payments')
        .select('id, amount, method, reference, date')
        .eq('invoice_id', id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const paymentLike = payment
        ? {
            id: payment.id as string,
            amount: Number(payment.amount),
            method: (payment.method as string) || 'online',
            reference: (payment.reference as string | null) ?? null,
            date: (payment.date as string | undefined) || today,
          }
        : {
            id: invoiceRow.id as string,
            amount: Number(invoiceRow.paid_amount) || Number(invoiceRow.total_amount) || 0,
            method: 'online',
            reference: (invoiceRow.invoice_number as string) || id,
            date: (invoiceRow.issue_date as string) || (invoiceRow.date as string) || today,
          };

      const receiptData = buildReceiptInvoiceData(
        invoiceRow as Parameters<typeof buildReceiptInvoiceData>[0],
        paymentLike,
      );
      pdfBuffer = await pack.documents.renderInvoicePdf!(receiptData, tenant);

      createReceiptForPayment(
        supabase,
        invoiceRow as Parameters<typeof createReceiptForPayment>[1],
        paymentLike,
        tenant,
        pack.currencyCode,
        async () => pdfBuffer,
      ).catch((receiptErr) => {
        console.warn('[invoices] receipt persist failed:', (receiptErr as Error).message);
      });
    }

    const receiptNumber = (existingReceipt?.invoice_number as string | undefined)
      || `RCP-${invoiceRow.invoice_number}`;
    const inline = req.query.inline === '1' || req.query.inline === 'true';
    return sendPdf(res, pdfBuffer, `receipt-${receiptNumber}.pdf`, inline);
  } catch (err) {
    if (err instanceof NotImplementedInJurisdiction || (err as any).name === 'NotImplementedInJurisdiction') {
      return res.status(501).json({ message: (err as Error).message, code: 501, feature: (err as any).feature });
    }
    if (err instanceof PdfQueueSaturatedError) {
      res.setHeader('Retry-After', '5');
      return res.status(503).json({ message: err.message, code: err.code });
    }
    console.error('Failed to generate receipt PDF:', err);
    return res.status(500).json({ message: 'Failed to generate receipt PDF' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/invoices/:id/payment-link — get or create a Moyasar checkout link
// Accessible to finance users and to parents of the linked student.
// ---------------------------------------------------------------------------

invoiceRouter.get('/:id/payment-link', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: invoiceId } = req.params;
    let tenantId = req.user?.tenant_id || (req.headers['x-tenant-id'] as string) || (req.query.tenant_id as string);

    // Platform owners may not have a tenant_id in their token; look up the invoice first.
    let invoiceQuery = supabase
      .from('invoices')
      .select('id, student_id, guardian_id, tenant_id, branch_id, status, document_type, total_amount, paid_amount')
      .eq('id', invoiceId);
    if (tenantId) {
      invoiceQuery = invoiceQuery.eq('tenant_id', tenantId);
    }
    const { data: invoice, error: invoiceError } = await invoiceQuery.single();

    if (invoice && !tenantId && req.user?.is_platform_owner) {
      // Cross-tenant lookup succeeded; adopt the invoice's tenant.
      tenantId = invoice.tenant_id as string;
    }

    if (invoiceError || !invoice || !tenantId) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const { data: parentRow } = await supabase
      .from('users')
      .select('linked_student_ids, email, user_role')
      .eq('auth_id', req.user!.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    const linked: string[] = (parentRow?.linked_student_ids as string[] | null) ?? [];
    const isParentPortalUser = parentRow?.user_role === 'parent' || linked.length > 0;

    // Parents (and dual-role staff with linked children) may only pay their own kids.
    if (isParentPortalUser && req.user!.role !== 'finance' && req.user!.role !== 'admin' && req.user!.role !== 'school_admin') {
      const isLinkedStudent = invoice.student_id && linked.includes(invoice.student_id as string);

      let isGuardian = false;
      if (!isLinkedStudent && invoice.guardian_id && parentRow?.email) {
        const { count } = await supabase
          .from('guardians')
          .select('*', { count: 'exact', head: true })
          .eq('id', invoice.guardian_id)
          .eq('email', parentRow.email as string)
          .eq('tenant_id', tenantId);
        isGuardian = (count ?? 0) > 0;
      }

      if (!isLinkedStudent && !isGuardian) {
        return res.status(403).json({ message: 'Not authorized to pay this invoice' });
      }
    }

    const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    const mobileReturn = String(req.query.client || '') === 'mobile';
    const appReturn = process.env.PARENT_APP_RETURN_URL || 'edusaga-parent://payment';
    const portalReturn = process.env.PARENT_PORTAL_URL || process.env.FRONTEND_URL || 'https://parentportal.edusaga360.com';
    const returnBase = mobileReturn ? appReturn : portalReturn;
    const ctx = await buildRequestContext(supabase, tenantId, (invoice.branch_id as string) ?? undefined);
    const pack = resolvePack(ctx);
    if (!pack.payments?.getOrCreatePaymentLink) {
      throw new NotImplementedInJurisdiction(resolveJurisdiction(ctx), 'payment link');
    }
    const result = await pack.payments.getOrCreatePaymentLink(supabase, {
      tenantId: tenantId as string,
      invoiceId: invoiceId as string,
      callbackUrl: `${baseUrl}/api/public/billing/moyasar/webhook`,
      successUrl: `${returnBase}/result?status=success`,
      backUrl: `${returnBase}/result?status=pending`,
    });

    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }

    return res.json(result);
  } catch (err) {
    if (err instanceof NotImplementedInJurisdiction || (err as any).name === 'NotImplementedInJurisdiction') {
      return res.status(501).json({ message: (err as Error).message, code: 501, feature: (err as any).feature });
    }
    console.error('Failed to get payment link:', err);
    return res.status(500).json({ message: 'Failed to get payment link' });
  }
});
