/** School-store slot math. Wall times are Asia/Riyadh (UTC+3, no DST). */

export const RIYADH_OFFSET = '+03:00';

export type HourRow = {
  weekday: number;
  start_time?: string;
  end_time?: string;
  startTime?: string;
  endTime?: string;
  slot_minutes?: number;
  slotMinutes?: number;
  capacity?: number;
};

export type BlackoutRow = {
  start_date?: string;
  end_date?: string;
  startDate?: string;
  endDate?: string;
};

export type BookingRow = {
  status?: string;
  starts_at?: string;
  ends_at?: string;
  startsAt?: string;
  endsAt?: string;
};

export type GeneratedSlot = {
  starts_at: string;
  ends_at: string;
  capacity: number;
  booked: number;
  available: boolean;
};

export function weekdayRiyadh(dateStr: string): number {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return 0;
  return new Date(Date.UTC(y, m - 1, d, 9, 0, 0)).getUTCDay();
}

export function padTime(timeStr: string): string {
  const raw = String(timeStr || '00:00');
  if (raw.length === 5) return `${raw}:00`;
  return raw.slice(0, 8);
}

export function riyadhIso(dateStr: string, timeStr: string): string {
  return `${dateStr}T${padTime(timeStr)}${RIYADH_OFFSET}`;
}

export function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = padTime(timeStr).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

export function isBlackedOut(dateStr: string, blackouts: BlackoutRow[] = []): boolean {
  return blackouts.some((row) => {
    const start = row.start_date || row.startDate;
    const end = row.end_date || row.endDate;
    return Boolean(start && end && dateStr >= start && dateStr <= end);
  });
}

export function intervalsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return Date.parse(aStart) < Date.parse(bEnd) && Date.parse(bStart) < Date.parse(aEnd);
}

export function bookingOccupies(booking: BookingRow, startIso: string, endIso: string): boolean {
  const status = booking.status || 'held';
  if (status === 'cancelled') return false;
  const starts = booking.starts_at || booking.startsAt;
  const ends = booking.ends_at || booking.endsAt;
  if (!starts || !ends) return false;
  return intervalsOverlap(startIso, endIso, starts, ends);
}

export function generateSlots(opts: {
  date: string;
  hours?: HourRow[];
  blackouts?: BlackoutRow[];
  bookings?: BookingRow[];
}): GeneratedSlot[] {
  const { date, hours = [], blackouts = [], bookings = [] } = opts;
  if (!date || isBlackedOut(date, blackouts)) return [];
  const dow = weekdayRiyadh(date);
  const dayHours = hours.filter((row) => Number(row.weekday) === dow);
  const slots: GeneratedSlot[] = [];

  for (const row of dayHours) {
    const slotMin = Number(row.slot_minutes || row.slotMinutes) || 60;
    const capacity = Math.max(1, Number(row.capacity) || 1);
    let cursor = parseTimeToMinutes(row.start_time || row.startTime || '00:00');
    const end = parseTimeToMinutes(row.end_time || row.endTime || '00:00');
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

export function slotEndFromStart(startsAt: string, slotMinutes = 60): string | null {
  const ms = Date.parse(startsAt) + Number(slotMinutes) * 60 * 1000;
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function slotMinutesForStart(hours: HourRow[], startsAt: string): number {
  const date = startsAt.slice(0, 10);
  const dow = weekdayRiyadh(date);
  const match = hours.find((row) => Number(row.weekday) === dow);
  return Number(match?.slot_minutes || match?.slotMinutes) || 60;
}
