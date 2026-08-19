import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import {
  findListedSchool,
  hasParentPortalAccess,
  linkedStudentIds,
  parentProfileForAuth,
  resolveRosterStudentIds,
  NOT_AT_SCHOOL,
  PARENT_ONLY,
} from '../lib/parentSchool.js';

export const parentAuthRouter = Router();

const loginLimiter = process.env.VITEST
  ? ((_req: Request, _res: Response, next: NextFunction) => next())
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: 'Too many login attempts. Please try again in a few minutes.' },
    });

const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
  tenant_code: z.string().trim().min(1).max(40).optional(),
  slug: z.string().trim().min(1).max(40).optional(),
}).refine((d) => Boolean(d.tenant_code || d.slug), {
  message: 'A school code is required',
});

const RefreshSchema = z.object({
  refresh_token: z.string().min(1),
});

function displayName(row: { first_name?: string | null; last_name?: string | null; name?: string | null; email?: string | null }) {
  const fromParts = [row.first_name, row.last_name].filter(Boolean).join(' ');
  return fromParts || row.name || row.email || '';
}

async function sessionPayload(
  session: { access_token: string; refresh_token: string; expires_in?: number },
  authUser: { id: string; email?: string },
  profile: { tenant_id: string; linked_student_ids?: unknown; first_name?: string | null; last_name?: string | null; name?: string | null; email?: string | null },
) {
  const linked_student_ids = await resolveRosterStudentIds({
    tenantId: profile.tenant_id,
    email: profile.email ?? authUser.email,
    linkedIds: linkedStudentIds(profile),
  });
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in ?? 3600,
    token_type: 'bearer',
    user: {
      id: authUser.id,
      email: authUser.email,
      name: displayName(profile),
      tenant_id: profile.tenant_id,
      role: 'parent',
      linked_student_ids,
    },
  };
}

parentAuthRouter.post('/login', loginLimiter, async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    const schoolMissing = !req.body?.tenant_code && !req.body?.slug;
    return res.status(400).json({
      message: schoolMissing
        ? 'A school code is required'
        : 'A valid email and password are required',
    });
  }

  const school = await findListedSchool({
    tenantCode: parsed.data.tenant_code,
    slug: parsed.data.slug,
  });
  if (!school) {
    return res.status(404).json({ message: 'School not found' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
  });

  if (error || !data.session || !data.user) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const profile = await parentProfileForAuth(data.user.id, school.id);
  if (!profile) {
    return res.status(403).json({ message: NOT_AT_SCHOOL });
  }
  if (!hasParentPortalAccess(profile)) {
    return res.status(403).json({ message: PARENT_ONLY });
  }

  return res.json(await sessionPayload(data.session, data.user, profile));
});

parentAuthRouter.post('/refresh', loginLimiter, async (req, res) => {
  const parsed = RefreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'refresh_token is required' });
  }

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: parsed.data.refresh_token });
  if (error || !data.session || !data.user) {
    return res.status(401).json({ message: 'Invalid or expired refresh token' });
  }

  const profile = await parentProfileForAuth(data.user.id);
  if (!profile || !hasParentPortalAccess(profile)) {
    return res.status(403).json({ message: PARENT_ONLY });
  }

  return res.json(await sessionPayload(data.session, data.user, profile));
});
