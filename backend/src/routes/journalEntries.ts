import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth.js';

export const journalEntryRouter = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const JournalLineSchema = z.object({
  account_id: z.string(),
  debit: z.number().min(0),
  credit: z.number().min(0),
  description: z.string().optional(),
  cost_center_id: z.string().optional(),
});

const CreateJournalEntrySchema = z.object({
  date: z.string(),
  reference: z.string().optional(),
  description: z.string(),
  lines: z.array(JournalLineSchema).min(2),
  fiscal_period_id: z.string().optional(),
});

journalEntryRouter.post('/', async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = CreateJournalEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: parsed.error.flatten(),
      });
    }

    const { lines, ...entry } = parsed.data;

    const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return res.status(400).json({
        message: `Debits (${totalDebit}) must equal credits (${totalCredit})`,
      });
    }

    const { data: journalEntry, error: insertError } = await supabase
      .from('journal_entries')
      .insert({
        ...entry,
        tenant_id: req.user!.tenant_id,
        created_by: req.user!.id,
        total_debit: totalDebit,
        total_credit: totalCredit,
        status: 'posted',
      })
      .select()
      .single();

    if (insertError) throw insertError;

    const journalLines = lines.map((line) => ({
      ...line,
      journal_entry_id: journalEntry.id,
      tenant_id: req.user!.tenant_id,
    }));

    const { error: linesError } = await supabase
      .from('journal_entry_lines')
      .insert(journalLines);

    if (linesError) throw linesError;

    res.status(201).json(journalEntry);
  } catch (err) {
    console.error('Failed to create journal entry:', err);
    res.status(500).json({ message: 'Failed to create journal entry' });
  }
});
