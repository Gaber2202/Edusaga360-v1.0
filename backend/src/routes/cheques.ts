import { Router, Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { z } from 'zod';
import { AuthenticatedRequest, requireRole, FINANCE_ROLES } from '../middleware/auth.js';
import { makeLedger, sar } from '../services/ledger.js';
import {
  canTransition,
  invoiceEffectOf,
  isChequeStatus,
  requiresFollowUp,
  CHEQUE_STATUSES,
  ChequeStatus,
} from '../services/chequeLifecycle.js';

export const chequeRouter = Router();


const { postJournal } = makeLedger(supabase);

interface ChequeRow {
  id: string;
  tenant_id: string;
  cheque_number: string;
  amount: number;
  status: ChequeStatus;
  invoice_id?: string | null;
  payment_id?: string | null;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  total_amount: number;
  paid_amount: number;
  branch_id?: string | null;
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const CreateChequeSchema = z.object({
  cheque_number: z.string().min(1),
  bank_name: z.string().optional(),
  drawer_name: z.string().optional(),
  amount: z.number().positive(),
  currency_code: z.string().optional(),
  currency: z.string().optional(), // deprecated alias
  issue_date: z.string().optional(),
  due_date: z.string().optional(),
  invoice_id: z.string().uuid().optional(),
  student_id: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const TransitionSchema = z.object({
  to_status: z.enum(CHEQUE_STATUSES),
  bounce_reason: z.string().optional(),
  note: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Invoice sync helpers — a cleared cheque records a payment + GL journal
// exactly like a cash/card payment; a bounce reverses it.
// ---------------------------------------------------------------------------

async function applyToInvoice(tenant_id: string, userId: string, cheque: ChequeRow) {
  const { data: invoice } = await supabase
    .from('invoices').select('*').eq('id', cheque.invoice_id).eq('tenant_id', tenant_id).single();
  if (!invoice) return null;
  const inv = invoice as InvoiceRow;
  const today = new Date().toISOString().split('T')[0];
  const newPaid = sar((inv.paid_amount ?? 0) + cheque.amount);
  const newStatus = newPaid >= inv.total_amount - 0.01 ? 'paid' : 'partial';

  const { data: payment } = await supabase
    .from('payments')
    .insert({
      tenant_id,
      branch_id: inv.branch_id ?? null,
      invoice_id: cheque.invoice_id,
      amount: cheque.amount,
      method: 'cheque',
      reference: cheque.cheque_number,
      date: today,
      status: 'completed',
    })
    .select()
    .single();

  await supabase.from('invoices')
    .update({ paid_amount: newPaid, status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', cheque.invoice_id).eq('tenant_id', tenant_id);

  await postJournal(tenant_id, userId, cheque.cheque_number, `Cheque cleared — ${inv.invoice_number}`, [
    { account_code: '11', debit: cheque.amount, credit: 0, description: `Cheque ${cheque.cheque_number} cleared` },
    { account_code: '12', debit: 0, credit: cheque.amount, description: `A/R cleared — ${inv.invoice_number}` },
  ], inv.branch_id ?? null);

  return { invoice_id: cheque.invoice_id, paid_amount: newPaid, status: newStatus, payment_id: (payment as { id?: string } | null)?.id ?? null };
}

async function reverseFromInvoice(tenant_id: string, userId: string, cheque: ChequeRow) {
  const { data: invoice } = await supabase
    .from('invoices').select('*').eq('id', cheque.invoice_id).eq('tenant_id', tenant_id).single();
  if (!invoice) return null;
  const inv = invoice as InvoiceRow;
  const newPaid = sar(Math.max(0, (inv.paid_amount ?? 0) - cheque.amount));
  const newStatus = newPaid <= 0.01 ? 'issued' : 'partial';

  if (cheque.payment_id) {
    await supabase.from('payments').update({ status: 'reversed' }).eq('id', cheque.payment_id).eq('tenant_id', tenant_id);
  }

  await supabase.from('invoices')
    .update({ paid_amount: newPaid, status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', cheque.invoice_id).eq('tenant_id', tenant_id);

  await postJournal(tenant_id, userId, cheque.cheque_number, `Cheque bounced — ${inv.invoice_number}`, [
    { account_code: '12', debit: cheque.amount, credit: 0, description: `A/R reinstated — ${inv.invoice_number}` },
    { account_code: '11', debit: 0, credit: cheque.amount, description: `Cheque ${cheque.cheque_number} bounced` },
  ], inv.branch_id ?? null);

  return { invoice_id: cheque.invoice_id, paid_amount: newPaid, status: newStatus, reversed: true };
}

// ---------------------------------------------------------------------------
// POST /api/cheques — record a new cheque (defaults to 'received')
// ---------------------------------------------------------------------------

chequeRouter.post('/', requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  const parsed = CreateChequeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const tenant_id = req.user!.tenant_id!;

  const { currency, currency_code, ...chequeData } = parsed.data;
  const { data: cheque, error } = await supabase
    .from('cheques')
    .insert({
      tenant_id,
      ...chequeData,
      currency_code: currency_code ?? currency ?? 'SAR',
      status: 'received',
      created_by: req.user!.id,
    })
    .select()
    .single();
  if (error) {
    console.error('cheques create:', error);
    return res.status(500).json({ error: 'Failed to record cheque' });
  }

  await supabase.from('cheque_status_history').insert({
    tenant_id, cheque_id: (cheque as ChequeRow).id, from_status: null, to_status: 'received', changed_by: req.user!.id,
  });

  return res.status(201).json(cheque);
});

// ---------------------------------------------------------------------------
// GET /api/cheques — list (filters: status, invoice_id, student_id, overdue)
// ---------------------------------------------------------------------------

chequeRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = req.user!.tenant_id!;
  const { status, invoice_id, student_id, overdue } = req.query as Record<string, string>;

  let q = supabase.from('cheques').select('*').eq('tenant_id', tenant_id).order('due_date', { ascending: true });
  if (status) q = q.eq('status', status);
  if (invoice_id) q = q.eq('invoice_id', invoice_id);
  if (student_id) q = q.eq('student_id', student_id);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  let rows = (data ?? []) as Array<ChequeRow & { due_date?: string | null }>;
  if (overdue === 'true') {
    const today = new Date().toISOString().split('T')[0];
    const OPEN: ChequeStatus[] = ['received', 'pending_deposit', 'deposited'];
    rows = rows.filter((c) => c.due_date && c.due_date < today && OPEN.includes(c.status));
  }
  return res.json(rows);
});

// ---------------------------------------------------------------------------
// POST /api/cheques/:id/transition — move a cheque to the next state and,
// when it clears/bounces, sync the linked invoice's payment status.
// ---------------------------------------------------------------------------

chequeRouter.post('/:id/transition', requireRole(FINANCE_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  const parsed = TransitionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const tenant_id = req.user!.tenant_id!;
  const { id } = req.params;
  const { to_status, bounce_reason, note } = parsed.data;

  const { data: chequeRow, error: fetchErr } = await supabase
    .from('cheques').select('*').eq('id', id).eq('tenant_id', tenant_id).single();
  if (fetchErr || !chequeRow) return res.status(404).json({ error: 'Cheque not found' });
  const cheque = chequeRow as ChequeRow;

  const from = cheque.status;
  if (!isChequeStatus(to_status) || !canTransition(from, to_status)) {
    return res.status(400).json({ error: `Illegal transition: ${from} → ${to_status}` });
  }

  const effect = invoiceEffectOf(from, to_status);
  const updates: Record<string, unknown> = { status: to_status, updated_at: new Date().toISOString() };
  if (to_status === 'bounced') updates.bounce_reason = bounce_reason ?? null;

  let invoiceSync: Record<string, unknown> | null = null;
  if (effect !== 'none' && cheque.invoice_id) {
    invoiceSync = effect === 'apply'
      ? await applyToInvoice(tenant_id, req.user!.id, cheque)
      : await reverseFromInvoice(tenant_id, req.user!.id, cheque);
    if (effect === 'apply' && invoiceSync?.payment_id) updates.payment_id = invoiceSync.payment_id;
  }

  const { data: updated, error: updErr } = await supabase
    .from('cheques').update(updates).eq('id', id).eq('tenant_id', tenant_id).select().single();
  if (updErr) {
    console.error('cheque transition update:', updErr);
    return res.status(500).json({ error: 'Failed to update cheque' });
  }

  await supabase.from('cheque_status_history').insert({
    tenant_id, cheque_id: id, from_status: from, to_status, note: note ?? bounce_reason ?? null, changed_by: req.user!.id,
  });

  return res.json({ cheque: updated, invoice_sync: invoiceSync, follow_up_required: requiresFollowUp(to_status) });
});
