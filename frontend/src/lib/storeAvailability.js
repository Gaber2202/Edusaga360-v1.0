/** School-store slot math. Wall times are Asia/Riyadh (UTC+3, no DST). */

export const RIYADH_OFFSET = '+03:00';

export function weekdayRiyadh(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return 0;
  return new Date(Date.UTC(y, m - 1, d, 9, 0, 0)).getUTCDay();
}

export function padTime(timeStr) {
  const raw = String(timeStr || '00:00');
  if (raw.length === 5) return `${raw}:00`;
  return raw.slice(0, 8);
}

export function riyadhIso(dateStr, timeStr) {
  return `${dateStr}T${padTime(timeStr)}${RIYADH_OFFSET}`;
}

export function parseTimeToMinutes(timeStr) {
  const [h, m] = padTime(timeStr).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

export function isBlackedOut(dateStr, blackouts = []) {
  return blackouts.some((row) => {
    const start = row.start_date || row.startDate;
    const end = row.end_date || row.endDate;
    return Boolean(start && end && dateStr >= start && dateStr <= end);
  });
}

export function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return Date.parse(aStart) < Date.parse(bEnd) && Date.parse(bStart) < Date.parse(aEnd);
}

export function bookingOccupies(booking, startIso, endIso) {
  const status = booking.status || 'held';
  if (status === 'cancelled') return false;
  const starts = booking.starts_at || booking.startsAt;
  const ends = booking.ends_at || booking.endsAt;
  if (!starts || !ends) return false;
  return intervalsOverlap(startIso, endIso, starts, ends);
}

/**
 * Generate bookable slots for one calendar day.
 * @param {{ date: string, hours: Array, blackouts?: Array, bookings?: Array }} opts
 */
export function generateSlots({ date, hours = [], blackouts = [], bookings = [] }) {
  if (!date || isBlackedOut(date, blackouts)) return [];
  const dow = weekdayRiyadh(date);
  const dayHours = hours.filter((row) => Number(row.weekday) === dow);
  const slots = [];

  for (const row of dayHours) {
    const slotMin = Number(row.slot_minutes || row.slotMinutes) || 60;
    const capacity = Math.max(1, Number(row.capacity) || 1);
    let cursor = parseTimeToMinutes(row.start_time || row.startTime);
    const end = parseTimeToMinutes(row.end_time || row.endTime);
    while (cursor + slotMin <= end) {
      const startsAt = riyadhIso(date, minutesToTime(cursor));
      const endsAt = riyadhIso(date, minutesToTime(cursor + slotMin));
      const booked = bookings.filter((b) => bookingOccupies(b, startsAt, endsAt)).length;
      slots.push({
        starts_at: startsAt,
        ends_at: endsAt,
        capacity,
        booked,
        available: booked < capacity,
      });
      cursor += slotMin;
    }
  }

  return slots;
}

export function slotEndFromStart(startsAt, slotMinutes = 60) {
  const ms = Date.parse(startsAt) + Number(slotMinutes) * 60 * 1000;
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}
