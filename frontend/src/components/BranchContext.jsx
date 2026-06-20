import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery } from '../api/supabaseClient';
import { useTenant } from './TenantContext';
import { useRole } from './RoleContext';

const BranchContext = createContext();

export function BranchProvider({ children }) {
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const { tenant } = useTenant();
  const { user, isCreator } = useRole();
  
  const tenantId = tenant?.id || user?.tenant_id;
  const isPlatformOwner = isCreator() && !tenantId;

  const { data: branches = [], isLoading } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: async () => {
      if (isPlatformOwner) {
        const { data } = await tenantQuery('branches').select('*').match({ is_active: true });
        return data || [];
      }
      if (!tenantId) return [];
      const { data } = await tenantQuery('branches').select('*').match({ is_active: true, tenant_id: tenantId });
      return data || [];
    },
    enabled: isPlatformOwner || !!tenantId,
  });

  useEffect(() => {
    const saved = localStorage.getItem('erp_selected_branch');
    if (saved && saved !== 'all') {
      setSelectedBranchId(saved);
    }
  }, []);

  const selectBranch = (branchId) => {
    setSelectedBranchId(branchId === 'all' ? null : branchId);
    localStorage.setItem('erp_selected_branch', branchId || 'all');
  };

  const selectedBranch = branches.find(b => b.id === selectedBranchId);

  const filterByBranch = (items) => {
    const list = Array.isArray(items) ? items : [];
    if (!selectedBranchId) return list;
    return list.filter(item => item.branch_id === selectedBranchId);
  };

  /**
   * Compose a filter object that scopes by the currently selected branch.
   *
   * Intended composition with useTenantFilter: `tenantFilter(branchFilter({ status: 'active' }))`.
   * When "All branches" is selected (selectedBranchId === null) this is a no-op
   * — it returns `extra` unchanged and the query fetches cross-branch data
   * (useful for consolidated reports / aggregations).
   *
   * When a single branch is selected, `branch_id` is added to the filter so
   * the server returns only that branch's rows instead of every row for the
   * tenant. For large tenants this is the difference between a 10k-row read
   * paginated into a UI that only ever renders 500.
   *
   * Call sites should continue to pass the resulting data through
   * `filterByBranch(items)` — when `branch_id` is already in the filter that's
   * a cheap no-op, but it remains correct if the server ever returns cross-
   * branch data (e.g. a cached response from before the branch was selected).
   */
  const branchFilter = (extra = {}) => {
    if (!selectedBranchId) return extra;
    return { branch_id: selectedBranchId, ...extra };
  };

  // Memoize context value to prevent unnecessary re-renders
  const value = React.useMemo(() => ({
    branches,
    selectedBranchId,
    selectedBranch,
    selectBranch,
    filterByBranch,
    branchFilter,
    isLoading
  }), [branches, selectedBranchId, selectedBranch, isLoading]);

  return (
    <BranchContext.Provider value={value}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return context;
}

export default BranchContext;