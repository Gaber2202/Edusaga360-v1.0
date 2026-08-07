import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../api/supabaseClient';
import { isPlatformOwner } from '../lib/authHelpers';
import { getJurisdictionContext } from '../api/jurisdiction';

const TenantContext = createContext(null);

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

  useEffect(() => {
    if (!user) {
      setTenant(null);
      setTenantLoading(false);
      return;
    }
    loadTenant(user);
  }, [user?.id, user?.tenant_id]);

  const loadTenant = async (u) => {
    setTenantLoading(true);
    try {
      // creator/platform owner has no tenant — they manage all tenants
      if (isPlatformOwner(u)) {
        setTenant(null);
        setTenantLoading(false);
        return;
      }

      let tenantData = null;
      if (u.tenant_id) {
        const { data } = await supabase.from('tenants').select('*').eq('id', u.tenant_id);
        tenantData = data?.[0] || null;
      } else if (u.tenant_code) {
        const { data } = await supabase.from('tenants').select('*').eq('tenant_code', u.tenant_code);
        tenantData = data?.[0] || null;
      }

      if (tenantData) {
        try {
          const ctx = await getJurisdictionContext(tenantData.id);
          tenantData = {
            ...tenantData,
            vat_rate: ctx.vatRate,
            currency_code: ctx.currencyCode,
            jurisdiction_code: ctx.jurisdiction,
          };
        } catch (e) {
          console.warn('TenantContext: could not load jurisdiction context', e);
        }
      }

      setTenant(tenantData);
    } catch (e) {
      console.warn('TenantContext: could not load tenant', e);
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

  const value = React.useMemo(() => ({
    tenant,
    tenantId,
    tenantLoading,
    isModuleEnabled,
    checkLimit,
    isTenantActive,
    isTrialExpired,
    needsOnboarding,
    refreshTenant,
  }), [tenant, tenantId, tenantLoading, isModuleEnabled, checkLimit, isTenantActive, isTrialExpired, needsOnboarding, refreshTenant]);

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
