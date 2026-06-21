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
});
