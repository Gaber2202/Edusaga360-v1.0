/**
 * Golden-file tests for Saudi payroll / GOSI outputs.
 *
 * These snapshots pin the current deployed calculation math so the pack refactor
 * cannot silently change net pay, GOSI contributions, or Nitaqat bands.
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { vi } from 'vitest';
import { createSupabaseStub, injectUser, QueryContext } from '../support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { payrollRouter } = await import('../../routes/payroll.js');

const PAYROLL_USER = {
  id: 'u1',
  email: 'hr@school.sa',
  tenant_id: 'tenant-A',
  role: 'hr_admin',
  is_platform_owner: false,
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(injectUser(PAYROLL_USER));
  app.use('/payroll', payrollRouter);
  return app;
}

beforeAll(() => {
  process.env.TZ = 'UTC';
});

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});

import { golden } from './support/golden.js';

describe('payroll / GOSI golden snapshots', () => {
  it('full payroll run response is byte-stable', async () => {
    const resolver = (ctx: QueryContext) => {
      if (ctx.table === 'employees') {
        return {
          data: [
            {
              id: 'e1',
              employee_number: 'EMP001',
              name_en: 'Ali',
              name_ar: 'علي',
              nationality: 'saudi',
              basic_salary: 10000,
              housing_allowance: 2000,
              transport_allowance: 1000,
              other_allowances: {},
              bank_name: 'Al Rajhi Bank',
              bank_iban: 'SA0380000000608010167519',
              department_id: null,
              job_title_id: null,
            },
            {
              id: 'e2',
              employee_number: 'EMP002',
              name_en: 'Raj',
              name_ar: 'راج',
              nationality: 'indian',
              basic_salary: 8000,
              housing_allowance: 1000,
              transport_allowance: 500,
              other_allowances: {},
              bank_name: 'Riyad Bank',
              bank_iban: 'SA0380000000608010167520',
              department_id: null,
              job_title_id: null,
            },
          ],
        };
      }
      if (ctx.table === 'attendance_policies') return { data: null };
      if (ctx.table === 'employee_attendance') return { data: [] };
      return { data: null };
    };
    db.setResolver(resolver);

    const res = await request(makeApp())
      .post('/payroll/calculate')
      .send({ period_start: '2026-06-01', period_end: '2026-06-30' });

    expect(res.status).toBe(200);
    golden('sa-payroll-full-run', JSON.stringify(res.body), 'json');
  });

  it('GOSI calculation response is byte-stable', async () => {
    const res = await request(makeApp())
      .post('/payroll/gosi-calculate')
      .send({
        employees: [
          { id: 'e1', nationality: 'saudi', basic_salary: 10000 },
          { id: 'e2', nationality: 'indian', basic_salary: 8000 },
          { id: 'e3', nationality: 'saudi', basic_salary: 50000 },
        ],
      });

    expect(res.status).toBe(200);
    golden('sa-gosi-calculation', JSON.stringify(res.body), 'json');
  });

  it('WPS (Mudad) bank file is byte-stable', async () => {
    const resolver = (ctx: QueryContext) => {
      if (ctx.table === 'tenants') {
        return { data: { id: 'tenant-A', slug: 'alnoor', name_en: 'Al Noor' } };
      }
      if (ctx.table === 'payslip_lines') return { data: [] };
      if (ctx.table === 'employees') {
        return {
          data: [
            {
              id: 'e1',
              employee_number: 'EMP001',
              nationality: 'saudi',
              basic_salary: 10000,
              housing_allowance: 2000,
              transport_allowance: 1000,
              other_allowances: {},
              bank_name: 'Al Rajhi Bank',
              bank_iban: 'SA0380000000608010167519',
            },
            {
              id: 'e2',
              employee_number: 'EMP002',
              nationality: 'indian',
              basic_salary: 8000,
              housing_allowance: 1000,
              transport_allowance: 500,
              other_allowances: {},
              bank_name: 'Riyad Bank',
              bank_iban: 'SA0380000000608010167520',
            },
          ],
        };
      }
      return { data: null };
    };
    db.setResolver(resolver);

    const res = await request(makeApp())
      .get('/payroll/wps-file')
      .query({ period_start: '2026-06-01', period_end: '2026-06-30' });

    expect(res.status).toBe(200);
    golden('sa-wps-file', res.text, 'txt');
  });
});
