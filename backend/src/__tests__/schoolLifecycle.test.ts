/**
 * Phase 3 — school lifecycle journey (API-level steps 1–9).
 *
 * Full UI E2E is tracked in QA_MATRIX; these tests lock the server contracts
 * that the handover requires for KSA, UAE, and Qatar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'crypto';
import { countryToJurisdiction } from '../lib/countryJurisdiction.js';
import { assertCanAddBranch, canAddBranch, BranchLimitExceededError } from '../lib/branchLimits.js';

const ADMIN_LINK_SECRET = process.env.ADMIN_LINK_SECRET || 'change-me-in-production';
function sigFor(action: string, id: string): string {
  return crypto.createHmac('sha256', ADMIN_LINK_SECRET).update(`${action}:${id}`).digest('hex').slice(0, 32);
}

const mockFrom = vi.fn();
const mockAuth = { admin: { createUser: vi.fn() } };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: mockAuth, from: mockFrom }),
}));

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

const { registrationRouter } = await import('../routes/registration.js');

function makeQB(resolvedValue: { data: unknown; error: unknown } = { data: null, error: null }) {
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolvedValue),
    maybeSingle: vi.fn().mockResolvedValue(resolvedValue),
  };
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/registration', registrationRouter);
  return app;
}

function mockApproveChain(country: string, requestId: string) {
  const fetchQB = makeQB({
    data: {
      id: requestId,
      status: 'pending',
      contact_name: 'Principal',
      contact_email: 'admin@school.test',
      school_name_en: `${country} School`,
      country,
    },
    error: null,
  });
  const jurisdictionQB = makeQB({ data: { code: countryToJurisdiction(country) }, error: null });
  const updateQB = makeQB({ data: null, error: null });
  const tenantInsertSpy = vi.fn().mockReturnThis();
  const tenantQB = {
    insert: tenantInsertSpy,
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: `tenant-${country}` }, error: null }),
  };
  const linkQB = makeQB({ data: null, error: null });

  mockFrom
    .mockReturnValueOnce(fetchQB)
    .mockReturnValueOnce(jurisdictionQB)
    .mockReturnValueOnce(updateQB)
    .mockReturnValueOnce(tenantQB)
    .mockReturnValueOnce(linkQB);

  return tenantInsertSpy;
}

describe('Phase 3 — country → jurisdiction (step 2)', () => {
  it.each([
    ['SA', 'SA'],
    ['sa', 'SA'],
    ['SAUDI ARABIA', 'SA'],
    ['AE', 'AE'],
    ['United Arab Emirates', 'AE'],
    ['QA', 'QA'],
    ['Qatar', 'QA'],
  ])('maps %s → %s', (input, expected) => {
    expect(countryToJurisdiction(input)).toBe(expected);
  });

  it('returns undefined for unknown countries (no IP/locale fallback)', () => {
    expect(countryToJurisdiction('US')).toBeUndefined();
    expect(countryToJurisdiction('')).toBeUndefined();
    expect(countryToJurisdiction(null)).toBeUndefined();
  });
});

describe('Phase 3 — approval-only tenant creation (steps 4–5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it.each([
    ['SA', 'req-sa'],
    ['AE', 'req-ae'],
    ['QA', 'req-qa'],
  ])('approve creates tenant with jurisdiction_code=%s when country is %s', async (country, requestId) => {
    const tenantInsertSpy = mockApproveChain(country, requestId);

    const res = await request(makeApp()).get(
      `/registration/approve/${requestId}?sig=${sigFor('approve', requestId)}`,
    );

    expect(res.status).toBe(200);
    expect(res.text).toContain('Approved');

    const insertPayload = tenantInsertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertPayload.jurisdiction_code).toBe(country);
    expect(insertPayload.status).toBe('trial');
  });

  it('rejects approval when country does not map to a jurisdiction', async () => {
    const fetchQB = makeQB({
      data: {
        id: 'req-bad',
        status: 'pending',
        contact_name: 'X',
        school_name_en: 'Unknown',
        country: 'US',
      },
      error: null,
    });
    mockFrom.mockReturnValueOnce(fetchQB);

    const res = await request(makeApp()).get(
      '/registration/approve/req-bad?sig=' + sigFor('approve', 'req-bad'),
    );

    expect(res.status).toBe(400);
    expect(res.text).toContain('unknown or missing country');
  });

  it('blocks onboarding completion while registration is still pending (no self-serve bypass)', async () => {
    const fetchQB = makeQB({
      data: {
        id: 'req-pending',
        status: 'pending',
        contact_email: 'p@school.test',
        onboarding_token: 'tok-pending',
      },
      error: null,
    });
    mockFrom.mockReturnValueOnce(fetchQB);

    const res = await request(makeApp())
      .post('/registration/onboarding/tok-pending/complete')
      .send({ password: 'SecurePass123!' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('Phase 3 — branch subscription limit (step 7)', () => {
  it('allows creation when under the plan cap', () => {
    expect(canAddBranch(0, 1)).toBe(true);
    expect(canAddBranch(2, 3)).toBe(true);
  });

  it('blocks creation at the cap', () => {
    expect(canAddBranch(1, 1)).toBe(false);
    expect(canAddBranch(3, 3)).toBe(false);
    expect(() => assertCanAddBranch(1, 1)).toThrow(BranchLimitExceededError);
  });

  it('defaults max to 9999 when unset', () => {
    expect(canAddBranch(100, null)).toBe(true);
    expect(canAddBranch(100, undefined)).toBe(true);
  });
});
