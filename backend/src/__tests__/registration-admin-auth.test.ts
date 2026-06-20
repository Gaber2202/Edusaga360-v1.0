/**
 * Registration admin actions — authorization (approve / deny / resend).
 *
 * These endpoints back both the approve/deny links in the admin email (HMAC
 * signed) AND the super-admin dashboard buttons (Approve / Deny / Resend).
 * The dashboard never holds the signing secret, so it must be able to authorize
 * via the caller's platform-owner / creator session instead. Regression guard
 * for the broken dashboard buttons that returned 403 (no signature was sent).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'crypto';
import { createSupabaseStub, QueryContext } from './support/supabaseMock.js';

process.env.ADMIN_LINK_SECRET = 'test-admin-secret';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { registrationRouter } = await import('../routes/registration.js');

const REQ_ID = 'req-123';
const APPROVED_ROW = {
  id: REQ_ID,
  status: 'approved',
  school_name_en: 'Al Noor School',
  contact_name: 'Sara',
  contact_email: 'sara@alnoor.sa',
};

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/registration', registrationRouter);
  return a;
}

const sigFor = (action: string, id: string) =>
  crypto.createHmac('sha256', 'test-admin-secret').update(`${action}:${id}`).digest('hex').slice(0, 32);

const asUser = (app_metadata: Record<string, unknown>) =>
  db.auth.getUser.mockResolvedValue({ data: { user: { id: 'u', app_metadata } }, error: null });

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});

describe('registration admin actions — dashboard auth or HMAC sig', () => {
  it('resend: 403 when neither a signature nor an authenticated owner is present', async () => {
    db.setResolver(() => ({ data: APPROVED_ROW }));
    const res = await request(app()).get(`/api/registration/resend/${REQ_ID}`);
    expect(res.status).toBe(403);
  });

  it('resend: 403 for an authenticated non-owner (tenant admin)', async () => {
    db.setResolver(() => ({ data: APPROVED_ROW }));
    asUser({ role: 'admin', tenant_id: 't1' });
    const res = await request(app())
      .get(`/api/registration/resend/${REQ_ID}`)
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });

  it('resend: a platform-owner session issues a fresh token (the dashboard Resend button)', async () => {
    db.setResolver((ctx: QueryContext) => (ctx.op === 'select' ? { data: APPROVED_ROW } : {}));
    asUser({ is_platform_owner: true });
    const res = await request(app())
      .get(`/api/registration/resend/${REQ_ID}`)
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
    const update = db.filtersFor('registration_requests').find((c) => c.op === 'update');
    const payload = update?.payload as Record<string, unknown> | undefined;
    expect(payload?.onboarding_token).toBeTruthy();
    expect(payload?.token_expires_at).toBeTruthy();
  });

  it('resend: a creator session is accepted', async () => {
    db.setResolver((ctx: QueryContext) => (ctx.op === 'select' ? { data: APPROVED_ROW } : {}));
    asUser({ role: 'creator' });
    const res = await request(app())
      .get(`/api/registration/resend/${REQ_ID}`)
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });

  it('resend: a valid HMAC-signed email link still works without a token', async () => {
    db.setResolver((ctx: QueryContext) => (ctx.op === 'select' ? { data: APPROVED_ROW } : {}));
    const res = await request(app()).get(`/api/registration/resend/${REQ_ID}?sig=${sigFor('resend', REQ_ID)}`);
    expect(res.status).toBe(200);
    expect(db.auth.getUser).not.toHaveBeenCalled();
  });

  it('approve & deny apply the same gate (owner passes it; anonymous is blocked)', async () => {
    db.setResolver(() => ({ data: null })); // request not found → 404 only reachable *after* auth passes
    for (const action of ['approve', 'deny']) {
      const blocked = await request(app()).get(`/api/registration/${action}/${REQ_ID}`);
      expect(blocked.status).toBe(403);

      asUser({ is_platform_owner: true });
      const passed = await request(app())
        .get(`/api/registration/${action}/${REQ_ID}`)
        .set('Authorization', 'Bearer token');
      expect(passed.status).toBe(404); // gate passed, then "request not found"
    }
  });
});
