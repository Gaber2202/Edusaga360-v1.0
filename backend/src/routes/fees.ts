import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { z } from 'zod';
import { AuthenticatedRequest, requireRole, FINANCE_ROLES } from '../middleware/auth.js';
import { buildRequestContext } from '../lib/jurisdiction.js';
import { resolvePack } from '../packs/registry.js';

export const feesRouter = Router();


// VAT rate is always 15% — enforced server-side, never trusted from client
const VAT_RATE = 0.15;

// ─── Validation schemas ────────────────────────────────────────────────────

const FeeItemSchema = z.object({
  description: z.string().min(1),
  amount: z.number().positive(),
});

const CreateInvoiceSchema = z.object({
  student_id: z.string().uuid(),
  fee_items: z.array(FeeItemSchema).min(1),
  discount: z.number().min(0).optional().default(0),
  due_date: z.string().optional(),
});

const RecordPaymentSchema = z.object({
  invoice_id: z.string().uuid(),
  amount: z.number().positive(),
  payment_method: z.enum(['cash', 'bank_transfer', 'card', 'online']),
  reference: z.string().optional(),
});

// ─── Helper: generate sequential invoice number per tenant ─────────────────

async function generateInvoiceNumber(tenant_id: string): Promise<string> {
  const { count, error } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenant_id);

  if (error) throw error;

  const seq = ((count ?? 0) + 1).toString().padStart(6, '0');
  const year = new Date().getFullYear();
  return `INV-${year}-${seq}`;
}

// ─── Helper: find account by type (best-effort, falls back to code prefix) ─

async function findAccount(
  tenant_id: string,
  type: string,
  fallbackCodePrefix: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('tenant_id', tenant_id)
    .eq('type', type)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (data) return data.id;

  const { data: byCode } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('tenant_id', tenant_id)
    .ilike('code', `${fallbackCodePrefix}%`)
    .limit(1)
    .single();

  return byCode?.id ?? null;
}

// ─── POST /api/fees/invoices — Create invoice with server-enforced VAT ─────

feesRouter.post('/invoices', requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = CreateInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 400,
        errors: parsed.error.flatten(),
      });
    }

    const tenant_id = req.user!.tenant_id!;
    const { student_id, fee_items, discount, due_date } = parsed.data;

    // Verify student belongs to this tenant
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id')
      .eq('id', student_id)
      .eq('tenant_id', tenant_id)
      .single();

    if (studentError || !student) {
      return res.status(404).json({ error: 'Student not found', code: 404 });
    }

    const ctx = await buildRequestContext(supabase, tenant_id);
    const pack = resolvePack(ctx);

    // Calculate amounts — VAT enforced at 15%, never from client input
    const subtotal = fee_items.reduce((sum, item) => sum + item.amount, 0);
    const discountAmount = discount ?? 0;
    const taxableAmount = subtotal - discountAmount;
    const vatAmount = Math.round(taxableAmount * VAT_RATE * 100) / 100;
    const totalAmount = Math.round((taxableAmount + vatAmount) * 100) / 100;

    const invoiceNumber = await generateInvoiceNumber(tenant_id);
    const today = new Date().toISOString().split('T')[0];

    const items = [
      ...fee_items.map((item) => ({
        description: item.description,
        amount: item.amount,
        type: 'fee',
      })),
      ...(discountAmount > 0
        ? [{ description: 'Discount', amount: -discountAmount, type: 'discount' }]
        : []),
      {
        description: 'VAT (15%)',
        amount: vatAmount,
        type: 'vat',
        rate: VAT_RATE,
      },
    ];

    // Insert invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        tenant_id,
        currency_code: pack.currencyCode,
        student_id,
        invoice_number: invoiceNumber,
        date: today,
        due_date: due_date ?? null,
        total_amount: totalAmount,
        paid_amount: 0,
        status: 'issued',
        items,
      })
      .select()
      .single();

    if (invoiceError) throw invoiceError;

    // Create double-entry journal: A/R debit | Revenue credit | VAT Payable credit
    // Best-effort: silently skip if Chart of Accounts not yet configured
    const [arAccountId, revenueAccountId, vatAccountId] = await Promise.all([
      findAccount(tenant_id, 'asset', '12'),       // Accounts Receivable
      findAccount(tenant_id, 'revenue', '41'),      // Tuition Revenue
      findAccount(tenant_id, 'liability', '24'),    // VAT Payable
    ]);

    if (arAccountId && revenueAccountId && vatAccountId) {
      const { data: je, error: jeError } = await supabase
        .from('journal_entries')
        .insert({
          tenant_id,
          date: today,
          reference: invoiceNumber,
          description: `Invoice ${invoiceNumber} — student fees`,
          total_debit: totalAmount,
          total_credit: totalAmount,
          status: 'posted',
          created_by: req.user!.id,
        })
        .select()
        .single();

      if (jeError) throw jeError;

      const lines = [
        {
          tenant_id,
          journal_entry_id: je.id,
          account_id: arAccountId,
          debit: totalAmount,
          credit: 0,
          description: `A/R — Invoice ${invoiceNumber}`,
        },
        {
          tenant_id,
          journal_entry_id: je.id,
          account_id: revenueAccountId,
          debit: 0,
          credit: taxableAmount,
          description: `Revenue — Invoice ${invoiceNumber}`,
        },
        {
          tenant_id,
          journal_entry_id: je.id,
          account_id: vatAccountId,
          debit: 0,
          credit: vatAmount,
          description: `VAT Payable (15%) — Invoice ${invoiceNumber}`,
        },
      ];

      const { error: linesError } = await supabase
        .from('journal_entry_lines')
        .insert(lines);

      if (linesError) throw linesError;
    }

    return res.status(201).json({
      ...invoice,
      subtotal,
      discount_amount: discountAmount,
      taxable_amount: taxableAmount,
      vat_amount: vatAmount,
      vat_rate: VAT_RATE,
    });
  } catch (err) {
    console.error('Failed to create invoice:', err);
    return res.status(500).json({ error: 'Failed to create invoice', code: 500 });
  }
});

