import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { isEmailConfigured, sendPasswordResetEmail } from '../services/email.js';

export const authRouter = Router();


const FRONTEND_URL = process.env.FRONTEND_URL || 'https://edusaga-360-production.vercel.app';

// Strict limiter for the public, unauthenticated reset endpoint — throttles
// both abuse and email-enumeration probing.
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many reset requests. Please try again in a few minutes.' },
});

authRouter.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const token = authHeader.slice(7);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ message: 'Invalid token' });
  }

  res.json({
    id: user.id,
    email: user.email,
    // Read privileged claims from app_metadata only (admin-only write).
    // user_metadata is user-writable and must never be used for auth decisions.
    tenant_id: user.app_metadata?.tenant_id,
    role: user.app_metadata?.role,
    is_platform_owner: user.app_metadata?.is_platform_owner === true,
    name: user.user_metadata?.name,
  });
});

/**
 * Public, self-service password reset.
 *
 * Generates one recovery link and emails it via Infobip when configured,
 * otherwise falls back to Supabase's built-in recovery email. Always responds
 * 200 with a generic body so the endpoint can't be used to discover which
 * emails are registered (anti-enumeration).
 */
authRouter.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'A valid email is required' });

  const email = parsed.data.email.toLowerCase();
  const redirectTo = `${FRONTEND_URL}/reset-password`;

  try {
    if (isEmailConfigured()) {
      // Preferred path: mint one recovery token and email THAT exact link.
      const { data: linkData } = await supabase.auth.admin.generateLink({
        type: 'recovery', email, options: { redirectTo },
      }).catch(() => ({ data: null } as any));
      const actionLink = (linkData as any)?.properties?.action_link ?? null;
      if (actionLink) {
        await sendPasswordResetEmail({ recipient_email: email, actionLink })
          .catch((e) => console.error('forgot-password email failed:', e));
      }
    } else {
      // Fallback: Supabase's built-in recovery email (requires SMTP configured).
      await supabase.auth.resetPasswordForEmail(email, { redirectTo }).catch(() => {});
    }
  } catch (e) {
    console.error('forgot-password error:', e);
  }

  return res.json({ ok: true });
});
