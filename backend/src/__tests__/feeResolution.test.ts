/**
 * Unit tests — fee structure effective-date filter (#187).
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveFeeStructures } from '../services/feeResolution.js';

function makeClient(rows: Record<string, unknown>[]) {
  const chain: Record<string, unknown> = {};
  const api = {
    select: () => api,
    eq: () => api,
    then: undefined as unknown,
  };
  // Minimal thenable thenable query builder
  const builder = {
    select: () => builder,
    eq: () => builder,
  };
  Object.assign(builder, {
    then(resolve: (v: unknown) => void) {
      resolve({ data: rows, error: null });
    },
  });
  return {
    from: () => builder,
  } as any;
}

describe('resolveFeeStructures effective dates (#187)', () => {
  const base = {
    id: 'fs1',
    category_id: 'c1',
    amount: 1000,
    grade: null,
    campus_id: null,
    program: null,
    is_mandatory: true,
    fee_categories: { code: 'TUITION', name_en: 'Tuition', name_ar: 'رسوم', vat_treatment: 'standard' },
  };

  it('excludes fee structures whose effective_to is before asOf', async () => {
    const client = makeClient([
      { ...base, id: 'expired', effective_from: '2024-01-01', effective_to: '2024-12-31' },
      { ...base, id: 'active', effective_from: '2025-01-01', effective_to: '2026-12-31' },
    ]);
    const result = await resolveFeeStructures(client, 'tenant-A', {
      academicYear: '2025-2026',
      asOf: '2025-06-01',
    });
    expect(result.map((r) => r.id)).toEqual(['active']);
  });

  it('excludes fee structures not yet effective', async () => {
    const client = makeClient([
      { ...base, id: 'future', effective_from: '2027-01-01', effective_to: null },
    ]);
    const result = await resolveFeeStructures(client, 'tenant-A', {
      academicYear: '2025-2026',
      asOf: '2025-06-01',
    });
    expect(result).toHaveLength(0);
  });
});
