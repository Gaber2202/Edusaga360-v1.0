import { format, subDays, startOfMonth } from 'date-fns';

export function isoDate(value) {
  return format(value, 'yyyy-MM-dd');
}

export function recordDate(row) {
  return row?.date ? String(row.date).slice(0, 10) : '';
}

export function applyAttendanceFilters(records, { status = 'all', from = '', to = '' } = {}) {
  return (records || []).filter((row) => {
    const date = recordDate(row);
    if (status && status !== 'all' && row.status !== status) return false;
    if (from && date && date < from) return false;
    if (to && date && date > to) return false;
    return true;
  });
}

export function presetRange(preset, now = new Date()) {
  if (preset === '7d') return { from: isoDate(subDays(now, 6)), to: isoDate(now) };
  if (preset === '30d') return { from: isoDate(subDays(now, 29)), to: isoDate(now) };
  if (preset === 'month') return { from: isoDate(startOfMonth(now)), to: isoDate(now) };
  return { from: '', to: '' };
}

export function filtersAreActive({ status, from, to }) {
  return (status && status !== 'all') || Boolean(from) || Boolean(to);
}
