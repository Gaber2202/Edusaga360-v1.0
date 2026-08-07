/**
 * Nationality classification consistency between GOSI (payroll) and Nitaqat
 * (regulator reports). Both subsystems must give the same answer for the same
 * nationality string, especially Arabic-language values.
 */
import { describe, it, expect, vi } from 'vitest';
import { isSaudi } from '../packs/sa/nationality.js';
import { calculateGosiForEmployee } from '../packs/sa/payroll.js';
import { calculateNitaqat } from '../packs/sa/regulatorReports.js';

const SAMPLE_NATIONALITIES = [
  { value: 'saudi', expected: true },
  { value: 'Saudi', expected: true },
  { value: 'Saudi Arabia', expected: true },
  { value: 'SA', expected: true },
  { value: 'سعودي', expected: true },
  { value: 'indian', expected: false },
  { value: 'Indian', expected: false },
  { value: 'filipino', expected: false },
  { value: 'سوداني', expected: false },
];

function makeSupabaseStub(thresholds: { platinum: number; green: number; yellow: number }) {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          limit: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: table === 'nitaqat_thresholds' ? thresholds : null, error: null })),
          })),
        })),
      })),
    })),
  } as any;
}

describe('isSaudi normalization', () => {
  it.each(SAMPLE_NATIONALITIES)('classifies "$value" as $expected', ({ value, expected }) => {
    expect(isSaudi(value)).toBe(expected);
  });

  it('classifies an employee object with is_saudi=true', () => {
    expect(isSaudi({ is_saudi: true, nationality: 'indian' })).toBe(true);
  });

  it('falls back to nationality when is_saudi is not true', () => {
    expect(isSaudi({ is_saudi: false, nationality: 'سعودي' })).toBe(true);
    expect(isSaudi({ is_saudi: null, nationality: 'indian' })).toBe(false);
  });
});

describe('payroll and nitaqat agree on nationality', () => {
  it.each(['saudi', 'SA', 'سعودي'])('"%s" is Saudi in both GOSI and Nitaqat', async (nationality) => {
    const gosi = calculateGosiForEmployee(10_000, nationality);
    expect(gosi.is_saudi).toBe(true);

    const supabase = makeSupabaseStub({ platinum: 40, green: 25, yellow: 15 });
    const nitaqat = await calculateNitaqat(supabase, 'tenant-1', {
      employees: [{ status: 'active', nationality }],
      departments: [],
    });
    expect(nitaqat.saudiCount).toBe(1);
    expect(nitaqat.saudi_vs_non_saudi).toEqual([
      { name: 'saudi', value: 1 },
      { name: 'non_saudi', value: 0 },
    ]);
  });

  it.each(['indian', 'إماراتي', 'jordanian'])('"%s" is non-Saudi in both GOSI and Nitaqat', async (nationality) => {
    const gosi = calculateGosiForEmployee(10_000, nationality);
    expect(gosi.is_saudi).toBe(false);

    const supabase = makeSupabaseStub({ platinum: 40, green: 25, yellow: 15 });
    const nitaqat = await calculateNitaqat(supabase, 'tenant-1', {
      employees: [{ status: 'active', nationality }],
      departments: [],
    });
    expect(nitaqat.saudiCount).toBe(0);
    expect(nitaqat.saudi_vs_non_saudi).toEqual([
      { name: 'saudi', value: 0 },
      { name: 'non_saudi', value: 1 },
    ]);
  });
});
