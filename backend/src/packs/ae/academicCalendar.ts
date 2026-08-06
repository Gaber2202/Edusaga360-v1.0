/**
 * src/packs/ae/academicCalendar.ts
 *
 * UAE academic calendar. Gregorian academic-year lookup is DB-driven and
 * identical to the Saudi implementation; Hijri helpers are intentionally omitted
 * because they are not used in the Emirates school calendar.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
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

export const aeAcademicCalendar: AcademicCalendarService = {
  currentAcademicYearForDate,
  academicYearBefore,
  termBoundariesForYear: () => {
    // Emirate-specific term dates are held in regulatory_register per school.
    return [];
  },
};
