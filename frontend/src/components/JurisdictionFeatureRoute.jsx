import React from 'react';
import { useJurisdictionFeatures } from './JurisdictionFeatureContext';
import PageNotFound from '../lib/PageNotFound';

/**
 * Route-level gate for jurisdiction features.
 * Renders children only when at least one of the required feature keys is
 * enabled for the current tenant's jurisdiction. Otherwise renders a 404 so
 * the page is absent, not greyed out or empty.
 */
export default function JurisdictionFeatureRoute({ featureKeys, children }) {
  const { loading, areAnyEnabled } = useJurisdictionFeatures();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-border border-t-najdi-700 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!areAnyEnabled(featureKeys)) {
    return <PageNotFound />;
  }

  return children;
}
