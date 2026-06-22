import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

export async function fetchData(query) {
  const { data, error } = await query;
  if (error) console.error('Supabase query error:', error);
  return data || [];
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://edusaga-360-production.up.railway.app';

/** Call the backend API with the current session's bearer token. */
export async function callApi(path, body = {}, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const method = options.method || (Object.keys(body).length ? 'POST' : 'GET');
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(json.message || json.error || `API error ${response.status}`);
    err.status = response.status;
    err.body = json;
    throw err;
  }
  return json;
}

/** GET helper that serialises a params object into a query string (skips empty values). */
export async function apiGet(path, params) {
  const entries = Object.entries(params || {}).filter(([, v]) => v != null && v !== '');
  const qs = entries.length ? `?${new URLSearchParams(entries).toString()}` : '';
  return callApi(`${path}${qs}`, {}, { method: 'GET' });
}
