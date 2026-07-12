/**
 * Inbound email persistence — upsert normalized messages into email_messages,
 * idempotent on (tenant_id, provider, external_id) so a re-sync updates in place.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { NormalizedEmail } from './types.js';

export interface EmailSyncResult {
  fetched: number;
  created: number;
  updated: number;
}

export async function upsertMessages(
  db: SupabaseClient,
  tenantId: string,
  connectorId: string,
  provider: string,
  messages: NormalizedEmail[],
): Promise<EmailSyncResult> {
  let created = 0;
  let updated = 0;
  const now = new Date().toISOString();

  for (const m of messages) {
    const { data: existing } = await db
      .from('email_messages')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('provider', provider)
      .eq('external_id', m.external_id)
      .maybeSingle();

    const fields = {
      connector_id: connectorId,
      from_address: m.from_address ?? null,
      to_address: m.to_address ?? null,
      subject: m.subject ?? null,
      snippet: m.snippet ?? null,
      received_at: m.received_at ?? null,
      raw: m.raw ?? {},
      synced_at: now,
    };

    if (existing) {
      await db
        .from('email_messages')
        .update(fields)
        .eq('tenant_id', tenantId)
        .eq('id', (existing as { id: string }).id);
      updated += 1;
    } else {
      await db
        .from('email_messages')
        .insert({ tenant_id: tenantId, provider, external_id: m.external_id, ...fields });
      created += 1;
    }
  }

  return { fetched: messages.length, created, updated };
}
