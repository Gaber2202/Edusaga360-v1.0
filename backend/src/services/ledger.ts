/**
 * Minimal GL helpers shared by finance routes.
 *
 * Journal posting is delegated to the post_journal Postgres function so the
 * header and lines are written atomically (see the 20260701_atomic_journal_
 * posting migration). routes/billing.ts posts through the same function, so the
 * cheque-clearing flow records the identical double-entry a cash/card payment
 * does.
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
      .maybeSingle();
    return (data as { id?: string } | null)?.id ?? null;
  }

  /**
   * Post a balanced journal entry atomically. If the chart of accounts is not
   * configured (any account missing), the function resolves nothing and returns
   * null and the entry is skipped silently — exactly like billing.
   */
  async function postJournal(
    tenant_id: string,
    created_by: string,
    reference: string,
    description: string,
    lines: JournalLine[],
  ): Promise<void> {
    const { error } = await supabase.rpc('post_journal', {
      p_tenant_id: tenant_id,
      p_created_by: created_by,
      p_reference: reference,
      p_description: description,
      p_lines: lines,
    });
    if (error) console.warn('[ledger] post_journal failed:', error.message);
  }

  return { findAccount, postJournal };
}
