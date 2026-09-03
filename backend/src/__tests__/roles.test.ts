import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, injectUser, type QueryContext } from './support/supabaseMock.js';
import { APP_ROLE_CATALOG } from '../lib/appRoles.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { rolesRouter } = await import('../routes/roles.js');

function user(role: string, is_platform_owner = false) {
  return {
    id: 'u1',
    email: 'admin@school.sa',
    tenant_id: 'tenant-A',
    role,
    is_platform_owner,
  };
}

function makeApp(u: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use(injectUser(u));
  app.use('/roles', rolesRouter);
  return app;
}

describe('app role catalogue', () => {
  it('has unique role codes including the roles the UI used to hard-code', () => {
    const codes = APP_ROLE_CATALOG.map((r) => r.role_code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of ['admin', 'finance', 'teacher', 'parent', 'hr_officer', 'branch_manager', 'unassigned']) {
      expect(codes).toContain(code);
    }
  });
});

describe('GET /roles', () => {
  beforeEach(() => {
    db.reset();
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'roles' && ctx.op === 'upsert') return { data: [], error: null };
      if (ctx.table === 'roles' && ctx.op === 'select') return { data: [], error: null };
      return {};
    });
  });

  it('returns the catalogue to a tenant admin when the table is empty', async () => {
    const res = await request(makeApp(user('admin'))).get('/roles').expect(200);
    expect(res.body.roles.length).toBe(APP_ROLE_CATALOG.length);
    expect(res.body.roles.map((r: { role_code: string }) => r.role_code)).toEqual(
      expect.arrayContaining(['admin', 'cfo', 'it_admin', 'unassigned']),
    );
  });

  it('returns roles to a teacher (read is not admin-only)', async () => {
    const res = await request(makeApp(user('teacher'))).get('/roles');
    expect(res.status).toBe(200);
    expect(res.body.roles.length).toBeGreaterThan(0);
  });
});

describe('POST /roles', () => {
  beforeEach(() => {
    db.reset();
    db.setResolver(() => ({ data: null, error: null }));
  });

  it('denies a parent creating a role', async () => {
    const res = await request(makeApp(user('parent')))
      .post('/roles')
      .send({ role_code: 'custom_ops', name_ar: 'عمليات', name_en: 'Ops' });
    expect(res.status).toBe(403);
  });

  it('rejects reserved system role codes', async () => {
    const res = await request(makeApp(user('admin')))
      .post('/roles')
      .send({ role_code: 'admin', name_ar: 'مدير', name_en: 'Admin' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('RESERVED');
  });
});
