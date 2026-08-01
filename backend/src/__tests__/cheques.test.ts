/**
 * Cheque lifecycle routes (P1.6) — create, list, and state transitions with
 * invoice payment sync on clear/bounce.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, injectUser, QueryContext } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { chequeRouter } = await import('../routes/cheques.js');

const TENANT_ID = 'tenant-A';
const CHEQUE_ID = '33333333-3333-3333-3333-333333333333';
const INVOICE_ID = '44444444-4444-4444-4444-444444444444';
const FINANCE_USER = { id: 'u1', email: 'fin@school.sa', tenant_id: TENANT_ID, role: 'admin', is_platform_owner: false };
const TEACHER_USER = { id: 'u2', email: 't@school.sa', tenant_id: TENANT_ID, role: 'teacher', is_platform_owner: false };

function makeApp(user: Record<string, unknown> = FINANCE_USER) {
  const app = express();
  app.use(express.json());
  app.use(injectUser(user));
  app.use('/cheques', chequeRouter);
  return app;
}

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});

describe('POST /cheques', () => {
  it('records a cheque (defaults to received) for a finance user', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'cheques' && ctx.op === 'insert') {
        return { data: { id: CHEQUE_ID, status: 'received', cheque_number: 'CHQ-001', amount: 500 } };
      }
      return { data: null };
    });

    const res = await request(makeApp())
      .post('/cheques')
      .send({ cheque_number: 'CHQ-001', bank_name: 'Al Rajhi', amount: 500, due_date: '2026-09-01' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(CHEQUE_ID);
    expect(res.body.status).toBe('received');
    // tenant_id must be stamped on the inserted rows (RLS data scoping)
    const chequeInsert = db.filtersFor('cheques').find((c) => c.op === 'insert');
    expect((chequeInsert?.payload as Record<string, unknown>)?.tenant_id).toBe(TENANT_ID);
    const histInsert = db.filtersFor('cheque_status_history').find((c) => c.op === 'insert');
    expect((histInsert?.payload as Record<string, unknown>)?.tenant_id).toBe(TENANT_ID);
  });

  it('rejects a non-finance role with 403', async () => {
    const res = await request(makeApp(TEACHER_USER)).post('/cheques').send({ cheque_number: 'X', amount: 1 });
    expect(res.status).toBe(403);
  });

  it('returns 400 on invalid payload', async () => {
    const res = await request(makeApp()).post('/cheques').send({ amount: -5 });
    expect(res.status).toBe(400);
  });
});

describe('GET /cheques', () => {
  it('lists cheques scoped to the tenant', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'cheques') return { data: [{ id: CHEQUE_ID, status: 'received', amount: 500, due_date: '2026-09-01' }] };
      return { data: null };
    });
    const res = await request(makeApp()).get('/cheques');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(db.everyQueryScopedToTenant('cheques', TENANT_ID)).toBe(true);
  });
});

describe('POST /cheques/:id/transition', () => {
  it('allows a legal transition with no financial effect (received → deposited)', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'cheques' && ctx.op === 'select') return { data: { id: CHEQUE_ID, status: 'received', amount: 500, invoice_id: null } };
      if (ctx.table === 'cheques' && ctx.op === 'update') return { data: { id: CHEQUE_ID, status: 'deposited' } };
      return { data: null };
    });

    const res = await request(makeApp()).post(`/cheques/${CHEQUE_ID}/transition`).send({ to_status: 'deposited' });
    expect(res.status).toBe(200);
    expect(res.body.cheque.status).toBe('deposited');
    expect(res.body.invoice_sync).toBeNull();
  });

  it('rejects an illegal transition (received → cleared)', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'cheques' && ctx.op === 'select') return { data: { id: CHEQUE_ID, status: 'received', amount: 500 } };
      return { data: null };
    });
    const res = await request(makeApp()).post(`/cheques/${CHEQUE_ID}/transition`).send({ to_status: 'cleared' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Illegal transition/);
  });

  it('clearing a cheque applies a payment to the linked invoice', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'cheques' && ctx.op === 'select') return { data: { id: CHEQUE_ID, status: 'deposited', amount: 500, invoice_id: INVOICE_ID, cheque_number: 'CHQ-001' } };
      if (ctx.table === 'cheques' && ctx.op === 'update') return { data: { id: CHEQUE_ID, status: 'cleared' } };
      if (ctx.table === 'invoices') return { data: { id: INVOICE_ID, invoice_number: 'INV-1', total_amount: 1000, paid_amount: 0 } };
      if (ctx.table === 'payments' && ctx.op === 'insert') return { data: { id: 'pay-1' } };
      if (ctx.table === 'chart_of_accounts') return { data: null }; // CoA not configured → journal skipped
      return { data: null };
    });

    const res = await request(makeApp()).post(`/cheques/${CHEQUE_ID}/transition`).send({ to_status: 'cleared' });
    expect(res.status).toBe(200);
    expect(res.body.cheque.status).toBe('cleared');
    expect(res.body.invoice_sync).toMatchObject({ invoice_id: INVOICE_ID, paid_amount: 500, balance: 500, status: 'partial', payment_id: 'pay-1' });
    expect(res.body.follow_up_required).toBe(false);
  });

  it('clearing a cheque for the full amount marks the invoice paid with zero balance', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'cheques' && ctx.op === 'select') return { data: { id: CHEQUE_ID, status: 'deposited', amount: 1000, invoice_id: INVOICE_ID, cheque_number: 'CHQ-001' } };
      if (ctx.table === 'cheques' && ctx.op === 'update') return { data: { id: CHEQUE_ID, status: 'cleared' } };
      if (ctx.table === 'invoices') return { data: { id: INVOICE_ID, invoice_number: 'INV-1', total_amount: 1000, paid_amount: 0 } };
      if (ctx.table === 'payments' && ctx.op === 'insert') return { data: { id: 'pay-1' } };
      if (ctx.table === 'chart_of_accounts') return { data: null };
      return { data: null };
    });

    const res = await request(makeApp()).post(`/cheques/${CHEQUE_ID}/transition`).send({ to_status: 'cleared' });
    expect(res.status).toBe(200);
    expect(res.body.invoice_sync).toMatchObject({ invoice_id: INVOICE_ID, paid_amount: 1000, balance: 0, status: 'paid' });
  });

  it('bouncing a cleared cheque reverses the invoice and flags follow-up', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'cheques' && ctx.op === 'select') return { data: { id: CHEQUE_ID, status: 'cleared', amount: 500, invoice_id: INVOICE_ID, cheque_number: 'CHQ-001', payment_id: 'pay-1' } };
      if (ctx.table === 'cheques' && ctx.op === 'update') return { data: { id: CHEQUE_ID, status: 'bounced' } };
      if (ctx.table === 'invoices') return { data: { id: INVOICE_ID, invoice_number: 'INV-1', total_amount: 1000, paid_amount: 500 } };
      if (ctx.table === 'chart_of_accounts') return { data: null };
      return { data: null };
    });

    const res = await request(makeApp()).post(`/cheques/${CHEQUE_ID}/transition`).send({ to_status: 'bounced', bounce_reason: 'NSF' });
    expect(res.status).toBe(200);
    expect(res.body.cheque.status).toBe('bounced');
    expect(res.body.invoice_sync).toMatchObject({ invoice_id: INVOICE_ID, paid_amount: 0, balance: 1000, status: 'issued', reversed: true });
    expect(res.body.follow_up_required).toBe(true);
  });

  it('returns 404 for a missing cheque', async () => {
    db.setResolver(() => ({ data: null, error: { code: 'PGRST116' } }));
    const res = await request(makeApp()).post(`/cheques/${CHEQUE_ID}/transition`).send({ to_status: 'deposited' });
    expect(res.status).toBe(404);
  });
});
