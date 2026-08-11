import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTenantContext, subscribeTenantContext } from '../api/supabaseClient';

/**
 * React Query hook wrapper for tenant-scoped queries.
 *
 * The query is disabled until the module-level tenant context (set by
 * TenantContextSyncer) is ready. This prevents tenantQuery from being called
 * before the tenant id is known, so it cannot return an empty result or throw
 * a retry-able error.
 *
 * The queryFn may call tenantQuery or any other async work. Callers are still
 * responsible for including the tenant id in the queryKey so React Query
 * refetches when the tenant changes.
 */
export function useTenantQuery(queryKey, queryFn, options = {}) {
  const tenantCtx = useSyncExternalStore(subscribeTenantContext, getTenantContext);
  const tenantReady = tenantCtx.isPlatformOwner || !!tenantCtx.tenantId;
  const { enabled: callerEnabled = true, ...rest } = options;

  return useQuery({
    queryKey,
    queryFn,
    ...rest,
    enabled: tenantReady && callerEnabled,
  });
}

export default useTenantQuery;
