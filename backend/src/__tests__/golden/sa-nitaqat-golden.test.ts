/**
 * Golden-file test for the Saudi Nitaqat / Saudization calculation.
 *
 * Pins the current deployed CHRO dashboard Nitaqat output so the pack refactor
 * cannot silently change band logic or Saudization percentage math.
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { MetricsService } from '../../services/metrics.js';
import { createSupabaseStub, QueryContext } from '../support/supabaseMock.js';
import { golden } from './support/golden.js';

const db = createSupabaseStub();

beforeAll(() => {
  process.env.TZ = 'UTC';
  vi.useFakeTimers({ shouldAdvanceTime: false });
  vi.setSystemTime(new Date('2026-06-18T00:00:00Z'));
});

beforeEach(() => {
  db.reset();
});

describe('Nitaqat / Saudization golden snapshot', () => {
  it('CHRO dashboard Nitaqat output is byte-stable', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'tenants') return { data: { id: 'tenant-A', jurisdiction_code: 'SA' } };
      if (ctx.table === 'kpi_registry') return { data: null };
      if (ctx.table === 'kpi_snapshots') return { data: null };
      if (ctx.table === 'academic_years') return { data: [] };
      if (ctx.table === 'branches') return { data: [] };
      if (ctx.table === 'employees') {
        // 4 active employees: 1 Saudi + 3 expat => 25% Saudization => green
        return {
          data: [
            { id: 'e1', status: 'active', nationality: 'saudi', gender: 'male', department_id: null, is_saudi: true, hire_date: '2024-01-01', end_date: null, contract_type: 'full_time' },
            { id: 'e2', status: 'active', nationality: 'indian', gender: 'male', department_id: null, is_saudi: false, hire_date: '2024-01-01', end_date: null, contract_type: 'full_time' },
            { id: 'e3', status: 'active', nationality: 'egyptian', gender: 'female', department_id: null, is_saudi: false, hire_date: '2024-01-01', end_date: null, contract_type: 'full_time' },
            { id: 'e4', status: 'active', nationality: 'indian', gender: 'female', department_id: null, is_saudi: false, hire_date: '2024-01-01', end_date: null, contract_type: 'full_time' },
          ],
        };
      }
      if (ctx.table === 'departments') return { data: [] };
      if (ctx.table === 'employee_attendance') return { data: [] };
      if (ctx.table === 'nitaqat_thresholds') return { data: null };
      if (ctx.table === 'invoices') return { data: [], count: 0 };
      if (ctx.table === 'zatca_submissions') return { data: [] };
      if (ctx.table === 'pay_runs') return { data: [] };
      return { data: null };
    });

    const service = new MetricsService(db.client as any);
    const dashboard = await service.getDashboard('chro', 'tenant-A', 'current', undefined, true);

    // Snapshot only the Nitaqat-related slice; the rest of the dashboard has
    // timestamps and is not relevant to the Saudi pack refactor.
    const snapshot = {
      nitaqat: dashboard.nitaqat,
      saudization_pct: dashboard.kpis?.saudization_pct,
      saudi_vs_non_saudi: dashboard.saudi_vs_non_saudi,
      workforce_composition: dashboard.workforce_composition,
    };

    golden('sa-nitaqat-chro', JSON.stringify(snapshot), 'json');
  });
});
