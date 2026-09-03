/**
 * Real-data metric helpers for the dashboard.
 *
 * These replace the previous fake/random sparklines. Every series and trend is
 * derived from actual tenant records (by their created_at / date field), so
 * what a prospect sees in a demo is truthful.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Bucket records into the last `buckets` weekly periods by COUNT.
 * Returns { series: [{v}], trend } where trend is the % change of the most
 * recent period versus the one before it.
 */
export function countSeries(records = [], dateField = 'created_at', buckets = 8) {
  const now = Date.now();
  const counts = new Array(buckets).fill(0);

  for (const r of records) {
    const d = toDate(r?.[dateField]);
    if (!d) continue;
    const weeksAgo = Math.floor((now - d.getTime()) / WEEK_MS);
    if (weeksAgo >= 0 && weeksAgo < buckets) {
      counts[buckets - 1 - weeksAgo] += 1;
    }
  }

  return { series: counts.map((v) => ({ v })), trend: periodTrend(counts) };
}

/**
 * Bucket a numeric amount across the last `buckets` weekly periods.
 * `amountFn` extracts the numeric value from each record.
 */
export function amountSeries(records = [], amountFn = (r) => r.amount || 0, dateField = 'created_at', buckets = 8) {
  const now = Date.now();
  const sums = new Array(buckets).fill(0);

  for (const r of records) {
    const d = toDate(r?.[dateField]);
    if (!d) continue;
    const weeksAgo = Math.floor((now - d.getTime()) / WEEK_MS);
    if (weeksAgo >= 0 && weeksAgo < buckets) {
      sums[buckets - 1 - weeksAgo] += Number(amountFn(r)) || 0;
    }
  }

  return { series: sums.map((v) => ({ v })), trend: periodTrend(sums) };
}

/**
 * Cumulative running total over weekly buckets — useful for "total" KPIs
 * (e.g. active students) where you want an always-growing line.
 */
export function cumulativeSeries(records = [], dateField = 'created_at', buckets = 8) {
  const { series } = countSeries(records, dateField, buckets);
  let running = 0;
  const cum = series.map((p) => { running += p.v; return { v: running }; });
  return { series: cum, trend: periodTrend(cum.map((p) => p.v)) };
}

/** % change of the last value vs the previous non-zero baseline. */
export function periodTrend(arr) {
  if (!arr || arr.length < 2) return 0;
  const last = arr[arr.length - 1];
  const prev = arr[arr.length - 2];
  if (prev === 0) return last > 0 ? 100 : 0;
  return Math.round(((last - prev) / Math.abs(prev)) * 100);
}

/** Count records created in the last `days` days. */
export function countSince(records = [], days = 30, dateField = 'created_at') {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return records.filter((r) => {
    const d = toDate(r?.[dateField]);
    return d && d.getTime() >= cutoff;
  }).length;
}
