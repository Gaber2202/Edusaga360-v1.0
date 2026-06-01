/**
 * Auth helpers shared between contexts, hooks, and pages.
 *
 * SINGLE SOURCE OF TRUTH for the "is this caller a platform owner / super admin?"
 * decision. Keep this in sync with the equivalent check inside every edge function
 * under the backend/functions (where src/ imports are not available).
 */

/**
 * A user is a platform owner (super admin) when:
 *   - their platform role is 'creator' and they have no tenant; OR
 *   - their platform role is 'admin' and they have no tenant_id AND no app role.
 *
 * A tenant admin (role='admin' WITH a tenant_id) is NOT a platform owner.
 * A user who holds an app-level `user_role` is a tenant-scoped user, not a platform owner,
 * even if their platform `role` is 'admin' — this prevents a tenant admin from being
 * treated as a super admin by mistake.
 */
export function isPlatformOwner(user) {
  if (!user) return false;
  if (user.role === 'creator') return !user.tenant_id;
  if (user.role === 'admin') return !user.tenant_id && !user.user_role;
  return false;
}

/**
 * Canonical list of app-level (tenant-scoped) roles.
 * Any code that does `roleCode !== 'admin' && ...` should import and reuse this.
 */
export const VALID_APP_ROLES = [
  'admin',
  'creator',
  'ceo',
  'cfo',
  'hr_head',
  'it_user',
  'accountant',
  'teacher',
  'parent',
  'hr_admin',
  'hr_officer',
  'finance',
  'branch_manager',
  'procurement',
  'admissions',
  'collections',
  'auditor',
  'crm_agent',
  'it_admin',
  'it_support',
  'facilities_manager',
  'content_manager',
];

/**
 * Default role for tenant users whose admin hasn't yet assigned an app role.
 * Intentionally the *least* privileged role — the user will see a banner asking
 * their administrator to assign them a role before they can use the product.
 *
 * DO NOT change this to 'admin' — that would silently elevate every un-onboarded
 * user to tenant-wide admin access.
 */
export const DEFAULT_UNASSIGNED_ROLE = 'unassigned';
