/**
 * YAMEN AI engine (/api/ai) — tool catalogue, compliance insights, and
 * graceful degradation when no LLM provider is configured.
 *
 * These tests exercise the deterministic parts of the assistant — the Supabase
 * tool executors and the no-provider fallback — WITHOUT calling any external
 * LLM, so they are hermetic and fast. Covers priority scenarios #5 (external
 * API failure fallback) and #6 (bilingual responses).
 *
 * NOTE: provider API keys are stripped before importing the router so the
 * module-level provider detection resolves to "no provider configured".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, injectUser, QueryContext } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

// Ensure deterministic "no LLM provider" behaviour regardless of CI env.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.GOOGLE_AI_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.GROQ_API_KEY;

const { aiRouter } = await import('../routes/ai.js');

const USER = { id: 'u1', email: 'principal@school.sa', tenant_id: 'tenant-A', role: 'admin', is_platform_owner: false };

function makeApp(user: Record<string, unknown> = USER) {
  const app = express();
  app.use(express.json());
  app.use(injectUser(user));
  app.use('/ai', aiRouter);
  return app;
}

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});

// ── Tool catalogue ───────────────────────────────────────────────────────────

describe('GET /ai/tools', () => {
  it('lists all YAMEN tools and reports no provider when keys are absent', async () => {
    const res = await request(makeApp()).get('/ai/tools');
    expect(res.status).toBe(200);
    expect(res.body.tools.length).toBeGreaterThanOrEqual(8);
    const names = res.body.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('get_compliance_alerts');
    expect(names).toContain('get_fee_collection_stats');
    expect(res.body.provider).toBe('none');
  });
});

// ── Compliance check (runs a real Supabase tool, no LLM needed) ───────────────

describe('POST /ai/invoke-llm (compliance_check mode)', () => {
  it('reports "no issues" when the tenant is clean', async () => {
    db.setResolver((ctx) => {
      if (ctx.table === 'employees') return { data: [] };
      if (ctx.table === 'leave_requests') return { data: [] };
      if (ctx.table === 'invoices') return { data: [] };
      return { data: null };
    });

    const res = await request(makeApp())
      .post('/ai/invoke-llm')
      .send({ prompt: 'check compliance', mode: 'compliance_check' });

    expect(res.status).toBe(200);
    expect(res.body.tool_used).toBe('get_compliance_alerts');
    const payload = JSON.parse(res.body.response);
    expect(payload.alerts[0].severity).toBe('ok');
  });

  it('surfaces critical iqama and overdue-fee alerts from live data', async () => {
    db.setResolver((ctx) => {
      if (ctx.table === 'employees') return { data: [{ id: 'e1', name_en: 'Ali', name_ar: 'علي', employee_number: 'E1', iqama_expiry: '2020-01-01', nationality: 'expat' }] };
      if (ctx.table === 'leave_requests') return { data: [] };
      if (ctx.table === 'invoices') return { data: [{ id: 'i1', invoice_number: 'INV-1', total_amount: 1000, paid_amount: 0, due_date: '2020-01-01', student_id: 's1' }] };
      return { data: null };
    });

    const res = await request(makeApp())
      .post('/ai/invoke-llm')
      .send({ prompt: 'فحص الامتثال', mode: 'compliance_check' });

    const payload = JSON.parse(res.body.response);
    const severities = payload.alerts.map((a: { severity: string }) => a.severity);
    expect(severities).toContain('critical'); // expired iqama
    expect(severities).toContain('warning');  // overdue invoice
    // Tenant scoping must hold on every underlying query.
    expect(db.everyQueryScopedToTenant('employees', 'tenant-A')).toBe(true);
    expect(db.everyQueryScopedToTenant('invoices', 'tenant-A')).toBe(true);
  });
});

// ── No-provider fallback (#5 graceful degradation) ───────────────────────────

describe('POST /ai/invoke-llm (chat mode, no provider configured)', () => {
  it('returns a bilingual "not configured" message instead of a 500', async () => {
    const res = await request(makeApp())
      .post('/ai/invoke-llm')
      .send({ prompt: 'How many employees do we have?' });

    expect(res.status).toBe(200);
    expect(res.body.response).toContain('GOOGLE_AI_API_KEY');
    // The message includes Arabic guidance for the school admin.
    expect(res.body.response).toMatch(/الذكاء الاصطناعي/);
  });

  it('validates the prompt — empty prompt is rejected with 400', async () => {
    const res = await request(makeApp()).post('/ai/invoke-llm').send({ prompt: '' });
    expect(res.status).toBe(400);
  });
});

// ── Proactive compliance endpoint ────────────────────────────────────────────

describe('POST /ai/compliance-alerts', () => {
  it('returns alerts with a null summary when no LLM is available', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (['employees', 'leave_requests', 'invoices'].includes(ctx.table)) return { data: [] };
      return { data: null };
    });

    const res = await request(makeApp()).post('/ai/compliance-alerts').send({ days_ahead: 30 });
    expect(res.status).toBe(200);
    expect(res.body.alerts).toBeTruthy();
    expect(res.body.summary).toBeNull();
  });
});
