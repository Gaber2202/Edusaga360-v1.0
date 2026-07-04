/**
 * Subscription — Moyasar webhook payment integrity (PAY-01 / PAY-02).
 *
 * The webhook grants plan/seat entitlements, so a forged or mis-routed body must
 * never apply an upgrade. These tests pin two server-side guards:
 *   1. Shared-secret verification when MOYASAR_WEBHOOK_SECRET is set.
 *   2. Amount verification — the paid halalas must equal order.total_amount * 100.
 *
 * "Upgrade applied" is observed via the `subscription_orders` UPDATE to
 * status:'paid' — the handler only reaches that write after both guards pass.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, QueryContext } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { subscriptionRouter } = await import('../routes/subscription.js');

const ORDER_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_ID = 'tenant-A';
const ORDER_TOTAL_SAR = 218500; // e.g. plan upgrade incl. VAT

function makeApp() {
  const app = express();
  app.use(express.json());
  // Webhook is unauthenticated at the handler level; mount the router directly.
  app.use('/subscription', subscriptionRouter);
  return app;
}

/** Resolver: a pending subscription order that has not yet been paid. */
function pendingOrderResolver(ctx: QueryContext) {
  if (ctx.table === 'subscription_orders' && ctx.op === 'select') {
    return { data: { id: ORDER_ID, tenant_id: TENANT_ID, status: 'pending_payment', total_amount: ORDER_TOTAL_SAR, order_type: 'plan_upgrade', plan_code: 'enterprise' } };
  }
  return { data: null };
}

function paidBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay_123',
    status: 'paid',
    amount: Math.round(ORDER_TOTAL_SAR * 100),
    metadata: { order_id: ORDER_ID, tenant_id: TENANT_ID, type: 'subscription' },
    ...overrides,
  };
}

/** Did the handler reach the "mark order paid" write? */
function orderMarkedPaid() {
  return db.filtersFor('subscription_orders').some(
    (c) => c.op === 'update' && (c.payload as Record<string, unknown>)?.status === 'paid',
  );
}

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
  db.setResolver(pendingOrderResolver);
});

afterEach(() => {
  delete process.env.MOYASAR_WEBHOOK_SECRET;
});

describe('POST /subscription/webhook/moyasar — amount verification (PAY-02)', () => {
  it('rejects a paid webhook whose amount does not match the order total', async () => {
    const res = await request(makeApp())
      .post('/subscription/webhook/moyasar')
      .send(paidBody({ amount: 100 })); // 1.00 SAR instead of the real total

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/amount mismatch/i);
    expect(orderMarkedPaid()).toBe(false);
  });

  it('rejects when amount is missing entirely', async () => {
    const body = paidBody();
    delete (body as Record<string, unknown>).amount;
    const res = await request(makeApp()).post('/subscription/webhook/moyasar').send(body);

    expect(res.status).toBe(400);
    expect(orderMarkedPaid()).toBe(false);
  });

  it('applies the upgrade when the amount matches exactly', async () => {
    const res = await request(makeApp()).post('/subscription/webhook/moyasar').send(paidBody());

    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(true);
    expect(orderMarkedPaid()).toBe(true);
  });
});

describe('POST /subscription/webhook/moyasar — shared-secret verification (PAY-01)', () => {
  it('rejects when a secret is configured but the request presents none', async () => {
    process.env.MOYASAR_WEBHOOK_SECRET = 's3cret';
    const res = await request(makeApp()).post('/subscription/webhook/moyasar').send(paidBody());

    expect(res.status).toBe(401);
    expect(orderMarkedPaid()).toBe(false);
  });

  it('rejects when the presented secret is wrong', async () => {
    process.env.MOYASAR_WEBHOOK_SECRET = 's3cret';
    const res = await request(makeApp())
      .post('/subscription/webhook/moyasar')
      .send(paidBody({ secret_token: 'wrong' }));

    expect(res.status).toBe(401);
    expect(orderMarkedPaid()).toBe(false);
  });

  it('accepts a correct secret via body secret_token and applies the upgrade', async () => {
    process.env.MOYASAR_WEBHOOK_SECRET = 's3cret';
    const res = await request(makeApp())
      .post('/subscription/webhook/moyasar')
      .send(paidBody({ secret_token: 's3cret' }));

    expect(res.status).toBe(200);
    expect(orderMarkedPaid()).toBe(true);
  });

  it('accepts a correct secret via x-moyasar-secret header', async () => {
    process.env.MOYASAR_WEBHOOK_SECRET = 's3cret';
    const res = await request(makeApp())
      .post('/subscription/webhook/moyasar')
      .set('x-moyasar-secret', 's3cret')
      .send(paidBody());

    expect(res.status).toBe(200);
    expect(orderMarkedPaid()).toBe(true);
  });
});
