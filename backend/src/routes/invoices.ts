import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { z } from 'zod';
import { AuthenticatedRequest, requireRole, FINANCE_ROLES } from '../middleware/auth.js';
import {
  generateTLVQR,
  generateUBLXml,
  generateInvoiceHash,
  generateZATCAInvoicePDF,
  signInvoice,
  generatePIH,
  reportInvoice,
  clearInvoice,
  complianceCheck,
  InvoiceData,
  TenantData,
} from '../services/zatca.js';
import { PdfQueueSaturatedError } from '../lib/pdfConcurrency.js';

export const invoiceRouter = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const InvoiceItemSchema = z.object({
  description: z.string(),
  amount: z.number().min(0),
  vat_rate: z.number().optional(),
});

const GenerateZATCASchema = z.object({
  invoice_id: z.string().optional(),
  invoice_number: z.string(),
  issue_date: z.string(),
  invoice_type: z.enum(['standard', 'credit_note']).optional(),
  zatca_invoice_type: z.enum(['standard', 'simplified']).optional(),
  subtotal: z.number().min(0),
  vat_amount: z.number().min(0),
  total_amount: z.number().min(0),
  student_name: z.string().optional(),
  student_id: z.string().optional(),
  buyer_vat_number: z.string().optional(),
  buyer_address: z.string().optional(),
  items: z.array(InvoiceItemSchema).optional(),
  discount_amount: z.number().optional(),
  notes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Helper: get tenant data from Supabase
// ---------------------------------------------------------------------------

async function getTenantData(tenantId: string): Promise<TenantData> {
  const { data } = await supabase
    .from('tenants')
    .select('id, name, name_ar, vat_number, address, address_ar, phone, email, cr_number')
    .eq('id', tenantId)
    .single();

  return (data as TenantData) || {};
}

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

    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID not found in token' });
    }

    const tenant = await getTenantData(tenantId);
    const icv = await getNextICV(tenantId);
    const previousHash = await getPreviousInvoiceHash(tenantId);
    const uuid = crypto.randomUUID();

    const invoice: InvoiceData = {
      ...parsed.data,
      uuid,
      icv,
      previous_invoice_hash: previousHash,
    };

    // Generate ZATCA artifacts
    const ubl_xml = generateUBLXml(invoice, tenant);
    const invoice_hash = generateInvoiceHash(ubl_xml);
    const signature = signInvoice(invoice_hash);
    const pih = generatePIH(previousHash);
    const qr_code = generateTLVQR(invoice, tenant, signature);

    // Generate PDF with proper Arabic rendering
    const pdfBuffer = await generateZATCAInvoicePDF(invoice, tenant);
    const pdf_base64 = pdfBuffer.toString('base64');

    // Submit to ZATCA API based on invoice type
    const isSimplified = invoice.zatca_invoice_type === 'simplified';
    const xmlBase64 = Buffer.from(ubl_xml, 'utf8').toString('base64');

    let zatcaResponse = null;
    let zatcaStatus = 'generated';

    try {
      if (isSimplified) {
        zatcaResponse = await reportInvoice(xmlBase64, invoice_hash, uuid);
        zatcaStatus = zatcaResponse.reportingStatus === 'REPORTED' ? 'reported' : 'generated';
      } else {
        zatcaResponse = await clearInvoice(xmlBase64, invoice_hash, uuid);
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

    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID not found' });
    }

    const tenant = await getTenantData(tenantId);
    const uuid = crypto.randomUUID();

    const invoice: InvoiceData = { ...parsed.data, uuid, icv: 1 };
    const xml = generateUBLXml(invoice, tenant);
    const hash = generateInvoiceHash(xml);
    const xmlBase64 = Buffer.from(xml, 'utf8').toString('base64');

    const result = await complianceCheck(xmlBase64, hash, uuid);

    return res.status(200).json({ uuid, invoice_hash: hash, compliance_result: result });
  } catch (err) {
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
    const tenantId = req.user!.tenant_id;

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

// ---------------------------------------------------------------------------
// GET /api/invoices/:id/download-pdf
// ---------------------------------------------------------------------------

invoiceRouter.get('/:id/download-pdf', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID not found in token' });
    }

    // Fetch invoice from Supabase
    const { data: invoiceRow, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (invoiceError || !invoiceRow) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Parents may only download invoices for their own linked children.
    if (req.user!.role === 'parent') {
      const { data: parent } = await supabase
        .from('users')
        .select('linked_student_ids')
        .eq('auth_id', req.user!.id)
        .single();
      const linked: string[] = (parent?.linked_student_ids as string[] | null) ?? [];
      if (!invoiceRow.student_id || !linked.includes(invoiceRow.student_id)) {
        return res.status(403).json({ message: 'Not authorized to access this invoice' });
      }
    }

    const tenant = await getTenantData(tenantId);

    const invoice: InvoiceData = {
      invoice_number: invoiceRow.invoice_number,
      issue_date: invoiceRow.issue_date,
      subtotal: invoiceRow.subtotal || 0,
      vat_amount: invoiceRow.vat_amount || 0,
      total_amount: invoiceRow.total_amount || 0,
      student_name: invoiceRow.student_name,
      student_id: invoiceRow.student_id,
      items: invoiceRow.items || undefined,
      discount_amount: invoiceRow.discount_amount || 0,
      notes: invoiceRow.notes || undefined,
    };

    const pdfBuffer = await generateZATCAInvoicePDF(invoice, tenant);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="invoice-${invoice.invoice_number}.pdf"`,
    );
    res.setHeader('Content-Length', pdfBuffer.length);

    return res.send(pdfBuffer);
  } catch (err) {
    if (err instanceof PdfQueueSaturatedError) {
      res.setHeader('Retry-After', '5');
      return res.status(503).json({ message: err.message, code: err.code });
    }
    console.error('Failed to generate invoice PDF:', err);
    return res.status(500).json({ message: 'Failed to generate invoice PDF' });
  }
});
