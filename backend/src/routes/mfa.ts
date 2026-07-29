import { Router, Response } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { normalizePhone } from '../lib/phone.js';
import {
  generateCode,
  createOtpRecord,
  verifyOtp,
  deliverOtp,
  invalidateExistingCodes,
  maskDestination,
  type OtpChannel,
} from '../services/otp.js';

export const mfaRouter = Router();

const MFA_CODE_TTL_MINUTES = 5;

function normalizeDestination(channel: OtpChannel, raw: string): string {
  if (channel === 'email') return raw.trim().toLowerCase();
  return normalizePhone(raw);
}

function validateDestination(channel: OtpChannel, destination: string): string | null {
  if (channel === 'email') {
    const emailSchema = z.string().email();
    return emailSchema.safeParse(destination).success ? null : 'Invalid email address';
  }
  const digits = destination.replace(/\D/g, '');
  if (digits.length < 8) return 'Invalid phone number';
  return null;
}

async function getUsersRow(authId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('id, tenant_id, mfa_required, mfa_channel, mfa_destination, name, name_ar, phone, email')
    .eq('auth_id', authId)
    .maybeSingle();
  if (error) throw error;
  return data as {
    id: string;
    tenant_id?: string | null;
    mfa_required?: boolean;
    mfa_channel?: string | null;
    mfa_destination?: string | null;
    name?: string | null;
    name_ar?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
}

async function updateAppMetadata(userId: string, patch: Record<string, unknown>): Promise<void> {
  const { data, error: getError } = await supabase.auth.admin.getUserById(userId);
  if (getError) throw getError;
  const existing = (data?.user?.app_metadata as Record<string, unknown> | undefined) ?? {};
  const updated = { ...existing, ...patch };
  const { error } = await supabase.auth.admin.updateUserById(userId, { app_metadata: updated });
  if (error) throw error;
}

async function sendMfaCode(
  req: AuthenticatedRequest,
  res: Response,
  purpose: 'mfa_login' | 'mfa_enroll',
  channel: OtpChannel,
  destination: string,
  language: 'ar' | 'en',
) {
  const userId = req.user!.id;
  const tenantId = req.user!.tenant_id;

  const code = generateCode();
  const delivery = await deliverOtp(channel, destination, code, language);

  const deliveryAttempts = [{
    channel,
    destination: maskDestination(channel, destination),
    success: delivery.success,
    error: delivery.error,
    message_id: delivery.messageId,
    provider: delivery.provider,
    at: new Date().toISOString(),
  }];

  if (!delivery.success) {
    return res.status(502).json({
      error: 'delivery_failed',
      message: delivery.error || 'Could not deliver verification code',
      channel,
      destination_masked: maskDestination(channel, destination),
    });
  }

  await invalidateExistingCodes(userId, purpose);

  const otpId = await createOtpRecord({
    tenantId,
    userId,
    purpose,
    channel,
    destination,
    code,
    expiresInMinutes: MFA_CODE_TTL_MINUTES,
    maxAttempts: 5,
    deliveryStatus: delivery.messageId ? 'sent' : 'pending',
    deliveryAttempts,
  });

  return res.json({
    otp_id: otpId,
    expires_at: new Date(Date.now() + MFA_CODE_TTL_MINUTES * 60 * 1000).toISOString(),
    channel,
    destination_masked: maskDestination(channel, destination),
    delivery_status: delivery.messageId ? 'sent' : 'pending',
  });
}

/**
 * Send a login MFA code to the user's configured destination.
 */
mfaRouter.post('/send', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = z.object({
      language: z.enum(['ar', 'en']).default('ar'),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'validation_error' });

    const user = await getUsersRow(req.user!.id);
    if (!user) return res.status(404).json({ error: 'user_not_found' });
    if (!user.mfa_required) return res.status(400).json({ error: 'mfa_not_enabled' });

    const channel = (user.mfa_channel ?? 'sms') as OtpChannel;
    const destination = user.mfa_destination;
    if (!destination) return res.status(400).json({ error: 'mfa_destination_missing' });

    return await sendMfaCode(req, res, 'mfa_login', channel, destination, parsed.data.language);
  } catch (err: any) {
    console.error('[mfa/send] error:', err);
    return res.status(500).json({ error: 'mfa_send_failed', message: err.message });
  }
});

