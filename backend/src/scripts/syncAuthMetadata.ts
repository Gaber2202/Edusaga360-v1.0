/**
 * P1-A-3 / P1-A-5 — Sync privileged claims from public.users → auth.app_metadata
 * and strip them from user_metadata.
 *
 * Usage (dev first):
 *   DRY_RUN=true npx tsx src/scripts/syncAuthMetadata.ts
 *
 * Production: founder-only, after reviewing the dry-run report. Never run
 * without DRY_RUN against production from an agent session.
 */
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const dryRun = process.env.DRY_RUN === 'true';

if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(1);
}

const projectRef = url.match(/https:\/\/([^.]+)/)?.[1] ?? 'unknown';
const isProdRef = projectRef === 'mhbfvewkjlfmkqdhxpyg';

if (isProdRef && !dryRun && process.env.ALLOW_PROD_WRITE !== 'true') {
  console.error(
    'Refusing non-dry-run against production project. Set DRY_RUN=true, or founder sets ALLOW_PROD_WRITE=true.',
  );
  process.exit(1);
}

const supabase = createClient(url, key, { realtime: { transport: ws as any } });

type AppUser = {
  auth_id: string | null;
  tenant_id: string | null;
  user_role: string | null;
  is_platform_owner: boolean;
  email: string;
};

type Summary = {
  project_ref: string;
  dry_run: boolean;
  users_with_auth_id: number;
  already_clean: number;
  would_update_app_metadata: number;
  would_strip_user_metadata: number;
  auth_fetch_failures: number;
  ghosts: Array<{ email: string; auth_id: string; users_tenant_id: string }>;
  orphans_privileged_user_meta: number;
  updated: number;
  failed: number;
};

async function main() {
  const summary: Summary = {
    project_ref: projectRef,
    dry_run: dryRun,
    users_with_auth_id: 0,
    already_clean: 0,
    would_update_app_metadata: 0,
    would_strip_user_metadata: 0,
    auth_fetch_failures: 0,
    ghosts: [],
    orphans_privileged_user_meta: 0,
    updated: 0,
    failed: 0,
  };

  const { data: rows, error } = await supabase
    .from('users')
    .select('auth_id,tenant_id,user_role,is_platform_owner,email')
    .not('auth_id', 'is', null);

  if (error) {
    console.error('Could not load users:', error);
    process.exit(1);
  }

  const appUsers = (rows as AppUser[] | null) || [];
  summary.users_with_auth_id = appUsers.length;
  console.log(`Project ${projectRef} | Found ${appUsers.length} users with auth_id | dry_run=${dryRun}`);

  for (const u of appUsers) {
    if (!u.auth_id) continue;

    const { data: authData, error: getErr } = await supabase.auth.admin.getUserById(u.auth_id);
    if (getErr || !authData?.user) {
      console.warn(`Skipping ${u.email} — could not fetch auth user:`, getErr?.message);
      summary.auth_fetch_failures += 1;
      continue;
    }

    const existing = (authData.user.app_metadata as Record<string, unknown>) || {};
    const userMeta = (authData.user.user_metadata as Record<string, unknown>) || {};
    const role = u.user_role || (u.is_platform_owner ? 'creator' : null);

    // P1-A-5: ghost — users.tenant_id set but app_metadata.tenant_id missing
    if (u.tenant_id && !existing.tenant_id) {
      summary.ghosts.push({
        email: u.email,
        auth_id: u.auth_id,
        users_tenant_id: u.tenant_id,
      });
    }

    const appMetadata: Record<string, unknown> = {
      ...existing,
      tenant_id: u.tenant_id,
      user_role: u.user_role,
      role,
      is_platform_owner: u.is_platform_owner === true,
    };

    if (!appMetadata.tenant_id) delete appMetadata.tenant_id;
    if (!appMetadata.user_role) delete appMetadata.user_role;
    if (!appMetadata.role) delete appMetadata.role;

    const { cleanUserMetadata, hasPrivilegedKeys } = stripPrivilegedUserMetadata(userMeta);

    const appNeedsUpdate =
      existing.tenant_id !== appMetadata.tenant_id ||
      existing.user_role !== appMetadata.user_role ||
      existing.role !== appMetadata.role ||
      Boolean(existing.is_platform_owner) !== Boolean(appMetadata.is_platform_owner);

    if (appNeedsUpdate) summary.would_update_app_metadata += 1;
    if (hasPrivilegedKeys) summary.would_strip_user_metadata += 1;
    if (!appNeedsUpdate && !hasPrivilegedKeys) summary.already_clean += 1;

    console.log(`${dryRun ? '[DRY RUN] ' : ''}${u.email}: app_metadata ->`, JSON.stringify(appMetadata));
    console.log(`${dryRun ? '[DRY RUN] ' : ''}${u.email}: user_metadata ->`, JSON.stringify(cleanUserMetadata));

    if (dryRun) continue;
    if (!appNeedsUpdate && !hasPrivilegedKeys) continue;

    const { error: updateErr } = await supabase.auth.admin.updateUserById(u.auth_id, {
      app_metadata: appMetadata,
      user_metadata: cleanUserMetadata,
    });

    if (updateErr) {
      console.error(`Failed to update ${u.email}:`, updateErr.message);
      summary.failed += 1;
    } else {
      console.log(`Updated ${u.email}`);
      summary.updated += 1;
    }
  }

  const linkedAuthIds = new Set(appUsers.map((u) => u.auth_id).filter(Boolean) as string[]);
  const { data: allAuth, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) {
    console.error('Could not list auth users for cleanup:', listErr);
  } else {
    for (const authUser of allAuth?.users || []) {
      if (linkedAuthIds.has(authUser.id)) continue;
      const userMeta = (authUser.user_metadata as Record<string, unknown>) || {};
      const { cleanUserMetadata, hasPrivilegedKeys } = stripPrivilegedUserMetadata(userMeta);
      if (!hasPrivilegedKeys) continue;
      summary.orphans_privileged_user_meta += 1;
      console.log(`${dryRun ? '[DRY RUN] ' : ''}${authUser.email}: stripping privileged user_metadata keys`);
      if (dryRun) continue;
      const { error: cleanErr } = await supabase.auth.admin.updateUserById(authUser.id, {
        user_metadata: cleanUserMetadata,
      });
      if (cleanErr) {
        console.error(`Failed to clean ${authUser.email}:`, cleanErr.message);
        summary.failed += 1;
      } else {
        console.log(`Cleaned user_metadata for ${authUser.email}`);
        summary.updated += 1;
      }
    }
  }

  console.log('\n=== SUMMARY (P1-A-3 / P1-A-5) ===');
  console.log(JSON.stringify(summary, null, 2));
}

function stripPrivilegedUserMetadata(userMeta: Record<string, unknown>): {
  cleanUserMetadata: Record<string, unknown>;
  hasPrivilegedKeys: boolean;
} {
  const cleanUserMetadata = { ...userMeta };
  const privileged = ['tenant_id', 'role', 'user_role', 'is_platform_owner'] as const;
  let hasPrivilegedKeys = false;
  for (const key of privileged) {
    if (key in cleanUserMetadata) {
      hasPrivilegedKeys = true;
      delete cleanUserMetadata[key];
    }
  }
  return { cleanUserMetadata, hasPrivilegedKeys };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
