/**
 * src/packs/qa/academicCalendar.ts
 *
 * Qatar academic calendar. The school year is Gregorian; exact term boundaries
 * are held per-school in regulatory_register/academic_years. Hijri helpers are
 * stubs because the Qatar pack calendar surface is Gregorian and Ramadan
 * detection is handled by the shared lib in payroll.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { NotImplementedInJurisdiction } from '../../lib/jurisdiction.js';
import type { AcademicCalendarService } from '../contract/CountryPack.js';

export interface AcademicYearRow {
  academic_year: string;
  start_date: string;
  end_date: string;
}

function isoDate(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function currentAcademicYearForDate(
  supabase: unknown,
  _tenantId: string,
  date?: Date | string,
): Promise<AcademicYearRow | null> {
  const target = isoDate(date ?? new Date());
  const { data, error } = await (supabase as SupabaseClient)
    .from('academic_years')
    .select('academic_year, start_date, end_date')
    .lte('start_date', target)
    .gte('end_date', target)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as AcademicYearRow | null) ?? null;
}

async function academicYearBefore(
  supabase: unknown,
  _tenantId: string,
  academicYear: string,
): Promise<AcademicYearRow | null> {
  const { data, error } = await (supabase as SupabaseClient)
    .from('academic_years')
    .select('academic_year, start_date, end_date')
    .lt('academic_year', academicYear)
    .order('academic_year', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as AcademicYearRow | null) ?? null;
}

function hijriStub(method: string) {
  return (..._args: unknown[]) => {
    throw new NotImplementedInJurisdiction(
      'QA',
      `AcademicCalendarService.${method} — Hijri calendar support is not enabled for Qatar`,
    );
  };
}

export const qaAcademicCalendar: AcademicCalendarService = {
  currentAcademicYearForDate,
  academicYearBefore,
  termBoundariesForYear: () => {
    // Exact term dates are per-school config; return an empty list until populated.
    return [];
  },
  formatHijri: hijriStub('formatHijri'),
  gregorianToHijri: hijriStub('gregorianToHijri'),
  hijriToGregorian: hijriStub('hijriToGregorian'),
  hijriNumeric: hijriStub('hijriNumeric'),
};
