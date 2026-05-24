import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRole } from './RoleContext';
import { useTenant } from './TenantContext';
import { setTenantContext } from '../api/supabaseClient';
import { isPlatformOwner } from '../lib/authHelpers';

/**
 * Syncs the React-tree auth state into the module-level tenant context used by
 * the tenant-scoped `base44` client (src/api/base44Client.js).
 *
 * Also clears the React-Query cache whenever the effective tenant changes,
 * so a signed-in platform admin switching between tenants (or any transient
 * "no tenant → tenant" boot sequence) can't serve stale cross-tenant rows from
 * React-Query's in-memory cache.
 *
 * Must be rendered inside both RoleProvider and TenantProvider. It renders nothing.
 */
export default function TenantContextSyncer() {
  const { user, loading: roleLoading } = useRole();
  const { tenant, tenantLoading } = useTenant();
  const queryClient = useQueryClient();
  const lastKeyRef = useRef(null);

  useEffect(() => {
    // Wait until both providers have finished their initial load so we don't flash
    // the ready=true context with a stale tenantId.
    if (roleLoading || tenantLoading) return;

    const effectiveTenantId = tenant?.id || user?.tenant_id || null;
    const platformOwner = isPlatformOwner(user);
    setTenantContext({ tenantId: effectiveTenantId, isPlatformOwner: platformOwner });

    const key = `${platformOwner ? '*' : ''}|${effectiveTenantId || ''}`;
    if (lastKeyRef.current !== null && lastKeyRef.current !== key) {
      queryClient.clear();
    }
    lastKeyRef.current = key;
  }, [user, tenant, roleLoading, tenantLoading, queryClient]);

  return null;
}
