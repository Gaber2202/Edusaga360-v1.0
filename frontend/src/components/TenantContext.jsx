import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../api/supabaseClient';
import { isPlatformOwner } from '../lib/authHelpers';
import { getJurisdictionContext, clearJurisdictionContext } from '../api/jurisdiction';

const TenantContext = createContext(null);

const SELECTED_BRANCH_KEY = 'erp_selected_branch';

function getStoredBranchId() {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(SELECTED_BRANCH_KEY);
  if (!raw || raw === 'all') return null;
  return raw;
}

function setStoredBranchId(branchId) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SELECTED_BRANCH_KEY, branchId || 'all');
}

/**
 * Build a localization object that deliberately has no currency when the
 * selected scope spans multiple currencies. ADR-008: no combined total and
 * no fabricated presentation currency for mixed-currency groups.
 */
function mixedCurrencyLocalization(base, currencies) {
  return {
    ...base,
    currencyCode: null,
    currencySymbol: { en: '', ar: '' },
    isMultiCurrency: true,
    currencies: currencies.map((c) => ({
      jurisdiction: c.jurisdiction,
      currencyCode: c.currencyCode,
      currencySymbol: c.localization?.currencySymbol || { en: c.currencyCode, ar: c.currencyCode },
    })),
  };
}

/**
 * TenantProvider — loads the current user's tenant record and exposes it.
 * Also augments the tenant with the backend-resolved jurisdiction context
 * (VAT rate, currency code, jurisdiction code) so components like
 * VATManagement and InvoiceForm can read them from the tenant object.
 * Must be placed INSIDE RoleProvider so it can receive user from auth.
 */
