/**
 * src/packs/sa/academicCalendar.ts
 *
 * Saudi academic-calendar and Hijri adapter. Academic-year lookup queries the
 * DB directly; Hijri conversion delegates to the Saudi pack's hijri module.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  formatHijri,
  gregorianToHijri,
  hijriToGregorian,
  hijriNumeric,
} from './hijri.js';
import type { AcademicCalendarService } from '../contract/CountryPack.js';

function toIsoDate(input?: Date | string): string | undefined {
  if (!input) return undefined;
  if (input instanceof Date) return input.toISOString().slice(0, 10);
  return input.slice(0, 10);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export const saAcademicCalendar: AcademicCalendarService = {
  currentAcademicYearForDate: async (
    supabase: SupabaseClient,
    tenantId: string,
    date?: Date | string,
  ) => {
    const explicitDate = toIsoDate(date);
    const iso = explicitDate ?? todayStr();

    // 1. Find the year whose range contains the requested/current date.
    const { data: inRange, error: rangeError } = await supabase
      .from('academic_years')
      .select('id, name, start_date, end_date, is_current')
      .eq('tenant_id', tenantId)
      .lte('start_date', iso)
      .gte('end_date', iso)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (rangeError) throw rangeError;
    if (inRange) return inRange;

    // 2. When asking for "current" (no explicit date), fall back to the row
    //    flagged is_current. This prevents a future academic year with the
    //    latest start_date from being treated as current forever.
    if (!explicitDate) {
      const { data: flagged, error: flaggedError } = await supabase
        .from('academic_years')
        .select('id, name, start_date, end_date, is_current')
        .eq('tenant_id', tenantId)
        .eq('is_current', true)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (flaggedError) throw flaggedError;
      if (flagged) return flagged;
    }

    // 3. Final fallback: latest start_date. This preserves the old behaviour
    //    for tenants that have not set end_date / is_current.
    const { data: latest, error: latestError } = await supabase
      .from('academic_years')
      .select('id, name, start_date, end_date, is_current')
      .eq('tenant_id', tenantId)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;
    return latest ?? null;
  },

  termBoundariesForYear: (_yearLabel: string) => {
    // Term boundaries are not yet modelled as a standalone concept.
    throw new Error('termBoundariesForYear is not implemented for SA');
  },

  formatHijri,
  gregorianToHijri,
  hijriToGregorian,
  hijriNumeric,
};
