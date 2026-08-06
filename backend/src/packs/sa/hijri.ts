/**
 * src/packs/sa/hijri.ts
 *
 * Saudi-specific re-export of the generic Umm al-Qura Hijri conversion library.
 * The algorithm lives in `src/lib/hijri.ts` per ADR-007; this file remains for
 * backward compatibility and is expected to be removed once all call sites migrate.
 */

export {
  formatHijri,
  gregorianToHijri,
  hijriToGregorian,
  hijriNumeric,
  hijriMonthName,
  isRamadan,
  type HijriDate,
} from '../../lib/hijri.js';
