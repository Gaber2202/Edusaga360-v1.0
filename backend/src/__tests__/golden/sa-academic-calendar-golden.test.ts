/**
 * Golden-file test for Saudi academic year resolution.
 *
 * In the current codebase the academic calendar is DB-driven: the Saudi school
 * year is stored in the `academic_years` table (e.g. 2026-2027 starting
 * 2026-09-01 and ending 2027-06-30). `MetricsService.getCurrentAcademicYear`
 * returns the active/latest row for a tenant. Term-boundary computation itself is
 * not yet isolated in a dedicated function; this snapshot at least pins the
 * current resolution behaviour before it moves into packs/sa.
 */
import { describe, it, beforeEach } from 'vitest';
import { MetricsService } from '../../services/metrics.js';
import { createSupabaseStub, QueryContext } from '../support/supabaseMock.js';
import { golden } from './support/golden.js';

const db = createSupabaseStub();

beforeEach(() => {
  db.reset();
});

describe('Saudi academic calendar golden snapshot', () => {
  it('getCurrentAcademicYear returns the latest Saudi academic year row', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'academic_years') {
        return {
          data: [
            {
              id: 'ay-2026-2027',
              name: '2026-2027',
              start_date: '2026-09-01',
              end_date: '2027-06-30',
              is_current: true,
            },
          ],
        };
      }
      return { data: null };
    });

    const service = new MetricsService(db.client as any);
    const year = await service.getCurrentAcademicYear('tenant-A');

    // `getCurrentAcademicYear` currently selects only id, name, start_date and
    // is_current; the snapshot captures that projection even though the seed data
    // also contains an end_date in the DB.
    golden('sa-academic-calendar-current-year', JSON.stringify(year), 'json');
  });
});
