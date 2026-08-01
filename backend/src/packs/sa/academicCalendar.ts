/**
 * src/packs/sa/academicCalendar.ts
 *
 * Saudi academic-calendar and Hijri adapter. Delegates to MetricsService for
 * DB-backed academic-year lookup and to lib/hijri for Umm al-Qura conversion.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { MetricsService } from '../../services/metrics.js';
import {
  formatHijri,
  gregorianToHijri,
  hijriToGregorian,
  hijriNumeric,
} from '../../lib/hijri.js';
import type { AcademicCalendarService } from '../contract/CountryPack.js';

export const saAcademicCalendar: AcademicCalendarService = {
  currentAcademicYearForDate: async (
    supabase: SupabaseClient,
    tenantId: string,
    _date?: Date | string,
  ) => new MetricsService(supabase).getCurrentAcademicYear(tenantId),

  termBoundariesForYear: (_yearLabel: string) => {
    // Term boundaries are not yet modelled as a standalone concept.
    throw new Error('termBoundariesForYear is not implemented for SA');
  },

  formatHijri,
  gregorianToHijri,
  hijriToGregorian,
  hijriNumeric,
};
