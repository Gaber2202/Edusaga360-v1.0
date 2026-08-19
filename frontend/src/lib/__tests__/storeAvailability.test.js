import { describe, it, expect } from 'vitest';
import { generateSlots, weekdayRiyadh, isBlackedOut } from '../storeAvailability';

const hours = [
  { weekday: 6, start_time: '16:00', end_time: '21:00', slot_minutes: 60, capacity: 1 },
];

describe('store availability slots', () => {
  it('uses Sunday = 0 in Asia/Riyadh', () => {
    expect(weekdayRiyadh('2026-08-16')).toBe(0);
    expect(weekdayRiyadh('2026-08-22')).toBe(6);
  });

  it('generates 60-minute slots on an open Saturday', () => {
    const slots = generateSlots({ date: '2026-08-22', hours });
    expect(slots).toHaveLength(5);
    expect(slots[0].starts_at).toBe('2026-08-22T16:00:00+03:00');
    expect(slots[0].ends_at).toBe('2026-08-22T17:00:00+03:00');
    expect(slots.every((s) => s.available)).toBe(true);
  });

  it('returns no slots on Friday when hours are Sat-Thu', () => {
    expect(generateSlots({ date: '2026-08-21', hours })).toEqual([]);
  });

  it('hides a slot that is already booked', () => {
    const slots = generateSlots({
      date: '2026-08-22',
      hours,
      bookings: [{
        status: 'confirmed',
        starts_at: '2026-08-22T16:00:00+03:00',
        ends_at: '2026-08-22T17:00:00+03:00',
      }],
    });
    expect(slots[0].available).toBe(false);
    expect(slots[1].available).toBe(true);
  });

  it('returns nothing on a blackout date', () => {
    expect(isBlackedOut('2026-08-22', [{ start_date: '2026-08-22', end_date: '2026-08-22' }])).toBe(true);
    expect(generateSlots({
      date: '2026-08-22',
      hours,
      blackouts: [{ start_date: '2026-08-22', end_date: '2026-08-22' }],
    })).toEqual([]);
  });
});
