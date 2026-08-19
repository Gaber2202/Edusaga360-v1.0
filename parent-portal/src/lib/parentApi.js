import { supabase } from './supabase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
  };
}

export async function fetchParentApi(path, { query, method = 'GET', body } = {}) {
  const qs = query
    ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString()}`
    : '';
  const res = await fetch(`${API_BASE_URL}${path}${qs}`, {
    method,
    headers: await authHeaders(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const payload = await res.json();
      detail = payload.message || payload.error || '';
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function fetchParentList(path, query) {
  const payload = await fetchParentApi(path, { query });
  return payload.data ?? [];
}

export async function signParentDocument(studentId, storagePath) {
  const payload = await fetchParentApi('/api/parent/documents/sign', {
    query: { student_id: studentId, path: storagePath },
  });
  return payload.url;
}

export async function updateChildAllergens(studentId, allergens) {
  const payload = await fetchParentApi(`/api/parent/children/${studentId}/allergens`, {
    method: 'PATCH',
    body: { allergens },
  });
  return payload.data;
}

export async function createCanteenTopup(studentId, amount) {
  const payload = await fetchParentApi('/api/parent/canteen/topup', {
    method: 'POST',
    body: { student_id: studentId, amount },
  });
  return payload.data;
}

export async function createStoreOrder(studentId, lines) {
  const payload = await fetchParentApi('/api/parent/store/orders', {
    method: 'POST',
    body: { student_id: studentId, lines },
  });
  return payload.data;
}

export async function fetchStoreSlots(productId, date) {
  return fetchParentList(`/api/parent/store/products/${productId}/slots`, { date });
}
