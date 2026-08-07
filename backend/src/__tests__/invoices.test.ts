/**
 * Invoice viewing & ZATCA e-invoicing route (P1.1 + P1.7).
 *
 * Verifies the endpoints that back the invoice detail view:
 *   - GET  /invoices/:id/download-pdf  -> server-rendered, ZATCA-compliant PDF
 *   - POST /invoices/generate-zatca    -> TLV QR + UBL XML + hash + base64 PDF
 *
 * Business rules verified:
 *   - The invoice fetch is always scoped to the caller's tenant (no cross-tenant leak)
 *   - A missing invoice returns 404 rather than a broken/empty PDF
 *   - ZATCA generation requires a finance role
 *   - ZATCA generation validates its payload
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, injectUser, QueryContext } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { invoiceRouter } = await import('../routes/invoices.js');

const TENANT_ID = 'tenant-A';
const INVOICE_ID = '22222222-2222-2222-2222-222222222222';
const FINANCE_USER = { id: 'u1', email: 'fin@school.sa', tenant_id: TENANT_ID, role: 'admin', is_platform_owner: false };
const TEACHER_USER = { id: 'u2', email: 'teacher@school.sa', tenant_id: TENANT_ID, role: 'teacher', is_platform_owner: false };
const PARENT_USER = { id: 'auth-parent-1', email: 'parent@home.sa', tenant_id: TENANT_ID, role: 'parent', is_platform_owner: false };

const TENANT_ROW = {
  id: TENANT_ID,
  name: 'Al Noor International School',
  name_ar: 'مدرسة النور العالمية',
  vat_number: '300000000000003',
  address: 'Riyadh',
  cr_number: '1010101010',
  jurisdiction_code: 'SA',
  settings: {},
};

const INVOICE_ROW = {
  id: INVOICE_ID,
  invoice_number: 'INV-2026-000001',
  issue_date: '2026-06-19',
  subtotal: 1000,
  vat_amount: 150,
  total_amount: 1150,
  student_name: 'Ali Hassan',
  student_id: 'STU-1',
  items: [{ description: 'Tuition Fee', amount: 1000, vat_rate: 15 }],
  discount_amount: 0,
};

function makeApp(user: Record<string, unknown> = FINANCE_USER) {
  const app = express();
  app.use(express.json());
  app.use(injectUser(user));
  app.use('/invoices', invoiceRouter);
  return app;
}

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});

// ── GET /invoices/:id/download-pdf ───────────────────────────────────────────

describe('GET /invoices/:id/download-pdf', () => {
  it('returns a ZATCA PDF and scopes the invoice lookup to the tenant', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'tenants') return { data: TENANT_ROW };
      if (ctx.table === 'invoices') return { data: INVOICE_ROW };
      return { data: null };
    });

    const res = await request(makeApp())
      .get(`/invoices/${INVOICE_ID}/download-pdf`)
      .buffer(true);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(Number(res.headers['content-length'])).toBeGreaterThan(0);
    // Tenant isolation: the invoice row must have been fetched with eq('tenant_id', ...).
    expect(db.everyQueryScopedToTenant('invoices', TENANT_ID)).toBe(true);
  });

  it('returns 404 when the invoice does not exist (no broken PDF)', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'tenants') return { data: TENANT_ROW };
      if (ctx.table === 'invoices') return { data: null, error: { code: 'PGRST116', message: 'No rows' } };
      return { data: null };
    });

    const res = await request(makeApp()).get(`/invoices/${INVOICE_ID}/download-pdf`);
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  it('lets a parent download an invoice for their own linked child', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'tenants') return { data: TENANT_ROW };
      if (ctx.table === 'invoices') return { data: INVOICE_ROW }; // student_id STU-1
      if (ctx.table === 'users') return { data: { linked_student_ids: ['STU-1'] } };
      return { data: null };
    });

    const res = await request(makeApp(PARENT_USER)).get(`/invoices/${INVOICE_ID}/download-pdf`).buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });

  it("blocks a parent from downloading another family's invoice (403)", async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'tenants') return { data: TENANT_ROW };
      if (ctx.table === 'invoices') return { data: INVOICE_ROW }; // student_id STU-1
      if (ctx.table === 'users') return { data: { linked_student_ids: ['STU-OTHER'] } };
      return { data: null };
    });

    const res = await request(makeApp(PARENT_USER)).get(`/invoices/${INVOICE_ID}/download-pdf`);
    expect(res.status).toBe(403);
  });
});

// ── POST /invoices/generate-zatca ────────────────────────────────────────────

describe('POST /invoices/generate-zatca', () => {
  const validBody = {
    invoice_id: INVOICE_ID,
    invoice_number: 'INV-2026-000001',
    issue_date: '2026-06-19',
    subtotal: 1000,
    vat_amount: 150,
    total_amount: 1150,
    student_name: 'Ali Hassan',
    items: [{ description: 'Tuition Fee', amount: 1000, vat_rate: 15 }],
  };

  it('returns the QR, UBL XML, invoice hash and base64 PDF for a finance user', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'tenants') return { data: TENANT_ROW };
      if (ctx.table === 'zatca_invoices') return { data: null }; // upsert ok
      return { data: null };
    });

    const res = await request(makeApp()).post('/invoices/generate-zatca').send(validBody);

    expect(res.status).toBe(200);
    expect(typeof res.body.qr_code).toBe('string');
    expect(res.body.qr_code.length).toBeGreaterThan(0);
    expect(res.body.invoice_hash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
    expect(res.body.ubl_xml).toContain('Invoice');
    expect(typeof res.body.pdf_base64).toBe('string');
    expect(res.body.pdf_base64.length).toBeGreaterThan(0);
  });

  it('rejects a non-finance role with 403', async () => {
    const res = await request(makeApp(TEACHER_USER)).post('/invoices/generate-zatca').send(validBody);
    expect(res.status).toBe(403);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(makeApp())
      .post('/invoices/generate-zatca')
      .send({ invoice_number: 'INV-2026-000001' }); // missing totals/date
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/validation/i);
  });
});
