/**
 * Yamen AI — pluggable provider registry.
 *
 * Verifies that the LLM layer can be reconfigured entirely through environment
 * variables: a CUSTOM OpenAI-compatible endpoint (e.g. a KSA-hosted local model)
 * can be added, pinned, and ordered without any code change — the core
 * requirement for regional deployments that must run their own LLM.
 *
 * All model HTTP calls are mocked (hermetic).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, injectUser } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

// Start from a clean slate — no built-in keys.
for (const k of ['ANTHROPIC_API_KEY', 'GOOGLE_AI_API_KEY', 'GEMINI_API_KEY', 'Gemini_EduSaga360', 'OPENAI_API_KEY', 'GROQ_API_KEY', 'AI_PROVIDER', 'AI_PROVIDER_ORDER', 'AI_CUSTOM_PROVIDERS']) {
  delete process.env[k];
}

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

const KSA_LOCAL = JSON.stringify([
  { name: 'ksa-local', base_url: 'https://llm.example.sa/v1', model: 'jais-30b', api_key_env: 'KSA_LLM_KEY' },
]);

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});

afterEach(() => {
  for (const k of ['AI_PROVIDER', 'AI_PROVIDER_ORDER', 'AI_CUSTOM_PROVIDERS', 'KSA_LLM_KEY', 'OPENAI_API_KEY']) {
    delete process.env[k];
  }
});

describe('Yamen AI — custom (local/regional) provider', () => {
  it('routes chat to a custom OpenAI-compatible endpoint declared purely via env', async () => {
    process.env.AI_CUSTOM_PROVIDERS = KSA_LOCAL;
    process.env.KSA_LLM_KEY = 'sk-ksa-123';

    const fetchMock = vi.fn(async () =>
      okJson({ choices: [{ message: { role: 'assistant', content: 'أهلاً، لديك ٥ معلمين.' } }] }),
    );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    try {
      const res = await request(makeApp()).post('/ai/invoke-llm').send({ prompt: 'كم عدد المعلمين؟' });

      expect(res.status).toBe(200);
      expect(res.body.provider).toBe('ksa-local');
      expect(res.body.response).toContain('معلمين');
      // Hit the configured regional endpoint, not OpenAI/Groq.
      expect(String(fetchMock.mock.calls[0][0])).toContain('llm.example.sa');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('lists the custom provider as active via GET /ai/tools', async () => {
    process.env.AI_CUSTOM_PROVIDERS = KSA_LOCAL;
    process.env.KSA_LLM_KEY = 'sk-ksa-123';
    const res = await request(makeApp()).get('/ai/tools');
    expect(res.body.provider).toMatch(/ksa-local.*tool use/);
  });

  it('treats a keyless local endpoint as configured', async () => {
    process.env.AI_CUSTOM_PROVIDERS = JSON.stringify([
      { name: 'onprem', base_url: 'http://127.0.0.1:11434/v1', model: 'llama3' },
    ]);
    const res = await request(makeApp()).get('/ai/diagnostics');
    const onprem = res.body.detected.custom_providers.find((p: { name: string }) => p.name === 'onprem');
    expect(onprem).toBeTruthy();
    expect(onprem.configured).toBe(true);
    expect(res.body.detected.active).toBe('onprem');
  });

  it('AI_PROVIDER can pin a custom provider (Saudi deployment forcing the local model)', async () => {
    process.env.OPENAI_API_KEY = 'sk-openai';
    process.env.AI_CUSTOM_PROVIDERS = KSA_LOCAL;
    process.env.KSA_LLM_KEY = 'sk-ksa-123';
    process.env.AI_PROVIDER = 'ksa-local';

    const fetchMock = vi.fn(async () => okJson({ choices: [{ message: { content: 'ok' } }] }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    try {
      const res = await request(makeApp()).post('/ai/invoke-llm').send({ prompt: 'hi' });
      expect(res.body.provider).toBe('ksa-local');
      expect(String(fetchMock.mock.calls[0][0])).toContain('llm.example.sa');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('AI_PROVIDER_ORDER sets the failover chain (custom first, then OpenAI)', async () => {
    process.env.OPENAI_API_KEY = 'sk-openai';
    process.env.AI_CUSTOM_PROVIDERS = KSA_LOCAL;
    process.env.KSA_LLM_KEY = 'sk-ksa-123';
    process.env.AI_PROVIDER_ORDER = 'ksa-local,openai';

    let call = 0;
    const fetchMock = vi.fn(async (url?: unknown) => {
      call += 1;
      // The local model is down on the first attempt → fail over to OpenAI.
      if (String(url).includes('llm.example.sa')) {
        return { ok: false, status: 503, json: async () => ({}), text: async () => 'upstream down' };
      }
      return okJson({ choices: [{ message: { content: 'served by openai' } }] });
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    try {
      const res = await request(makeApp()).post('/ai/invoke-llm').send({ prompt: 'hi' });
      expect(res.body.provider).toBe('openai');
      expect(res.body.response).toBe('served by openai');
      // First attempt went to the regional endpoint, second to OpenAI.
      expect(String(fetchMock.mock.calls[0][0])).toContain('llm.example.sa');
      expect(String(fetchMock.mock.calls[1][0])).toContain('api.openai.com');
      expect(call).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('an unknown AI_PROVIDER lists custom providers among the supported values', async () => {
    process.env.AI_CUSTOM_PROVIDERS = KSA_LOCAL;
    process.env.KSA_LLM_KEY = 'sk-ksa-123';
    process.env.AI_PROVIDER = 'nope';
    const res = await request(makeApp()).post('/ai/invoke-llm').send({ prompt: 'hi' });
    expect(res.body.provider).toBe('misconfigured');
    expect(res.body.response).toContain('Unknown AI_PROVIDER');
    expect(res.body.response).toContain('ksa-local');
  });

  it('ignores malformed AI_CUSTOM_PROVIDERS JSON without crashing', async () => {
    process.env.AI_CUSTOM_PROVIDERS = '{not valid json';
    process.env.OPENAI_API_KEY = 'sk-openai';
    const res = await request(makeApp()).get('/ai/diagnostics');
    expect(res.status).toBe(200);
    expect(res.body.detected.custom_providers).toEqual([]);
    expect(res.body.detected.active).toBe('openai');
  });
});
