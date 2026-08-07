import { useJurisdictionFeatures } from './JurisdictionFeatureContext';

/**
 * Component-level gate for jurisdiction features.
 * Renders children only when at least one of the required feature keys is
 * enabled for the current tenant's jurisdiction. Otherwise renders nothing.
 */
export default function JurisdictionFeatureGate({ featureKeys, children, fallback = null }) {
  const { loading, areAnyEnabled } = useJurisdictionFeatures();
  if (loading) return null;
  if (!areAnyEnabled(featureKeys)) return fallback;
  return children;
}
