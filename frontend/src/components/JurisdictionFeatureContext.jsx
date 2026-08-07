import React, { createContext, useContext, useMemo, useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../api/supabaseClient';

const JurisdictionFeatureContext = createContext(null);

export function JurisdictionFeatureProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      if (!isAuthenticated || !user?.tenant_id) {
        if (!cancelled) {
          setFeatures([]);
          setLoading(false);
        }
        return;
      }

      const { data: tenantRecord, error: tenantError } = await supabase
        .from('tenants')
        .select('jurisdiction_code')
        .eq('id', user.tenant_id)
        .single();

      if (tenantError || !tenantRecord?.jurisdiction_code || cancelled) {
        if (!cancelled) {
          setFeatures([]);
          setLoading(false);
        }
        return;
      }

      const { data: rows, error } = await supabase
        .from('jurisdiction_features')
        .select('feature_key, enabled')
        .eq('jurisdiction_code', tenantRecord.jurisdiction_code);

      if (!cancelled) {
        if (error) {
          console.warn('JurisdictionFeatureProvider: could not load features', error);
          setFeatures([]);
        } else {
          setFeatures(rows || []);
        }
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [isAuthenticated, user?.tenant_id]);

  const enabledSet = useMemo(() => {
    const set = new Set();
    for (const f of features) {
      if (f.enabled) set.add(f.feature_key);
    }
    return set;
  }, [features]);

  const isFeatureEnabled = useMemo(() => (key) => enabledSet.has(key), [enabledSet]);
  const areAnyEnabled = useMemo(
    () => (keys) => keys.some((k) => enabledSet.has(k)),
    [enabledSet],
  );

  const value = useMemo(
    () => ({ features, loading, isFeatureEnabled, areAnyEnabled }),
    [features, loading, isFeatureEnabled, areAnyEnabled],
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