export function TenantProvider({ user, children }) {
  const [tenant, setTenant] = useState(null);
  const [tenantLoading, setTenantLoading] = useState(true);
  const [tenantLoadingError, setTenantLoadingError] = useState(null);
  const [selectedBranchId, setSelectedBranchId] = useState(() => getStoredBranchId());

  // Listen for branch changes from BranchContext (same window) and from other tabs.
  useEffect(() => {
    const onStorage = () => setSelectedBranchId(getStoredBranchId());
    const onBranchChanged = (e) => setSelectedBranchId(e.detail?.branchId === 'all' ? null : e.detail?.branchId || null);
    window.addEventListener('storage', onStorage);
    window.addEventListener('erp-branch-changed', onBranchChanged);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('erp-branch-changed', onBranchChanged);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setTenant(null);
      setTenantLoading(false);
      setTenantLoadingError(null);
      return;
    }
    loadTenant(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.tenant_id, selectedBranchId]);

  const loadTenant = async (u) => {
    setTenantLoading(true);
    setTenantLoadingError(null);
    let tenantData = null;

    try {
      // creator/platform owner has no tenant — they manage all tenants
      if (isPlatformOwner(u)) {
        setTenant(null);
        setTenantLoading(false);
        return;
      }

      if (u.tenant_id) {
        const { data } = await supabase.from('tenants').select('*').eq('id', u.tenant_id);
        tenantData = data?.[0] || null;
      } else if (u.tenant_code) {
        const { data } = await supabase.from('tenants').select('*').eq('tenant_code', u.tenant_code);
        tenantData = data?.[0] || null;
      }

      if (!tenantData) {
        setTenant(null);
        setTenantLoading(false);
        return;
      }

      // Always refresh the cache when the branch changes so we do not reuse a
      // tenant-level localization for a branch-level request.
      clearJurisdictionContext();

      try {
        // Load branches to detect a mixed-currency scope. The branch list is
        // small; it doubles as the source for branch-level context resolution.
        const { data: branches } = await supabase
          .from('branches')
          .select('id, name_en, jurisdiction_code')
          .eq('tenant_id', tenantData.id)
          .eq('status', 'active');

        const activeBranches = branches ?? [];
        const selectedBranch = activeBranches.find((b) => b.id === selectedBranchId);

        let ctx = null;
        let localization = null;
        let isMultiCurrency = false;
        let currencies = [];

        const loadContext = async (branchId) => {
          try {
            return await getJurisdictionContext(tenantData.id, branchId);
          } catch (e) {
            console.error('TenantContext: could not resolve jurisdiction context', { tenantId: tenantData.id, branchId }, e);
            setTenantLoadingError(e);
            return null;
          }
        };

        if (selectedBranch) {
          // Branch-level jurisdiction context: currency, VAT, calendar, locale.
          ctx = await loadContext(selectedBranchId);
          localization = ctx?.localization ?? null;
        } else if (activeBranches.length > 0) {
          // "All Branches" or no explicit branch selected. Resolve each branch's
          // currency so we can detect multi-currency groups per ADR-008.
          const branchContexts = await Promise.all(
            activeBranches.map(async (b) => loadContext(b.id)),
          );

          const defined = branchContexts.filter(Boolean);
          const distinct = [...new Map(defined.map((c) => [c.currencyCode, c])).values()];
          currencies = distinct;

          if (distinct.length === 1) {
            // Single-currency group (all branches share the same currency).
            ctx = distinct[0];
            localization = ctx?.localization ?? null;
          } else if (distinct.length > 1) {
            // Multi-currency group: do not pick one currency or fabricate a sum.
            isMultiCurrency = true;
            const tenantCtx = await loadContext();
            if (tenantCtx) {
              localization = mixedCurrencyLocalization(tenantCtx.localization ?? {}, distinct);
              ctx = { ...tenantCtx, currencyCode: null, localization };
            }
          } else {
            // No branches resolved; fall back to tenant context.
            ctx = await loadContext();
            localization = ctx?.localization ?? null;
          }
        } else {
          // No active branches; use tenant fallback.
          ctx = await loadContext();
          localization = ctx?.localization ?? null;
        }

        if (ctx) {
          tenantData = {
            ...tenantData,
            vat_rate: ctx.vatRate,
            currency_code: ctx.currencyCode,
            jurisdiction_code: ctx.jurisdiction,
            localization,
            selected_branch_id: selectedBranchId,
            is_multi_currency: isMultiCurrency,
            branch_currencies: currencies,
          };
        }
      } catch (jurisdictionErr) {
        console.error('TenantContext: branch/jurisdiction resolution failed', jurisdictionErr);
        setTenantLoadingError(jurisdictionErr);
        // tenantData stays as the base row so the app remains usable
      }

      setTenant(tenantData);
    } catch (e) {
      console.error('TenantContext: could not load tenant', e);
      setTenantLoadingError(e);
      setTenant(null);
    } finally {
      setTenantLoading(false);
    }
  };

  // Resolved tenant ID — from tenant record or user record
  const tenantId = tenant?.id || user?.tenant_id || null;

  const isModuleEnabled = React.useCallback((moduleKey) => {
    if (!tenant) return true;
    if (!tenant.enabled_modules || tenant.enabled_modules.length === 0) return true;
    return tenant.enabled_modules.includes(moduleKey);
  }, [tenant]);

  const checkLimit = React.useCallback((limitKey) => {
    if (!tenant) return { allowed: true, current: 0, max: Infinity };
    const limitMap = {
      employees: { current: tenant.current_employees || 0, max: tenant.max_employees || 9999 },
      students:  { current: tenant.current_students  || 0, max: tenant.max_students  || 9999 },
      branches:  { current: tenant.current_branches  || 0, max: tenant.max_branches  || 9999 },
      yamen_ai:  { current: tenant.yamen_ai_used_this_month || 0, max: tenant.yamen_ai_monthly_limit || 9999 },
    };
    const entry = limitMap[limitKey];
    if (!entry) return { allowed: true, current: 0, max: Infinity };
    return { allowed: entry.current < entry.max, current: entry.current, max: entry.max };
  }, [tenant]);

  const isTenantActive = React.useCallback(() => {
    if (!tenant) return true;
    if (tenant.status === 'trial' && tenant.trial_end_date) {
      return new Date(tenant.trial_end_date) >= new Date();
    }
    return ['active'].includes(tenant.status);
  }, [tenant]);

  const needsOnboarding = React.useCallback(() => {
    if (!tenant) return false;
    return tenant.onboarding_completed === false;
  }, [tenant]);

  const isTrialExpired = React.useCallback(() => {
    if (!tenant || tenant.status !== 'trial') return false;
    if (!tenant.trial_end_date) return false;
    return new Date(tenant.trial_end_date) < new Date();
  }, [tenant]);

  const refreshTenant = React.useCallback(() => {
    if (user) loadTenant(user);
  }, [user]);

  const selectBranch = React.useCallback((branchId) => {
    const id = branchId === 'all' ? null : branchId;
    setSelectedBranchId(id);
    setStoredBranchId(id);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('erp-branch-changed', { detail: { branchId: id || 'all' } }));
    }
  }, []);

  const value = React.useMemo(() => ({
    tenant,
    tenantId,
    tenantLoading,
    tenantLoadingError,
    selectedBranchId,
    selectBranch,
    isModuleEnabled,
    checkLimit,
    isTenantActive,
    isTrialExpired,
    needsOnboarding,
    refreshTenant,
  }), [tenant, tenantId, tenantLoading, tenantLoadingError, selectedBranchId, isModuleEnabled, checkLimit, isTenantActive, isTrialExpired, needsOnboarding, refreshTenant, selectBranch]);

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    // Safe fallback — don't crash if used outside provider
    return {
      tenant: null,
      tenantLoading: false,
      tenantLoadingError: null,
      selectedBranchId: null,
      selectBranch: () => {},
      isModuleEnabled: () => true,
      checkLimit: () => ({ allowed: true, current: 0, max: Infinity }),
      isTenantActive: () => true,
      isTrialExpired: () => false,
      needsOnboarding: () => false,
      refreshTenant: () => {},
    };
  }
  return ctx;
}

export default TenantContext;
