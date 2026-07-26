import { toHalala } from '../../lib/money.js';

const MOYASAR_BASE = 'https://api.moyasar.com/v1';

export type MoyasarSourceType = 'creditcard' | 'mada' | 'applepay' | 'stcpay' | 'samsungpay';

export interface MoyasarInvoiceItem {
  amount: number; // halalas
  currency: 'SAR';
  description: string;
  callback_url?: string;
  success_url?: string;
  back_url?: string;
  expired_at?: string;
  metadata?: Record<string, string>;
}

export type MoyasarBulkInvoiceItem = MoyasarInvoiceItem;

export interface MoyasarPaymentRequest {
  amount: number; // halalas
  currency: 'SAR';
  description?: string;
  callback_url?: string;
  source: Record<string, unknown>;
  metadata?: Record<string, string>;
  given_id?: string;
}

export interface MoyasarRefundRequest {
  amount?: number; // halalas; omit for full refund
}

export interface MoyasarWebhookRegisterRequest {
  url: string;
  shared_secret: string;
  events: string[];
  http_method: 'post';
}

export interface MoyasarConfig {
  secretKey: string;
  publishableKey?: string;
  webhookSecret?: string;
}

export interface MoyasarResponse<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data?: T;
  error?: { message?: string; [key: string]: unknown };
}

function basicAuth(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
}

export class MoyasarClient {
  private secretKey: string;

  constructor(config: MoyasarConfig) {
    if (!config.secretKey) throw new Error('Moyasar secret key is required');
    this.secretKey = config.secretKey;
  }

  private async request<T = Record<string, unknown>>(
    method: string,
    path: string,
    options?: { body?: Record<string, unknown>; idempotencyKey?: string },
  ): Promise<MoyasarResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: basicAuth(this.secretKey),
    };
    if (options?.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }
    try {
      const res = await fetch(`${MOYASAR_BASE}${path}`, {
        method,
        headers,
        body: options?.body ? JSON.stringify(options.body) : undefined,
      });
      const text = await res.text();
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = { raw: text };
      }
      if (!res.ok) {
        return { ok: false, status: res.status, error: json as { message?: string } };
      }
      return { ok: true, status: res.status, data: json as T };
    } catch (err) {
      return { ok: false, status: 0, error: { message: (err as Error).message } };
    }
  }

  async createInvoice(item: MoyasarInvoiceItem, idempotencyKey?: string): Promise<MoyasarResponse> {
    return this.request('POST', '/invoices', { body: item as unknown as Record<string, unknown>, idempotencyKey });
  }

  async bulkCreateInvoices(invoices: MoyasarBulkInvoiceItem[], idempotencyKey?: string): Promise<MoyasarResponse> {
    return this.request('POST', '/invoices/bulk', { body: { invoices } as unknown as Record<string, unknown>, idempotencyKey });
  }

  async cancelInvoice(moyasarId: string, idempotencyKey?: string): Promise<MoyasarResponse> {
    return this.request('PUT', `/invoices/${moyasarId}/cancel`, { idempotencyKey });
  }

  async getInvoice(moyasarId: string): Promise<MoyasarResponse> {
    return this.request('GET', `/invoices/${moyasarId}`);
  }

  async listInvoices(query?: Record<string, string>): Promise<MoyasarResponse> {
    const qs = query ? new URLSearchParams(query).toString() : '';
    return this.request('GET', `/invoices${qs ? `?${qs}` : ''}`);
  }

  async createPayment(req: MoyasarPaymentRequest, idempotencyKey?: string): Promise<MoyasarResponse> {
    return this.request('POST', '/payments', { body: req as unknown as Record<string, unknown>, idempotencyKey });
  }

  async getPayment(moyasarId: string): Promise<MoyasarResponse> {
    return this.request('GET', `/payments/${moyasarId}`);
  }

  async listPayments(query?: Record<string, string>): Promise<MoyasarResponse> {
    const qs = query ? new URLSearchParams(query).toString() : '';
    return this.request('GET', `/payments${qs ? `?${qs}` : ''}`);
  }

  async refundPayment(moyasarId: string, req?: MoyasarRefundRequest, idempotencyKey?: string): Promise<MoyasarResponse> {
    return this.request('POST', `/payments/${moyasarId}/refund`, { body: (req ?? {}) as unknown as Record<string, unknown>, idempotencyKey });
  }

  async voidPayment(moyasarId: string, idempotencyKey?: string): Promise<MoyasarResponse> {
    return this.request('POST', `/payments/${moyasarId}/void`, { idempotencyKey });
  }

  async capturePayment(moyasarId: string, idempotencyKey?: string): Promise<MoyasarResponse> {
    return this.request('POST', `/payments/${moyasarId}/capture`, { idempotencyKey });
  }

  async registerWebhook(req: MoyasarWebhookRegisterRequest, idempotencyKey?: string): Promise<MoyasarResponse> {
    return this.request('POST', '/webhooks', { body: req as unknown as Record<string, unknown>, idempotencyKey });
  }
}

export { toHalala };
