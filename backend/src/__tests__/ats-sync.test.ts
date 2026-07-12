/**
 * ATS sync — upsertCandidates idempotency against a mocked Supabase.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createSupabaseStub } from './support/supabaseMock.js';
import { upsertCandidates } from '../services/ats/sync.js';

const db = createSupabaseStub();

beforeEach(() => db.reset());

const candidates = [
  { external_id: '1', full_name: 'Alpha', email: 'a@x.com', raw: {} },
  { external_id: '2', full_name: 'Beta', raw: {} },
];

describe('upsertCandidates', () => {
  it('inserts candidates that do not yet exist', async () => {
    db.setResolver((ctx) => (ctx.table === 'hr_candidates' && ctx.op === 'select' ? { data: null } : {}));
    const res = await upsertCandidates(db.client, 'tenant-A', 'conn-1', 'greenhouse', candidates);
    expect(res).toEqual({ fetched: 2, created: 2, updated: 0 });
  });

  it('updates candidates that already exist (idempotent re-sync)', async () => {
    db.setResolver((ctx) => (ctx.table === 'hr_candidates' && ctx.op === 'select' ? { data: { id: 'existing' } } : {}));
    const res = await upsertCandidates(db.client, 'tenant-A', 'conn-1', 'greenhouse', candidates);
    expect(res).toEqual({ fetched: 2, created: 0, updated: 2 });
  });

  it('keys the lookup on (tenant, provider, external_id)', async () => {
    db.setResolver((ctx) => (ctx.table === 'hr_candidates' && ctx.op === 'select' ? { data: null } : {}));
    await upsertCandidates(db.client, 'tenant-A', 'conn-1', 'greenhouse', [candidates[0]]);
    const lookup = db.filtersFor('hr_candidates').find((c) => c.op === 'select')!;
    const keys = lookup.filters.filter((f) => f.method === 'eq').map((f) => f.args[0]);
    expect(keys).toEqual(expect.arrayContaining(['tenant_id', 'provider', 'external_id']));
  });
});
