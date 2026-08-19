import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';
import {
  hasParentPortalAccess,
  linkedStudentIds,
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
  const row = await parentProfileForAuth(req.user!.id, req.user?.tenant_id);
  if (!row || !hasParentPortalAccess(row)) {
    return res.status(403).json({ message: PARENT_ONLY });
  }

  const tenantId = req.user?.tenant_id || row.tenant_id;
  if (!tenantId) {
    return res.status(403).json({ message: 'No tenant assigned to user' });
  }
  if (row.tenant_id && tenantId !== row.tenant_id) {
    return res.status(403).json({ message: PARENT_ONLY });
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
