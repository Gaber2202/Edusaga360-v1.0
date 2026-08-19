import { describe, it, expect } from 'vitest';
import { generateSlots, weekdayRiyadh, slotMinutesForStart } from '../lib/storeAvailability.js';

const hours = [
  { weekday: 6, start_time: '16:00', end_time: '21:00', slot_minutes: 60, capacity: 1 },
];

describe('storeAvailability', () => {
  it('maps Riyadh weekdays with Sunday = 0', () => {
    expect(weekdayRiyadh('2026-08-16')).toBe(0);
    expect(weekdayRiyadh('2026-08-22')).toBe(6);
  });

  it('builds hourly slots for Saturday 16:00-21:00', () => {
    const slots = generateSlots({ date: '2026-08-22', hours });
    expect(slots.map((s) => s.starts_at)).toEqual([
      '2026-08-22T16:00:00+03:00',
      '2026-08-22T17:00:00+03:00',
      '2026-08-22T18:00:00+03:00',
      '2026-08-22T19:00:00+03:00',
      '2026-08-22T20:00:00+03:00',
    ]);
  });

  it('marks overlapping held bookings as taken', () => {
    const slots = generateSlots({
      date: '2026-08-22',
      hours,
      bookings: [{
        status: 'held',
        starts_at: '2026-08-22T13:00:00.000Z',
        ends_at: '2026-08-22T14:00:00.000Z',
      }],
    });
    expect(slots[0].available).toBe(false);
  });

  it('reads slot length from opening hours', () => {
    expect(slotMinutesForStart(hours, '2026-08-22T16:00:00+03:00')).toBe(60);
  });
});
