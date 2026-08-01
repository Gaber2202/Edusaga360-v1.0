/**
 * CO-003 — Hijri (Umm al-Qura) ↔ Gregorian conversion.
 *
 * Saudi Arabia's civil calendar is the Umm al-Qura calendar. Rather than ship a
 * hand-rolled tabular algorithm (the common "Kuwaiti" arithmetic calendar is
 * frequently a day off from the official sightings), this layer uses the ICU
 * `islamic-umalqura` calendar bundled with Node's full-ICU build via `Intl`.
 * That is the same authoritative dataset the Kingdom publishes, valid roughly
 * 1300–1600 AH.
 *
 * Gregorian → Hijri is a direct `Intl` format. Hijri → Gregorian is inverted by
 * binary-searching the (monotonic) day axis for the day whose Umm al-Qura parts
 * match the target — which also gives us free validation: an impossible Hijri
 * date (e.g. day 30 of a 29-day month) has no matching day and throws.
 *
 * All conversions operate on the calendar date in UTC to avoid timezone drift;
 * invoice/attendance dates are date-only values.
 */

export interface HijriDate {
  year: number;
  month: number; // 1–12
  day: number; // 1–30
}

const MS_PER_DAY = 86_400_000;

const HIJRI_MONTHS_EN = [
  'Muharram', 'Safar', "Rabi' al-Awwal", "Rabi' al-Thani",
  'Jumada al-Awwal', 'Jumada al-Thani', 'Rajab', "Sha'ban",
  'Ramadan', 'Shawwal', "Dhu al-Qi'dah", 'Dhu al-Hijjah',
];

// A single reusable formatter; reads numeric Umm al-Qura parts in UTC.
const PARTS_FMT = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', {
  year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC',
});

/** Normalize Date | ISO string ('yyyy-mm-dd' or full ISO) to a UTC-midnight day number. */
function toDayNumber(input: Date | string): number {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${String(input)}`);
  // Collapse to the UTC calendar date (ignore any time-of-day / offset).
  const utcMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor(utcMidnight / MS_PER_DAY);
}

function partsForDay(dayNumber: number): HijriDate {
  const parts = PARTS_FMT.formatToParts(new Date(dayNumber * MS_PER_DAY));
  let year = 0, month = 0, day = 0;
  for (const p of parts) {
    if (p.type === 'year') year = parseInt(p.value, 10);
    else if (p.type === 'month') month = parseInt(p.value, 10);
    else if (p.type === 'day') day = parseInt(p.value, 10);
  }
  return { year, month, day };
}

const sortKey = (h: HijriDate): number => h.year * 10_000 + h.month * 100 + h.day;

/** Gregorian → Umm al-Qura Hijri parts. */
export function gregorianToHijri(input: Date | string): HijriDate {
  return partsForDay(toDayNumber(input));
}

/**
 * Umm al-Qura Hijri → Gregorian Date (UTC midnight). Throws on an impossible
 * Hijri date (no matching Gregorian day).
 */
export function hijriToGregorian(year: number, month: number, day: number): Date {
  if (month < 1 || month > 12 || day < 1 || day > 30) {
    throw new Error(`Invalid Hijri date: ${year}-${month}-${day}`);
  }
  const target = year * 10_000 + month * 100 + day;

  // Hijri year ≈ 0.970224 Gregorian years; epoch 1/1/1 AH ≈ 622 CE. Seed a window
  // and widen it until it brackets the target, then binary-search the day.
  const approxGregYear = Math.floor((year - 1) * 0.970224 + 621.567);
  let lo = Math.floor(Date.UTC(approxGregYear - 1, 0, 1) / MS_PER_DAY);
  let hi = Math.floor(Date.UTC(approxGregYear + 2, 0, 1) / MS_PER_DAY);
  while (sortKey(partsForDay(lo)) > target) lo -= 30;
  while (sortKey(partsForDay(hi)) < target) hi += 30;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (sortKey(partsForDay(mid)) < target) lo = mid + 1;
    else hi = mid;
  }
  if (sortKey(partsForDay(lo)) !== target) {
    throw new Error(`Invalid Hijri date (no such day in Umm al-Qura): ${year}-${month}-${day}`);
  }
  return new Date(lo * MS_PER_DAY);
}

/** Zero-padded numeric Hijri string, e.g. "1448-01-17". */
export function hijriNumeric(input: Date | string): string {
  const h = gregorianToHijri(input);
  return `${h.year}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`;
}

/**
 * Localized Hijri string. locale 'ar' → Arabic numerals + month names + هـ era;
 * 'en' → Latin, e.g. "17 Muharram 1448 AH".
 */
export function formatHijri(input: Date | string, locale: 'ar' | 'en' = 'ar'): string {
  if (locale === 'ar') {
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
      year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
    }).format(new Date(toDayNumber(input) * MS_PER_DAY));
  }
  const h = gregorianToHijri(input);
  return `${h.day} ${HIJRI_MONTHS_EN[h.month - 1]} ${h.year} AH`;
}

/** English Hijri month name (1–12). */
export function hijriMonthName(month: number): string {
  if (month < 1 || month > 12) throw new Error(`Invalid Hijri month: ${month}`);
  return HIJRI_MONTHS_EN[month - 1];
}
