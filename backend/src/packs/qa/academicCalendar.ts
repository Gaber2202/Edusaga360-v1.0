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
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

function toIsoDate(input?: Date | string): string | undefined {
  if (!input) return undefined;
  if (input instanceof Date) return input.toISOString().slice(0, 10);
  return input.slice(0, 10);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

const currentAcademicYearForDate: AcademicCalendarService['currentAcademicYearForDate'] = async (
  supabase: unknown,
  tenantId: string,
  date?: Date | string,
) => {
  const explicitDate = toIsoDate(date);
  const iso = explicitDate ?? todayStr();

  const { data: inRange, error: rangeError } = await (supabase as SupabaseClient)
    .from('academic_years')
    .select('id, name, start_date, end_date, is_current')
    .eq('tenant_id', tenantId)
    .lte('start_date', iso)
    .gte('end_date', iso)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (rangeError) throw rangeError;
  if (inRange) return inRange as AcademicYearRow;

  if (!explicitDate) {
    const { data: flagged, error: flaggedError } = await (supabase as SupabaseClient)
      .from('academic_years')
      .select('id, name, start_date, end_date, is_current')
      .eq('tenant_id', tenantId)
      .eq('is_current', true)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (flaggedError) throw flaggedError;
    if (flagged) return flagged as AcademicYearRow;
  }

  const { data: latest, error: latestError } = await (supabase as SupabaseClient)
    .from('academic_years')
    .select('id, name, start_date, end_date, is_current')
    .eq('tenant_id', tenantId)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;
  return (latest as AcademicYearRow | null) ?? null;
};

const academicYearBefore: AcademicCalendarService['academicYearBefore'] = async (
  supabase: unknown,
  tenantId: string,
  startDate: string,
) => {
  const { data: prevYear, error } = await (supabase as SupabaseClient)
    .from('academic_years')
    .select('id, name, start_date, end_date, is_current')
    .eq('tenant_id', tenantId)
    .lt('start_date', startDate)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (prevYear as AcademicYearRow | null) ?? null;
};

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
