/**
 * ATS sync runner.
 *
 * fetchCandidates()  — pure: executes a provider's plan over HTTP and returns
 *                      normalized candidates. Fetch is injectable for tests.
 * upsertCandidates() — persists normalized candidates into hr_candidates,
 *                      idempotent on (tenant_id, provider, external_id) so a
 *                      re-sync updates in place rather than duplicating.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertPublicUrl } from '../../lib/ssrfGuard.js';
import { AtsError, AtsProvider, AtsProviderContext, NormalizedCandidate } from './types.js';

export async function fetchCandidates(
  provider: AtsProvider,
  ctx: AtsProviderContext,
): Promise<NormalizedCandidate[]> {
  const plan = provider.buildPlan(ctx.config, ctx.credentials);
  const doFetch = ctx.fetchImpl ?? fetch;

  // SSRF guard for admin-configured targets (custom base_url, Workday/LinkedIn/
  // Indeed URLs) before any outbound request.
  try {
    await assertPublicUrl(plan.url);
  } catch (e) {
    throw new AtsError(`${provider.label}: ${(e as Error).message}`);
  }

  let resp: Response;
  try {
    resp = await doFetch(plan.url, { method: plan.method ?? 'GET', headers: plan.headers, body: plan.body });
  } catch (e) {
    throw new AtsError(`Could not reach ${provider.label}: ${(e as Error).message}`);
  }
  if (!resp.ok) {
    throw new AtsError(`${provider.label} returned HTTP ${resp.status}`);
  }

  const json: unknown = await resp.json();
  return plan
    .extractList(json)
    .map((item) => plan.mapItem(item))
    // Drop rows we can't key or name — never persist junk.
    .filter((c) => !!c.external_id && !!c.full_name);
}

export interface SyncResult {
  fetched: number;
  created: number;
  updated: number;
}

export async function upsertCandidates(
  db: SupabaseClient,
  tenantId: string,
  connectorId: string,
  provider: string,
  candidates: NormalizedCandidate[],
): Promise<SyncResult> {
  let created = 0;
  let updated = 0;
  const now = new Date().toISOString();

  for (const c of candidates) {
    const { data: existing } = await db
      .from('hr_candidates')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('provider', provider)
      .eq('external_id', c.external_id)
      .maybeSingle();

    const fields = {
      connector_id: connectorId,
      full_name: c.full_name,
      email: c.email ?? null,
      phone: c.phone ?? null,
      job_title: c.job_title ?? null,
      stage: c.stage ?? null,
      applied_at: c.applied_at ?? null,
      raw: c.raw ?? {},
      synced_at: now,
    };

    if (existing) {
      await db
        .from('hr_candidates')
        .update({ ...fields, updated_at: now })
        .eq('tenant_id', tenantId)
        .eq('id', (existing as { id: string }).id);
      updated += 1;
    } else {
      await db
        .from('hr_candidates')
        .insert({ tenant_id: tenantId, provider, external_id: c.external_id, ...fields });
      created += 1;
    }
  }

  return { fetched: candidates.length, created, updated };
}
