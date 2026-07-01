/**
 * Per-tenant Yamen AI routing + server-side token metering/limits.
 *
 * Verifies that a tenant is routed to ITS OWN configured LLM (with a decrypted
 * key), that token usage is metered via record_ai_usage, and that a tenant over
 * its monthly token limit is blocked before any provider is called.
 *
 * Hermetic: the LLM HTTP call and Supabase are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'crypto';
import { createSupabaseStub, injectUser } from './support/supabaseMock.js';
import { encryptSecret } from '../lib/aiCrypto.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

// No platform (env) providers — force the tenant's own provider to serve.
for (const k of ['ANTHROPIC_API_KEY', 'GOOGLE_AI_API_KEY', 'GEMINI_API_KEY', 'Gemini_EduSaga360', 'OPENAI_API_KEY', 'GROQ_API_KEY', 'AI_PROVIDER', 'AI_PROVIDER_ORDER', 'AI_CUSTOM_PROVIDERS']) {
  delete process.env[k];
}
process.env.AI_CONFIG_ENC_KEY = crypto.randomBytes(32).toString('base64');

const { aiRouter } = await import('../routes/ai.js');

const USER = { id: 'u1', email: 'principal@school.sa', tenant_id: 'tenant-A', role: 'admin', is_platform_owner: false };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(injectUser(USER));
  app.use('/ai', aiRouter);
  return app;
}

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => '' };
}

function currentPeriod() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

const encKey = encryptSecret('sk-tenant-secret');

// Resolver: tenant provider row + tenant quota row. `limit`/`used` configurable.
function resolver(opts: { limit?: number | null; used?: number } = {}) {
  return (ctx: { table: string }) => {
    if (ctx.table === 'tenant_ai_providers') {
      return { data: [{
        name: 'ksa-local', format: 'openai', base_url: 'https://llm.example.sa/v1',
        model: 'jais-30b', api_key_enc: encKey, is_active: true, priority: 10,
      }] };
    }
    if (ctx.table === 'tenants') {
      return { data: {
        yamen_ai_token_limit: opts.limit ?? null,
        yamen_ai_tokens_used_this_month: opts.used ?? 0,
        yamen_ai_usage_period: currentPeriod(),
      } };
    }
    return { data: null };
  };
}

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});

describe('Per-tenant AI routing', () => {
  it('routes chat to the tenant\'s own provider using its decrypted key', async () => {
    db.setResolver(resolver());
    const fetchMock = vi.fn(async (_url?: unknown, init?: unknown) =>
      okJson({ choices: [{ message: { content: 'Answer from KSA model.' } }], usage: { total_tokens: 321 } }),
    );
    // capture the Authorization header to prove the decrypted key was used
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    try {
      const res = await request(makeApp()).post('/ai/invoke-llm').send({ prompt: 'hi' });
      expect(res.status).toBe(200);
      expect(res.body.provider).toBe('ksa-local');
      expect(res.body.response).toBe('Answer from KSA model.');
      expect(String(fetchMock.mock.calls[0][0])).toContain('llm.example.sa');
      const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
      expect(init.headers.Authorization).toBe('Bearer sk-tenant-secret');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('meters token usage via record_ai_usage after a successful call', async () => {
    db.setResolver(resolver());
    const fetchMock = vi.fn(async (_url?: unknown, _init?: unknown) =>
      okJson({ choices: [{ message: { content: 'ok' } }], usage: { total_tokens: 321 } }),
    );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    try {
      const res = await request(makeApp()).post('/ai/invoke-llm').send({ prompt: 'hi' });
      expect(res.body.tokens_used).toBe(321);
      const calls = db.rpcCallsFor('record_ai_usage');
      expect(calls).toHaveLength(1);
      expect(calls[0].params).toMatchObject({ p_tenant_id: 'tenant-A', p_tokens: 321 });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('blocks a tenant that is over its monthly token limit (no provider call)', async () => {
    db.setResolver(resolver({ limit: 1000, used: 1000 }));
    const fetchMock = vi.fn(async () => okJson({ choices: [{ message: { content: 'should not run' } }] }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    try {
      const res = await request(makeApp()).post('/ai/invoke-llm').send({ prompt: 'hi' });
      expect(res.status).toBe(200);
      expect(res.body.provider).toBe('quota_exceeded');
      expect(res.body.error_type).toBe('token_limit_reached');
      expect(res.body.response).toMatch(/limit reached|الحد/);
      expect(fetchMock).not.toHaveBeenCalled();       // never spent a token
      expect(db.rpcCallsFor('record_ai_usage')).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('allows a tenant under its limit', async () => {
    db.setResolver(resolver({ limit: 1000, used: 200 }));
    const fetchMock = vi.fn(async (_url?: unknown, _init?: unknown) =>
      okJson({ choices: [{ message: { content: 'within budget' } }], usage: { total_tokens: 50 } }),
    );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    try {
      const res = await request(makeApp()).post('/ai/invoke-llm').send({ prompt: 'hi' });
      expect(res.body.provider).toBe('ksa-local');
      expect(res.body.response).toBe('within budget');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
