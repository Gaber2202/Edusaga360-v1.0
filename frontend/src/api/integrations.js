/**
 * Frontend client for the integration control planes on the Express backend.
 *
 * Each call goes through `callApi`, which attaches the Supabase JWT and points at
 * VITE_API_BASE_URL. These wrap the three backends built for legacy/ATS/email
 * integration:
 *   - API keys   → /api/api-keys   (external /api/v1 credentials)
 *   - ATS        → /api/ats        (hiring connectors + candidates)
 *   - Email      → /api/email      (mailbox connectors + messages)
 */
import { callApi } from './supabaseClient';

const GET = { method: 'GET' };
const DELETE = { method: 'DELETE' };

const withTenant = (base, tenantId) =>
  tenantId ? `${base}?tenant_id=${encodeURIComponent(tenantId)}` : base;

// ── API keys (control plane for the external /api/v1 data plane) ───────────────
export const apiKeysApi = {
  listScopes: (tenantId) => callApi(withTenant('/api/api-keys/scopes', tenantId), null, GET),
  list: (tenantId) => callApi(withTenant('/api/api-keys', tenantId), null, GET),
  create: (payload, tenantId) => callApi('/api/api-keys', { ...payload, ...(tenantId && { tenant_id: tenantId }) }, { method: 'POST' }),
  revoke: (id, tenantId) => callApi(withTenant(`/api/api-keys/${id}`, tenantId), null, DELETE),
};

// ── ATS connectors ────────────────────────────────────────────────────────────
export const atsApi = {
  providers: () => callApi('/api/ats/providers', null, GET),
  listConnectors: () => callApi('/api/ats/connectors', null, GET),
  createConnector: (payload) => callApi('/api/ats/connectors', payload, { method: 'POST' }),
  testConnector: (id) => callApi(`/api/ats/connectors/${id}/test`, {}, { method: 'POST' }),
  syncConnector: (id) => callApi(`/api/ats/connectors/${id}/sync`, {}, { method: 'POST' }),
  deleteConnector: (id) => callApi(`/api/ats/connectors/${id}`, null, DELETE),
  candidates: () => callApi('/api/ats/candidates', null, GET),
};

// ── Messaging connectors (SMS / WhatsApp) ─────────────────────────────────────
export const messagingApi = {
  providers: () => callApi('/api/messaging/providers', null, GET),
  listConnectors: () => callApi('/api/messaging/connectors', null, GET),
  createConnector: (payload) => callApi('/api/messaging/connectors', payload, { method: 'POST' }),
  send: (id, message) => callApi(`/api/messaging/connectors/${id}/send`, message, { method: 'POST' }),
  deleteConnector: (id) => callApi(`/api/messaging/connectors/${id}`, null, DELETE),
};

// ── Email connectors ──────────────────────────────────────────────────────────
export const emailApi = {
  providers: () => callApi('/api/email/providers', null, GET),
  listConnectors: () => callApi('/api/email/connectors', null, GET),
  createConnector: (payload) => callApi('/api/email/connectors', payload, { method: 'POST' }),
  send: (id, message) => callApi(`/api/email/connectors/${id}/send`, message, { method: 'POST' }),
  syncConnector: (id) => callApi(`/api/email/connectors/${id}/sync`, {}, { method: 'POST' }),
  deleteConnector: (id) => callApi(`/api/email/connectors/${id}`, null, DELETE),
  messages: () => callApi('/api/email/messages', null, GET),
};

/**
 * Render a provider descriptor's fields into a credentials/config payload.
 * `values` is a flat { fieldKey: value } map from the form. Fields declared on
 * `credentialFields` go to `credentials`; everything on `configFields` to
 * `config`. A field whose key is `field_map` is parsed from JSON text.
 */
export function splitProviderPayload(provider, values) {
  const credentials = {};
  const config = {};
  for (const f of provider.credentialFields || []) {
    const v = values[f.key];
    if (v !== undefined && v !== '') credentials[f.key] = v;
  }
  for (const f of provider.configFields || []) {
    let v = values[f.key];
    if (v === undefined || v === '') continue;
    if (f.key === 'field_map' && typeof v === 'string') {
      v = JSON.parse(v); // caller wraps in try/catch to surface a friendly error
    }
    config[f.key] = v;
  }
  return { credentials, config };
}
