import { vi } from 'vitest';

/**
 * Generate a fake Bearer token string (not a real JWT; used only to test
 * header parsing and mock routing through the Supabase auth stub).
 */
export function makeFakeToken(payload: Record<string, unknown> = {}): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ sub: 'user-123', ...payload })).toString('base64url');
  return `${header}.${body}.fakesig`;
}

/**
 * Build a chainable Supabase mock client factory.
 * Usage:
 *   const { mock, client } = makeSupabaseMock();
 *   mock.from.mockReturnValue({ select: ... })
 */
export function makeSupabaseMock() {
  // auth sub-object
  const auth = {
    getUser: vi.fn(),
    admin: {
      createUser: vi.fn(),
    },
  };

  // Chainable query builder
  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  const client = {
    auth,
    from: vi.fn().mockReturnValue(queryBuilder),
  };

  return { client, auth, queryBuilder };
}

/**
 * A minimal AuthenticatedRequest-like object for middleware unit tests.
 */
export function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    headers: {},
    user: undefined,
    ...overrides,
  };
}

export function makeRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res as ReturnType<typeof makeRes>;
}
