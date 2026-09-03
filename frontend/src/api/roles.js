import { callApi } from './supabaseClient';

export async function fetchRoles({ includeInactive = false } = {}) {
  const qs = includeInactive ? '?include_inactive=1' : '';
  const data = await callApi(`/api/roles${qs}`, null, { method: 'GET' });
  return data.roles || [];
}

export async function createRole(payload) {
  const data = await callApi('/api/roles', payload, { method: 'POST' });
  return data.role;
}

export async function updateRole(id, payload) {
  const data = await callApi(`/api/roles/${id}`, payload, { method: 'PATCH' });
  return data.role;
}

export async function deleteRole(id) {
  return callApi(`/api/roles/${id}`, null, { method: 'DELETE' });
}
