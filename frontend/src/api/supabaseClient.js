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

/**
 * Thrown when tenantQuery is called before the module-level tenant context is
 * set. React Query's default retry behaviour will re-run the queryFn once the
 * context is populated by TenantContextSyncer.
 */
export class TenantContextNotReadyError extends Error {
  constructor(tableName) {
    super(`tenantQuery('${tableName}'): tenantId is not set`);
    this.name = 'TenantContextNotReadyError';
    this.tableName = tableName;
  }
}

// Tables that are platform-wide (not tenant-scoped). Queries against these
// tables must NOT have a tenant_id filter appended automatically.
const PLATFORM_ONLY_ENTITIES = new Set([
  'tenants',
  'tenant_requests',
  'registration_requests', // platform admin table — no tenant_id row filter
  'roles',
  'countries',
  'currencies',
  'jurisdictions',
  'public_settings',
  'app_settings',
  'app_versions',
  'audit_logs',
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

  // Guard: if tenantId is null the filter `.eq('tenant_id', null)` would
  // silently return 0 rows.  Throw so React Query retries once context is set.
  if (!tenantId) {
    console.warn(`tenantQuery('${tableName}'): tenantId is not set — will retry`);
    throw new TenantContextNotReadyError(tableName);
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
 * All file access uses signed URLs (private buckets) — never getPublicUrl.
 * Direct uploads from the client go through the backend /api/files/upload
 * endpoint which validates file type, size, and generates safe random paths.
 */
export const storage = {
  async uploadFile(bucket, path, file) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true });
    if (error) throw error;
    return data;
  },

  /** @deprecated Use getSignedUrl — files are stored in private buckets. */
  getFileUrl(bucket, path) {
    // Kept for backward-compat but logs a warning — callers should switch to getSignedUrl.
    console.warn('[storage.getFileUrl] Public URL access is deprecated. Use getSignedUrl instead.');
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
 * Normalize journal entries fetched with embedded journal_entry_lines.
 * The production schema stores lines in a separate table, so a flat select('*')
 * returns no `lines` array. This maps the embedded relation into the shape the
 * components expect (account_code, account_type, account_name, line_number).
 */
export function normalizeJournalEntries(entries) {
  return (entries || []).map((je) => ({
    ...je,
    lines: (je.journal_entry_lines || []).map((line) => ({
      ...line,
      account_code: line.chart_of_accounts?.code,
      account_name: line.chart_of_accounts?.name_ar,
      account_type: line.chart_of_accounts?.type,
      line_number: line.id?.slice(0, 8),
    })),
  }));
}

/**
 * Call a backend API endpoint (replaces supabase.functions.*).
 */
// VITE_API_BASE_URL must be set in Vercel env vars for each environment (dev/staging/prod).
// No fallback — a missing env var should fail visibly rather than silently route dev/staging
// traffic to the production Railway instance and cause data contamination.
if (!import.meta.env.VITE_API_BASE_URL) {
  console.error('[supabaseClient] VITE_API_BASE_URL is not set. Backend API calls will fail. Set this variable in your .env file or Vercel environment settings.');
}
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export async function callApi(endpoint, data, options = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
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
  } catch (e) {
    // True transport failure (DNS, CORS preflight blocked, offline).
    const err = new Error(`Could not reach server at ${API_BASE_URL}: ${e.message}`);
    err.isNetworkError = true;
    throw err;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    const err = new Error(body.message || body.error || `API error: ${response.status}`);
    err.status = response.status;
    err.body = body;
    throw err;
  }

  if (options.responseType === 'blob') return response.blob();
  return response.json();
}

/**
 * Upload a file via multipart/form-data to the backend.
 * Returns { path, signedUrl } on success.
 */
export async function uploadFileApi(file) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const formData = new FormData();
  formData.append('file', file);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/files/upload`, {
      method: 'POST',
      headers: {
        ...(session?.access_token && {
          Authorization: `Bearer ${session.access_token}`,
        }),
      },
      body: formData,
    });
  } catch (e) {
    const err = new Error(`Upload failed: ${e.message}`);
    err.isNetworkError = true;
    throw err;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    const err = new Error(body.message || body.error || `Upload error: ${response.status}`);
    err.status = response.status;
    err.body = body;
    throw err;
  }

  return response.json();
}

/**
 * Re-mint a fresh signed URL for a previously uploaded file path.
 * Signed URLs returned by uploadFileApi expire after ~1 hour, so the canonical
 * thing to persist is the `path`; call this to view the file later.
 * Returns the signed URL string.
 */
export async function getSignedUrlApi(path) {
  if (!path) throw new Error('getSignedUrlApi: path is required');

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(
    `${API_BASE_URL}/api/files/sign?path=${encodeURIComponent(path)}`,
    {
      headers: {
        ...(session?.access_token && {
          Authorization: `Bearer ${session.access_token}`,
        }),
      },
    },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    const err = new Error(body.message || body.error || `Sign error: ${response.status}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  return data.signedUrl;
}
