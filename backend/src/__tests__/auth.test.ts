import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeReq, makeRes } from './helpers.js';

// ── Mock @supabase/supabase-js before importing the middleware ────────────────
const mockGetUser = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

// Import AFTER the mock is registered
const { authMiddleware } = await import('../middleware/auth.js');

// ── helpers ───────────────────────────────────────────────────────────────────

function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-abc',
    email: 'admin@school.sa',
    app_metadata: {
      tenant_id: 'tenant-xyz',
      role: 'admin',
      is_platform_owner: false,
      ...overrides,
    },
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes with a valid token and sets req.user', async () => {
    const user = buildUser();
    mockGetUser.mockResolvedValueOnce({ data: { user }, error: null });

    const req = makeReq({ headers: { authorization: 'Bearer valid-token' } });
    const res = makeRes();
    const next = vi.fn();

    await authMiddleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect((req as never as { user: unknown }).user).toMatchObject({
      id: 'user-abc',
      email: 'admin@school.sa',
      tenant_id: 'tenant-xyz',
      role: 'admin',
      is_platform_owner: false,
    });
  });

  it('returns 401 when Authorization header is missing', async () => {
    const req = makeReq({ headers: {} });
    const res = makeRes();
    const next = vi.fn();

    await authMiddleware(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header does not start with Bearer', async () => {
    const req = makeReq({ headers: { authorization: 'Basic abc123' } });
    const res = makeRes();
    const next = vi.fn();

    await authMiddleware(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Supabase returns an error (invalid/expired token)', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: new Error('JWT expired'),
    });

    const req = makeReq({ headers: { authorization: 'Bearer bad-token' } });
    const res = makeRes();
    const next = vi.fn();

    await authMiddleware(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Supabase returns null user without error', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const req = makeReq({ headers: { authorization: 'Bearer ghost-token' } });
    const res = makeRes();
    const next = vi.fn();

    await authMiddleware(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('sets is_platform_owner=true for platform owner tokens', async () => {
    // is_platform_owner is read from app_metadata (admin-only) — NOT user_metadata.
    const user = {
      ...buildUser({ tenant_id: undefined }),
      app_metadata: { is_platform_owner: true },
    };
    mockGetUser.mockResolvedValueOnce({ data: { user }, error: null });

    const req = makeReq({ headers: { authorization: 'Bearer platform-token' } });
    const res = makeRes();
    const next = vi.fn();

    await authMiddleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledOnce();
    const reqUser = (req as never as { user: { is_platform_owner: boolean } }).user;
    expect(reqUser.is_platform_owner).toBe(true);
  });

  it('returns 401 when Supabase throws an unexpected exception', async () => {
    mockGetUser.mockRejectedValueOnce(new Error('network error'));

    const req = makeReq({ headers: { authorization: 'Bearer some-token' } });
    const res = makeRes();
    const next = vi.fn();

    await authMiddleware(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
