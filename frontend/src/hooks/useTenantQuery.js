import { useQuery } from '@tanstack/react-query';
import { supabase } from '../api/supabaseClient';
import { useTenant } from '../components/TenantContext';
import { useRole } from '../components/RoleContext';

/**
 * Tenant-aware data fetching hook.
 * Automatically filters entity queries by the current user's tenant_id.
 * Super admins (creator role with no tenant) see all data.
 * 
 * Usage:
 *   const { data, isLoading } = useTenantQuery('employees', 'Employee', { status: 'active' });
 */
export function useTenantQuery(queryKey, entityName, filters = {}, sortBy = '-created_at', limit) {
  const { tenant } = useTenant();
  const { user, isCreator } = useRole();

  const tenantId = tenant?.id || user?.tenant_id;
  const isPlatformOwner = isCreator() && !tenantId;

  // Build the final filter: always inject tenant_id unless platform owner
  // If tenantId is unknown (null/undefined) for a non-platform-owner, block all data
  const tenantFilter = isPlatformOwner
    ? { ...filters }
    : { ...filters, tenant_id: tenantId || '__BLOCK_ALL__' };

  return useQuery({
    queryKey: [queryKey, tenantId, JSON.stringify(filters)],
    queryFn: async () => {
      // Hard block: never fetch data if tenant is not yet resolved for tenant users
      if (!isPlatformOwner && !tenantId) return [];
      const entity = supabase.from(entityName);
      if (!entity) {
        console.error(`Entity "${entityName}" not found`);
        return [];
      }
      if (Object.keys(tenantFilter).length > 0) {
        return entity.filter(tenantFilter, sortBy, limit);
      }
      return entity.list(sortBy, limit);
    },
    enabled: isPlatformOwner || !!tenantId,
    initialData: [],
  });
}

/**
 * Helper to inject tenant_id into data before create/update.
 */
export function useTenantMutation() {
  const { tenant } = useTenant();
  const { user, isCreator } = useRole();

  const tenantId = tenant?.id || user?.tenant_id;
  const tenantCode = tenant?.tenant_code || user?.tenant_code;

  const injectTenantId = (data) => {
    if (isCreator() && !tenantId) return data; // platform owner
    return {
      ...data,
      tenant_id: tenantId,
      tenant_code: tenantCode,
    };
  };

  return { injectTenantId, tenantId, tenantCode };
}

export default useTenantQuery;