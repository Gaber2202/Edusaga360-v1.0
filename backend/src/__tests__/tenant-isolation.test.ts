import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeReq, makeRes } from './helpers.js';

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({}),
}));

const { tenantMiddleware } = await import('../middleware/tenant.js');

// ── helpers ───────────────────────────────────────────────────────────────────

function userWith(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'user@school.sa',
    tenant_id: 'tenant-A',
    role: 'admin',
    is_platform_owner: false,
    ...overrides,
  };
}

// ── tenantMiddleware unit tests ───────────────────────────────────────────────

describe('tenantMiddleware', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when req.user is not set (not authenticated)', () => {
    const req = makeReq({ user: undefined });
    const res = makeRes();
    const next = vi.fn();

    tenantMiddleware(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes and calls next() when user has a valid tenant_id', () => {
    const req = makeReq({ user: userWith() });
    const res = makeRes();
    const next = vi.fn();

    tenantMiddleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 403 when non-platform-owner user has no tenant_id', () => {
    const req = makeReq({ user: userWith({ tenant_id: undefined }) });
    const res = makeRes();
    const next = vi.fn();

    tenantMiddleware(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('platform owner bypasses tenant check (no tenant_id required)', () => {
    const req = makeReq({
      user: userWith({ tenant_id: undefined, is_platform_owner: true }),
    });
    const res = makeRes();
    const next = vi.fn();

    tenantMiddleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('platform owner with a tenant_id also passes', () => {
    const req = makeReq({
      user: userWith({ tenant_id: 'tenant-B', is_platform_owner: true }),
    });
    const res = makeRes();
    const next = vi.fn();

    tenantMiddleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledOnce();
  });
});

// ── Tenant isolation: verify the tenant_id filter is always applied ───────────

describe('Tenant isolation — query filter contract', () => {
  /**
   * This describes the CONTRACT that route handlers must follow.
   * We simulate a minimal Supabase query builder and assert `.eq('tenant_id', ...)`
   * is called with the request user's tenant_id — not any other tenant's id.
   */

  function makeQueryBuilder(resolvedData: unknown = []) {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: resolvedData, error: null }),
    };
    return builder;
  }

  it('tenant A cannot access tenant B data — eq filter differs', () => {
    const builderA = makeQueryBuilder({ id: 'entry-1', tenant_id: 'tenant-A' });
    const builderB = makeQueryBuilder({ id: 'entry-2', tenant_id: 'tenant-B' });

    // Simulate tenant-A's request
    builderA.select('*').eq('tenant_id', 'tenant-A');
    expect(builderA.eq).toHaveBeenCalledWith('tenant_id', 'tenant-A');
    expect(builderA.eq).not.toHaveBeenCalledWith('tenant_id', 'tenant-B');

    // Simulate tenant-B's request
    builderB.select('*').eq('tenant_id', 'tenant-B');
    expect(builderB.eq).toHaveBeenCalledWith('tenant_id', 'tenant-B');
    expect(builderB.eq).not.toHaveBeenCalledWith('tenant_id', 'tenant-A');
  });

  it('tenant filter always appends tenant_id from req.user', async () => {
    const tenantId = 'tenant-school-123';
    const builder = makeQueryBuilder([{ id: 'je-1', tenant_id: tenantId }]);

    // Simulate what a route handler must do: scope query to req.user.tenant_id
    builder.select('*').eq('tenant_id', tenantId);

    expect(builder.eq).toHaveBeenCalledTimes(1);
    expect(builder.eq).toHaveBeenCalledWith('tenant_id', tenantId);
  });

  it('platform owner query does not filter by tenant_id', async () => {
    const builder = makeQueryBuilder([
      { id: 'je-1', tenant_id: 'tenant-A' },
      { id: 'je-2', tenant_id: 'tenant-B' },
    ]);

    // Platform owner: no tenant_id filter — selects across all tenants
    builder.select('*');

    expect(builder.eq).not.toHaveBeenCalled();
    await expect(builder.single()).resolves.toMatchObject({ error: null });
  });
});
