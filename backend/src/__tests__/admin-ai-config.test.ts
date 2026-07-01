/**
 * Admin (super-admin) per-tenant AI configuration endpoints.
 *
 * Confirms platform-owner gating, that provider API keys are ENCRYPTED on write
 * and never returned to the client, and that the token-limit endpoint works.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'crypto';
import { createSupabaseStub, QueryContext } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

process.env.AI_CONFIG_ENC_KEY = crypto.randomBytes(32).toString('base64');

const { adminRouter } = await import('../routes/admin.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  return app;
}

function asPlatformOwner(isOwner = true) {
  db.auth.getUser.mockResolvedValue({
    data: { user: { id: 'admin1', email: 'super@edusaga.com', app_metadata: { is_platform_owner: isOwner } } },
    error: null,
  });
}

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});

describe('POST /admin/tenants/:id/ai/providers', () => {
  it('encrypts the api key on write and never returns key material', async () => {
    asPlatformOwner();
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'tenant_ai_providers' && ctx.op === 'insert') {
        const p = ctx.payload as Record<string, unknown>;
        return { data: { id: 'p1', name: p.name, format: p.format, base_url: p.base_url, model: p.model, is_active: p.is_active, priority: p.priority, created_at: 't' } };
      }
      return { data: null };
    });

    const res = await request(makeApp())
      .post('/admin/tenants/tenant-A/ai/providers')
      .set('Authorization', 'Bearer x')
      .send({ name: 'ksa-local', format: 'openai', base_url: 'https://llm.example.sa/v1', model: 'jais-30b', api_key: 'sk-plaintext-123' });

    expect(res.status).toBe(200);
    // Response exposes only that a key exists — never the key or ciphertext.
    expect(res.body.provider.has_key).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('sk-plaintext-123');
    expect(res.body.provider.api_key_enc).toBeUndefined();

    // What was written to the DB was ciphertext, not the plaintext key.
    const insert = db.filtersFor('tenant_ai_providers').find((c) => c.op === 'insert');
    const payload = insert?.payload as Record<string, unknown>;
    expect(payload.api_key_enc).toBeTruthy();
    expect(payload.api_key_enc).not.toBe('sk-plaintext-123');
    expect(String(payload.api_key_enc)).not.toContain('sk-plaintext-123');
  });

  it('rejects an openai provider with no base_url', async () => {
    asPlatformOwner();
    const res = await request(makeApp())
      .post('/admin/tenants/tenant-A/ai/providers')
      .set('Authorization', 'Bearer x')
      .send({ name: 'bad', format: 'openai', model: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/base_url/);
  });

  it('denies a non-platform-owner (403)', async () => {
    asPlatformOwner(false);
    db.setResolver((ctx: QueryContext) => ctx.table === 'users' ? { data: { is_platform_owner: false, user_role: 'admin' } } : { data: null });
    const res = await request(makeApp())
      .post('/admin/tenants/tenant-A/ai/providers')
      .set('Authorization', 'Bearer x')
      .send({ name: 'x', format: 'openai', base_url: 'https://y/v1', model: 'm' });
    expect(res.status).toBe(403);
  });
});

describe('GET /admin/tenants/:id/ai', () => {
  it('returns providers with masked keys and the token limit/usage', async () => {
    asPlatformOwner();
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'tenants') {
        return { data: { yamen_ai_token_limit: 100000, yamen_ai_tokens_used_this_month: 4200, yamen_ai_used_this_month: 12, yamen_ai_usage_period: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}` } };
      }
      if (ctx.table === 'tenant_ai_providers') {
        return { data: [{ id: 'p1', name: 'ksa-local', format: 'openai', base_url: 'https://llm.example.sa/v1', model: 'jais-30b', api_key_enc: 'CIPHERTEXT', is_active: true, priority: 10, created_at: 't' }] };
      }
      return { data: null };
    });

    const res = await request(makeApp()).get('/admin/tenants/tenant-A/ai').set('Authorization', 'Bearer x');
    expect(res.status).toBe(200);
    expect(res.body.token_limit).toBe(100000);
    expect(res.body.tokens_used_this_month).toBe(4200);
    expect(res.body.providers[0].has_key).toBe(true);
    // The ciphertext must never leave the server.
    expect(JSON.stringify(res.body)).not.toContain('CIPHERTEXT');
  });
});

describe('PUT /admin/tenants/:id/ai/limit', () => {
  it('sets a token limit', async () => {
    asPlatformOwner();
    db.setResolver((ctx: QueryContext) => ctx.table === 'tenants' ? { data: { id: 'tenant-A', name_en: 'School A' } } : { data: null });
    const res = await request(makeApp()).put('/admin/tenants/tenant-A/ai/limit').set('Authorization', 'Bearer x').send({ token_limit: 500000 });
    expect(res.status).toBe(200);
    expect(res.body.token_limit).toBe(500000);
  });

  it('treats 0 as unlimited (null)', async () => {
    asPlatformOwner();
    db.setResolver((ctx: QueryContext) => ctx.table === 'tenants' ? { data: { id: 'tenant-A', name_en: 'School A' } } : { data: null });
    const res = await request(makeApp()).put('/admin/tenants/tenant-A/ai/limit').set('Authorization', 'Bearer x').send({ token_limit: 0 });
    expect(res.body.token_limit).toBeNull();
  });
});
