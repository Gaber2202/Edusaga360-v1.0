import React, { createContext, useContext, useMemo, useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { getJurisdictionContext } from '../api/jurisdiction';

const JurisdictionFeatureContext = createContext(null);

export function JurisdictionFeatureProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [context, setContext] = useState({ features: [], vatRate: undefined, currencyCode: undefined, jurisdiction: undefined });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      if (!isAuthenticated || !user?.tenant_id) {
        if (!cancelled) {
          setContext({ features: [], vatRate: undefined, currencyCode: undefined, jurisdiction: undefined });
          setLoading(false);
        }
        return;
      }

      try {
        const data = await getJurisdictionContext(user.tenant_id);
        if (!cancelled) {
          setContext({
            features: data.features || [],
            vatRate: data.vatRate,
            currencyCode: data.currencyCode,
            jurisdiction: data.jurisdiction,
          });
        }
      } catch (error) {
        console.warn('JurisdictionFeatureProvider: could not load context', error);
        if (!cancelled) {
          setContext({ features: [], vatRate: undefined, currencyCode: undefined, jurisdiction: undefined });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [isAuthenticated, user?.tenant_id]);

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
    () => ({ ...context, features: context.features, loading, isFeatureEnabled, areAnyEnabled }),
    [context, loading, isFeatureEnabled, areAnyEnabled],
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