// ─── POST /api/fees/payments — Record payment against an invoice ───────────

feesRouter.post('/payments', requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = RecordPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 400,
        errors: parsed.error.flatten(),
      });
    }

    const tenant_id = req.user!.tenant_id!;
    const { invoice_id, amount, payment_method, reference } = parsed.data;

    // Fetch invoice — must belong to this tenant
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .eq('tenant_id', tenant_id)
      .single();

    if (fetchError || !invoice) {
      return res.status(404).json({ error: 'Invoice not found', code: 404 });
    }

    if (invoice.status === 'paid' || invoice.status === 'cancelled') {
      return res.status(400).json({
        error: `Invoice is already ${invoice.status}`,
        code: 400,
      });
    }

    const remaining = invoice.total_amount - invoice.paid_amount;
    if (amount > remaining + 0.01) {
      return res.status(400).json({
        error: `Payment amount (${amount}) exceeds outstanding balance (${remaining.toFixed(2)})`,
        code: 400,
      });
    }

    const today = new Date().toISOString().split('T')[0];
    const newPaidAmount = Math.round((invoice.paid_amount + amount) * 100) / 100;
    const newStatus =
      newPaidAmount >= invoice.total_amount - 0.01 ? 'paid' : 'partial';

    // Insert payment record
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        tenant_id,
        currency_code: invoice.currency_code,
        invoice_id,
        amount,
        method: payment_method,
        reference: reference ?? null,
        date: today,
        status: 'completed',
      })
      .select()
      .single();

    if (paymentError) throw paymentError;

    // Update invoice paid_amount and status
    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        paid_amount: newPaidAmount,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoice_id)
      .eq('tenant_id', tenant_id);

    if (updateError) throw updateError;

    // Create double-entry journal: Cash/Bank debit | A/R credit
    const [cashAccountId, arAccountId] = await Promise.all([
      findAccount(tenant_id, 'asset', '11'),  // Cash / Bank
      findAccount(tenant_id, 'asset', '12'),  // A/R
    ]);

    if (cashAccountId && arAccountId) {
      const ref = invoice.invoice_number ?? invoice_id.slice(0, 8);
      const { data: je, error: jeError } = await supabase
        .from('journal_entries')
        .insert({
          tenant_id,
          date: today,
          reference: reference ?? `PMT-${invoice_id.slice(0, 8)}`,
          description: `Payment received — Invoice ${ref}`,
          total_debit: amount,
          total_credit: amount,
          status: 'posted',
          created_by: req.user!.id,
        })
        .select()
        .single();

      if (jeError) throw jeError;

      const lines = [
        {
          tenant_id,
          journal_entry_id: je.id,
          account_id: cashAccountId,
          debit: amount,
          credit: 0,
          description: `${payment_method} — Invoice ${ref}`,
        },
        {
          tenant_id,
          journal_entry_id: je.id,
          account_id: arAccountId,
          debit: 0,
          credit: amount,
          description: `A/R cleared — Invoice ${ref}`,
        },
      ];

      const { error: linesError } = await supabase
        .from('journal_entry_lines')
        .insert(lines);

      if (linesError) throw linesError;
    }

    return res.status(201).json({
      payment,
      invoice: {
        id: invoice_id,
        paid_amount: newPaidAmount,
        status: newStatus,
        remaining_balance: Math.max(0, invoice.total_amount - newPaidAmount),
      },
    });
  } catch (err) {
    console.error('Failed to record payment:', err);
    return res.status(500).json({ error: 'Failed to record payment', code: 500 });
  }
});

// ─── GET /api/fees/invoices — List invoices (paginated) ───────────────────

feesRouter.get('/invoices', async (req: AuthenticatedRequest, res) => {
  try {
    const tenant_id = req.user!.tenant_id!;
    const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '20', 10)));
    const offset = (page - 1) * limit;

    const status = req.query.status as string | undefined;
    const student_id = req.query.student_id as string | undefined;

    let query = supabase
      .from('invoices')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenant_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);
    if (student_id) query = query.eq('student_id', student_id);

    const { data, count, error } = await query;
    if (error) throw error;

    return res.json({
      data,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        pages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (err) {
    console.error('Failed to list invoices:', err);
    return res.status(500).json({ error: 'Failed to list invoices', code: 500 });
  }
});

// ─── GET /api/fees/invoices/:id — Single invoice with line items ──────────

feesRouter.get('/invoices/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const tenant_id = req.user!.tenant_id!;
    const { id } = req.params;

    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('*, students(id, name_en, name_ar, student_id)')
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .single();

    if (error || !invoice) {
      return res.status(404).json({ error: 'Invoice not found', code: 404 });
    }

    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .eq('invoice_id', id)
      .eq('tenant_id', tenant_id)
      .order('created_at', { ascending: false });

    return res.json({ ...invoice, payments: payments ?? [] });
  } catch (err) {
    console.error('Failed to get invoice:', err);
    return res.status(500).json({ error: 'Failed to get invoice', code: 500 });
  }
});
