import React, { createContext, useContext, useMemo, useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { getJurisdictionContext } from '../api/jurisdiction';

const JurisdictionFeatureContext = createContext(null);

function resolveTenantId(user) {
  // tenant_id/role must only come from admin-writable app_metadata.
  // user_metadata is user-writable and is not a trustworthy source.
  return user?.app_metadata?.tenant_id || null;
}

export function JurisdictionFeatureProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const tenantId = resolveTenantId(user);
  const [context, setContext] = useState({ features: [], vatRate: undefined, currencyCode: undefined, jurisdiction: undefined });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      setError(null);
      if (!isAuthenticated || !tenantId) {
        if (!cancelled) {
          setContext({ features: [], vatRate: undefined, currencyCode: undefined, jurisdiction: undefined });
          setLoading(false);
        }
        return;
      }

      try {
        const data = await getJurisdictionContext(tenantId);
        if (!cancelled) {
          setContext({
            features: data.features || [],
            vatRate: data.vatRate,
            currencyCode: data.currencyCode,
            jurisdiction: data.jurisdiction,
          });
        }
      } catch (error) {
        console.error('JurisdictionFeatureProvider: could not load context', error);
        if (!cancelled) {
          setContext({ features: [], vatRate: undefined, currencyCode: undefined, jurisdiction: undefined });
          setError(error);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [isAuthenticated, tenantId]);

  const enabledSet = useMemo(() => {
    const set = new Set();
    for (const key of context.features) {
      set.add(key);
    }
    return set;
  }, [context.features]);

  const isFeatureEnabled = useMemo(() => (key) => enabledSet.has(key), [enabledSet]);
  const areAnyEnabled = useMemo(
    () => (keys) => keys.some((k) => enabledSet.has(k)),
    [enabledSet],
  );

  const value = useMemo(
    () => ({ ...context, features: context.features, loading, error, isFeatureEnabled, areAnyEnabled }),
    [context, loading, error, isFeatureEnabled, areAnyEnabled],
  );

  return (
    <JurisdictionFeatureContext.Provider value={value}>
      {children}
    </JurisdictionFeatureContext.Provider>
  );
}

export function useJurisdictionFeatures() {
  const ctx = useContext(JurisdictionFeatureContext);
  if (!ctx) {
    throw new Error('useJurisdictionFeatures must be used within JurisdictionFeatureProvider');
  }
  return ctx;
}

export default JurisdictionFeatureContext;
