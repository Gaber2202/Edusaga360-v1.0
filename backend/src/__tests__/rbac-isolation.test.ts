/**
 * Role-based access control (requireRole) and multi-tenant isolation.
 *
 * Covers priority scenario #4 (multi-school data isolation — "parallel school
 * contexts") and #8 (auth / permission enforcement). RBAC is the last line of
 * defence in front of the DB's Row-Level Security, so these contracts must hold
 * for every finance/payroll/HR route.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { makeReq, makeRes } from './helpers.js';
import { createSupabaseStub, injectUser } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

// requireRole + role sets live in middleware/auth.ts; feesRouter is used as a
// representative tenant-scoped router for the isolation test.
const { requireRole, FINANCE_ROLES, PAYROLL_ROLES, HR_ROLES } = await import('../middleware/auth.js');
const { feesRouter } = await import('../routes/fees.js');

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});

// ── requireRole middleware ───────────────────────────────────────────────────

describe('requireRole', () => {
  function run(roles: string[], user: Record<string, unknown> | undefined) {
    const req = makeReq({ user });
    const res = makeRes();
    const next = vi.fn();
    requireRole(roles)(req as never, res as never, next);
    return { res, next };
  }

  it('allows a user whose role is in the allow-list', () => {
    const { res, next } = run(FINANCE_ROLES, { role: 'finance' });
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('denies a user whose role is not in the allow-list (403)', () => {
    const { res, next } = run(FINANCE_ROLES, { role: 'teacher' });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('denies a user with no role at all (403)', () => {
    const { res, next } = run(FINANCE_ROLES, {});
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('lets a platform owner bypass the role check entirely', () => {
    const { res, next } = run(FINANCE_ROLES, { is_platform_owner: true });
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('keeps role sets distinct — an accountant is finance but NOT payroll', () => {
    expect(run(FINANCE_ROLES, { role: 'accountant' }).next).toHaveBeenCalledOnce();
    expect(run(PAYROLL_ROLES, { role: 'accountant' }).res.status).toHaveBeenCalledWith(403);
  });

  it('hr_admin is in the HR and payroll sets', () => {
    expect(run(HR_ROLES, { role: 'hr_admin' }).next).toHaveBeenCalledOnce();
    expect(run(PAYROLL_ROLES, { role: 'hr_admin' }).next).toHaveBeenCalledOnce();
  });

  it('admin is a member of every privileged set', () => {
    for (const set of [FINANCE_ROLES, PAYROLL_ROLES, HR_ROLES]) {
      expect(run(set, { role: 'admin' }).next).toHaveBeenCalledOnce();
    }
  });
});

// ── Multi-tenant isolation under parallel school contexts ────────────────────

describe('Multi-tenant isolation — parallel schools', () => {
  function appFor(tenantId: string) {
    const app = express();
    app.use(express.json());
    app.use(injectUser({ id: `u-${tenantId}`, email: `staff@${tenantId}.sa`, tenant_id: tenantId, role: 'admin', is_platform_owner: false }));
    app.use('/fees', feesRouter);
    return app;
  }

  it('scopes each school\'s reads to its own tenant_id — no cross-tenant leakage', async () => {
    db.setResolver((ctx) => (ctx.table === 'invoices' ? { data: [], count: 0 } : { data: null }));

    // School A queries its invoices.
    db.reset();
    await request(appFor('school-A')).get('/fees/invoices');
    const aCalls = db.filtersFor('invoices');
    expect(aCalls.length).toBeGreaterThan(0);
    expect(db.everyQueryScopedToTenant('invoices', 'school-A')).toBe(true);
    const aTouchedB = aCalls.some((c) => c.filters.some((f) => f.method === 'eq' && f.args[0] === 'tenant_id' && f.args[1] === 'school-B'));
    expect(aTouchedB).toBe(false);

    // School B queries its invoices — independently scoped.
    db.reset();
    db.setResolver((ctx) => (ctx.table === 'invoices' ? { data: [], count: 0 } : { data: null }));
    await request(appFor('school-B')).get('/fees/invoices');
    expect(db.everyQueryScopedToTenant('invoices', 'school-B')).toBe(true);
    const bTouchedA = db.filtersFor('invoices').some((c) => c.filters.some((f) => f.method === 'eq' && f.args[0] === 'tenant_id' && f.args[1] === 'school-A'));
    expect(bTouchedA).toBe(false);
  });

  it('a payment lookup is constrained to the caller tenant', async () => {
    db.reset();
    db.setResolver((ctx) => {
      if (ctx.table === 'invoices' && ctx.op === 'select') return { data: null, error: { code: 'PGRST116' } };
      return { data: null };
    });

    const res = await request(appFor('school-A'))
      .post('/fees/payments')
      .send({ invoice_id: '22222222-2222-2222-2222-222222222222', amount: 100, payment_method: 'cash' });

    // Invoice from another tenant is simply "not found" for school-A.
    expect(res.status).toBe(404);
    expect(db.everyQueryScopedToTenant('invoices', 'school-A')).toBe(true);
  });
});
