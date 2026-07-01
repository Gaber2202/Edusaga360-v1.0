/**
 * Executive Command Center — access control + Vitality Index tests.
 *
 * Covers the acceptance requirement: a CFO-only grant must 403 on every other
 * persona (esp. /api/exec/ceo) even with a valid token and a direct API call,
 * while admin/creator/platform-owner retain implicit view-all. Also covers
 * tenant isolation on the access-grant lookup and the Vitality Index's
 * weighted-average math, including normalization when configured weights
 * don't sum to 100.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { makeReq, makeRes } from './helpers.js';
import { createSupabaseStub, injectUser } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { requireExecAccess, hasImplicitViewAll, getAccessiblePersonas } = await import('../middleware/execAccess.js');
const { execRouter, computeVitalityIndex, pctDelta, stripMarkdown } = await import('../routes/exec.js');

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});

// ── hasImplicitViewAll ───────────────────────────────────────────────────────

describe('hasImplicitViewAll', () => {
  it('grants view-all to a platform owner', () => {
    expect(hasImplicitViewAll({ id: 'u1', email: 'a@b.com', is_platform_owner: true })).toBe(true);
  });
  it('grants view-all to a tenant admin', () => {
    expect(hasImplicitViewAll({ id: 'u1', email: 'a@b.com', role: 'admin' })).toBe(true);
  });
  it('grants view-all to a creator', () => {
    expect(hasImplicitViewAll({ id: 'u1', email: 'a@b.com', role: 'creator' })).toBe(true);
  });
  it('denies a plain exec persona role', () => {
    expect(hasImplicitViewAll({ id: 'u1', email: 'a@b.com', role: 'cfo' })).toBe(false);
  });
  it('denies an undefined user', () => {
    expect(hasImplicitViewAll(undefined)).toBe(false);
  });
});

// ── requireExecAccess middleware (unit level) ────────────────────────────────

describe('requireExecAccess', () => {
  function grantResolver(grantedPersonas: string[]) {
    return (ctx: any) => {
      if (ctx.table !== 'exec_dashboard_access') return {};
      if (ctx.single) {
        const personaArg = ctx.filters.find((f: any) => f.method === 'eq' && f.args[0] === 'persona')?.args[1];
        return { data: grantedPersonas.includes(personaArg) ? { id: 'grant-1' } : null };
      }
      return { data: grantedPersonas.map((p) => ({ persona: p })) };
    };
  }

  it('lets an admin through without querying exec_dashboard_access', async () => {
    const req = makeReq({ user: { id: 'u1', email: 'a@b.com', role: 'admin', tenant_id: 'tenant-A' } });
    const res = makeRes();
    const next = vi.fn();
    await requireExecAccess('ceo')(req as never, res as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(db.filtersFor('exec_dashboard_access').length).toBe(0);
  });

  it('lets a platform owner through for every persona', async () => {
    for (const persona of ['ceo', 'cfo', 'coo', 'chro'] as const) {
      const req = makeReq({ user: { id: 'u1', email: 'a@b.com', is_platform_owner: true } });
      const res = makeRes();
      const next = vi.fn();
      await requireExecAccess(persona)(req as never, res as never, next);
      expect(next).toHaveBeenCalledOnce();
    }
  });

  it('403s a user with no tenant_id at all', async () => {
    const req = makeReq({ user: { id: 'u1', email: 'a@b.com', role: 'cfo' } });
    const res = makeRes();
    const next = vi.fn();
    await requireExecAccess('cfo')(req as never, res as never, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a CFO-only grant to reach the cfo persona', async () => {
    db.setResolver(grantResolver(['cfo']));
    const req = makeReq({ user: { id: 'u1', email: 'a@b.com', role: 'cfo', tenant_id: 'tenant-A' } });
    const res = makeRes();
    const next = vi.fn();
    await requireExecAccess('cfo')(req as never, res as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('ACCEPTANCE: a CFO-only grant 403s on the ceo persona', async () => {
    db.setResolver(grantResolver(['cfo']));
    const req = makeReq({ user: { id: 'u1', email: 'a@b.com', role: 'cfo', tenant_id: 'tenant-A' } });
    const res = makeRes();
    const next = vi.fn();
    await requireExecAccess('ceo')(req as never, res as never, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('403s a user with zero grants on every persona', async () => {
    db.setResolver(grantResolver([]));
    for (const persona of ['ceo', 'cfo', 'coo', 'chro'] as const) {
      const req = makeReq({ user: { id: 'u1', email: 'a@b.com', tenant_id: 'tenant-A' } });
      const res = makeRes();
      const next = vi.fn();
      await requireExecAccess(persona)(req as never, res as never, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('a multi-persona grant (ceo+coo) reaches both but not cfo/chro', async () => {
    db.setResolver(grantResolver(['ceo', 'coo']));
    const user = { id: 'u1', email: 'a@b.com', tenant_id: 'tenant-A' };

    const allowed: string[] = [];
    const denied: string[] = [];
    for (const persona of ['ceo', 'cfo', 'coo', 'chro'] as const) {
      const req = makeReq({ user });
      const res = makeRes();
      const next = vi.fn();
      await requireExecAccess(persona)(req as never, res as never, next);
      if (next.mock.calls.length > 0) allowed.push(persona);
      else denied.push(persona);
    }
    expect(allowed.sort()).toEqual(['ceo', 'coo']);
    expect(denied.sort()).toEqual(['cfo', 'chro']);
  });

  it('scopes the access lookup to the caller tenant_id', async () => {
    db.setResolver(grantResolver(['cfo']));
    const req = makeReq({ user: { id: 'u1', email: 'a@b.com', tenant_id: 'tenant-A' } });
    const res = makeRes();
    const next = vi.fn();
    await requireExecAccess('cfo')(req as never, res as never, next);
    expect(db.everyQueryScopedToTenant('exec_dashboard_access', 'tenant-A')).toBe(true);
  });
});

// ── getAccessiblePersonas ─────────────────────────────────────────────────────

describe('getAccessiblePersonas', () => {
  it('returns isAdmin + all personas for an admin, with no DB query', async () => {
    const result = await getAccessiblePersonas({ id: 'u1', email: 'a@b.com', role: 'admin' });
    expect(result.isAdmin).toBe(true);
    expect(result.personas.sort()).toEqual(['ceo', 'cfo', 'chro', 'coo']);
    expect(db.filtersFor('exec_dashboard_access').length).toBe(0);
  });

  it('returns only the granted personas for a non-admin', async () => {
    db.setResolver((ctx) => (ctx.table === 'exec_dashboard_access' ? { data: [{ persona: 'cfo' }, { persona: 'coo' }] } : {}));
    const result = await getAccessiblePersonas({ id: 'u1', email: 'a@b.com', tenant_id: 'tenant-A' });
    expect(result.isAdmin).toBe(false);
    expect(result.personas.sort()).toEqual(['cfo', 'coo']);
  });

  it('returns no personas for a non-admin with no tenant_id', async () => {
    const result = await getAccessiblePersonas({ id: 'u1', email: 'a@b.com' });
    expect(result).toEqual({ isAdmin: false, personas: [] });
  });
});

// ── Full router integration — direct API call against /api/exec/* ──────────

describe('execRouter — direct API call isolation', () => {
  function appWithUser(user: Record<string, unknown>) {
    const app = express();
    app.use(express.json());
    app.use(injectUser(user));
    app.use('/api/exec', execRouter);
    return app;
  }

  function grantResolver(grantedPersonas: string[]) {
    return (ctx: any) => {
      if (ctx.table !== 'exec_dashboard_access') return {};
      if (ctx.single) {
        const personaArg = ctx.filters.find((f: any) => f.method === 'eq' && f.args[0] === 'persona')?.args[1];
        return { data: grantedPersonas.includes(personaArg) ? { id: 'grant-1' } : null };
      }
      return { data: grantedPersonas.map((p) => ({ persona: p })) };
    };
  }

  it('ACCEPTANCE: a CFO-only test user gets 403 from a direct GET /api/exec/ceo call', async () => {
    db.setResolver(grantResolver(['cfo']));
    const res = await request(appWithUser({ id: 'u1', email: 'cfo@school.sa', role: 'cfo', tenant_id: 'tenant-A' })).get('/api/exec/ceo');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EXEC_ACCESS_DENIED');
  });

  it('the same CFO-only user can reach GET /api/exec/cfo', async () => {
    db.setResolver(grantResolver(['cfo']));
    const res = await request(appWithUser({ id: 'u1', email: 'cfo@school.sa', role: 'cfo', tenant_id: 'tenant-A' })).get('/api/exec/cfo');
    expect(res.status).toBe(200);
    expect(res.body.kpis).toBeDefined();
  });

  it('a user with zero grants gets 403 on every dashboard', async () => {
    db.setResolver(grantResolver([]));
    const app = appWithUser({ id: 'u1', email: 'noone@school.sa', tenant_id: 'tenant-A' });
    for (const persona of ['ceo', 'cfo', 'coo', 'chro']) {
      const res = await request(app).get(`/api/exec/${persona}`);
      expect(res.status).toBe(403);
    }
  });

  it('an admin can reach every dashboard with no grant rows at all', async () => {
    db.setResolver(grantResolver([]));
    const app = appWithUser({ id: 'admin-1', email: 'admin@school.sa', role: 'admin', tenant_id: 'tenant-A' });
    for (const persona of ['ceo', 'cfo', 'coo', 'chro']) {
      const res = await request(app).get(`/api/exec/${persona}`);
      expect(res.status).toBe(200);
    }
  });

  it('GET /api/exec/access reports the caller\'s own accessible personas', async () => {
    db.setResolver(grantResolver(['cfo', 'chro']));
    const res = await request(appWithUser({ id: 'u1', email: 'multi@school.sa', tenant_id: 'tenant-A' })).get('/api/exec/access');
    expect(res.status).toBe(200);
    expect(res.body.isAdmin).toBe(false);
    expect(res.body.personas.sort()).toEqual(['cfo', 'chro']);
  });

  it('a CFO-only grant also 403s on the ceo board-brief endpoints', async () => {
    db.setResolver(grantResolver(['cfo']));
    const app = appWithUser({ id: 'u1', email: 'cfo@school.sa', role: 'cfo', tenant_id: 'tenant-A' });
    const getRes = await request(app).get('/api/exec/ceo/brief');
    expect(getRes.status).toBe(403);
    const postRes = await request(app).post('/api/exec/ceo/brief/refresh');
    expect(postRes.status).toBe(403);
  });
});

// ── Group Vitality Index — weighted-average math ─────────────────────────────

describe('computeVitalityIndex', () => {
  const subscores = { financial: 80, growth: 60, collections: 90, compliance: 70, retention: 100 };

  it('computes the default-weighted (25/20/20/20/15) composite correctly', () => {
    const weights = { financial: 25, growth: 20, collections: 20, compliance: 20, retention: 15 };
    const result = computeVitalityIndex(weights, subscores);
    // (80*25 + 60*20 + 90*20 + 70*20 + 100*15) / 100 = 79
    expect(result.score).toBe(79);
    expect(result.sub_scores).toEqual(subscores);
  });

  it('returns 100 when every sub-score is 100, regardless of weight split', () => {
    const perfect = { financial: 100, growth: 100, collections: 100, compliance: 100, retention: 100 };
    expect(computeVitalityIndex({ financial: 25, growth: 20, collections: 20, compliance: 20, retention: 15 }, perfect).score).toBe(100);
    expect(computeVitalityIndex({ financial: 50, growth: 10, collections: 10, compliance: 10, retention: 20 }, perfect).score).toBe(100);
  });

  it('returns 0 when every sub-score is 0', () => {
    const zero = { financial: 0, growth: 0, collections: 0, compliance: 0, retention: 0 };
    expect(computeVitalityIndex({ financial: 25, growth: 20, collections: 20, compliance: 20, retention: 15 }, zero).score).toBe(0);
  });

  it('normalizes weights that do not sum to 100 (defends against misconfigured rows)', () => {
    // Half of the default weights (12.5/10/10/10/7.5, summing to 50) must
    // produce the exact same score as the full default weights, since the
    // implementation normalizes by totalWeight rather than assuming 100.
    const halved = { financial: 12.5, growth: 10, collections: 10, compliance: 10, retention: 7.5 };
    const full = { financial: 25, growth: 20, collections: 20, compliance: 20, retention: 15 };
    expect(computeVitalityIndex(halved, subscores).score).toBe(computeVitalityIndex(full, subscores).score);
  });

  it('falls back to a totalWeight of 1 (never divides by zero) when all weights are zero', () => {
    const zeroWeights = { financial: 0, growth: 0, collections: 0, compliance: 0, retention: 0 };
    const result = computeVitalityIndex(zeroWeights, subscores);
    expect(Number.isFinite(result.score)).toBe(true);
  });

  it('a single dominant weight collapses the composite to that sub-score', () => {
    const onlyFinancial = { financial: 100, growth: 0, collections: 0, compliance: 0, retention: 0 };
    expect(computeVitalityIndex(onlyFinancial, subscores).score).toBe(subscores.financial);
  });
});

// ── pctDelta — period-over-period change used by CEO KPI deltas ──────────────

describe('pctDelta', () => {
  it('returns null when there is no prior value (avoids a misleading 0%/Infinity)', () => {
    expect(pctDelta(100, 0)).toBeNull();
  });
  it('computes a positive change correctly', () => {
    expect(pctDelta(120, 100)).toBe(20);
  });
  it('computes a negative change correctly', () => {
    expect(pctDelta(80, 100)).toBe(-20);
  });
  it('uses the magnitude of the previous value as the base (−100 → −50 is a +50% improvement)', () => {
    expect(pctDelta(-50, -100)).toBe(50);
  });
});

// ── stripMarkdown — clean plain-text briefs / reports (no literal "**") ───────

describe('stripMarkdown', () => {
  it('unwraps **bold** without leaving markers', () => {
    expect(stripMarkdown('Revenue is **up 12%** this month')).toBe('Revenue is up 12% this month');
  });
  it('removes stray/unbalanced ** markers', () => {
    expect(stripMarkdown('**Summary: strong quarter')).toBe('Summary: strong quarter');
  });
  it('strips heading markers but keeps the text', () => {
    expect(stripMarkdown('## Board Brief')).toBe('Board Brief');
  });
  it('unwraps inline `code` spans', () => {
    expect(stripMarkdown('collection rate `95%`')).toBe('collection rate 95%');
  });
  it('leaves a lone asterisk (e.g. multiplication) untouched', () => {
    expect(stripMarkdown('3 * 4 = 12')).toBe('3 * 4 = 12');
  });
});
