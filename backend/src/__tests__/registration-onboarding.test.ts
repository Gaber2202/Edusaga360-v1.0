/**
 * Onboarding link lifecycle — root-cause regression for the "invalid link"
 * (رابط غير صالح) error that appeared AFTER a school finished setup.
 *
 * Cause: completion used to null the onboarding_token, so revisiting the link
 * (refresh / back / re-click the email) found nothing → 404 → scary "invalid
 * link", even though the account was successfully created.
 *
 * Fix verified here:
 *  - GET keeps resolving a completed link and returns ALREADY_COMPLETED (409)
 *    so the client forwards the admin to sign in.
 *  - completion preserves the token (no onboarding_token:null) and is idempotent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, QueryContext } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { registrationRouter } = await import('../routes/registration.js');

const TOKEN = 'tok-abc';
const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
const past = new Date(Date.now() - 1000).toISOString();

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/registration', registrationRouter);
  return a;
}

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});

describe('GET /onboarding/:token — link lifecycle', () => {
  it('returns the request for an approved, unexpired link', async () => {
    db.setResolver(() => ({ data: { id: 'r1', status: 'approved', school_name_en: 'X', contact_name: 'A', contact_email: 'a@x.sa', tenant_id: 't1', token_expires_at: future } }));
    const res = await request(app()).get(`/api/registration/onboarding/${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.request.contact_email).toBe('a@x.sa');
  });

  it('returns ALREADY_COMPLETED (409) for a completed link — not a scary "invalid"', async () => {
    db.setResolver(() => ({ data: { id: 'r1', status: 'completed', token_expires_at: future } }));
    const res = await request(app()).get(`/api/registration/onboarding/${TOKEN}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ALREADY_COMPLETED');
  });

  it('returns TOKEN_EXPIRED (410) for an expired approved link', async () => {
    db.setResolver(() => ({ data: { id: 'r1', status: 'approved', token_expires_at: past } }));
    const res = await request(app()).get(`/api/registration/onboarding/${TOKEN}`);
    expect(res.status).toBe(410);
    expect(res.body.error).toBe('TOKEN_EXPIRED');
  });

  it('returns 404 for an unknown token', async () => {
    db.setResolver(() => ({ data: null }));
    const res = await request(app()).get(`/api/registration/onboarding/${TOKEN}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /onboarding/:token/complete — completion', () => {
  const body = { password: 'Password123', default_language: 'ar' };

  it('preserves the onboarding token (does not null it) so revisits resolve to ALREADY_COMPLETED', async () => {
    db.setResolver((ctx: QueryContext) =>
      ctx.table === 'registration_requests' && ctx.single
        ? { data: { id: 'r1', status: 'approved', contact_email: 'a@x.sa', contact_name: 'A', tenant_id: 't1', token_expires_at: future } }
        : {});
    db.auth.admin.createUser.mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null });

    const res = await request(app()).post(`/api/registration/onboarding/${TOKEN}/complete`).send(body);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const update = db.filtersFor('registration_requests').find((c) => c.op === 'update');
    const payload = update?.payload as Record<string, unknown>;
    expect(payload.status).toBe('completed');
    expect('onboarding_token' in payload).toBe(false); // token kept alive
  });

  it('provisions using ONLY real columns and sets onboarding_completed (guards the silent-failure bug)', async () => {
    db.setResolver((ctx: QueryContext) =>
      ctx.table === 'registration_requests' && ctx.single
        ? { data: { id: 'r1', status: 'approved', contact_email: 'a@x.sa', contact_name: 'A', tenant_id: 't1', token_expires_at: future } }
        : {});
    db.auth.admin.createUser.mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null });

    const res = await request(app()).post(`/api/registration/onboarding/${TOKEN}/complete`).send(body);
    expect(res.status).toBe(200);

    // users insert must use user_role (real column) and never role / is_trial_user,
    // which don't exist and made PostgREST reject the whole insert silently.
    const userInsert = db.filtersFor('users').find((c) => c.op === 'insert');
    const userPayload = (userInsert?.payload ?? {}) as Record<string, unknown>;
    expect(userPayload.user_role).toBe('admin');
    expect('role' in userPayload).toBe(false);
    expect('is_trial_user' in userPayload).toBe(false);

    // tenants update must set onboarding_completed and omit the non-existent
    // max_users column (its presence previously failed the whole update).
    const tenantUpdate = db.filtersFor('tenants').find((c) => c.op === 'update');
    const tenantPayload = (tenantUpdate?.payload ?? {}) as Record<string, unknown>;
    expect(tenantPayload.onboarding_completed).toBe(true);
    expect('max_users' in tenantPayload).toBe(false);
  });

  it('is idempotent — a second completion returns success, not an error', async () => {
    db.setResolver(() => ({ data: { id: 'r1', status: 'completed', token_expires_at: future } }));
    const res = await request(app()).post(`/api/registration/onboarding/${TOKEN}/complete`).send(body);
    expect(res.status).toBe(200);
    expect(res.body.alreadyCompleted).toBe(true);
    expect(db.auth.admin.createUser).not.toHaveBeenCalled();
  });
});
