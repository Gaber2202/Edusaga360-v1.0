/**
 * Bulk invoice generation — dry-run preview (P1.2).
 *
 * Verifies the preview returns an accurate, idempotent picture before anything
 * is written:
 *   - counts only students that will actually be invoiced (excludes those that
 *     already have a non-cancelled invoice for the year)
 *   - reports the estimated total value (incl. 15% VAT on standard categories,
 *     0% on exempt) and a recipients sample
 *   - is finance-role gated and validates its payload
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, injectUser, QueryContext } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { billingRouter } = await import('../routes/billing.js');

const TENANT_ID = 'tenant-A';
const FINANCE_USER = { id: 'u1', email: 'fin@school.sa', tenant_id: TENANT_ID, role: 'admin', is_platform_owner: false };
const TEACHER_USER = { id: 'u2', email: 't@school.sa', tenant_id: TENANT_ID, role: 'teacher', is_platform_owner: false };

function makeApp(user: Record<string, unknown> = FINANCE_USER) {
  const app = express();
  app.use(express.json());
  app.use(injectUser(user));
  app.use('/billing', billingRouter);
  return app;
}

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});

const FEE_STRUCTURES = [
  { id: 'fs1', grade: null, amount: 1000, category_id: 'c1', fee_categories: { id: 'c1', vat_treatment: 'standard', name_en: 'Tuition', name_ar: 'رسوم دراسية', code: 'TUI' } },
  { id: 'fs2', grade: null, amount: 500, category_id: 'c2', fee_categories: { id: 'c2', vat_treatment: 'exempt', name_en: 'Books', name_ar: 'كتب', code: 'BK' } },
];
const STUDENTS = [
  { id: 's1', grade_id: 'g1', name_en: 'Aisha', name_ar: 'عائشة' },
  { id: 's2', grade_id: 'g1', name_en: 'Bilal', name_ar: 'بلال' },
  { id: 's3', grade_id: 'g1', name_en: 'Carmen', name_ar: 'كارمن' },
];

describe('POST /billing/bulk-invoices — dry-run preview', () => {
  it('counts only students that will be invoiced and totals incl. VAT', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'fee_structures') return { data: FEE_STRUCTURES };
      if (ctx.table === 'students') return { data: STUDENTS };
      if (ctx.table === 'invoices') return { data: [{ student_id: 's2' }] }; // s2 already invoiced this year
      return { data: null };
    });

    const res = await request(makeApp())
      .post('/billing/bulk-invoices')
      .send({ academic_year: '2026-2027', dry_run: true });

    expect(res.status).toBe(200);
    expect(res.body.dry_run).toBe(true);
    expect(res.body.student_count).toBe(3);
    expect(res.body.fee_structures).toBe(2);
    expect(res.body.estimated_invoices).toBe(2); // s1 + s3 (s2 excluded)
    expect(res.body.already_invoiced).toBe(1); // s2
    expect(res.body.skipped_no_fees).toBe(0);
    // Per student: 1000 + 15% VAT = 1150, plus 500 exempt = 1650; two students => 3300
    expect(res.body.estimated_total).toBe(3300);
    expect(res.body.recipients).toHaveLength(2);
    expect(res.body.recipients[0]).toMatchObject({ amount: 1650 });
    // The estimate must NOT just echo the active-student count.
    expect(res.body.estimated_invoices).not.toBe(res.body.student_count);
  });

  it('returns 400 when no fee structures match the criteria', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'fee_structures') return { data: [] };
      return { data: null };
    });
    const res = await request(makeApp())
      .post('/billing/bulk-invoices')
      .send({ academic_year: '2026-2027', dry_run: true });
    expect(res.status).toBe(400);
  });

  it('rejects a non-finance role with 403', async () => {
    const res = await request(makeApp(TEACHER_USER))
      .post('/billing/bulk-invoices')
      .send({ academic_year: '2026-2027', dry_run: true });
    expect(res.status).toBe(403);
  });

  it('returns 400 on an invalid payload (missing academic_year)', async () => {
    const res = await request(makeApp()).post('/billing/bulk-invoices').send({ dry_run: true });
    expect(res.status).toBe(400);
  });
});
