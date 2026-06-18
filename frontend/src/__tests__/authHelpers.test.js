/**
 * Platform-owner / super-admin determination — multi-tenant safety.
 *
 * This is the single source of truth for "can this caller see ALL tenants?".
 * A bug here is a cross-tenant data-leak: a tenant admin must NEVER be treated
 * as a platform owner. Covers priority scenario #4 (tenant isolation) and the
 * auth-flow requirement (#8).
 */
import { describe, it, expect } from 'vitest';
import { isPlatformOwner, VALID_APP_ROLES, DEFAULT_UNASSIGNED_ROLE } from '@/lib/authHelpers';

describe('isPlatformOwner', () => {
  it('treats a creator with no tenant as a platform owner', () => {
    expect(isPlatformOwner({ role: 'creator', tenant_id: null })).toBe(true);
    expect(isPlatformOwner({ role: 'creator' })).toBe(true);
  });

  it('treats a bare admin (no tenant, no app role) as a platform owner', () => {
    expect(isPlatformOwner({ role: 'admin', tenant_id: null })).toBe(true);
  });

  it('does NOT treat a tenant-scoped admin as a platform owner (no cross-tenant access)', () => {
    expect(isPlatformOwner({ role: 'admin', tenant_id: 'tenant-A' })).toBe(false);
  });

  it('does NOT treat a creator WITH a tenant as a platform owner', () => {
    expect(isPlatformOwner({ role: 'creator', tenant_id: 'tenant-A' })).toBe(false);
  });

  it('does NOT elevate an admin who holds an app-level role', () => {
    // A tenant admin who also has a user_role is tenant-scoped, not super-admin.
    expect(isPlatformOwner({ role: 'admin', tenant_id: null, user_role: 'finance' })).toBe(false);
  });

  it('returns false for ordinary roles and for null users', () => {
    expect(isPlatformOwner({ role: 'teacher', tenant_id: 'tenant-A' })).toBe(false);
    expect(isPlatformOwner({ role: 'parent' })).toBe(false);
    expect(isPlatformOwner(null)).toBe(false);
    expect(isPlatformOwner(undefined)).toBe(false);
  });
});

describe('role catalogue invariants', () => {
  it('exposes the canonical app roles without duplicates', () => {
    expect(VALID_APP_ROLES).toContain('admin');
    expect(VALID_APP_ROLES).toContain('finance');
    expect(VALID_APP_ROLES).toContain('teacher');
    expect(new Set(VALID_APP_ROLES).size).toBe(VALID_APP_ROLES.length);
  });

  it('keeps the unassigned default as the least-privileged role (never admin)', () => {
    expect(DEFAULT_UNASSIGNED_ROLE).toBe('unassigned');
    expect(VALID_APP_ROLES).not.toContain(DEFAULT_UNASSIGNED_ROLE);
  });
});
