/**
 * Fees & Billing (core fees router) — invoice CRUD, server-enforced VAT,
 * payment recording, and multi-tenant isolation.
 *
 * Business rules verified:
 *   - VAT is ALWAYS computed server-side at 15% — never trusted from the client
 *   - Discounts reduce the taxable base before VAT
 *   - A student from another tenant can never be invoiced (RLS / tenant scoping)
 *   - Payments cannot exceed the outstanding balance; paid/cancelled invoices lock
 *
 * Covers priority scenarios #1 (enrollment → invoice → payment) and #4 (isolation).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, injectUser, QueryContext } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { feesRouter } = await import('../routes/fees.js');

const STUDENT_ID = '11111111-1111-1111-1111-111111111111';
const INVOICE_ID = '22222222-2222-2222-2222-222222222222';
const FINANCE_USER = { id: 'u1', email: 'fin@school.sa', tenant_id: 'tenant-A', role: 'admin', is_platform_owner: false };

function makeApp(user: Record<string, unknown> = FINANCE_USER) {
  const app = express();
  app.use(express.json());
  app.use(injectUser(user));
  app.use('/fees', feesRouter);
  return app;
}

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});

// ── Invoice creation with server-side VAT ────────────────────────────────────

describe('POST /fees/invoices', () => {
  function invoiceCreateResolver(studentFound = true) {
    return (ctx: QueryContext) => {
      if (ctx.table === 'students') {
        return studentFound
          ? { data: { id: STUDENT_ID } }
          : { data: null, error: { code: 'PGRST116', message: 'No rows' } };
      }
      if (ctx.table === 'invoices' && ctx.head) return { count: 0 };
      if (ctx.table === 'invoices' && ctx.op === 'insert') {
        return { data: { id: INVOICE_ID, invoice_number: 'INV-2026-000001', status: 'issued', total_amount: 1150 } };
      }
      if (ctx.table === 'tenants') return { data: { id: 'tenant-A', jurisdiction_code: 'SA', settings: {} } };
      if (ctx.table === 'chart_of_accounts') return { data: null }; // CoA not configured → journal skipped
      return { data: null };
    };
  }

  it('computes 15% VAT server-side and returns the breakdown', async () => {
    db.setResolver(invoiceCreateResolver());
    const res = await request(makeApp())
      .post('/fees/invoices')
      .send({ student_id: STUDENT_ID, fee_items: [{ description: 'Tuition Term 1', amount: 1000 }] });

    expect(res.status).toBe(201);
    expect(res.body.subtotal).toBe(1000);
    expect(res.body.vat_amount).toBe(150);
    expect(res.body.taxable_amount).toBe(1000);
    expect(res.body.vat_rate).toBe(0.15);
  });

  it('applies a discount to the taxable base before VAT', async () => {
    db.setResolver(invoiceCreateResolver());
    const res = await request(makeApp())
      .post('/fees/invoices')
      .send({ student_id: STUDENT_ID, fee_items: [{ description: 'Tuition', amount: 1000 }], discount: 200 });

    expect(res.status).toBe(201);
    expect(res.body.taxable_amount).toBe(800);
    expect(res.body.vat_amount).toBe(120); // 800 * 0.15
  });

  it('accepts bilingual (Arabic) fee descriptions', async () => {
    db.setResolver(invoiceCreateResolver());
    const res = await request(makeApp())
      .post('/fees/invoices')
      .send({ student_id: STUDENT_ID, fee_items: [{ description: 'رسوم دراسية - الفصل الأول', amount: 1500 }] });

    expect(res.status).toBe(201);
    expect(res.body.vat_amount).toBe(225); // 1500 * 0.15
  });

  it('returns 404 for a student that does not belong to the caller tenant (isolation)', async () => {
    db.setResolver(invoiceCreateResolver(false));
    const res = await request(makeApp())
      .post('/fees/invoices')
      .send({ student_id: STUDENT_ID, fee_items: [{ description: 'Tuition', amount: 1000 }] });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Student not found');
    // The lookup must have been scoped to the caller's tenant.
    expect(db.everyQueryScopedToTenant('students', 'tenant-A')).toBe(true);
  });

  it('rejects invalid payloads with 400 (empty fee_items, bad amount)', async () => {
    db.setResolver(invoiceCreateResolver());
    const r1 = await request(makeApp())
      .post('/fees/invoices')
      .send({ student_id: STUDENT_ID, fee_items: [] });
    expect(r1.status).toBe(400);

    const r2 = await request(makeApp())
      .post('/fees/invoices')
      .send({ student_id: STUDENT_ID, fee_items: [{ description: 'X', amount: -5 }] });
    expect(r2.status).toBe(400);

    const r3 = await request(makeApp())
      .post('/fees/invoices')
      .send({ student_id: 'not-a-uuid', fee_items: [{ description: 'X', amount: 5 }] });
    expect(r3.status).toBe(400);
  });
});

// ── Payment recording ────────────────────────────────────────────────────────

describe('POST /fees/payments', () => {
  function paymentResolver(invoice: Record<string, unknown> | null) {
    return (ctx: QueryContext) => {
      if (ctx.table === 'invoices' && ctx.op === 'select') {
        return invoice ? { data: invoice } : { data: null, error: { code: 'PGRST116' } };
      }
      if (ctx.table === 'payments' && ctx.op === 'insert') return { data: { id: 'pmt1', amount: 0 } };
      if (ctx.table === 'tenants') return { data: { id: 'tenant-A', jurisdiction_code: 'SA', settings: {} } };
      if (ctx.table === 'chart_of_accounts') return { data: null };
      return { data: null };
    };
  }

  const issuedInvoice = { id: INVOICE_ID, invoice_number: 'INV-1', total_amount: 1150, paid_amount: 0, status: 'issued' };

  it('marks an invoice paid when the full balance is received', async () => {
    db.setResolver(paymentResolver(issuedInvoice));
    const res = await request(makeApp())
      .post('/fees/payments')
      .send({ invoice_id: INVOICE_ID, amount: 1150, payment_method: 'bank_transfer' });

    expect(res.status).toBe(201);
    expect(res.body.invoice.status).toBe('paid');
    expect(res.body.invoice.remaining_balance).toBe(0);
  });

  it('marks an invoice partial on an underpayment', async () => {
    db.setResolver(paymentResolver(issuedInvoice));
    const res = await request(makeApp())
      .post('/fees/payments')
      .send({ invoice_id: INVOICE_ID, amount: 500, payment_method: 'cash' });

    expect(res.body.invoice.status).toBe('partial');
    expect(res.body.invoice.remaining_balance).toBe(650);
  });

  it('rejects an overpayment that exceeds the outstanding balance', async () => {
    db.setResolver(paymentResolver(issuedInvoice));
    const res = await request(makeApp())
      .post('/fees/payments')
      .send({ invoice_id: INVOICE_ID, amount: 2000, payment_method: 'card' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds outstanding balance/);
  });

  it('refuses to record a payment against an already-paid invoice', async () => {
    db.setResolver(paymentResolver({ ...issuedInvoice, status: 'paid', paid_amount: 1150 }));
    const res = await request(makeApp())
      .post('/fees/payments')
      .send({ invoice_id: INVOICE_ID, amount: 100, payment_method: 'cash' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already paid/);
  });

  it('returns 404 for an invoice outside the caller tenant', async () => {
    db.setResolver(paymentResolver(null));
    const res = await request(makeApp())
      .post('/fees/payments')
      .send({ invoice_id: INVOICE_ID, amount: 100, payment_method: 'cash' });
    expect(res.status).toBe(404);
  });
});

// ── Listing & retrieval (CRUD reads + isolation) ─────────────────────────────

describe('GET /fees/invoices', () => {
  it('returns paginated invoices scoped to the tenant', async () => {
    db.setResolver((ctx) => {
      if (ctx.table === 'invoices') return { data: [{ id: INVOICE_ID }], count: 1 };
      return { data: null };
    });

    const res = await request(makeApp()).get('/fees/invoices').query({ page: '1', limit: '20' });
    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 20, total: 1, pages: 1 });
    expect(db.everyQueryScopedToTenant('invoices', 'tenant-A')).toBe(true);
  });
});

describe('GET /fees/invoices/:id', () => {
  it('returns 404 when the invoice belongs to a different tenant', async () => {
    db.setResolver((ctx) => {
      if (ctx.table === 'invoices') return { data: null, error: { code: 'PGRST116' } };
      return { data: null };
    });
    const res = await request(makeApp()).get(`/fees/invoices/${INVOICE_ID}`);
    expect(res.status).toBe(404);
  });
});
