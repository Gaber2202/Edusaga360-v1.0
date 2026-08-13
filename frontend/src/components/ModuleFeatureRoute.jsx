import { Navigate } from 'react-router-dom';
import { useTenant } from './TenantContext';

/**
 * Route-level gate for module feature flags.
 *
 * Reuses the same pattern as JurisdictionFeatureRoute but checks
 * tenant.enabled_modules (with the DEFAULT_ENABLED_MODULES fallback).
 *
 * @param {string|string[]} moduleKeys - module flag key(s) that grant access
 * @param {ReactNode} children - the page to render if any module key is enabled
 * @param {ReactNode} fallback - optional custom fallback; defaults to redirect to Dashboard
 */
export default function ModuleFeatureRoute({ moduleKeys, children, fallback = null }) {
  const { isModuleEnabled } = useTenant();
  const keys = Array.isArray(moduleKeys) ? moduleKeys : [moduleKeys];
  const enabled = keys.some((k) => isModuleEnabled(k));

  if (enabled) return children;
  if (fallback) return fallback;
  return <Navigate to="/" replace />;
}
