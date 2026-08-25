import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, injectUser, QueryContext } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { storeOrdersRouter } = await import('../routes/storeOrders.js');

const ORDER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const INVOICE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const FINANCE_USER = { id: 'u1', email: 'fin@school.sa', tenant_id: 'tenant-A', role: 'finance', is_platform_owner: false };

function makeApp(user: Record<string, unknown> = FINANCE_USER) {
  const app = express();
  app.use(express.json());
  app.use(injectUser(user));
  app.use('/store', storeOrdersRouter);
  return app;
}

const TENANT_ROW = {
  id: 'tenant-A',
  name_en: 'Al Noor',
  name_ar: 'النور',
  jurisdiction_code: 'SA',
  settings: { vat_number: '300000000000003' },
};

const PENDING_ORDER = {
  id: ORDER_ID,
  order_number: 'SO-001',
  status: 'pending_payment',
  invoice_id: INVOICE_ID,
  total_amount: 150,
  student_id: STUDENT_ID,
  currency_code: 'SAR',
};

const ISSUED_INVOICE = {
  id: INVOICE_ID,
  invoice_number: 'INV-STORE-1',
  total_amount: 150,
  paid_amount: 0,
  status: 'issued',
  source: 'store',
  student_id: STUDENT_ID,
  tenant_id: 'tenant-A',
  branch_id: null,
};

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /store/orders/:id/collect-payment', () => {
  let orderStatus = 'pending_payment';

  function resolver() {
    return (ctx: QueryContext) => {
      if (ctx.table === 'store_orders' && ctx.op === 'select') {
        return { data: { ...PENDING_ORDER, status: orderStatus, store_order_lines: [] } };
      }
      if (ctx.table === 'store_orders' && ctx.op === 'update') {
        orderStatus = 'ready_for_collect';
        return { data: { ...PENDING_ORDER, status: orderStatus } };
      }
      if (ctx.table === 'invoices' && ctx.op === 'select') {
        return { data: ISSUED_INVOICE };
      }
      if (ctx.table === 'invoices' && ctx.op === 'update') {
        return { data: { ...ISSUED_INVOICE, status: 'paid', paid_amount: 150 } };
      }
      if (ctx.table === 'payments' && ctx.op === 'insert') {
        return { data: { id: 'pay-1', amount: 150, method: 'cash' } };
      }
      if (ctx.table === 'store_order_lines') {
        return { data: [{ product_id: 'prod-1', line_type: 'purchase', quantity: 1 }] };
      }
      if (ctx.table === 'store_products') {
        return { data: { stock_qty: 5 } };
      }
      if (ctx.table === 'store_bookings') {
        return { data: null };
      }
      if (ctx.table === 'tenants') return { data: TENANT_ROW };
      if (ctx.table === 'chart_of_accounts') return { data: null };
      if (ctx.table === 'receipts' && ctx.op === 'insert') {
        return { data: { id: 'rcpt-1', receipt_number: 'RCP-1' } };
      }
      return { data: null };
    };
  }

  beforeEach(() => {
    orderStatus = 'pending_payment';
    db.setRpcResolver((fn) => {
      if (fn === 'post_journal') return { data: 'je-1' };
      return {};
    });
    db.setResolver(resolver());
  });

  it('collects in-school payment and marks order ready for collect', async () => {
    const res = await request(makeApp())
      .post(`/store/orders/${ORDER_ID}/collect-payment`)
      .send({ payment_method: 'cash', amount: 150 });

    expect(res.status).toBe(201);
    expect(res.body.payment).toBeTruthy();
    expect(res.body.invoice.status).toBe('paid');
    expect(res.body.order?.status).toBe('ready_for_collect');
  });

  it('rejects collect when order is not pending payment', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'store_orders' && ctx.op === 'select') {
        return { data: { ...PENDING_ORDER, status: 'ready_for_collect' } };
      }
      return resolver()(ctx);
    });

    const res = await request(makeApp())
      .post(`/store/orders/${ORDER_ID}/collect-payment`)
      .send({ payment_method: 'cash' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not awaiting payment/i);
  });

  it('requires finance role', async () => {
    const res = await request(makeApp({ ...FINANCE_USER, role: 'teacher' }))
      .post(`/store/orders/${ORDER_ID}/collect-payment`)
      .send({ payment_method: 'cash' });

    expect(res.status).toBe(403);
  });
});
