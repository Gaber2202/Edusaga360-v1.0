import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';
import {
  hasParentPortalAccess,
  linkedStudentIds,
  listParentProfilesForAuth,
  parentProfileForAuth,
  resolveRosterStudentIds,
  PARENT_ONLY,
} from '../lib/parentSchool.js';

export interface ParentScope {
  tenantId: string;
  linkedIds: string[];
  profile: {
    id: string;
    email: string | null;
    name: string | null;
  };
}

export interface ParentRequest extends AuthenticatedRequest {
  parent: ParentScope;
}

/** JWT role may be teacher for dual-role staff; the users row is authoritative. */
export function requireParent(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  return next();
}

export async function attachParentScope(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const headerTenant = (req.headers['x-tenant-id'] as string | undefined)?.trim();
  const preferredTenant = headerTenant || req.user?.tenant_id;

  let row = preferredTenant
    ? await parentProfileForAuth(req.user!.id, preferredTenant)
    : null;

  // Multi-school parents: JWT may omit tenant_id — fall back to first assigned profile.
  if (!row) {
    const profiles = await listParentProfilesForAuth(req.user!.id);
    if (preferredTenant) {
      row = profiles.find((p) => p.tenant_id === preferredTenant) ?? null;
    } else if (profiles.length === 1) {
      row = profiles[0] ?? null;
    } else if (profiles.length > 1) {
      return res.status(400).json({
        message: 'Select a school',
        code: 'school_selection_required',
      });
    }
  }

  if (!row || !hasParentPortalAccess(row)) {
    return res.status(403).json({ message: PARENT_ONLY });
  }

  // If client sent X-Tenant-Id, it must match a profile they own.
  if (headerTenant && row.tenant_id !== headerTenant) {
    return res.status(403).json({ message: PARENT_ONLY });
  }

  const tenantId = row.tenant_id;
  if (!tenantId) {
    return res.status(403).json({ message: 'No tenant assigned to user' });
  }

  const linkedIds = await resolveRosterStudentIds({
    tenantId,
    email: row.email ?? req.user?.email,
    linkedIds: linkedStudentIds(row),
  });

  (req as ParentRequest).parent = {
    tenantId,
    linkedIds,
    profile: {
      id: row.id,
      email: row.email ?? req.user?.email ?? null,
      name: row.name ?? null,
    },
  };
  return next();
}

export function scopedStudentIds(req: ParentRequest, studentId?: string): string[] | { status: number; message: string } {
  const linked = req.parent.linkedIds;
  if (!studentId) return linked;
  if (!linked.includes(studentId)) {
    return { status: 403, message: 'Not authorized for this student' };
  }
  return [studentId];
}
