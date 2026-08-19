import { supabase } from './supabase.js';

export const SCHOOL_NOT_FOUND = 'School not found';
export const PARENT_ONLY = 'This API is for parent accounts only';
export const NOT_AT_SCHOOL = 'This account is not registered at this school';

export interface PublicSchool {
  id: string;
  slug: string;
  tenant_code: string;
  name_en: string | null;
  name_ar: string | null;
  logo_url: string | null;
  status: string | null;
}

export interface ParentUserRow {
  id: string;
  email: string | null;
  name: string | null;
  tenant_id: string;
  user_role: string | null;
  linked_student_ids: unknown;
  status?: string | null;
}

export function hasParentPortalAccess(row: {
  user_role?: string | null;
  linked_student_ids?: unknown;
} | null | undefined): boolean {
  if (!row) return false;
  if (row.user_role === 'parent') return true;
  return Array.isArray(row.linked_student_ids) && row.linked_student_ids.length > 0;
}

export function linkedStudentIds(row: { linked_student_ids?: unknown } | null | undefined): string[] {
  return Array.isArray(row?.linked_student_ids)
    ? [...new Set((row!.linked_student_ids as unknown[]).filter((id): id is string => typeof id === 'string' && id.length > 0))]
    : [];
}

/**
 * Parent children must already exist on the school student list.
 * Stored linked_student_ids that are missing, and students found via the
 * parent's guardian email, are intersected with `students` for this tenant.
 */
export async function resolveRosterStudentIds(opts: {
  tenantId: string;
  email?: string | null;
  linkedIds: string[];
}): Promise<string[]> {
  const claimed = [...new Set(opts.linkedIds.filter(Boolean))];
  const found = new Set<string>();

  if (opts.email) {
    const { data: guardian } = await supabase
      .from('guardians')
      .select('id')
      .eq('tenant_id', opts.tenantId)
      .ilike('email', opts.email.trim())
      .maybeSingle();
    const guardianId = (guardian as { id?: string } | null)?.id;
    if (guardianId) {
      const { data: byGuardian } = await supabase
        .from('students')
        .select('id')
        .eq('tenant_id', opts.tenantId)
        .eq('guardian_id', guardianId);
      for (const row of byGuardian ?? []) {
        if (row?.id) found.add(row.id as string);
      }
    }
  }

  const wanted = [...new Set([...claimed, ...found])];
  if (wanted.length === 0) return [];

  const { data: roster } = await supabase
    .from('students')
    .select('id')
    .eq('tenant_id', opts.tenantId)
    .in('id', wanted);

  const existing = new Set((roster ?? []).map((row) => row.id as string).filter(Boolean));
  return wanted.filter((id) => existing.has(id));
}

function isPubliclyListed(row: PublicSchool): boolean {
  if (!row.slug) return false;
  return row.status === 'active' || row.status === 'trial';
}

export function publicSchoolPayload(row: PublicSchool) {
  return {
    name_en: row.name_en,
    name_ar: row.name_ar,
    slug: row.slug,
    logo_url: row.logo_url,
    tenant_code: row.tenant_code,
  };
}

export async function findListedSchool(opts: {
  tenantCode?: string;
  slug?: string;
}): Promise<PublicSchool | null> {
  const code = opts.tenantCode?.trim();
  const slug = opts.slug?.trim().toLowerCase();
  if (!code && !slug) return null;

  let query = supabase
    .from('tenants')
    .select('id, slug, tenant_code, name_en, name_ar, logo_url, status');

  if (code) {
    query = query.ilike('tenant_code', code);
  } else if (slug) {
    query = query.eq('slug', slug);
  }

  const { data } = await query.maybeSingle();
  const row = data as PublicSchool | null;
  if (!row || !isPubliclyListed(row)) return null;
  return row;
}

export async function parentProfileForAuth(
  authId: string,
  tenantId?: string,
): Promise<ParentUserRow | null> {
  let query = supabase
    .from('users')
    .select('id, email, name, tenant_id, user_role, linked_student_ids, status')
    .eq('auth_id', authId);

  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }

  const { data } = await query.maybeSingle();
  return (data as ParentUserRow | null) ?? null;
}