/**
 * Verify a login MFA code and mark the session as MFA-verified.
 */
mfaRouter.post('/verify', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = z.object({
      otp_id: z.string().uuid(),
      code: z.string().length(6),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'validation_error' });

    const result = await verifyOtp(parsed.data.otp_id, req.user!.id, parsed.data.code);
    if (!result.valid) {
      return res.status(401).json({ error: 'invalid_code', message: 'Invalid or expired verification code' });
    }

    const user = await getUsersRow(req.user!.id);
    await updateAppMetadata(req.user!.id, {
      mfa_required: true,
      mfa_channel: user?.mfa_channel ?? 'sms',
      mfa_verified_at: new Date().toISOString(),
    });

    return res.json({ success: true });
  } catch (err: any) {
    console.error('[mfa/verify] error:', err);
    return res.status(500).json({ error: 'mfa_verify_failed', message: err.message });
  }
});

/**
 * Start MFA enrollment by sending a code to a destination the user controls.
 */
mfaRouter.post('/enroll', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = z.object({
      channel: z.enum(['sms', 'whatsapp', 'email']),
      destination: z.string().min(3).max(120),
      language: z.enum(['ar', 'en']).default('ar'),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'validation_error' });

    const channel = parsed.data.channel;
    const destination = normalizeDestination(channel, parsed.data.destination);
    const validationError = validateDestination(channel, destination);
    if (validationError) return res.status(400).json({ error: 'validation_error', message: validationError });

    return await sendMfaCode(req, res, 'mfa_enroll', channel, destination, parsed.data.language);
  } catch (err: any) {
    console.error('[mfa/enroll] error:', err);
    return res.status(500).json({ error: 'mfa_enroll_failed', message: err.message });
  }
});

/**
 * Confirm MFA enrollment after verifying the enrollment code.
 */
mfaRouter.post('/confirm', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = z.object({
      otp_id: z.string().uuid(),
      code: z.string().length(6),
      channel: z.enum(['sms', 'whatsapp', 'email']),
      destination: z.string().min(3).max(120),
      language: z.enum(['ar', 'en']).default('ar'),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'validation_error' });

    const result = await verifyOtp(parsed.data.otp_id, req.user!.id, parsed.data.code);
    if (!result.valid) {
      return res.status(401).json({ error: 'invalid_code', message: 'Invalid or expired verification code' });
    }

    const channel = parsed.data.channel;
    const destination = normalizeDestination(channel, parsed.data.destination);

    const user = await getUsersRow(req.user!.id);
    const { error: updateError } = await supabase
      .from('users')
      .update({
        mfa_required: true,
        mfa_channel: channel,
        mfa_destination: destination,
      })
      .eq('id', user?.id);
    if (updateError) throw updateError;

    await updateAppMetadata(req.user!.id, {
      mfa_required: true,
      mfa_channel: channel,
      mfa_verified_at: new Date().toISOString(),
    });

    return res.json({ success: true, channel, destination_masked: maskDestination(channel, destination) });
  } catch (err: any) {
    console.error('[mfa/confirm] error:', err);
    return res.status(500).json({ error: 'mfa_confirm_failed', message: err.message });
  }
});

/**
 * Disable MFA for the current user.
 */
mfaRouter.post('/disable', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await getUsersRow(req.user!.id);
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    const { error: updateError } = await supabase
      .from('users')
      .update({ mfa_required: false, mfa_channel: null, mfa_destination: null })
      .eq('id', user.id);
    if (updateError) throw updateError;

    await updateAppMetadata(req.user!.id, {
      mfa_required: false,
      mfa_verified_at: null,
      mfa_channel: null,
    });

    return res.json({ success: true });
  } catch (err: any) {
    console.error('[mfa/disable] error:', err);
    return res.status(500).json({ error: 'mfa_disable_failed', message: err.message });
  }
});
