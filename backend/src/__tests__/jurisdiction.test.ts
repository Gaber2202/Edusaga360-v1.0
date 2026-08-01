import { describe, it, expect } from 'vitest';
import {
  resolveJurisdiction,
  JurisdictionUnresolvedError,
  NotImplementedInJurisdiction,
  type RequestContext,
} from '../lib/jurisdiction';

describe('resolveJurisdiction', () => {
  it('returns the branch jurisdiction when the branch is set', () => {
    const ctx: RequestContext = {
      tenant: { id: 'tenant-1', jurisdictionCode: 'SA' },
      branch: { id: 'branch-1', jurisdictionCode: 'AE' },
    };
    expect(resolveJurisdiction(ctx)).toBe('AE');
  });

  it('falls back to the tenant jurisdiction when branch is undefined', () => {
    const ctx: RequestContext = {
      tenant: { id: 'tenant-1', jurisdictionCode: 'QA' },
    };
    expect(resolveJurisdiction(ctx)).toBe('QA');
  });

  it('falls back to the tenant jurisdiction when branch code is an empty string', () => {
    const ctx: RequestContext = {
      tenant: { id: 'tenant-1', jurisdictionCode: 'SA' },
      branch: { id: 'branch-1', jurisdictionCode: '' },
    };
    expect(resolveJurisdiction(ctx)).toBe('SA');
  });

  it('throws JurisdictionUnresolvedError when both tenant and branch jurisdictions are missing', () => {
    const ctx: RequestContext = {
      tenant: { id: 'tenant-1', jurisdictionCode: '' },
      branch: { id: 'branch-1', jurisdictionCode: '' },
    };
    expect(() => resolveJurisdiction(ctx)).toThrow(JurisdictionUnresolvedError);
    try {
      resolveJurisdiction(ctx);
    } catch (err) {
      expect(err).toBeInstanceOf(JurisdictionUnresolvedError);
      expect((err as JurisdictionUnresolvedError).tenantId).toBe('tenant-1');
      expect((err as JurisdictionUnresolvedError).branchId).toBe('branch-1');
      expect((err as Error).message).toContain('tenant-1');
      expect((err as Error).message).toContain('branch-1');
    }
  });

  it('throws JurisdictionUnresolvedError with only tenant id when branch is undefined', () => {
    const ctx: RequestContext = {
      tenant: { id: 'tenant-2', jurisdictionCode: '' },
    };
    expect(() => resolveJurisdiction(ctx)).toThrow(JurisdictionUnresolvedError);
    try {
      resolveJurisdiction(ctx);
    } catch (err) {
      expect((err as JurisdictionUnresolvedError).tenantId).toBe('tenant-2');
      expect((err as JurisdictionUnresolvedError).branchId).toBeUndefined();
    }
  });

  it('returns branch value even when it differs from the tenant value', () => {
    const ctx: RequestContext = {
      tenant: { id: 'tenant-1', jurisdictionCode: 'SA' },
      branch: { id: 'branch-1', jurisdictionCode: 'QA' },
    };
    expect(resolveJurisdiction(ctx)).toBe('QA');
  });
});

describe('NotImplementedInJurisdiction', () => {
  it('contains jurisdiction and feature details', () => {
    const err = new NotImplementedInJurisdiction('AE', 'ZATCA reporting');
    expect(err.jurisdiction).toBe('AE');
    expect(err.feature).toBe('ZATCA reporting');
    expect(err.message).toContain('AE');
    expect(err.message).toContain('ZATCA reporting');
  });
});
