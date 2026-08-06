import { Router, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../../lib/supabase.js';
import { ApiKeyRequest, requireScope } from '../../middleware/apiKeyAuth.js';
import { parsePagination } from './shared.js';
import { createInvoiceForStudent } from '../billing.js';
import { shareInvoice, renderInvoicePdf } from '../../services/share.js';
import type { ShareChannel } from '../../services/share.js';

export const invoicesRouter = Router();

const CreateInvoiceSchema = z.object({
  student_id: z.string().uuid(),
  academic_year: z.string().min(4),
  fee_lines: z.array(z.object({
    category_id: z.string().uuid(),
    description_en: z.string(),
    description_ar: z.string(),
    amount: z.number().min(0),
    quantity: z.number().int().min(1).default(1),
  })).min(1),
  due_date: z.string().optional(),
  document_type: z.enum(['invoice', 'quotation', 'proforma', 'credit_note', 'debit_note', 'receipt']).default('invoice'),
  invoice_type: z.enum(['simplified', 'standard']).default('simplified'),
  buyer_name: z.string().optional(),
  buyer_vat_number: z.string().optional(),
  buyer_address: z.string().optional(),
  supply_date: z.string().optional(),
  notes: z.string().optional(),
  terms_and_conditions: z.string().optional(),
});

const ShareInvoiceSchema = z.object({
  channels: z.array(z.enum(['whatsapp', 'email', 'link', 'print'])).min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  expires_in_hours: z.number().int().min(1).max(720).optional().default(168),
});

invoicesRouter.get('/', requireScope('invoices:read'), async (req: ApiKeyRequest, res: Response) => {
  const tenantId = req.apiClient!.tenantId;
  const { limit, offset } = parsePagination(req);
  const { student_id, status } = req.query as Record<string, string | undefined>;

  let query = supabase
    .from('invoices')
    .select('id, invoice_number, student_id, date, due_date, total_amount, paid_amount, status, created_at', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (student_id) query = query.eq('student_id', student_id);
  if (status) query = query.eq('status', status);

  const { data, error, count } = await query
    .order('date', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return res.status(500).json({ error: 'server_error', message: 'Failed to fetch invoices' });
  }
  res.json({ data: data ?? [], pagination: { limit, offset, total: count ?? 0 } });
});

invoicesRouter.get('/:id', requireScope('invoices:read'), async (req: ApiKeyRequest, res: Response) => {
  const tenantId = req.apiClient!.tenantId;
  const { id } = req.params;
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', id as string)
    .single();
  if (error || !data) return res.status(404).json({ error: 'not_found', message: 'Invoice not found' });
  return res.json(data);
});

invoicesRouter.post('/', requireScope('invoices:write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const tenantId = req.apiClient!.tenantId;
    const parsed = CreateInvoiceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });

    const invoice = await createInvoiceForStudent(
      tenantId,
      'api',
      parsed.data.student_id,
      parsed.data.academic_year,
      parsed.data.fee_lines,
      parsed.data.due_date,
      null,
      {
        document_type: parsed.data.document_type,
        invoice_type: parsed.data.invoice_type,
        buyer_name: parsed.data.buyer_name,
        buyer_vat_number: parsed.data.buyer_vat_number,
        buyer_address: parsed.data.buyer_address,
        supply_date: parsed.data.supply_date,
        notes: parsed.data.notes,
        terms_and_conditions: parsed.data.terms_and_conditions,
      },
    );

    return res.status(201).json({ invoice });
  } catch (err) {
    console.error('[external/v1/invoices] create failed:', err);
    return res.status(500).json({ error: 'server_error', message: (err as Error).message });
  }
});

invoicesRouter.get('/:id/payments', requireScope('payments:read'), async (req: ApiKeyRequest, res: Response) => {
  const tenantId = req.apiClient!.tenantId;
  const { id } = req.params;
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('id, total_amount, paid_amount, status, balance')
    .eq('tenant_id', tenantId)
    .eq('id', id as string)
    .single();
  if (invErr || !invoice) return res.status(404).json({ error: 'not_found', message: 'Invoice not found' });

  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('invoice_id', id as string)
    .order('date', { ascending: false });

  return res.json({
    invoice_id: id,
    total_amount: invoice.total_amount,
    paid_amount: invoice.paid_amount,
    status: invoice.status,
    balance: invoice.balance,
    payments: payments ?? [],
  });
});

invoicesRouter.post('/:id/share', requireScope('invoices:share'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const tenantId = req.apiClient!.tenantId;
    const { id } = req.params;
    const parsed = ShareInvoiceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });

    const results = await shareInvoice(supabase, tenantId, id as string, parsed.data.channels as ShareChannel[], {
      phone: parsed.data.phone,
      email: parsed.data.email,
      createdBy: `api:${req.apiClient!.keyId}`,
      expiresInHours: parsed.data.expires_in_hours,
    });

    return res.json({ invoice_id: id, results });
  } catch (err) {
    console.error('[external/v1/invoices] share failed:', err);
    return res.status(500).json({ error: 'server_error', message: (err as Error).message });
  }
});

invoicesRouter.get('/:id/download-pdf', requireScope('invoices:read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const tenantId = req.apiClient!.tenantId;
    const { id } = req.params;
    const { data: row, error } = await supabase
      .from('invoices')
      .select('invoice_number')
      .eq('tenant_id', tenantId)
      .eq('id', id as string)
      .single();
    if (error || !row) return res.status(404).json({ error: 'not_found', message: 'Invoice not found' });

    const pdfBuffer = await renderInvoicePdf(supabase, tenantId, id as string);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${row.invoice_number}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[external/v1/invoices] pdf failed:', err);
    return res.status(500).json({ error: 'server_error', message: (err as Error).message });
  }
});
