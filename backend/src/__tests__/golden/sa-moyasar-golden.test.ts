/**
 * Golden-file tests for Moyasar (Saudi payments adapter) outbound payloads.
 *
 * The clock is frozen so `expired_at` and `idempotency-Key` are deterministic.
 * These snapshots pin the request shape before the pack refactor, because the
 * `amount_minor` / `currency` rename already touched this surface once.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSupabaseStub, injectUser, QueryContext } from '../support/supabaseMock.js';
import { MoyasarClient } from '../../packs/sa/moyasarClient.js';
import { golden } from './support/golden.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const FIXED_TIMESTAMP = '2026-06-18T00:00:00.000Z';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(FIXED_TIMESTAMP));
  process.env.MOYASAR_SECRET_KEY_TEST = 'sk_test_xxx';
  process.env.MOYASAR_API_KEY = 'sk_live_xxx';
  process.env.PUBLIC_BASE_URL = 'https://parent.example.com';
  process.env.FRONTEND_URL = 'https://admin.example.com';
  db.reset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function invoiceResolver() {
  return (ctx: QueryContext) => {
    if (ctx.table === 'invoices') {
      return {
        data: {
          id: 'inv-1',
          invoice_number: 'INV-2026-000001',
          total_amount: 1150,
          paid_amount: 0,
          due_date: '2026-06-30',
          branch_id: null,
          guardian_id: 'guardian-1',
          status: 'issued',
          document_type: 'invoice',
          currency_code: 'SAR',
        },
      };
    }
    if (ctx.table === 'currencies') {
      return { data: [{ code: 'SAR', minor_units: 2 }] };
    }
    if (ctx.table === 'moyasar_invoices') {
      // No active link exists; no previous version.
      return { data: [] };
    }
    return { data: null };
  };
}

function normalizePayload(payload: unknown): unknown {
  return payload;
}

describe('Moyasar outbound payload golden snapshots', () => {
  it('createOrRefreshMoyasarLink invoice payload is byte-stable', async () => {
    db.setResolver(invoiceResolver());

    const spy = vi
      .spyOn(MoyasarClient.prototype, 'createInvoice')
      .mockResolvedValue({
        ok: true,
        status: 201,
        data: { id: 'msar-inv-1', url: 'https://moyasar.com/invoice/1', status: 'initiated' },
      });

    const { createOrRefreshMoyasarLink } = await import('../../packs/sa/moyasarService.js');
    await createOrRefreshMoyasarLink(db.client as any, {
      tenantId: 'tenant-A',
      invoiceId: 'inv-1',
      callbackUrl: 'https://api.example.com/public/billing/moyasar/webhook',
      successUrl: 'https://parent.example.com/payment/result?status=success',
      backUrl: 'https://parent.example.com/payment/result?status=pending',
      studentFirstName: 'Sara',
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const payload = spy.mock.calls[0][0];
    golden('sa-moyasar-invoice-link-payload', JSON.stringify(normalizePayload(payload)), 'json');
  });

  it('requestMoyasarRefund payload is byte-stable', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'payments') {
        return {
          data: {
            id: 'pmt-1',
            reference: 'moyasar-pmt-1',
            amount: 1150,
            invoice_id: 'inv-1',
            currency_code: 'SAR',
          },
        };
      }
      if (ctx.table === 'tenant_compliance_settings') {
        return { data: null };
      }
      if (ctx.table === 'moyasar_refund_queue') return { data: null };
      return { data: null };
    });

    const spy = vi
      .spyOn(MoyasarClient.prototype, 'refundPayment')
      .mockResolvedValue({
        ok: true,
        status: 200,
        data: { id: 'ref-1' },
      });

    const { requestMoyasarRefund } = await import('../../packs/sa/moyasarService.js');
    await requestMoyasarRefund(db.client as any, 'tenant-A', 'pmt-1', 500);

    expect(spy).toHaveBeenCalledTimes(1);
    const [moyasarPaymentId, refundReq] = spy.mock.calls[0];
    golden(
      'sa-moyasar-refund-payload',
      JSON.stringify({ moyasarPaymentId, refundRequest: normalizePayload(refundReq) }),
      'json',
    );
  });

  it('subscription payment link payload is byte-stable', async () => {
    // The subscription route uses global fetch and supabase directly.
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 'msar-sub-1', url: 'https://moyasar.com/invoice/sub-1', status: 'initiated' }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const orderId = 'order-1';
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'subscription_orders') {
        return {
          data: {
            id: orderId,
            tenant_id: 'tenant-A',
            status: 'pending_payment',
            total_amount: 218500,
            order_type: 'plan_upgrade',
            plan_code: 'enterprise',
            currency: 'SAR',
          },
        };
      }
      return { data: null };
    });

    const express = await import('express');
    const request = (await import('supertest')).default;
    const { subscriptionRouter } = await import('../../routes/subscription.js');

    const app = express.default();
    app.use(express.default.json());
    app.use(injectUser({ id: 'u1', email: 'admin@example.com', tenant_id: 'tenant-A', role: 'admin', is_platform_owner: false }));
    app.use(subscriptionRouter);

    const res = await request(app)
      .post(`/orders/${orderId}/payment-link`)
      .send({});

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, fetchInit] = fetchSpy.mock.calls[0];
    const body = typeof fetchInit.body === 'string' ? JSON.parse(fetchInit.body) : fetchInit.body;
    const headers = fetchInit.headers;
    const authHeader = typeof headers === 'object' ? headers.Authorization : undefined;

    // Normalise the Basic auth header (it encodes the secret key) so the snapshot
    // does not depend on the test secret. The structure is still asserted.
    const normalised = JSON.stringify({
      url,
      method: fetchInit.method,
      authHeaderPrefix: typeof authHeader === 'string' ? authHeader.slice(0, 6) : null,
      body,
    });

    golden('sa-moyasar-subscription-link-payload', normalised, 'json');
  });
});
