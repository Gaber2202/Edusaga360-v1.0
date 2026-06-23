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

  // Regression: a configured-but-failing Gemini key must NOT be reported as
  // "add GOOGLE_AI_API_KEY" (the bug that masked this for four prior attempts).
  // The user sees a short friendly message; the raw cause stays in `detail`.
  it('shows a friendly message (not "add the key" / not a raw blob) when Gemini fails', async () => {
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
      expect(res.body.error_type).toBe('region_unsupported');
      // Raw cause retained for diagnostics…
      expect(res.body.detail).toContain('User location is not supported');
      // …but the user sees a short friendly message, not the raw blob or "add key".
      expect(res.body.response).not.toContain('User location is not supported');
      expect(res.body.response).not.toContain('Add GOOGLE_AI_API_KEY');
      expect(res.body.response).toMatch(/region|منطقة/);
      expect(fetchMock).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // The user's real case: depleted Gemini billing → 429 RESOURCE_EXHAUSTED.
  it('maps a 429 quota error to a short "tokens exceeded" message', async () => {
    const raw = JSON.stringify({ error: { code: 429, message: 'Your prepayment credits are depleted.', status: 'RESOURCE_EXHAUSTED' } });
    const fetchMock = vi.fn(async () => ({ ok: false, status: 429, text: async () => raw }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    try {
      const res = await request(makeApp())
        .post('/ai/invoke-llm')
        .send({ prompt: 'فحص الموظفين' });

      expect(res.status).toBe(200);
      expect(res.body.provider).toBe('error');
      expect(res.body.error_type).toBe('quota_exceeded');
      // Short, human message — Arabic + English, no raw JSON blob.
      expect(res.body.response).toMatch(/exceeded|تجاوز|الرصيد/);
      expect(res.body.response).not.toContain('RESOURCE_EXHAUSTED');
      expect(res.body.response).not.toContain('{');
      // Raw cause still available to developers via `detail`.
      expect(res.body.detail).toContain('RESOURCE_EXHAUSTED');
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
      expect(res.body.detected.active).toBe('gemini');
      expect(res.body.detected.gemini_key_source).toBe('GOOGLE_AI_API_KEY');
      expect(res.body.detected.gemini_model).toBe('gemini-2.0-flash');
      // The live probe targets whichever provider is active (gemini here).
      expect(res.body.probe.provider).toBe('gemini');
      expect(res.body.probe.ok).toBe(false);
      expect(res.body.probe.status).toBe(400);
      expect(res.body.probe.error).toContain('API_KEY_INVALID');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
