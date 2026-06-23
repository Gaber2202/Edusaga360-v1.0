/**
 * Yamen AI — Groq (OpenAI-compatible) provider with full tool use.
 *
 * Groq is the recommended free, region-safe provider. These tests verify that
 * with only GROQ_API_KEY set, Yamen routes to Groq, executes its live-data tools
 * via the OpenAI function-calling format, and that the AI_PROVIDER override and
 * its misconfiguration messages behave. The Groq HTTP call is mocked (hermetic).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, injectUser } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

// Production-like config: only a Groq key is present (the user's "move off Google").
delete process.env.ANTHROPIC_API_KEY;
delete process.env.GOOGLE_AI_API_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.Gemini_EduSaga360;
delete process.env.OPENAI_API_KEY;
delete process.env.AI_PROVIDER;
process.env.GROQ_API_KEY = 'test-groq-key';

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

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
  delete process.env.AI_PROVIDER;
});

describe('Yamen AI — Groq provider', () => {
  it('reports groq with tool use as the active provider', async () => {
    const res = await request(makeApp()).get('/ai/tools');
    expect(res.status).toBe(200);
    expect(res.body.provider).toMatch(/groq.*tool use/);
  });

  it('answers a plain chat via Groq when only GROQ_API_KEY is set', async () => {
    const fetchMock = vi.fn(async (_url?: unknown, _init?: unknown) =>
      okJson({ choices: [{ message: { role: 'assistant', content: 'You have 5 teachers.' } }] }),
    );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    try {
      const res = await request(makeApp())
        .post('/ai/invoke-llm')
        .send({ prompt: 'How many teachers?' });

      expect(res.status).toBe(200);
      expect(res.body.provider).toBe('groq');
      expect(res.body.response).toBe('You have 5 teachers.');
      // Hit Groq's OpenAI-compatible endpoint.
      expect(String(fetchMock.mock.calls[0][0])).toContain('api.groq.com');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('executes a live-data tool through the OpenAI function-calling loop', async () => {
    db.setResolver((ctx) => {
      if (ctx.table === 'employees') {
        return { data: [{ id: 'e1', name_en: 'Ali', status: 'active' }, { id: 'e2', name_en: 'Sara', status: 'active' }] };
      }
      return { data: null };
    });

    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        // First turn: the model asks to call get_employee_list.
        return okJson({
          choices: [{
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'get_employee_list', arguments: '{}' } }],
            },
          }],
        });
      }
      // Second turn: the model answers using the tool result.
      return okJson({ choices: [{ message: { role: 'assistant', content: 'You have 2 active employees.' } }] });
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    try {
      const res = await request(makeApp())
        .post('/ai/invoke-llm')
        .send({ prompt: 'How many employees do we have?' });

      expect(res.status).toBe(200);
      expect(res.body.provider).toBe('groq');
      expect(res.body.response).toBe('You have 2 active employees.');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      // The tool query must stay scoped to the caller's tenant.
      expect(db.everyQueryScopedToTenant('employees', 'tenant-A')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('surfaces the real Groq error instead of "not configured" when the call fails', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => 'Invalid API Key',
    }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    try {
      const res = await request(makeApp())
        .post('/ai/invoke-llm')
        .send({ prompt: 'hi' });

      expect(res.status).toBe(200);
      expect(res.body.provider).toBe('error');
      expect(res.body.response).toContain('Invalid API Key');
      expect(res.body.response).not.toContain('not configured');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('diagnostics probes Groq live as the active provider', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => 'Invalid API Key',
    }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    try {
      const res = await request(makeApp()).get('/ai/diagnostics');
      expect(res.status).toBe(200);
      expect(res.body.detected.active).toBe('groq');
      expect(res.body.detected.groq).toBe(true);
      expect(res.body.detected.groq_model).toBe('llama-3.3-70b-versatile');
      expect(res.body.probe.provider).toBe('groq');
      expect(res.body.probe.ok).toBe(false);
      expect(res.body.probe.status).toBe(401);
      expect(res.body.probe.error).toContain('Invalid API Key');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Yamen AI — AI_PROVIDER override', () => {
  it('pinning AI_PROVIDER to an unconfigured provider names the missing key', async () => {
    process.env.AI_PROVIDER = 'gemini';
    try {
      const res = await request(makeApp()).post('/ai/invoke-llm').send({ prompt: 'hi' });
      expect(res.status).toBe(200);
      expect(res.body.provider).toBe('misconfigured');
      expect(res.body.response).toContain('AI_PROVIDER=gemini');
      expect(res.body.response).toContain('GOOGLE_AI_API_KEY');
    } finally {
      delete process.env.AI_PROVIDER;
    }
  });

  it('an unknown AI_PROVIDER value lists the supported providers (e.g. a stray "serper")', async () => {
    process.env.AI_PROVIDER = 'serper';
    try {
      const res = await request(makeApp()).post('/ai/invoke-llm').send({ prompt: 'hi' });
      expect(res.status).toBe(200);
      expect(res.body.provider).toBe('misconfigured');
      expect(res.body.response).toContain('Unknown AI_PROVIDER');
      expect(res.body.response).toContain('groq');
    } finally {
      delete process.env.AI_PROVIDER;
    }
  });
});
