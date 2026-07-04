/**
 * RBAC route guards (2B-2) — server-side role enforcement on privileged
 * mutations that previously relied on frontend-only gating.
 *
 * The threat: `parent` and `unassigned` are real roles, so before this an
 * external parent could create invoices, record payments, pull any employee's
 * payslip, send bulk WhatsApp, or edit HR policy by calling the API directly.
 *
 * These tests pin, per endpoint: a denied role → 403 (guard fires before the
 * handler), an allowed role → not 403 (guard passes through), and platform
 * owners bypass. We assert on the guard boundary (403 vs not-403), not on
 * downstream handler behaviour, so the tests are fast and mock-independent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, injectUser } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { feesRouter } = await import('../routes/fees.js');
const { payslipPdfRouter } = await import('../routes/payslipPdf.js');
const { attendancePolicyRouter } = await import('../routes/attendancePolicy.js');
const { notificationsRouter } = await import('../routes/notifications.js');
const { benchmarksRouter } = await import('../routes/benchmarks.js');

function user(role: string, is_platform_owner = false) {
  return { id: 'u1', email: 'u@school.sa', tenant_id: 'tenant-A', role, is_platform_owner };
}

function app(router: express.Router, mount: string, u: Record<string, unknown>) {
  const a = express();
  a.use(express.json());
  a.use(injectUser(u));
  a.use(mount, router);
  return a;
}

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
  db.setResolver(() => ({ data: null }));
});

describe('fees — FINANCE_ROLES on money writes', () => {
  const body = { student_id: '11111111-1111-1111-1111-111111111111', fee_items: [{ description: 'Tuition', amount: 100 }] };
  it('denies a parent creating an invoice', async () => {
    const res = await request(app(feesRouter, '/fees', user('parent'))).post('/fees/invoices').send(body);
    expect(res.status).toBe(403);
  });
  it('denies a teacher recording a payment', async () => {
    const res = await request(app(feesRouter, '/fees', user('teacher'))).post('/fees/payments').send({ invoice_id: '22222222-2222-2222-2222-222222222222', amount: 10, payment_method: 'cash' });
    expect(res.status).toBe(403);
  });
  it('allows finance to create an invoice (guard passes)', async () => {
    const res = await request(app(feesRouter, '/fees', user('finance'))).post('/fees/invoices').send(body);
    expect(res.status).not.toBe(403);
  });
  it('allows a platform owner to bypass', async () => {
    const res = await request(app(feesRouter, '/fees', user('parent', true))).post('/fees/invoices').send(body);
    expect(res.status).not.toBe(403);
  });
});

describe('payslipPdf — PAYROLL_ROLES (salary + IBAN)', () => {
  it('denies a teacher pulling a payslip PDF', async () => {
    const res = await request(app(payslipPdfRouter, '/payroll', user('teacher')))
      .post('/payroll/payslip-pdf')
      .send({ payslip_id: '33333333-3333-3333-3333-333333333333', employee_id: '44444444-4444-4444-4444-444444444444', period_month: 6, period_year: 2026 });
    expect(res.status).toBe(403);
  });
  it('denies a parent', async () => {
    const res = await request(app(payslipPdfRouter, '/payroll', user('parent')))
      .post('/payroll/payslip-pdf').send({ payslip_id: '3', employee_id: '4', period_month: 6, period_year: 2026 });
    expect(res.status).toBe(403);
  });
});

describe('attendancePolicy — HR_ROLES on config', () => {
  it('denies a teacher creating a policy', async () => {
    const res = await request(app(attendancePolicyRouter, '/ap', user('teacher'))).post('/ap/').send({ name: 'P1' });
    expect(res.status).toBe(403);
  });
  it('allows hr_admin (guard passes)', async () => {
    const res = await request(app(attendancePolicyRouter, '/ap', user('hr_admin'))).post('/ap/').send({ name: 'P1' });
    expect(res.status).not.toBe(403);
  });
});

describe('notifications — STAFF_ROLES excludes parent/unassigned', () => {
  it('denies a parent sending bulk WhatsApp', async () => {
    const res = await request(app(notificationsRouter, '/n', user('parent')))
      .post('/n/whatsapp/bulk').send({ recipients: [], template_key: 'x' });
    expect(res.status).toBe(403);
  });
  it('denies an unassigned user', async () => {
    const res = await request(app(notificationsRouter, '/n', user('unassigned')))
      .post('/n/in-app').send({ user_id: 'u2', title: 'hi', body: 'x' });
    expect(res.status).toBe(403);
  });
  it('allows a teacher to send (guard passes)', async () => {
    const res = await request(app(notificationsRouter, '/n', user('teacher')))
      .post('/n/in-app').send({ user_id: 'u2', title: 'hi', body: 'x' });
    expect(res.status).not.toBe(403);
  });
  it('leaves self-service /my/read-all open to any authenticated user', async () => {
    const res = await request(app(notificationsRouter, '/n', user('parent'))).post('/n/my/read-all').send({});
    expect(res.status).not.toBe(403);
  });
});

describe('benchmarks — EXEC_ROLES on snapshot', () => {
  it('denies a parent recomputing the snapshot', async () => {
    const res = await request(app(benchmarksRouter, '/b', user('parent'))).post('/b/snapshot').send({});
    expect(res.status).toBe(403);
  });
  it('allows admin (guard passes)', async () => {
    const res = await request(app(benchmarksRouter, '/b', user('admin'))).post('/b/snapshot').send({});
    expect(res.status).not.toBe(403);
  });
});
