import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AuthenticatedRequest, requireRole, FINANCE_ROLES } from '../middleware/auth.js';
import {
  generateTLVQR,
  generateUBLXml,
  generateInvoiceHash,
  generateZATCAInvoicePDF,
  InvoiceData,
  TenantData,
} from '../services/zatca.js';

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
  subtotal: z.number().min(0),
  vat_amount: z.number().min(0),
  total_amount: z.number().min(0),
  student_name: z.string().optional(),
  student_id: z.string().optional(),
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

    const invoice: InvoiceData = parsed.data;
    const tenantId = req.user!.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID not found in token' });
    }

    const tenant = await getTenantData(tenantId);

    // Generate ZATCA artifacts
    const qr_code = generateTLVQR(invoice, tenant);
    const ubl_xml = generateUBLXml(invoice, tenant);
    const invoice_hash = generateInvoiceHash(ubl_xml);

    // Generate PDF and encode as base64
    const pdfBuffer = await generateZATCAInvoicePDF(invoice, tenant);
    const pdf_base64 = pdfBuffer.toString('base64');

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
      zatca_status: 'generated' as const,
      tenant_id: tenantId,
      created_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from('zatca_invoices')
      .upsert(zatcaRecord, { onConflict: 'invoice_number,tenant_id' });

    if (upsertError) {
      console.error('Failed to upsert zatca_invoices:', upsertError);
      // Non-fatal — still return the generated data
    }

    return res.status(200).json({
      qr_code,
      invoice_hash,
      ubl_xml,
      pdf_base64,
    });
  } catch (err) {
    console.error('Failed to generate ZATCA invoice:', err);
    return res.status(500).json({ message: 'Failed to generate ZATCA invoice' });
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
    console.error('Failed to generate invoice PDF:', err);
    return res.status(500).json({ message: 'Failed to generate invoice PDF' });
  }
});
