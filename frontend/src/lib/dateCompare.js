// Timezone-safe date comparisons for compliance fields (Iqama / visa /
// contract expiry, trial end, etc.).
//
// The problem: `iqama_expiry` is stored as a date-only string like
// "2026-04-19". `new Date("2026-04-19")` parses as 00:00 UTC, while
// `new Date()` is the user's local now. For a user in KSA (UTC+3) at
// 10:00 AST on the expiry day itself, `new Date(expiry) < new Date()`
// is `true` — the Iqama is flagged expired a day early. For fields with
// legal consequences (residency, licenses) that off-by-one is unacceptable.
//
// Fix: always compare in Asia/Riyadh at day granularity.

const RIYADH_TZ = 'Asia/Riyadh';

// Cache the formatter — it's surprisingly expensive to construct.
let _riyadhDayFmt = null;
function riyadhDayFmt() {
  if (!_riyadhDayFmt) {
    _riyadhDayFmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: RIYADH_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }
  return _riyadhDayFmt;
}

/**
 * Returns "YYYY-MM-DD" for the Asia/Riyadh calendar day that contains `d`.
 * If `d` is null/undefined/invalid, returns null.
 */
export function toRiyadhDayKey(d) {
  if (d == null || d === '') return null;
  // Date-only string like "2026-04-19" — return as-is, it has no time or zone.
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  // 'en-CA' formats as YYYY-MM-DD, which sorts lexicographically.
  return riyadhDayFmt().format(date);
}

/** "YYYY-MM-DD" for today in Asia/Riyadh. */
export function todayRiyadh() {
  return riyadhDayFmt().format(new Date());
}

/**
 * True iff `expiry` is strictly before the given reference day in Asia/Riyadh.
 * An item is "expired" on the day AFTER its expiry date, not on the day itself.
 * Returns false for missing/invalid `expiry` (fail-open for "not expired").
 */
export function isExpired(expiry, on = new Date()) {
  const e = toRiyadhDayKey(expiry);
  if (!e) return false;
  const today = toRiyadhDayKey(on);
  return e < today;
}

/**
 * Whole days from `on` until `expiry`, in Asia/Riyadh calendar days.
 * Negative if expired. Returns null for missing/invalid `expiry`.
 */
export function daysUntilExpiry(expiry, on = new Date()) {
  const e = toRiyadhDayKey(expiry);
  const t = toRiyadhDayKey(on);
  if (!e || !t) return null;
  // Interpret both as midnight UTC so the diff is exact calendar days.
  const eUtc = Date.parse(`${e}T00:00:00Z`);
  const tUtc = Date.parse(`${t}T00:00:00Z`);
  return Math.round((eUtc - tUtc) / 86400000);
}

/** True iff `expiry` is within `days` calendar days from `on` (inclusive, not yet expired). */
export function isExpiringWithin(expiry, days, on = new Date()) {
  const n = daysUntilExpiry(expiry, on);
  if (n === null) return false;
  return n >= 0 && n <= days;
}
