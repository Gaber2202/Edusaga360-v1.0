/**
 * Yamen AI — Google Gemini provider activation.
 *
 * Verifies that setting GOOGLE_AI_API_KEY (a backend env var, applied platform
 * wide for every tenant) switches Yamen onto the Google provider — the exact
 * config used when a Gemini key is supplied and no Claude key is present.
 * Hermetic: only exercises provider detection, no external LLM call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, injectUser } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

// Production-like config: only a Google (Gemini) key is configured.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.GROQ_API_KEY;
process.env.GOOGLE_AI_API_KEY = 'test-gemini-key';
process.env.GOOGLE_AI_MODEL = 'gemini-2.0-flash';

const { aiRouter } = await import('../routes/ai.js');

const USER = { id: 'u1', email: 'principal@school.sa', tenant_id: 'tenant-A', role: 'admin', is_platform_owner: false };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(injectUser(USER));
  app.use('/ai', aiRouter);
  return app;
}

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});

describe('Yamen AI — Google Gemini activation', () => {
  it('reports gemini with tool use as the active provider when GOOGLE_AI_API_KEY is set', async () => {
    const res = await request(makeApp()).get('/ai/tools');
    expect(res.status).toBe(200);
    expect(res.body.provider).toMatch(/gemini.*tool use/);
  });

  it('also accepts GEMINI_API_KEY as an alias', async () => {
    const original = process.env.GOOGLE_AI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-alias-key';
    try {
      const res = await request(makeApp()).get('/ai/tools');
      expect(res.status).toBe(200);
      expect(res.body.provider).toMatch(/gemini.*tool use/);
    } finally {
      process.env.GOOGLE_AI_API_KEY = original;
      delete process.env.GEMINI_API_KEY;
    }
  });

  // Regression: a configured-but-failing Gemini key (bad key, unsupported
  // region, quota, wrong model) must surface the REAL cause — not the
  // misleading "add GOOGLE_AI_API_KEY" message that masked this for four
  // prior fix attempts.
  it('surfaces the real provider error instead of "add the key" when Gemini is configured but fails', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => 'User location is not supported for the API use.',
    }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    try {
      const res = await request(makeApp())
        .post('/ai/invoke-llm')
        .send({ prompt: 'How many employees do we have?' });

      expect(res.status).toBe(200);
      expect(res.body.provider).toBe('error');
      // Real cause is surfaced to the user…
      expect(res.body.response).toContain('User location is not supported');
      expect(res.body.detail).toContain('User location is not supported');
      // …and the misleading "add the key" instruction is gone.
      expect(res.body.response).not.toContain('Add GOOGLE_AI_API_KEY');
      expect(fetchMock).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('diagnostics probes Gemini live and reports the verbatim error', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => 'API key not valid. Please pass a valid API key. [API_KEY_INVALID]',
    }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    try {
      const res = await request(makeApp()).get('/ai/diagnostics');
      expect(res.status).toBe(200);
      expect(res.body.detected.gemini).toBe(true);
      expect(res.body.detected.gemini_key_source).toBe('GOOGLE_AI_API_KEY');
      expect(res.body.detected.gemini_model).toBe('gemini-2.0-flash');
      expect(res.body.geminiProbe.ok).toBe(false);
      expect(res.body.geminiProbe.status).toBe(400);
      expect(res.body.geminiProbe.error).toContain('API_KEY_INVALID');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
