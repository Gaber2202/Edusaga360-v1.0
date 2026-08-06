import { describe, expect, it } from 'vitest';
import { resolvePack } from '../registry.js';
import { NotImplementedInJurisdiction } from '../../lib/jurisdiction.js';

describe('no silent fallback', () => {
  it('throws NotImplementedInJurisdiction for an unregistered jurisdiction', () => {
    const ctx = { tenant: { id: 'tenant-1', jurisdictionCode: 'XX' } };
    expect(() => resolvePack(ctx)).toThrow(NotImplementedInJurisdiction);
  });

  it('does not return Saudi behaviour for an unregistered jurisdiction', () => {
    const ctx = { tenant: { id: 'tenant-1', jurisdictionCode: 'XX' } };
    let threw = false;
    try {
      resolvePack(ctx);
    } catch (err) {
      threw = true;
      expect(err).toBeInstanceOf(NotImplementedInJurisdiction);
      // Ensure the error names the missing jurisdiction, not Saudi Arabia.
      expect((err as NotImplementedInJurisdiction).jurisdiction).toBe('XX');
    }
    expect(threw).toBe(true);
  });
});
