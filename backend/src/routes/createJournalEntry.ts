/**
 * Compatibility endpoint for frontend createJournalEntry() calls.
 * Mounted at POST /api/functions/createJournalEntry
 *
 * Accepts account_code-based lines (legacy Base44 / integration shape),
 * posts via post_journal RPC, and returns { entry }.
 */
import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { AuthenticatedRequest, requireRole, FINANCE_ROLES, PAYROLL_ROLES } from '../middleware/auth.js';

export const createJournalEntryRouter = Router();

const LineSchema = z.object({
  account_code: z.string().min(1),
  account_name: z.string().optional(),
  debit: z.number().min(0).default(0),
  credit: z.number().min(0).default(0),
  description: z.string().optional(),
  line_number: z.number().optional(),
});

const BodySchema = z.object({
  date: z.string().optional(),
  reference: z.string().optional(),
  description: z.string().min(1),
  journal_type: z.string().optional(),
  journal_number: z.string().optional(),
  branch_id: z.string().nullable().optional(),
  source_document_type: z.string().optional(),
  source_document_id: z.string().optional(),
  requested_status: z.enum(['draft', 'approved', 'posted']).optional(),
  lines: z.array(LineSchema).min(2),
});

/** Ensure payroll / expense liability accounts exist so payroll posting can resolve. */
async function ensurePayrollAccounts(tenantId: string) {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('jurisdiction_code')
    .eq('id', tenantId)
    .maybeSingle();
  const currency =
    String(tenant?.jurisdiction_code || 'SA').toUpperCase() === 'AE'
      ? 'AED'
      : String(tenant?.jurisdiction_code || 'SA').toUpperCase() === 'QA'
        ? 'QAR'
        : 'SAR';

  const needed = [
    { code: '510001', name_en: 'Salary Expense', name_ar: 'مصروف الرواتب', type: 'expense' },
    { code: '511001', name_en: 'Social Insurance Employer Expense', name_ar: 'مصروف التأمينات (صاحب العمل)', type: 'expense' },
    { code: '220001', name_en: 'Salaries Payable', name_ar: 'رواتب مستحقة', type: 'liability' },
    { code: '221001', name_en: 'Social Insurance Payable', name_ar: 'تأمينات مستحقة', type: 'liability' },
    { code: '222001', name_en: 'Payroll Deductions Clearing', name_ar: 'مقاصة استقطاعات الرواتب', type: 'liability' },
  ];

  for (const acct of needed) {
    const { data: existing } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('code', acct.code)
      .maybeSingle();
    if (existing) continue;
    const { error } = await supabase.from('chart_of_accounts').insert({
      tenant_id: tenantId,
      code: acct.code,
      name_en: acct.name_en,
      name_ar: acct.name_ar,
      type: acct.type,
      currency_code: currency,
      is_active: true,
    });
    if (error) {
      console.warn('[createJournalEntry] COA seed skipped for', acct.code, error.message);
    }
  }
}

/** Map common legacy short codes onto seeded 6-digit chart codes. */
function normalizeAccountCode(code: string): string {
  const map: Record<string, string> = {
    '6000': '510001',
    '5010': '510001',
    '6010': '511001',
    '6030': '511001',
    '2100': '220001',
    '2080': '220001',
    '2200': '221001',
    '2081': '221001',
    '2082': '221001',
    '2090': '222001',
    '51': '510001',
    '511': '511001',
    '22': '220001',
    '221': '221001',
    '222': '222001',
  };
  return map[code] || code;
}

createJournalEntryRouter.post(
  '/',
  requireRole([...new Set([...FINANCE_ROLES, ...PAYROLL_ROLES])]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = BodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten(),
        });
      }

      const tenantId = req.user!.tenant_id!;
      const userId = req.user!.id;
      const payload = parsed.data;

      const lines = payload.lines
        .map((l) => ({
          account_code: normalizeAccountCode(l.account_code),
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          description: l.description || payload.description,
        }))
        .filter((l) => l.debit > 0 || l.credit > 0);

      const totalDebit = Math.round(lines.reduce((s, l) => s + l.debit, 0) * 100) / 100;
      const totalCredit = Math.round(lines.reduce((s, l) => s + l.credit, 0) * 100) / 100;
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return res.status(400).json({
          error: `Debits (${totalDebit}) must equal credits (${totalCredit})`,
        });
      }
      if (totalDebit <= 0) {
        return res.status(400).json({ error: 'Journal entry has zero amount' });
      }

      // Payroll / salary postings need expense + payable accounts.
      const needsPayrollCoa = lines.some((l) =>
        /^(51|52|22|6000|6010|2100|2200|5010|208)/.test(l.account_code),
      );
      if (needsPayrollCoa || payload.source_document_type === 'PayRun') {
        await ensurePayrollAccounts(tenantId);
      }

      const reference =
        payload.reference ||
        payload.journal_number ||
        `JE-${Date.now().toString(36).toUpperCase()}`;

      const branchId =
        payload.branch_id && payload.branch_id !== 'all' ? payload.branch_id : null;

      const { data: jeId, error: rpcError } = await supabase.rpc('post_journal', {
        p_tenant_id: tenantId,
        p_created_by: userId,
        p_reference: reference,
        p_description: payload.description,
        p_lines: lines,
        p_branch_id: branchId,
      });

      if (rpcError) {
        const msg = rpcError.message || '';
        if (/chart_of_accounts_incomplete/i.test(msg)) {
          return res.status(422).json({
            error: 'Chart of accounts incomplete — journal skipped',
            code: 'COA_INCOMPLETE',
            details: msg,
          });
        }
        console.error('[createJournalEntry] post_journal failed:', rpcError);
        return res.status(500).json({ error: 'Failed to post journal entry', details: msg });
      }

      if (!jeId) {
        return res.status(422).json({
          error: 'Chart of accounts incomplete — journal skipped',
          code: 'COA_INCOMPLETE',
        });
      }

      if (payload.date) {
        await supabase.from('journal_entries').update({ date: payload.date }).eq('id', jeId);
      }

      const { data: entry, error: fetchErr } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('id', jeId)
        .single();
      if (fetchErr) throw fetchErr;

      return res.status(201).json({ entry });
    } catch (err: any) {
      console.error('[createJournalEntry] error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to create journal entry' });
    }
  },
);
