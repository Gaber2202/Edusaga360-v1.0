import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase.js', () => ({ supabase: {} }));
vi.mock('../services/tenant.js', () => ({ getTenantComplianceData: vi.fn() }));
vi.mock('../services/zatca.js', () => ({ invoiceDataFromRow: vi.fn(), generateZATCAInvoicePDF: vi.fn() }));
vi.mock('../services/email.js', () => ({ isEmailConfigured: vi.fn().mockReturnValue(false), sendEmail: vi.fn() }));
vi.mock('../services/messaging/registry.js', () => ({ getProvider: vi.fn() }));
vi.mock('../lib/aiCrypto.js', () => ({ isAiCryptoConfigured: vi.fn().mockReturnValue(false), decryptSecret: vi.fn() }));

process.env.INVOICE_LINK_SECRET = 'test-secret';

import { createShareToken, verifyShareToken, recordInvoiceView } from '../services/share.js';
import { createSupabaseStub, QueryContext } from './support/supabaseMock.js';

describe('Invoice sharing tokens', () => {
  it('creates and verifies a tamper-proof token', () => {
    const token = createShareToken('inv-1', 'tenant-1');
    const payload = verifyShareToken(token);
    expect(payload).toBeTruthy();
    expect(payload?.invoice_id).toBe('inv-1');
    expect(payload?.tenant_id).toBe('tenant-1');
  });

  it('rejects a modified token', () => {
    const token = createShareToken('inv-1', 'tenant-1');
    const tampered = token.replace(/^./, 'x');
    expect(verifyShareToken(tampered)).toBeNull();
  });

  it('rejects an expired token', () => {
    const past = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
    const token = createShareToken('inv-1', 'tenant-1', past);
    expect(verifyShareToken(token)).toBeNull();
  });
});

describe('recordInvoiceView', () => {
  it('increments view_count, updates status to viewed, and writes ledger', async () => {
    const db = createSupabaseStub();
    let invoiceUpdate: any = null;
    let ledgerEntry: any = null;

    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'invoices' && ctx.op === 'update' && ctx.single) {
        invoiceUpdate = ctx.payload;
        return { data: { id: 'inv-1', status: 'viewed' } };
      }
      if (ctx.table === 'agent_actions_ledger' && ctx.op === 'insert') {
        ledgerEntry = ctx.payload;
        return { data: {} };
      }
      if (ctx.table === 'invoices' && ctx.op === 'select') {
        return { data: { id: 'inv-1', status: 'issued', view_count: 0 } };
      }
      return { data: null };
    });

    await recordInvoiceView(db.client as any, 'tenant-1', 'inv-1');

    expect(invoiceUpdate).toBeTruthy();
    expect(invoiceUpdate.view_count).toBe(1);
    expect(invoiceUpdate.status).toBe('viewed');
    expect(ledgerEntry).toBeTruthy();
    expect((ledgerEntry as any).action_type).toBe('document_viewed');
  });
});
