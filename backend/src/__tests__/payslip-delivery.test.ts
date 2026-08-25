import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createPayslipShareToken,
  verifyPayslipShareToken,
  payslipLinkExpiresAt,
  PAYSLIP_LINK_TTL_DAYS,
} from '../services/payslipDelivery.js';

describe('SCRUM-123 payslip secure link tokens', () => {
  beforeEach(() => {
    process.env.PAYSLIP_LINK_SECRET = 'test-payslip-secret';
  });

  afterEach(() => {
    delete process.env.PAYSLIP_LINK_SECRET;
  });

  it('creates a verifiable token with 30-day expiry', () => {
    const expiresAt = payslipLinkExpiresAt(new Date('2026-08-25T00:00:00.000Z'));
    expect(expiresAt.toISOString()).toBe('2026-09-24T00:00:00.000Z');
    expect(PAYSLIP_LINK_TTL_DAYS).toBe(30);

    const token = createPayslipShareToken(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
      expiresAt,
    );

    const verified = verifyPayslipShareToken(token);
    expect(verified).toEqual({
      tenant_id: '11111111-1111-1111-1111-111111111111',
      payslip_id: '22222222-2222-2222-2222-222222222222',
      employee_id: '33333333-3333-3333-3333-333333333333',
      expires_at: expiresAt.toISOString(),
    });
  });

  it('rejects expired tokens', () => {
    const expired = new Date(Date.now() - 60_000);
    const token = createPayslipShareToken(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
      expired,
    );
    expect(verifyPayslipShareToken(token)).toBeNull();
  });

  it('rejects tampered tokens', () => {
    const expiresAt = payslipLinkExpiresAt();
    const token = createPayslipShareToken(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
      expiresAt,
    );
    const corrupted = `${token.slice(0, -4)}xxxx`;
    expect(verifyPayslipShareToken(corrupted)).toBeNull();
  });
});
