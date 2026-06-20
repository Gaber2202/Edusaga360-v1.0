/**
 * Date-range filtering for dashboards (P3.3).
 *
 * The Operations Dashboard's "last 7/30/90 days" selector previously did
 * nothing — every metric used the full dataset. These pure helpers let the
 * dashboard actually scope its KPIs/charts to the chosen window. Records with
 * no recognizable timestamp are kept (so missing-date rows are never silently
 * dropped from the totals).
 */

const DATE_FIELDS = ['created_date', 'created_at', 'date'];

export function recordDate(item) {
  if (!item) return null;
  for (const f of DATE_FIELDS) {
    if (item[f]) return item[f];
  }
  return null;
}

export function withinLastDays(value, days, now = new Date()) {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - Number(days));
  return d >= cutoff;
}

export function filterByDateRange(items = [], days, now = new Date()) {
  const n = Number(days);
  if (!n || n <= 0) return items;
  return items.filter((it) => {
    const v = recordDate(it);
    return v == null ? true : withinLastDays(v, n, now);
  });
}

export default filterByDateRange;
