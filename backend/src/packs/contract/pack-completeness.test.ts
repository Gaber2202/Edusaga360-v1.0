import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase.js', () => ({ supabase: {} }));

import { resolvePack, getRegisteredPacks } from '../registry.js';
import type { CountryPack } from './CountryPack.js';

/**
 * Required top-level services for a GA/Beta country pack.
 * A pack may still throw NotImplementedInJurisdiction for an individual method,
 * but the service object itself must be present so callers can resolve it.
 */
const REQUIRED_SERVICES: Array<keyof CountryPack> = [
  'tax',
  'eInvoice',
  'payments',
  'identity',
  'payroll',
  'govIntegrations',
  'regulatorReports',
  'academicCalendar',
  'feeGovernance',
  'documents',
  'localisation',
];

describe('pack completeness', () => {
  it('every registered pack exposes all required service objects', () => {
    for (const pack of getRegisteredPacks()) {
      for (const service of REQUIRED_SERVICES) {
        expect(pack[service], `pack ${pack.code} is missing ${String(service)}`).toBeDefined();
      }
    }
  });

  it('registered pack codes are unique', () => {
    const codes = getRegisteredPacks().map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('resolvePack returns a pack for the jurisdiction registered by the pack itself', () => {
    for (const pack of getRegisteredPacks()) {
      const ctx = { tenant: { id: 'tenant-1', jurisdictionCode: pack.code } };
      const resolved = resolvePack(ctx);
      expect(resolved).toBe(pack);
    }
  });
});
