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

export const saAcademicCalendar: AcademicCalendarService = {
  currentAcademicYearForDate: async (
    supabase: SupabaseClient,
    tenantId: string,
    date?: Date | string,
  ) => {
    const iso = toIsoDate(date);
    let q = supabase
      .from('academic_years')
      .select('id, name, start_date, end_date, is_current')
      .eq('tenant_id', tenantId);
    if (iso) {
      q = q.lte('start_date', iso).gte('end_date', iso);
    }
    const { data, error } = await q.order('start_date', { ascending: false }).maybeSingle();
    if (error) throw error;
    return data;
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
