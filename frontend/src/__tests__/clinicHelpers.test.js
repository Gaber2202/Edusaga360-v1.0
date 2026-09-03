import { describe, it, expect } from 'vitest';
import {
  normalizeAllergies,
  normalizeConditions,
  isCriticalHealth,
  buildClinicVisitEvent,
  parseListInput,
} from '@/lib/clinicHelpers';

describe('clinicHelpers', () => {
  it('merges allergies from health record and student profile', () => {
    const allergies = normalizeAllergies(
      { allergies: [{ name: 'Peanuts' }, 'Latex'] },
      { allergies: 'Dust, Peanuts', canteen_allergens: ['Gluten'] },
    );
    expect(allergies.map((a) => a.name).sort()).toEqual(['Dust', 'Gluten', 'Latex', 'Peanuts']);
  });

  it('parses condition lists and detects critical flags', () => {
    expect(normalizeConditions({ chronic_conditions: ['Asthma'] }, { chronic_conditions: 'Diabetes' }))
      .toEqual(['Asthma', 'Diabetes']);
    expect(isCriticalHealth({ has_critical_condition: true }, null)).toBe(true);
    expect(isCriticalHealth(null, { medical_notes: 'severe asthma' })).toBe(true);
    expect(parseListInput('a, b; c')).toEqual(['a', 'b', 'c']);
  });

  it('builds clinic visit event payloads for the bus', () => {
    const payload = buildClinicVisitEvent({
      student: { id: 's1', emergency_phone: '+9665', emergency_contact: 'Parent', branch_id: 'b1' },
      visit: {
        student_id: 's1',
        student_name: 'Ali',
        visit_time: '10:00',
        complaint_category: 'fever',
        medication_dispensed: 'Paracetamol',
        outcome: 'sent_home',
        parent_notified: true,
      },
      tenantId: 't1',
    });
    expect(payload.parent_notified).toBe(true);
    expect(payload.guardian_phone).toBe('+9665');
    expect(payload.outcome).toBe('sent_home');
  });
});
