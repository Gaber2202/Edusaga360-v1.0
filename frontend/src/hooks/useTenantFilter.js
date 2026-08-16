import { useTenant } from '../components/TenantContext';
import { useRole } from '../components/RoleContext';
import { tenantQuery } from '../api/supabaseClient';
import { useQuery } from '@tanstack/react-query';

/**
 * Central hook for tenant-scoped data access.
 * 
 * - For platform owners (creator with no tenant): returns all data (no filter)
 * - For tenant users: automatically injects tenant_id into every query
 * - Records with null/missing tenant_id are NEVER shown to tenant users
 */
export function useTenantFilter() {
  const { tenant } = useTenant();
  const { user, isCreator } = useRole();

  const tenantId = tenant?.id || user?.tenant_id || null;
  const isPlatformOwner = isCreator() && !tenantId;

  const tenantFilter = (additionalFilters = {}) => {
    // tenantQuery() already injects the tenant_id row filter on select/insert/
    // update/delete, so tenantFilter must not add it again. This avoids duplicate
    // tenant_id query parameters like ...&tenant_id=eq.x&tenant_id=eq.x.
    return additionalFilters;
  };

  const useTenantQuery = (queryKey, entityName, filters = {}, sort = '-created_at', limit = undefined, enabled = true) => {
    const filter = tenantFilter(filters);
    const hasTenantAccess = isPlatformOwner || !!tenantId;

    return useQuery({
      queryKey: [queryKey, tenantId, JSON.stringify(filters)],
      queryFn: async () => {
        const tableName = entityName.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase() + (!entityName.toLowerCase().endsWith('s') ? 's' : '');
        let query = tenantQuery(tableName).select('*');
        
        if (Object.keys(filter).length > 0) {
          query = query.match(filter);
        }
        
        if (sort) {
          const desc = sort.startsWith('-');
          const col = desc ? sort.slice(1) : sort;
          query = query.order(col, { ascending: !desc });
        }
        
        if (limit) {
          query = query.limit(limit);
        }
        
        const { data, error } = await query;
        if (error) {
          console.error(`Error fetching ${entityName}:`, error);
          return [];
        }
        return data || [];
      },
      enabled: enabled && hasTenantAccess,
      initialData: [],
    });
  };

  const getTenantIdForCreate = () => {
    if (isPlatformOwner) return undefined;
    return tenantId || undefined;
  };

  return {
    tenantId,
    isPlatformOwner,
    tenantFilter,
    tenantQuery: useTenantQuery,
    getTenantIdForCreate,
    hasTenantAccess: isPlatformOwner || !!tenantId,
  };
}

export default useTenantFilter;
