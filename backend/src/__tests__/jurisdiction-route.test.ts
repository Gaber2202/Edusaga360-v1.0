import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, injectUser, type QueryContext } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { jurisdictionRouter } = await import('../routes/jurisdiction.js');

const TENANT_ID = 'tenant-A';
const SA_USER = {
  id: 'u1',
  email: 'admin@school.sa',
  tenant_id: TENANT_ID,
  role: 'admin',
  is_platform_owner: false,
};

function resolver(ctx: QueryContext) {
  if (ctx.table === 'tenants') {
    return {
      data: {
        id: TENANT_ID,
        jurisdiction_code: ctx.filters.some((f) => f.method === 'eq' && f.args[1] === 'missing-tenant')
          ? null
          : 'SA',
        settings: {},
      },
    };
  }
  if (ctx.table === 'branches') {
    return {
      data: {
        id: 'branch-1',
        jurisdiction_code: null,
        settings: {},
      },
    };
  }
  if (ctx.table === 'jurisdiction_features') return { data: [] };
  if (ctx.table === 'jurisdiction_tax_rules') return { data: null };
  return {};
}

function makeApp(user = SA_USER) {
  const app = express();
  app.use(express.json());
  app.use(injectUser(user));
  app.use('/jurisdiction', jurisdictionRouter);
  return app;
}

describe('GET /jurisdiction/context', () => {
  beforeEach(() => {
    db.reset();
    db.setResolver(resolver);
  });

  it('resolves to the tenant currency when the tenant has no branches', async () => {
    const app = makeApp();
    const res = await request(app).get('/jurisdiction/context').expect(200);
    expect(res.body.jurisdiction).toBe('SA');
    expect(res.body.currencyCode).toBe('SAR');
  });

  it('resolves to the tenant currency when the branch jurisdiction_code is NULL', async () => {
    const app = makeApp();
    const res = await request(app)
      .get('/jurisdiction/context')
      .query({ branch_id: 'branch-1' })
      .expect(200);
    expect(res.body.jurisdiction).toBe('SA');
    expect(res.body.currencyCode).toBe('SAR');
  });

  it('returns 500 when the tenant has no jurisdiction code', async () => {
    const app = makeApp({ ...SA_USER, tenant_id: 'missing-tenant' });
    await request(app).get('/jurisdiction/context').expect(500);
  });
});
