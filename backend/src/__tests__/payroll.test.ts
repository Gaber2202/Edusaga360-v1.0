/**
 * HR & Payroll — salary calculation, GOSI reporting, WPS file generation.
 *
 * Business context (Saudi labour / GOSI):
 *   - Saudi nationals: 9% employee + 11.75% employer GOSI
 *   - Expats:          1.5% employee + 2% employer
 *   - Contributions are computed on basic salary capped at SAR 45,000/month
 *   - Net = gross (basic + allowances) − GOSI employee − attendance deductions
 *   - WPS (Wage Protection System) export is a pipe-delimited bank file
 *
 * Covers priority scenario #2 (hiring → salary calc → GOSI reporting),
 * RBAC enforcement (PAYROLL_ROLES), and multi-tenant query scoping.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, injectUser, QueryContext } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { payrollRouter } = await import('../routes/payroll.js');

const PAYROLL_USER = { id: 'u1', email: 'hr@school.sa', tenant_id: 'tenant-A', role: 'hr_admin', is_platform_owner: false };

function makeApp(user: Record<string, unknown> = PAYROLL_USER) {
  const app = express();
  app.use(express.json());
  app.use(injectUser(user));
  app.use('/payroll', payrollRouter);
  return app;
}

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});

// ── GOSI-only calculation ────────────────────────────────────────────────────

describe('POST /payroll/gosi-calculate', () => {
  it('applies Saudi rates (9% / 11.75%) below the cap', async () => {
    const res = await request(makeApp())
      .post('/payroll/gosi-calculate')
      .send({ employees: [{ id: 'e1', nationality: 'saudi', basic_salary: 10000 }] });

    expect(res.status).toBe(200);
    const e = res.body.employees[0];
    expect(e.is_saudi).toBe(true);
    expect(e.gosi_wage).toBe(10000);
    expect(e.gosi_employee).toBe(900);
    expect(e.gosi_employer).toBe(1175);
    expect(e.gosi_cap_applied).toBe(false);
  });

  it('applies expat rates (1.5% / 2%)', async () => {
    const res = await request(makeApp())
      .post('/payroll/gosi-calculate')
      .send({ employees: [{ id: 'e1', nationality: 'indian', basic_salary: 10000 }] });

    const e = res.body.employees[0];
    expect(e.is_saudi).toBe(false);
    expect(e.gosi_employee).toBe(150);
    expect(e.gosi_employer).toBe(200);
  });

  it('caps the GOSI wage at SAR 45,000 for a high earner', async () => {
    const res = await request(makeApp())
      .post('/payroll/gosi-calculate')
      .send({ employees: [{ id: 'e1', nationality: 'saudi', basic_salary: 50000 }] });

    const e = res.body.employees[0];
    expect(e.gosi_wage).toBe(45000);
    expect(e.gosi_cap_applied).toBe(true);
    expect(e.gosi_employee).toBe(4050);      // 45000 * 9%
    expect(e.gosi_employer).toBeCloseTo(5287.5); // 45000 * 11.75%
  });

  it('recognises the Arabic nationality "سعودي" as Saudi', async () => {
    const res = await request(makeApp())
      .post('/payroll/gosi-calculate')
      .send({ employees: [{ id: 'e1', nationality: 'سعودي', basic_salary: 10000 }] });

    expect(res.body.employees[0].is_saudi).toBe(true);
    expect(res.body.employees[0].gosi_employee).toBe(900);
  });

  it('aggregates totals across a mixed Saudi/expat workforce', async () => {
    const res = await request(makeApp())
      .post('/payroll/gosi-calculate')
      .send({ employees: [
        { id: 'e1', nationality: 'saudi', basic_salary: 10000 },
        { id: 'e2', nationality: 'expat', basic_salary: 8000 },
      ] });

    expect(res.body.totals.total_gosi_employee).toBe(1020);  // 900 + 120
    expect(res.body.totals.total_gosi_employer).toBe(1335);  // 1175 + 160
  });

  it('rejects an empty employees array (400 validation)', async () => {
    const res = await request(makeApp()).post('/payroll/gosi-calculate').send({ employees: [] });
    expect(res.status).toBe(400);
  });

  it('denies a non-payroll role with 403 (RBAC)', async () => {
    const teacher = { ...PAYROLL_USER, role: 'teacher' };
    const res = await request(makeApp(teacher))
      .post('/payroll/gosi-calculate')
      .send({ employees: [{ id: 'e1', nationality: 'saudi', basic_salary: 10000 }] });
    expect(res.status).toBe(403);
  });
});

// ── Full payroll run ─────────────────────────────────────────────────────────

describe('POST /payroll/calculate', () => {
  function payrollResolver(employees: unknown[], attendance: unknown[] = []) {
    return (ctx: QueryContext) => {
      if (ctx.table === 'employees') return { data: employees };
      if (ctx.table === 'attendance_policies') return { data: null }; // use KSA defaults
      if (ctx.table === 'employee_attendance') return { data: attendance };
      return { data: null };
    };
  }

  it('computes gross, GOSI, and net per employee plus a summary', async () => {
    db.setResolver(payrollResolver([
      { id: 'e1', employee_number: 'EMP001', name_en: 'Ali', name_ar: 'علي', nationality: 'saudi', basic_salary: 10000, housing_allowance: 2000, transport_allowance: 1000, other_allowances: {} },
      { id: 'e2', employee_number: 'EMP002', name_en: 'Raj', name_ar: 'راج', nationality: 'expat', basic_salary: 8000, housing_allowance: 1000, transport_allowance: 500, other_allowances: {} },
    ]));

    const res = await request(makeApp())
      .post('/payroll/calculate')
      .send({ period_start: '2026-06-01', period_end: '2026-06-30' });

    expect(res.status).toBe(200);
    expect(res.body.summary.employee_count).toBe(2);
    expect(res.body.summary.total_gross).toBe(22500);          // 13000 + 9500
    expect(res.body.summary.total_gosi_employee).toBe(1020);   // 900 + 120
    expect(res.body.summary.total_net).toBe(21480);            // 12100 + 9380

    const ali = res.body.employees.find((e: { employee_id: string }) => e.employee_id === 'e1');
    expect(ali.gross_salary).toBe(13000);
    expect(ali.net_salary).toBe(12100);
    expect(ali.is_saudi).toBe(true);
  });

  it('applies attendance deductions (absent days reduce net pay)', async () => {
    // basic 26,000 over 26 working days → daily rate 1,000; 2 unexcused absences → 2,000 deduction
    db.setResolver(payrollResolver(
      [{ id: 'e1', employee_number: 'EMP001', name_en: 'Sara', name_ar: 'سارة', nationality: 'saudi', basic_salary: 26000, housing_allowance: 0, transport_allowance: 0, other_allowances: {} }],
      [
        { employee_id: 'e1', status: 'absent', late_minutes: 0, is_excused: false },
        { employee_id: 'e1', status: 'absent', late_minutes: 0, is_excused: false },
      ],
    ));

    const res = await request(makeApp())
      .post('/payroll/calculate')
      .send({ period_start: '2026-06-01', period_end: '2026-06-30' });

    const emp = res.body.employees[0];
    expect(emp.attendance_detail.absent_days).toBe(2);
    expect(emp.absence_deduction).toBe(2000);
    // net = 26000 gross − 2340 GOSI − 2000 absence
    expect(emp.net_salary).toBe(21660);
  });

  it('ignores excused absences when deducting', async () => {
    db.setResolver(payrollResolver(
      [{ id: 'e1', employee_number: 'EMP001', name_en: 'Sara', name_ar: 'سارة', nationality: 'saudi', basic_salary: 26000, housing_allowance: 0, transport_allowance: 0, other_allowances: {} }],
      [{ employee_id: 'e1', status: 'absent', late_minutes: 0, is_excused: true }],
    ));

    const res = await request(makeApp())
      .post('/payroll/calculate')
      .send({ period_start: '2026-06-01', period_end: '2026-06-30' });

    expect(res.body.employees[0].absence_deduction).toBe(0);
  });

  it('returns 404 when the tenant has no active employees', async () => {
    db.setResolver(payrollResolver([]));
    const res = await request(makeApp())
      .post('/payroll/calculate')
      .send({ period_start: '2026-06-01', period_end: '2026-06-30' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for a malformed period date', async () => {
    const res = await request(makeApp())
      .post('/payroll/calculate')
      .send({ period_start: '06/01/2026', period_end: '2026-06-30' });
    expect(res.status).toBe(400);
  });

  it('scopes the employees query to the caller tenant (multi-tenant isolation)', async () => {
    db.setResolver(payrollResolver([
      { id: 'e1', employee_number: 'EMP001', name_en: 'Ali', name_ar: 'علي', nationality: 'saudi', basic_salary: 10000, housing_allowance: 0, transport_allowance: 0, other_allowances: {} },
    ]));

    await request(makeApp())
      .post('/payroll/calculate')
      .send({ period_start: '2026-06-01', period_end: '2026-06-30' });

    expect(db.everyQueryScopedToTenant('employees', 'tenant-A')).toBe(true);
    expect(db.everyQueryScopedToTenant('employee_attendance', 'tenant-A')).toBe(true);
  });
});

// ── WPS bank file ────────────────────────────────────────────────────────────

describe('GET /payroll/wps-file', () => {
  function wpsResolver(employees: unknown[]) {
    return (ctx: QueryContext) => {
      if (ctx.table === 'tenants') return { data: { id: 'tenant-A', slug: 'alnoor', name_en: 'Al Noor' } };
      if (ctx.table === 'payslip_lines') return { data: [] };  // none finalized → live calc
      if (ctx.table === 'employees') return { data: employees };
      return { data: null };
    };
  }

  it('emits a pipe-delimited WPS line per employee with SAR currency', async () => {
    db.setResolver(wpsResolver([
      { id: 'e1', employee_number: 'EMP001', nationality: 'saudi', basic_salary: 10000, housing_allowance: 0, transport_allowance: 0, other_allowances: {}, bank_name: 'Al Rajhi Bank', bank_iban: 'SA0380000000608010167519' },
    ]));

    const res = await request(makeApp())
      .get('/payroll/wps-file')
      .query({ period_start: '2026-06-01', period_end: '2026-06-30' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.headers['content-disposition']).toContain('WPS_alnoor_');
    // EmployerID|EmployeeID|BankCode|IBAN|Amount|Currency  (net = 10000 − 900 GOSI)
    expect(res.text).toContain('ALNOOR|EMP001|ALRA|SA0380000000608010167519|9100.00|SAR');
  });

  it('returns 400 when period query params are missing', async () => {
    const res = await request(makeApp()).get('/payroll/wps-file');
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid date format', async () => {
    const res = await request(makeApp())
      .get('/payroll/wps-file')
      .query({ period_start: '2026/06/01', period_end: '2026-06-30' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when no employee data exists for the period', async () => {
    db.setResolver(wpsResolver([]));
    const res = await request(makeApp())
      .get('/payroll/wps-file')
      .query({ period_start: '2026-06-01', period_end: '2026-06-30' });
    expect(res.status).toBe(404);
  });
});
