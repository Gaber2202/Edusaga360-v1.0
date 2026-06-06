import { callApi } from './supabaseClient';

export async function submitTenantRequest(payload) {
  const data = await callApi('/api/registration/request', payload);
  if (!data || data.success === false) {
    throw new Error(data?.message || data?.error || 'Failed to submit registration request');
  }
  return { request_id: data.request_id, id: data.request_id };
}

export async function submitClientTenantRequest(payload) {
  const data = await callApi('/api/functions/submitClientTenantRequest', payload);
  if (!data || data.error) {
    throw new Error(data?.error || 'Failed to submit subscription request');
  }
  return { request: data.request, tenant_max_users: data.tenant_max_users };
}
