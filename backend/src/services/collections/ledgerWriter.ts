import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface LedgerEntry {
  tenant_id: string;
  action_type: string;
  actor?: string;
  reference_table?: string;
  reference_id?: string;
  input_snapshot: Record<string, unknown>;
  model_version?: string;
  rule_version?: string;
  confidence?: number;
  decision: string;
  outcome?: Record<string, unknown>;
}

export function hashSnapshot(obj: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

export async function writeLedger(
  supabase: SupabaseClient,
  entry: LedgerEntry,
): Promise<void> {
  const outcome = entry.outcome ?? {};
  const { error } = await supabase.from('agent_actions_ledger').insert({
    tenant_id: entry.tenant_id,
    action_type: entry.action_type,
    actor: entry.actor ?? 'yamen',
    reference_table: entry.reference_table,
    reference_id: entry.reference_id,
    input_snapshot: entry.input_snapshot,
    input_snapshot_hash: hashSnapshot(entry.input_snapshot),
    model_version: entry.model_version,
    rule_version: entry.rule_version ?? 'unknown',
    confidence: entry.confidence,
    decision: entry.decision,
    outcome,
    outcome_hash: hashSnapshot(outcome),
  });
  if (error) {
    console.error('[collections/ledger] failed to write ledger:', error);
  }
}
