import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  findListedSchoolById,
  hasParentPortalAccess,
  linkedStudentIds,
  listAssignedSchoolsForAuth,
  parentProfileForAuth,
  publicSchoolPayload,
  resolveRosterStudentIds,
  PARENT_ONLY,
  type PublicSchool,
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
  tenant_id: z.string().trim().min(1).max(64).optional(),
  tenant_code: z.string().trim().min(1).max(40).optional(),
  slug: z.string().trim().min(1).max(40).optional(),
});

const RefreshSchema = z.object({
  refresh_token: z.string().min(1),
});

const SelectSchoolSchema = z.object({
  tenant_id: z.string().trim().min(1).max(64).optional(),
  slug: z.string().trim().min(1).max(40).optional(),
  refresh_token: z.string().min(1).optional(),
}).refine((d) => Boolean(d.tenant_id || d.slug), {
  message: 'tenant_id or slug is required',
});

function displayName(row: { first_name?: string | null; last_name?: string | null; name?: string | null; email?: string | null }) {
  const fromParts = [row.first_name, row.last_name].filter(Boolean).join(' ');
  return fromParts || row.name || row.email || '';
}

async function sessionPayload(
  session: { access_token: string; refresh_token: string; expires_in?: number },
  authUser: { id: string; email?: string },
  profile: { tenant_id: string; linked_student_ids?: unknown; first_name?: string | null; last_name?: string | null; name?: string | null; email?: string | null },
  school: PublicSchool,
  schools: PublicSchool[],
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
    needs_school_selection: false,
    user: {
      id: authUser.id,
      email: authUser.email,
      name: displayName(profile),
      tenant_id: profile.tenant_id,
      role: 'parent',
      linked_student_ids,
    },
    school: publicSchoolPayload(school, { includeId: true }),
    schools: schools.map((s) => publicSchoolPayload(s, { includeId: true })),
  };
}

function pendingSchoolPayload(
  session: { access_token: string; refresh_token: string; expires_in?: number },
  schools: PublicSchool[],
) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in ?? 3600,
    token_type: 'bearer',
    needs_school_selection: true,
    user: null,
    school: null,
    schools: schools.map((s) => publicSchoolPayload(s, { includeId: true })),
  };
}

parentAuthRouter.post('/login', loginLimiter, async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'A valid email and password are required' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
  });

  if (error || !data.session || !data.user) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const schools = await listAssignedSchoolsForAuth(data.user.id);
  if (schools.length === 0) {
    return res.status(403).json({ message: PARENT_ONLY });
  }

  const hintId = parsed.data.tenant_id?.trim();
  const hintCode = parsed.data.tenant_code?.trim();
  const hintSlug = parsed.data.slug?.trim().toLowerCase();
  const hinted = (hintId || hintCode || hintSlug)
    ? schools.find((s) =>
      (hintId && s.id === hintId)
      || (hintCode && s.tenant_code.toLowerCase() === hintCode.toLowerCase())
      || (hintSlug && s.slug === hintSlug),
    )
    : undefined;

  if (hintId || hintCode || hintSlug) {
    if (!hinted) {
      return res.status(403).json({ message: 'This account is not registered at this school' });
    }
    const profile = await parentProfileForAuth(data.user.id, hinted.id);
    if (!profile || !hasParentPortalAccess(profile)) {
      return res.status(403).json({ message: PARENT_ONLY });
    }
    return res.json(await sessionPayload(data.session, data.user, profile, hinted, schools));
  }

  if (schools.length > 1) {
    return res.json(pendingSchoolPayload(data.session, schools));
  }

  const school = schools[0]!;
  const profile = await parentProfileForAuth(data.user.id, school.id);
  if (!profile || !hasParentPortalAccess(profile)) {
    return res.status(403).json({ message: PARENT_ONLY });
  }

  return res.json(await sessionPayload(data.session, data.user, profile, school, schools));
});

parentAuthRouter.post('/select-school', loginLimiter, authMiddleware, async (req: AuthenticatedRequest, res) => {
  const parsed = SelectSchoolSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'tenant_id or slug is required' });
  }

  const schools = await listAssignedSchoolsForAuth(req.user!.id);
  if (schools.length === 0) {
    return res.status(403).json({ message: PARENT_ONLY });
  }

  const school = schools.find((s) =>
    (parsed.data.tenant_id && s.id === parsed.data.tenant_id)
    || (parsed.data.slug && s.slug === parsed.data.slug.trim().toLowerCase()),
  );
  if (!school) {
    return res.status(403).json({ message: 'This account is not registered at this school' });
  }

  const profile = await parentProfileForAuth(req.user!.id, school.id);
  if (!profile || !hasParentPortalAccess(profile)) {
    return res.status(403).json({ message: PARENT_ONLY });
  }

  const refreshToken = parsed.data.refresh_token || '';

  let session: { access_token: string; refresh_token: string; expires_in?: number };
  if (refreshToken) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }
    session = data.session;
  } else {
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!accessToken) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    session = {
      access_token: accessToken,
      refresh_token: '',
      expires_in: 3600,
    };
  }

  return res.json(await sessionPayload(session, req.user!, profile, school, schools));
});

parentAuthRouter.get('/schools', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const schools = await listAssignedSchoolsForAuth(req.user!.id);
  if (schools.length === 0) {
    return res.status(403).json({ message: PARENT_ONLY });
  }
  return res.json({ schools: schools.map((s) => publicSchoolPayload(s, { includeId: true })) });
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

  const schools = await listAssignedSchoolsForAuth(data.user.id);
  if (schools.length === 0) {
    return res.status(403).json({ message: PARENT_ONLY });
  }

  const tenantHint = typeof req.body?.tenant_id === 'string' ? req.body.tenant_id : undefined;
  const school = (tenantHint && schools.find((s) => s.id === tenantHint))
    || (schools.length === 1 ? schools[0]! : null);

  if (!school) {
    return res.json(pendingSchoolPayload(data.session, schools));
  }

  const profile = await parentProfileForAuth(data.user.id, school.id);
  if (!profile || !hasParentPortalAccess(profile)) {
    return res.status(403).json({ message: PARENT_ONLY });
  }

  return res.json(await sessionPayload(data.session, data.user, profile, school, schools));
});
