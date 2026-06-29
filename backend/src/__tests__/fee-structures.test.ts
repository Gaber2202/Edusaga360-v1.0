/**
 * Billing — fee-structures routes (/billing/fee-structures).
 *
 * Guards the canonical fee_structures contract after the 1A-01 schema
 * reconciliation: the POST must validate + persist the billing-engine column
 * set, stamp the caller's tenant_id + created_by, gate on a finance role, and
 * the GET must scope reads to the tenant.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, injectUser, QueryContext } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { billingRouter } = await import('../routes/billing.js');

const CATEGORY_ID = '33333333-3333-3333-3333-333333333333';
const FINANCE_USER = { id: 'u-fin', email: 'fin@school.sa', tenant_id: 'tenant-A', role: 'finance', is_platform_owner: false };
const TEACHER_USER = { id: 'u-tea', email: 'tea@school.sa', tenant_id: 'tenant-A', role: 'teacher', is_platform_owner: false };

function makeApp(user: Record<string, unknown> = FINANCE_USER) {
  const app = express();
  app.use(express.json());
  app.use(injectUser(user));
  app.use('/billing', billingRouter);
  return app;
}

const validPayload = {
  academic_year: '2025-2026',
  category_id: CATEGORY_ID,
  grade: 'G1',
  program: 'national',
  amount: 1500,
  is_mandatory: true,
  installment_count: 3,
  notes_ar: 'ملاحظة',
  notes_en: 'note',
  effective_from: '2025-09-01',
  effective_to: '2026-06-30',
};

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
  db.setResolver((ctx: QueryContext) => {
    if (ctx.table === 'fee_structures' && ctx.op === 'insert') {
      return { data: { id: 'fs-1', ...(ctx.payload as object) } };
    }
    if (ctx.table === 'fee_structures') {
      return { data: [{ id: 'fs-1', academic_year: '2025-2026', amount: 1500, fee_categories: { code: 'TUIT', name_en: 'Tuition', name_ar: 'رسوم', vat_treatment: 'exempt' } }] };
    }
    return { data: null };
  });
});

describe('POST /billing/fee-structures', () => {
  it('creates a fee structure and stamps tenant_id + created_by', async () => {
    const res = await request(makeApp()).post('/billing/fee-structures').send(validPayload);
    expect(res.status).toBe(201);

    const insert = db.filtersFor('fee_structures').find((c) => c.op === 'insert');
    expect(insert).toBeTruthy();
    const payload = insert!.payload as Record<string, unknown>;
    // canonical billing columns persisted
    expect(payload).toMatchObject({
      academic_year: '2025-2026',
      category_id: CATEGORY_ID,
      amount: 1500,
      installment_count: 3,
      program: 'national',
    });
    // server-stamped, never trusted from the client
    expect(payload.tenant_id).toBe('tenant-A');
    expect(payload.created_by).toBe('u-fin');
  });

  it('rejects a negative amount with 400', async () => {
    const res = await request(makeApp()).post('/billing/fee-structures').send({ ...validPayload, amount: -5 });
    expect(res.status).toBe(400);
  });

  it('rejects a missing category_id with 400', async () => {
    const { category_id: _omit, ...noCategory } = validPayload;
    const res = await request(makeApp()).post('/billing/fee-structures').send(noCategory);
    expect(res.status).toBe(400);
  });

  it('forbids a non-finance role (403)', async () => {
    const res = await request(makeApp(TEACHER_USER)).post('/billing/fee-structures').send(validPayload);
    expect(res.status).toBe(403);
  });
});

describe('GET /billing/fee-structures', () => {
  it('returns fee structures scoped to the caller tenant', async () => {
    const res = await request(makeApp()).get('/billing/fee-structures');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const read = db.filtersFor('fee_structures').find((c) => c.op === 'select');
    expect(read).toBeTruthy();
    expect(read!.filters.some((f) => f.method === 'eq' && f.args[0] === 'tenant_id' && f.args[1] === 'tenant-A')).toBe(true);
  });
});
