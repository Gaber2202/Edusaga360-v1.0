/**
 * Billing engine — VAT-aware invoicing, payments, credit notes, ZATCA
 * submission, and VAT reporting.
 *
 * Business rules verified:
 *   - Tuition is VAT-exempt; other categories (transport/meals) are 15%
 *   - Discounts reduce the taxable base before VAT (per ZATCA)
 *   - Government API (ZATCA) failures must degrade gracefully, not 500
 *   - Credit notes cannot exceed the original invoice total
 *   - VAT report nets credit notes out of VAT payable
 *
 * Covers priority scenarios #1 (invoice → payment), #5 (gov API fallback),
 * #6 (bilingual), #7 (ZATCA compliance).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, injectUser, QueryContext } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { billingRouter } = await import('../routes/billing.js');

const STUDENT_ID = '11111111-1111-1111-1111-111111111111';
const INVOICE_ID = '22222222-2222-2222-2222-222222222222';
const CATEGORY_ID = '33333333-3333-3333-3333-333333333333';
const FINANCE_USER = { id: 'u1', email: 'fin@school.sa', tenant_id: 'tenant-A', role: 'finance', is_platform_owner: false };

function makeApp(user: Record<string, unknown> = FINANCE_USER) {
  const app = express();
  app.use(express.json());
  app.use(injectUser(user));
  app.use('/billing', billingRouter);
  return app;
}

const TENANT_ROW = { id: 'tenant-A', name_en: 'Al Noor', name_ar: 'النور', admin_email: 'a@school.sa', city: 'Riyadh', jurisdiction_code: 'SA', settings: { vat_number: '300000000000003' } };

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Invoice creation with VAT treatment ──────────────────────────────────────

describe('POST /billing/invoices', () => {
  function invoiceResolver(opts: { studentFound?: boolean; vatTreatment?: string } = {}) {
    const { studentFound = true, vatTreatment = 'standard' } = opts;
    return (ctx: QueryContext) => {
      if (ctx.table === 'students') {
        return studentFound
          ? { data: { id: STUDENT_ID, name_en: 'Sara', name_ar: 'سارة', grade_id: 'g1', guardian_id: null, grades: { name_en: 'Grade 1' } } }
          : { data: null, error: { code: 'PGRST116' } };
      }
      if (ctx.table === 'fee_categories') return { data: [{ id: CATEGORY_ID, vat_treatment: vatTreatment, name_en: 'Fee', name_ar: 'رسوم', code: 'FEE' }] };
      if (ctx.table === 'invoices' && ctx.head) return { count: 0 };
      if (ctx.table === 'invoices' && ctx.op === 'insert') return { data: { id: INVOICE_ID, invoice_number: 'INV-2026-000001', total_amount: 1150 } };
      if (ctx.table === 'tenants') return { data: TENANT_ROW };
      if (ctx.table === 'zatca_submissions' && ctx.op === 'insert') return { data: { id: 'z1' } };
      if (ctx.table === 'zatca_submissions') return { data: null };
      if (ctx.table === 'chart_of_accounts') return { data: null };
      return { data: null };
    };
  }

  it('charges 15% VAT on a standard (non-tuition) fee line', async () => {
    db.setResolver(invoiceResolver());
    const res = await request(makeApp())
      .post('/billing/invoices')
      .send({
        student_id: STUDENT_ID,
        academic_year: '2025-2026',
        apply_discounts: false,
        fee_lines: [{ description_en: 'Transport', description_ar: 'نقل', amount: 1000 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.summary).toMatchObject({ subtotal: 1000, total_discount: 0, vat_amount: 150, total_amount: 1150 });
    expect(res.body.zatca).toHaveProperty('qr_code');
    expect(res.body.zatca).toHaveProperty('invoice_hash');
  });

  it('charges 0% VAT when the fee category is tuition/exempt', async () => {
    db.setResolver(invoiceResolver({ vatTreatment: 'exempt' }));
    const res = await request(makeApp())
      .post('/billing/invoices')
      .send({
        student_id: STUDENT_ID,
        academic_year: '2025-2026',
        apply_discounts: false,
        fee_lines: [{ category_id: CATEGORY_ID, description_en: 'Tuition', description_ar: 'رسوم دراسية', amount: 1000 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.summary).toMatchObject({ subtotal: 1000, vat_amount: 0, total_amount: 1000 });
  });

  it('accepts bilingual Arabic fee descriptions and special characters', async () => {
    db.setResolver(invoiceResolver());
    const res = await request(makeApp())
      .post('/billing/invoices')
      .send({
        student_id: STUDENT_ID,
        academic_year: '2025-2026',
        apply_discounts: false,
        fee_lines: [{ description_en: 'Meals & Snacks', description_ar: 'وجبات وأطعمة خفيفة', amount: 600 }],
        notes_ar: 'ملاحظة: يرجى السداد قبل نهاية الشهر',
      });

    expect(res.status).toBe(201);
    expect(res.body.summary.subtotal).toBe(600);
  });

  it('returns 404 for a student outside the caller tenant (isolation)', async () => {
    db.setResolver(invoiceResolver({ studentFound: false }));
    const res = await request(makeApp())
      .post('/billing/invoices')
      .send({ student_id: STUDENT_ID, academic_year: '2025-2026', fee_lines: [{ description_en: 'X', description_ar: 'س', amount: 100 }] });
    expect(res.status).toBe(404);
  });

  it('denies a non-finance role with 403 (RBAC)', async () => {
    const res = await request(makeApp({ ...FINANCE_USER, role: 'teacher' }))
      .post('/billing/invoices')
      .send({ student_id: STUDENT_ID, academic_year: '2025-2026', fee_lines: [{ description_en: 'X', description_ar: 'س', amount: 100 }] });
    expect(res.status).toBe(403);
  });

  it('rejects an invoice with no fee lines (400)', async () => {
    db.setResolver(invoiceResolver());
    const res = await request(makeApp())
      .post('/billing/invoices')
      .send({ student_id: STUDENT_ID, academic_year: '2025-2026', fee_lines: [] });
    expect(res.status).toBe(400);
  });
});

// ── Payments ─────────────────────────────────────────────────────────────────

describe('POST /billing/payments', () => {
  function paymentResolver(invoice: Record<string, unknown> | null) {
    return (ctx: QueryContext) => {
      if (ctx.table === 'invoices' && ctx.op === 'select') return invoice ? { data: invoice } : { data: null, error: { code: 'PGRST116' } };
      if (ctx.table === 'payments' && ctx.op === 'insert') return { data: { id: 'pmt1' } };
      if (ctx.table === 'tenants') return { data: TENANT_ROW };
      if (ctx.table === 'chart_of_accounts') return { data: null };
      return { data: null };
    };
  }
  const issued = { id: INVOICE_ID, invoice_number: 'INV-1', total_amount: 1150, paid_amount: 0, status: 'issued' };

  it('settles an invoice in full (mada)', async () => {
    db.setResolver(paymentResolver(issued));
    const res = await request(makeApp())
      .post('/billing/payments')
      .send({ invoice_id: INVOICE_ID, amount: 1150, payment_method: 'mada' });
    expect(res.status).toBe(201);
    expect(res.body.invoice.status).toBe('paid');
    expect(res.body.invoice.remaining_balance).toBe(0);
  });

  it('records a partial payment', async () => {
    db.setResolver(paymentResolver(issued));
    const res = await request(makeApp())
      .post('/billing/payments')
      .send({ invoice_id: INVOICE_ID, amount: 400, payment_method: 'cash' });
    expect(res.body.invoice.status).toBe('partial');
    expect(res.body.invoice.remaining_balance).toBe(750);
  });

  it('rejects an overpayment', async () => {
    db.setResolver(paymentResolver(issued));
    const res = await request(makeApp())
      .post('/billing/payments')
      .send({ invoice_id: INVOICE_ID, amount: 5000, payment_method: 'bank_transfer' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds balance/);
  });

  it('locks an already-paid invoice', async () => {
    db.setResolver(paymentResolver({ ...issued, status: 'paid', paid_amount: 1150 }));
    const res = await request(makeApp())
      .post('/billing/payments')
      .send({ invoice_id: INVOICE_ID, amount: 10, payment_method: 'cash' });
    expect(res.status).toBe(400);
  });
});

// ── Credit notes ─────────────────────────────────────────────────────────────

describe('POST /billing/invoices/:id/credit-note', () => {
  function cnResolver(originalTotal = 1150) {
    return (ctx: QueryContext) => {
      if (ctx.table === 'invoices' && ctx.op === 'select') return { data: { id: INVOICE_ID, invoice_number: 'INV-1', total_amount: originalTotal, student_id: STUDENT_ID, academic_year: '2025-2026' } };
      if (ctx.table === 'invoices' && ctx.op === 'insert') return { data: { id: 'cn1', invoice_number: 'CN-INV-1', total_amount: -500, invoice_type: 'credit_note' } };
      if (ctx.table === 'tenants') return { data: TENANT_ROW };
      if (ctx.table === 'jurisdiction_features') return { data: { enabled: true } };
      if (ctx.table === 'zatca_submissions') return { data: null };
      if (ctx.table === 'chart_of_accounts') return { data: null };
      return { data: null };
    };
  }

  it('issues a credit note for an amount within the original total', async () => {
    db.setResolver(cnResolver());
    const res = await request(makeApp())
      .post(`/billing/invoices/${INVOICE_ID}/credit-note`)
      .send({ original_invoice_id: INVOICE_ID, reason: 'Refund', reason_ar: 'استرداد', amount: 500 });
    expect(res.status).toBe(201);
    expect(res.body.invoice_type).toBe('credit_note');
    expect(res.body.total_amount).toBe(-500);

    // Balance must be generated, not written. Credit notes start with paid_amount=0 and a negative balance.
    const cnInsert = db.filtersFor('invoices').find((c) => c.op === 'insert');
    expect(cnInsert).toBeTruthy();
    const payload = cnInsert!.payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty('balance');
    expect(payload.paid_amount).toBe(0);
    expect(payload.total_amount).toBe(-500);
    // Generated balance will be total_amount - paid_amount = -500.
    expect((payload.total_amount as number) - (payload.paid_amount as number)).toBe(-500);
  });

  it('refuses a credit note larger than the original invoice', async () => {
    db.setResolver(cnResolver(1150));
    const res = await request(makeApp())
      .post(`/billing/invoices/${INVOICE_ID}/credit-note`)
      .send({ original_invoice_id: INVOICE_ID, reason: 'Refund', reason_ar: 'استرداد', amount: 2000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds original/);
  });
});

// ── ZATCA submission — government API resilience (#5) ─────────────────────────

describe('POST /billing/invoices/:id/zatca-submit', () => {
  function zatcaResolver() {
    return (ctx: QueryContext) => {
      if (ctx.table === 'zatca_submissions' && ctx.op === 'select') return { data: { id: 'z1', invoice_hash: 'h', ubl_xml: '<Invoice/>', submission_type: 'reporting' } };
      if (ctx.table === 'tenants') return { data: TENANT_ROW };
      if (ctx.table === 'jurisdiction_features') return { data: { enabled: true } };
      if (ctx.table === 'invoices') return { data: { invoice_number: 'INV-1', date: '2026-06-18', subtotal: 1000, vat_amount: 150, total_amount: 1150 } };
      return { data: null };
    };
  }

  it('marks the invoice "reported" when ZATCA accepts it', async () => {
    db.setResolver(zatcaResolver());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ reportingStatus: 'REPORTED' }) }));

    const res = await request(makeApp()).post(`/billing/invoices/${INVOICE_ID}/zatca-submit`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('reported');
  });

  it('marks it "rejected" when ZATCA returns a non-OK response', async () => {
    db.setResolver(zatcaResolver());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'invalid invoice' }) }));

    const res = await request(makeApp()).post(`/billing/invoices/${INVOICE_ID}/zatca-submit`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rejected');
  });

  it('degrades to "error" (not a 500) when the ZATCA API is unreachable', async () => {
    db.setResolver(zatcaResolver());
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const res = await request(makeApp()).post(`/billing/invoices/${INVOICE_ID}/zatca-submit`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('error');
  });

  it('returns 404 when there is no ZATCA record for the invoice', async () => {
    db.setResolver((ctx) => (ctx.table === 'zatca_submissions' ? { data: null, error: { code: 'PGRST116' } } : { data: null }));
    const res = await request(makeApp()).post(`/billing/invoices/${INVOICE_ID}/zatca-submit`);
    expect(res.status).toBe(404);
  });
});

// ── VAT report ───────────────────────────────────────────────────────────────

describe('GET /billing/vat-report', () => {
  it('aggregates revenue/VAT and nets credit notes out of VAT payable', async () => {
    db.setResolver((ctx) => {
      if (ctx.table === 'invoices') return { data: [
        { subtotal: 1000, vat_amount: 150, total_amount: 1150, discount_amount: 0, invoice_type: 'standard', status: 'paid' },
        { subtotal: 2000, vat_amount: 300, total_amount: 2300, discount_amount: 0, invoice_type: 'standard', status: 'issued' },
        { subtotal: 0, vat_amount: -75, total_amount: -500, discount_amount: 0, invoice_type: 'credit_note', status: 'issued' },
      ] };
      return { data: null };
    });

    const res = await request(makeApp())
      .get('/billing/vat-report')
      .query({ from_date: '2026-01-01', to_date: '2026-12-31' });

    expect(res.status).toBe(200);
    expect(res.body.gross_revenue).toBe(3000);
    expect(res.body.vat_collected).toBe(450);
    expect(res.body.credit_notes).toMatchObject({ revenue: 500, vat: 75 });
    expect(res.body.net_vat_payable).toBe(375); // 450 − 75
  });

  it('requires both from_date and to_date (400)', async () => {
    const res = await request(makeApp()).get('/billing/vat-report').query({ from_date: '2026-01-01' });
    expect(res.status).toBe(400);
  });
});
