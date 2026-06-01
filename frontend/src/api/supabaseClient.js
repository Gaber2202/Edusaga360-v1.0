import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

let currentTenantContext = {
  tenantId: null,
  isPlatformOwner: false,
  ready: false,
};

const subscribers = new Set();

export function setTenantContext(next) {
  const prev = currentTenantContext;
  currentTenantContext = {
    tenantId: next?.tenantId || null,
    isPlatformOwner: !!next?.isPlatformOwner,
    ready: true,
  };
  if (
    prev.tenantId !== currentTenantContext.tenantId ||
    prev.isPlatformOwner !== currentTenantContext.isPlatformOwner ||
    prev.ready !== currentTenantContext.ready
  ) {
    for (const fn of subscribers) {
      try {
        fn(currentTenantContext, prev);
      } catch {
        /* noop */
      }
    }
  }
}

export function getTenantContext() {
  return currentTenantContext;
}

export function subscribeTenantContext(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

const PLATFORM_ONLY_ENTITIES = new Set([
  'tenants',
  'tenant_requests',
  'roles',
  'countries',
  'currencies',
  'public_settings',
  'app_settings',
  'app_versions',
]);

export { PLATFORM_ONLY_ENTITIES };

/**
 * Tenant-scoped database query helper.
 * Automatically appends tenant_id filter for non-platform entities.
 */
export function tenantQuery(tableName) {
  const query = supabase.from(tableName);
  const { tenantId, isPlatformOwner } = currentTenantContext;

  if (PLATFORM_ONLY_ENTITIES.has(tableName) || isPlatformOwner) {
    return query;
  }

  return {
    select: (...args) => query.select(...args).eq('tenant_id', tenantId),
    insert: (data) => {
      const withTenant = Array.isArray(data)
        ? data.map((d) => ({ ...d, tenant_id: tenantId }))
        : { ...data, tenant_id: tenantId };
      return query.insert(withTenant);
    },
    update: (data) => query.update(data).eq('tenant_id', tenantId),
    delete: () => query.delete().eq('tenant_id', tenantId),
    upsert: (data) => {
      const withTenant = Array.isArray(data)
        ? data.map((d) => ({ ...d, tenant_id: tenantId }))
        : { ...data, tenant_id: tenantId };
      return query.upsert(withTenant);
    },
  };
}

/**
 * Platform-level query (no tenant scoping) — super-admin only.
 */
export function platformQuery(tableName) {
  return supabase.from(tableName);
}

/**
 * File storage helpers using Supabase Storage.
 */
export const storage = {
  async uploadFile(bucket, path, file) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true });
    if (error) throw error;
    return data;
  },

  getFileUrl(bucket, path) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  },

  async getSignedUrl(bucket, path, expiresIn = 3600) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);
    if (error) throw error;
    return data.signedUrl;
  },

  async deleteFile(bucket, paths) {
    const { error } = await supabase.storage
      .from(bucket)
      .remove(Array.isArray(paths) ? paths : [paths]);
    if (error) throw error;
  },
};

/**
 * Helper to extract data array from a Supabase query (for use in React Query queryFn).
 * Supabase queries resolve to { data, error } — this extracts just the data array.
 */
export async function fetchData(query) {
  const { data, error } = await query;
  if (error) console.error('Supabase query error:', error);
  return data || [];
}

/**
 * Call a backend API endpoint (replaces supabase.functions.*).
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export async function callApi(endpoint, data, options = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: options.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token && {
        Authorization: `Bearer ${session.access_token}`,
      }),
      ...options.headers,
    },
    body: data ? JSON.stringify(data) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `API error: ${response.status}`);
  }

  return response.json();
}
