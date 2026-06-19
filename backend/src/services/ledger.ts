/**
 * Minimal GL helpers shared by finance routes.
 *
 * Mirrors the journal-posting logic in routes/billing.ts (sar/findAccount/
 * postJournal) so the cheque-clearing flow records the identical double-entry
 * a cash/card payment does. billing.ts can be migrated onto this service in a
 * later pass; it is intentionally left untouched here to avoid touching the
 * revenue-critical path in this change.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** Round to 2 decimal places (SAR-safe). */
export function sar(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface JournalLine {
  account_code: string;
  debit: number;
  credit: number;
  description: string;
}

export function makeLedger(supabase: SupabaseClient) {
  /** Lookup GL account id by code prefix (best-effort, non-fatal). */
  async function findAccount(tenant_id: string, codePrefix: string): Promise<string | null> {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('tenant_id', tenant_id)
      .ilike('code', `${codePrefix}%`)
      .eq('is_active', true)
      .limit(1)
      .single();
    return (data as { id?: string } | null)?.id ?? null;
  }

  /**
   * Post a balanced journal entry. If the chart of accounts is not configured
   * (any account missing), the entry is skipped silently — exactly like billing.
   */
  async function postJournal(
    tenant_id: string,
    created_by: string,
    reference: string,
    description: string,
    lines: JournalLine[],
  ): Promise<void> {
    const total = sar(lines.reduce((s, l) => s + l.debit, 0));
    const accountIds = await Promise.all(lines.map((l) => findAccount(tenant_id, l.account_code)));
    if (accountIds.some((id) => !id)) return; // CoA not configured — skip silently

    const { data: je, error } = await supabase
      .from('journal_entries')
      .insert({
        tenant_id,
        date: new Date().toISOString().split('T')[0],
        reference,
        description,
        total_debit: total,
        total_credit: total,
        status: 'posted',
        created_by,
      })
      .select()
      .single();
    if (error || !je) return;

    await supabase.from('journal_entry_lines').insert(
      lines.map((l, i) => ({
        tenant_id,
        journal_entry_id: (je as { id: string }).id,
        account_id: accountIds[i],
        debit: l.debit,
        credit: l.credit,
        description: l.description,
      })),
    );
  }

  return { findAccount, postJournal };
}
