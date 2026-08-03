/**
 * Golden-file test for Saudi academic year resolution.
 *
 * The Saudi school year is stored in the `academic_years` table. The pack's
 * `currentAcademicYearForDate` resolves the active year for a given date by
 * checking the `start_date` / `end_date` range. When no date is supplied it
 * uses the current date, falling back to the `is_current` flag if today's date
 * is not inside any range.
 */
import { describe, it, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { saAcademicCalendar } from '../../packs/sa/academicCalendar.js';
import { createSupabaseStub, QueryContext } from '../support/supabaseMock.js';
import { golden } from './support/golden.js';

const db = createSupabaseStub();

beforeAll(() => {
  process.env.TZ = 'UTC';
  vi.useFakeTimers({ shouldAdvanceTime: false });
  // Set "today" to a gap between academic years so the no-date path must use
  // the is_current fallback.
  vi.setSystemTime(new Date('2026-08-01T00:00:00Z'));
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  db.reset();
});

describe('Saudi academic calendar golden snapshot', () => {
  it('currentAcademicYearForDate resolves by date range and is_current fallback', async () => {
    const years = [
      {
        id: 'ay-2024-2025',
        name: '2024-2025',
        start_date: '2024-09-01',
        end_date: '2025-06-30',
        is_current: false,
      },
      {
        id: 'ay-2025-2026',
        name: '2025-2026',
        start_date: '2025-09-01',
        end_date: '2026-06-30',
        is_current: false,
      },
      {
        id: 'ay-2026-2027',
        name: '2026-2027',
        start_date: '2026-09-01',
        end_date: '2027-06-30',
        is_current: true,
      },
      {
        id: 'ay-2027-2028',
        name: '2027-2028',
        start_date: '2027-09-01',
        end_date: '2028-06-30',
        is_current: false,
      },
    ];

    db.setResolver((ctx: QueryContext) => {
      if (ctx.table !== 'academic_years') return { data: null };

      let filtered = years.slice().sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));

      for (const f of ctx.filters) {
        const key = String(f.args[0]);
        const value = f.args[1];
        // The resolver's in-memory data is already scoped to tenant-A.
        if (key === 'tenant_id' && f.method === 'eq') continue;
        if (f.method === 'eq') {
          filtered = filtered.filter((y: any) => y[key] === value);
        } else if (f.method === 'lte') {
          filtered = filtered.filter((y: any) => String(y[key]) <= String(value));
        } else if (f.method === 'gte') {
          filtered = filtered.filter((y: any) => String(y[key]) >= String(value));
        }
      }

      if (ctx.single) return { data: filtered[0] ?? null };
      return { data: filtered };
    });

    // 2026-06-15 falls inside 2025-2026, not inside the flagged 2026-2027 year.
    const forDate = await saAcademicCalendar.currentAcademicYearForDate!(
      db.client as any,
      'tenant-A',
      '2026-06-15',
    );

    // No date supplied: today is 2026-08-01 (between years), so it should fall
    // back to the year flagged is_current (2026-2027), not the latest start_date.
    const current = await saAcademicCalendar.currentAcademicYearForDate!(
      db.client as any,
      'tenant-A',
    );

    golden(
      'sa-academic-calendar-current-year',
      JSON.stringify({ forDate, current }),
      'json',
    );
  });
});
