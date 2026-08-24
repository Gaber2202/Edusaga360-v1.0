import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, QueryContext } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { billingPublicRouter } = await import('../routes/billingPublic.js');

const INVOICE_ID = '22222222-2222-2222-2222-222222222222';
const TENANT_ID = 'tenant-A';
const PROFILE_ID = '33333333-3333-3333-3333-333333333333';
const PAYMENT_ID = 'pay_123';
const MOYASAR_INVOICE_ID = 'moyasar-inv-1';
const MOYASAR_INVOICE_ROW_ID = 'mi-1';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/public/billing', billingPublicRouter);
  return app;
}

function paidBody(overrides: Record<string, unknown> = {}) {
  return {
    id: PAYMENT_ID,
    type: 'payment_paid',
    status: 'paid',
    invoice_id: MOYASAR_INVOICE_ID,
    amount: 100000,
    metadata: { invoice_id: INVOICE_ID, tenant_id: TENANT_ID, collection_message_id: 'msg-1' },
    secret_token: 'super-secret',
    ...overrides,
  };
}

function resolver(ctx: QueryContext) {
  if (ctx.table === 'tenants' && ctx.op === 'select' && ctx.single) {
    return {
      data: {
        id: TENANT_ID,
        jurisdiction_code: 'SA',
        name_en: 'Test School',
        settings: {},
      },
    };
  }

  if (ctx.table === 'branches' && ctx.op === 'select') {
    return { data: [] };
  }

  if (ctx.table === 'tenant_compliance_settings' && ctx.op === 'select' && ctx.single) {
    return { data: null };
  }

  if (ctx.table === 'moyasar_invoices' && ctx.op === 'select' && ctx.single) {
    return { data: { id: MOYASAR_INVOICE_ROW_ID, edusaga_invoice_id: INVOICE_ID, tenant_id: TENANT_ID } };
  }

  if (ctx.table === 'invoices' && ctx.op === 'select' && ctx.single) {
    return {
      data: {
        id: INVOICE_ID,
        tenant_id: TENANT_ID,
        student_id: 'student-1',
        guardian_id: 'guardian-1',
        invoice_number: 'INV-001',
        total_amount: 1000,
        paid_amount: 0,
        balance: 1000,
        status: 'issued',
        due_date: '2026-07-01',
      },
    };
  }

  if (ctx.table === 'invoices' && ctx.op === 'update') {
    return { data: [{ id: INVOICE_ID, status: 'paid', paid_amount: 1000, balance: 0, total_amount: 1000 }] };
  }

  if (ctx.table === 'payments' && ctx.op === 'select' && ctx.single) {
    const prior = db.filtersFor('payments').filter((c) => c.op === 'select' && c.single).length;
    if (prior > 1) return { data: { id: 'payment-1' } };
    return { data: null };
  }

  if (ctx.table === 'payments' && ctx.op === 'insert') return { data: { id: 'payment-1' } };

  if (ctx.table === 'moyasar_webhook_events' && ctx.op === 'select' && ctx.single) {
    const prior = db.filtersFor('moyasar_webhook_events').filter((c) => c.op === 'select' && c.single).length;
    if (prior > 1) return { data: { id: 'mwe-1' } };
    return { data: null };
  }
  if (ctx.table === 'moyasar_webhook_events' && ctx.op === 'insert') return { data: { id: 'mwe-1' } };
  if (ctx.table === 'moyasar_payments' && ctx.op === 'upsert') return { data: { id: 'mp-1' } };

  if (ctx.table === 'students' && ctx.op === 'select' && ctx.single) return { data: { guardian_id: 'guardian-1' }};

  if (ctx.table === 'collection_profiles' && ctx.op === 'select' && ctx.single) {
    return { data: { id: PROFILE_ID, preferred_language: 'ar', guardian_id: 'guardian-1' } };
  }

  if (ctx.table === 'collection_messages' && ctx.op === 'insert') return { data: { id: 'thankyou-1' } };
  if (ctx.table === 'collection_messages' && ctx.op === 'update') return { data: [] };
  if (ctx.table === 'agent_actions_ledger' && ctx.op === 'insert') return { data: null };

  return { data: null };
}

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
  db.setResolver(resolver);
});

describe('POST /api/public/billing/moyasar/webhook', () => {
  it('rejects a paid webhook when the secret does not match', async () => {
    process.env.MOYASAR_WEBHOOK_SECRET = 'super-secret';
    const res = await request(makeApp())
      .post('/api/public/billing/moyasar/webhook')
      .send(paidBody({ secret_token: 'wrong-secret' }));

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_signature');
    expect(db.filtersFor('payments')).toHaveLength(0);
  });

  it('applies a paid webhook and stops collection sequences', async () => {
    process.env.MOYASAR_WEBHOOK_SECRET = 'super-secret';
    const res = await request(makeApp())
      .post('/api/public/billing/moyasar/webhook')
      .send(paidBody());

    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(true);
    expect(res.body.invoice_status).toBe('paid');

    const paymentInsert = db.filtersFor('payments').find((c) => c.op === 'insert');
    expect(paymentInsert).toBeTruthy();
    expect((paymentInsert?.payload as { reference?: string })?.reference).toBe(PAYMENT_ID);

    const invoiceUpdate = db.filtersFor('invoices').find((c) => c.op === 'update');
    expect((invoiceUpdate?.payload as { status?: string })?.status).toBe('paid');
    expect((invoiceUpdate?.payload as { paid_amount?: number })?.paid_amount).toBe(1000);
    expect((invoiceUpdate?.payload as { balance?: number })?.balance).toBeUndefined();

    const stopUpdate = db.filtersFor('collection_messages').find((c) => c.op === 'update');
    expect((stopUpdate?.payload as { delivery_status?: string })?.delivery_status).toBe('stopped');

    // Phase 3 gate: payment must post to GL (same accounts as manual payment route).
    const journal = db.rpcCallsFor('post_journal')[0];
    expect(journal).toBeTruthy();
    expect(journal.params).toMatchObject({
      p_tenant_id: TENANT_ID,
      p_reference: PAYMENT_ID,
    });
    const lines = (journal.params as { p_lines: { account_code: string; debit: number; credit: number }[] }).p_lines;
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ account_code: '11', debit: 1000, credit: 0 }),
        expect.objectContaining({ account_code: '12', debit: 0, credit: 1000 }),
      ]),
    );
  });

  it('is idempotent — second identical webhook is already_processed', async () => {
    process.env.MOYASAR_WEBHOOK_SECRET = 'super-secret';
    await request(makeApp()).post('/api/public/billing/moyasar/webhook').send(paidBody());

    const res = await request(makeApp())
      .post('/api/public/billing/moyasar/webhook')
      .send(paidBody());

    expect(res.status).toBe(200);
    expect(res.body.already_processed).toBe(true);

    const paymentInserts = db.filtersFor('payments').filter((c) => c.op === 'insert');
    expect(paymentInserts).toHaveLength(1);

    // Journal must not be posted twice on replay.
    expect(db.rpcCallsFor('post_journal')).toHaveLength(1);
  });
});
