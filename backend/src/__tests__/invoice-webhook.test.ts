import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dispatchWebhook } from '../services/webhookDelivery.js';
import { createSupabaseStub, QueryContext } from './support/supabaseMock.js';

describe('dispatchWebhook', () => {
  let fetchMock: any;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts signed payload and logs a delivery', async () => {
    const db = createSupabaseStub();
    let insertedDelivery: any = null;

    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'tenant_webhooks' && ctx.op === 'select') {
        return {
          data: [
            {
              id: 'hook-1',
              url: 'https://example.com/webhook',
              events: ['invoice.paid'],
              secret: 'shh',
            },
          ],
        };
      }
      if (ctx.table === 'webhook_deliveries' && ctx.op === 'insert') {
        insertedDelivery = ctx.payload;
        return { data: {} };
      }
      if (ctx.table === 'webhook_deliveries' && ctx.op === 'select') {
        return { data: null };
      }
      return { data: null };
    });

    const result = await dispatchWebhook(db.client as any, 'tenant-1', 'invoice.paid', { invoice_id: 'inv-1' }, 'inv-1');

    expect(result.delivered).toBe(1);
    expect(result.failed).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.com/webhook');
    expect(options.method).toBe('POST');
    expect(options.headers['X-Webhook-Event']).toBe('invoice.paid');
    expect(options.headers['X-Webhook-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(insertedDelivery).toBeTruthy();
    expect(insertedDelivery.delivery_status).toBe('delivered');
  });

  it('skips duplicate deliveries for the same source_id', async () => {
    const db = createSupabaseStub();
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'tenant_webhooks' && ctx.op === 'select') {
        return { data: [{ id: 'hook-1', url: 'https://example.com/webhook', events: ['invoice.paid'], secret: 'shh' }] };
      }
      if (ctx.table === 'webhook_deliveries' && ctx.op === 'select') {
        return { data: { id: 'existing' } };
      }
      return { data: null };
    });

    const result = await dispatchWebhook(db.client as any, 'tenant-1', 'invoice.paid', { invoice_id: 'inv-1' }, 'inv-1');
    expect(result.delivered).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
