import { callApi } from './supabaseClient';

export async function submitRegistrationRequest(payload) {
  let data;
  try {
    data = await callApi('/api/registration/request', payload);
  } catch (e) {
    const err = new Error(e?.message || 'Network error submitting registration');
    err.code = 'NETWORK';
    throw err;
  }
  if (!data || data.success !== true) {
    const err = new Error(data?.message || data?.error || 'Failed to submit registration request');
    err.code = data?.error || 'SERVER_ERROR';
    err.field = data?.field;
    err.existing_status = data?.existing_status;
    throw err;
  }
  return { request_id: data.request_id ?? null };
}
