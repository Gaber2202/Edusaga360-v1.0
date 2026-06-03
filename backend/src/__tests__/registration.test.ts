import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Mock @supabase/supabase-js ────────────────────────────────────────────────
// We need fine-grained control per test, so we track calls through a shared ref.
const mockFrom = vi.fn();
const mockAuth = {
  admin: {
    createUser: vi.fn(),
  },
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: mockAuth,
    from: mockFrom,
  }),
}));

// Mock global fetch (used for Resend email API)
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

// Import AFTER mocks are set up
const { registrationRouter } = await import('../routes/registration.js');

// ── Minimal Express app wrapping just the registration router ─────────────────
function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/registration', registrationRouter);
  return app;
}

// ── Query builder factory ─────────────────────────────────────────────────────
function makeQB(resolvedValue: { data: unknown; error: unknown } = { data: null, error: null }) {
  const qb = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolvedValue),
  };
  return qb;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /registration/request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  it('returns 201 with valid registration data', async () => {
    // First call: check for duplicate → not found
    const dupQB = makeQB({ data: null, error: { code: 'PGRST116' } });
    // Second call: insert → success
    const insertQB = makeQB({
      data: {
        id: 'req-1',
        contact_email: 'school@example.com',
        contact_name: 'Ahmed Ali',
        school_name_en: 'Test School',
      },
      error: null,
    });

    mockFrom
      .mockReturnValueOnce(dupQB)
      .mockReturnValueOnce(insertQB);

    const app = makeApp();
    const res = await request(app)
      .post('/registration/request')
      .send({
        contact_email: 'school@example.com',
        contact_name: 'Ahmed Ali',
        school_name_en: 'Test School',
        city: 'Riyadh',
        country: 'SA',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.request_id).toBe('req-1');
  });

  it('returns 400 when email is missing', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/registration/request')
      .send({
        contact_name: 'Ahmed Ali',
        school_name_en: 'Test School',
        // no email
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 409 when a pending request already exists for email', async () => {
    const dupQB = makeQB({
      data: { id: 'existing-req', status: 'pending' },
      error: null,
    });
    mockFrom.mockReturnValueOnce(dupQB);

    const app = makeApp();
    const res = await request(app)
      .post('/registration/request')
      .send({
        contact_email: 'duplicate@school.sa',
        contact_name: 'Sara',
        school_name_en: 'Dup School',
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('DUPLICATE');
  });
});

describe('GET /registration/approve/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  it('returns HTML success page when approving a valid pending request', async () => {
    const fetchQB = makeQB({
      data: {
        id: 'req-valid',
        status: 'pending',
        contact_email: 'admin@school.sa',
        contact_name: 'Ahmed',
        school_name_en: 'Good School',
        school_name_ar: '',
        onboarding_token: 'tok123',
        city: 'Riyadh',
        school_type: 'private',
      },
      error: null,
    });
    const updateQB = makeQB({ data: null, error: null });
    const tenantQB = makeQB({
      data: { id: 'tenant-new' },
      error: null,
    });
    const linkQB = makeQB({ data: null, error: null });

    mockFrom
      .mockReturnValueOnce(fetchQB)   // select request
      .mockReturnValueOnce(updateQB)  // update status = approved
      .mockReturnValueOnce(tenantQB)  // insert tenant
      .mockReturnValueOnce(linkQB);   // update registration_requests with tenant_id

    const app = makeApp();
    const res = await request(app).get('/registration/approve/req-valid');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Approved');
  });

  it('returns 404 HTML page when request ID does not exist', async () => {
    const notFoundQB = makeQB({ data: null, error: new Error('not found') });
    mockFrom.mockReturnValueOnce(notFoundQB);

    const app = makeApp();
    const res = await request(app).get('/registration/approve/nonexistent-id');

    expect(res.status).toBe(404);
    expect(res.text).toContain('Not Found');
  });

  it('shows already-approved page without re-approving', async () => {
    const fetchQB = makeQB({
      data: {
        id: 'req-already',
        status: 'approved',
        contact_name: 'Sara',
        school_name_en: 'Already School',
      },
      error: null,
    });
    mockFrom.mockReturnValueOnce(fetchQB);

    const app = makeApp();
    const res = await request(app).get('/registration/approve/req-already');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Already Approved');
  });
});

describe('POST /registration/onboarding/:token/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 and redirect_url when token is valid and status is approved', async () => {
    const fetchQB = makeQB({
      data: {
        id: 'req-3',
        status: 'approved',
        contact_email: 'admin@school.sa',
        contact_name: 'Ahmed Ali',
        tenant_id: 'tenant-abc',
        onboarding_token: 'validtoken123',
      },
      error: null,
    });
    const createUserResult = {
      data: { user: { id: 'auth-user-1' } },
      error: null,
    };
    const usersQB = makeQB({ data: null, error: null });
    const tenantQB = makeQB({ data: null, error: null });
    const completeQB = makeQB({ data: null, error: null });

    mockFrom
      .mockReturnValueOnce(fetchQB)
      .mockReturnValueOnce(usersQB)
      .mockReturnValueOnce(tenantQB)
      .mockReturnValueOnce(completeQB);

    mockAuth.admin.createUser.mockResolvedValueOnce(createUserResult);

    const app = makeApp();
    const res = await request(app)
      .post('/registration/onboarding/validtoken123/complete')
      .send({ password: 'SecurePass123!', default_language: 'ar' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('redirect_url');
  });

  it('returns 404 when onboarding token is invalid', async () => {
    const notFoundQB = makeQB({ data: null, error: new Error('not found') });
    mockFrom.mockReturnValueOnce(notFoundQB);

    const app = makeApp();
    const res = await request(app)
      .post('/registration/onboarding/badtoken/complete')
      .send({ password: 'Pass123!' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when request exists but is not approved (still pending)', async () => {
    const fetchQB = makeQB({
      data: {
        id: 'req-pending',
        status: 'pending',
        contact_email: 'pending@school.sa',
        contact_name: 'Pending User',
        onboarding_token: 'pendingtoken',
      },
      error: null,
    });
    mockFrom.mockReturnValueOnce(fetchQB);

    const app = makeApp();
    const res = await request(app)
      .post('/registration/onboarding/pendingtoken/complete')
      .send({ password: 'Pass123!' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('not approved');
  });
});
