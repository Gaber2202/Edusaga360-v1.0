/**
 * RF-006 — cross-tenant IDOR regression guard.
 *
 * The backend uses the Supabase service-role key, which BYPASSES Postgres RLS.
 * Tenant isolation therefore depends entirely on each query carrying an explicit
 * eq('tenant_id', <caller's tenant>). The tenant-isolation scan flagged four
 * HIGH leaks where a staff user in tenant A could read/write tenant B's rows:
 *   - parents.ts  /invite            (trusted body-supplied tenant_id)
 *   - intake.ts   /verify-documents  (application fetch + 2 writes by id only)
 *
 * These tests assert the fixes: the body tenant is bound to the authenticated
 * tenant, and every applications/students query is scoped to the caller's tenant.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, injectUser, QueryContext } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));
// email side-effects in parents.ts /invite — stub so the handler runs headless.
vi.mock('../services/email.js', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
  isEmailConfigured: () => false,
}));

const { parentsRouter } = await import('../routes/parents.js');
const { intakeRouter } = await import('../routes/intake.js');

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STAFF_A = { id: 'staff-a', email: 'staff@a.sa', tenant_id: TENANT_A, role: 'admin', is_platform_owner: false };
const APP_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';

function mountParents(user = STAFF_A) {
  const app = express();
  app.use(express.json());
  app.use(injectUser(user));
  app.use('/parents', parentsRouter);
  return app;
}

function mountIntake(user = STAFF_A) {
  const app = express();
  app.use(express.json());
  app.use(injectUser(user));
  app.use('/intake', intakeRouter);
  return app;
}

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});

describe('RF-006 parents.ts /invite', () => {
  const body = {
    guardian_name_en: 'Sara Ali',
    guardian_email: 'sara@home.sa',
    student_id: STUDENT_ID,
    tenant_id: TENANT_B, // <-- caller (tenant A) tries to act on tenant B
  };

  it('rejects a body tenant_id that differs from the authenticated tenant (403)', async () => {
    const res = await request(mountParents()).post('/parents/invite').send(body);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('TENANT_MISMATCH');
    // Must short-circuit before touching any tenant table.
    expect(db.filtersFor('students')).toHaveLength(0);
    expect(db.filtersFor('users')).toHaveLength(0);
    expect(db.filtersFor('guardians')).toHaveLength(0);
  });

  it('scopes the student link write to the tenant when tenant matches', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'users' && ctx.op === 'select') return { data: [] }; // no existing parent
      if (ctx.table === 'guardians' && ctx.op === 'insert') return { data: { id: 'g1' } };
      return {};
    });
    // Same-tenant request: should not be rejected on tenant grounds.
    const res = await request(mountParents())
      .post('/parents/invite')
      .send({ ...body, tenant_id: TENANT_A });
    expect(res.status).not.toBe(403);
    // Every students query carried eq('tenant_id', TENANT_A).
    const studentWrites = db.filtersFor('students');
    expect(studentWrites.length).toBeGreaterThan(0);
    expect(db.everyQueryScopedToTenant('students', TENANT_A)).toBe(true);
  });
});

describe('RF-006 intake.ts /verify-documents/:applicationId', () => {
  const payload = { verified_documents: [{ doc_code: 'ID', url: 'u', name: 'n', verified_by: 'x', verified_at: 't' }] };

  it('returns 404 when the application belongs to another tenant', async () => {
    // Resolver mimics RLS-less DB: only return the row when the query is scoped
    // to the application's real tenant (B). A caller from tenant A must miss.
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'applications' && ctx.op === 'select') {
        const scopedToA = ctx.filters.some(
          (f) => f.method === 'eq' && f.args[0] === 'tenant_id' && f.args[1] === TENANT_A,
        );
        return scopedToA ? { data: null } : { data: { id: APP_ID, tenant_id: TENANT_B } };
      }
      return {};
    });

    const res = await request(mountIntake())
      .post(`/intake/verify-documents/${APP_ID}`)
      .send(payload);

    expect(res.status).toBe(404);
    // The fetch was scoped to the caller's tenant, and no cross-tenant write happened.
    expect(db.everyQueryScopedToTenant('applications', TENANT_A)).toBe(true);
    expect(db.filtersFor('students')).toHaveLength(0);
  });

  it('scopes the application + student writes to the caller tenant on success', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'applications' && ctx.op === 'select') {
        return { data: { id: APP_ID, tenant_id: TENANT_A, application_number: 'APP-1', documents: [], missing_documents: ['ID'], pipeline_stage: 'submitted' } };
      }
      return {};
    });

    const res = await request(mountIntake())
      .post(`/intake/verify-documents/${APP_ID}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(db.everyQueryScopedToTenant('applications', TENANT_A)).toBe(true);
    expect(db.everyQueryScopedToTenant('students', TENANT_A)).toBe(true);
  });
});
