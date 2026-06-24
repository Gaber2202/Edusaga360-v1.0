/**
 * Public self-service password reset — POST /api/auth/forgot-password.
 *
 * Business rules verified:
 *   - Invalid emails are rejected (400)
 *   - When Infobip is configured, ONE recovery link is generated and emailed —
 *     and resetPasswordForEmail is NOT called (a second token would invalidate
 *     the first)
 *   - When Infobip is absent, it falls back to Supabase's built-in recovery email
 *   - The email is normalized to lower-case
 *   - Unknown addresses still return 200 (anti-enumeration)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Deterministic, no-op rate limiter for tests.
vi.mock('express-rate-limit', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const generateLink = vi.fn();
const resetPasswordForEmail = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      admin: { generateLink },
      resetPasswordForEmail,
      getUser: vi.fn(),
    },
  }),
}));

const isEmailConfigured = vi.fn();
const sendPasswordResetEmail = vi.fn();
vi.mock('../services/email.js', () => ({
  isEmailConfigured: () => isEmailConfigured(),
  sendPasswordResetEmail: (...args: unknown[]) => sendPasswordResetEmail(...args),
  sendInviteEmail: vi.fn(),
  sendEmail: vi.fn(),
}));

const { authRouter } = await import('../routes/auth.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/auth/forgot-password', () => {
  it('rejects an invalid email with 400', async () => {
    const res = await request(makeApp()).post('/api/auth/forgot-password').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it('generates one link and emails it via Infobip without a colliding token', async () => {
    isEmailConfigured.mockReturnValue(true);
    generateLink.mockResolvedValue({ data: { properties: { action_link: 'https://reset.link/abc' } } });
    sendPasswordResetEmail.mockResolvedValue(undefined);

    const res = await request(makeApp()).post('/api/auth/forgot-password').send({ email: 'User@School.sa' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(generateLink).toHaveBeenCalledWith(expect.objectContaining({ type: 'recovery', email: 'user@school.sa' }));
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(
      expect.objectContaining({ recipient_email: 'user@school.sa', actionLink: 'https://reset.link/abc' }),
    );
    // Critical: do NOT also send via Supabase — that would mint a second token
    // and invalidate the emailed link.
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('falls back to Supabase recovery email when Infobip is not configured', async () => {
    isEmailConfigured.mockReturnValue(false);
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    const res = await request(makeApp()).post('/api/auth/forgot-password').send({ email: 'user@school.sa' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      'user@school.sa',
      expect.objectContaining({ redirectTo: expect.stringContaining('/reset-password') }),
    );
    expect(generateLink).not.toHaveBeenCalled();
  });

  it('still returns 200 for an unknown email (anti-enumeration)', async () => {
    isEmailConfigured.mockReturnValue(true);
    generateLink.mockResolvedValue({ data: null }); // user not found → no link

    const res = await request(makeApp()).post('/api/auth/forgot-password').send({ email: 'ghost@nowhere.sa' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});
