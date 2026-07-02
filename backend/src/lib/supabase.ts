/**
 * SC-001 — single shared Supabase client.
 *
 * Every route and middleware previously constructed its own
 * `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` (~25 copies). That is
 * both duplication and a scaling foot-gun: each module held an independent
 * client, and there was no single seam to add connection pooling, a read cache,
 * or instrumentation. This module is that seam — import `supabase` from here.
 *
 * SECURITY: this uses the SERVICE ROLE key, which BYPASSES Postgres RLS. Tenant
 * isolation therefore depends on every query carrying an explicit
 * `.eq('tenant_id', <caller tenant>)` (see RF-006). Do not expose this client to
 * anything that accepts an unauthenticated tenant hint.
 */
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
