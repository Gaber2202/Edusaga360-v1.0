import { callApi } from './supabaseClient';

export async function submitRegistrationRequest(payload) {
  let data;
  try {
    data = await callApi('/api/registration/request', payload);
  } catch (e) {
    // Only a real transport failure is NETWORK. A 4xx/5xx from the server
    // carries a status + message we should surface instead of masking it.
    if (e?.isNetworkError) {
      const err = new Error(e?.message || 'Network error submitting registration');
      err.code = 'NETWORK';
      throw err;
    }
    if (e?.status === 409 || e?.body?.error === 'DUPLICATE') {
      const err = new Error(e?.message || 'Duplicate registration');
      err.code = 'DUPLICATE';
      throw err;
    }
    if (e?.status === 400) {
      const err = new Error(e?.message || 'Validation error');
      err.code = 'VALIDATION';
      err.field = e?.body?.field;
      throw err;
    }
    // Real server error (500 etc.) — surface the actual message.
    const err = new Error(e?.message || 'Server error submitting registration');
    err.code = 'SERVER_ERROR';
    err.status = e?.status;
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
