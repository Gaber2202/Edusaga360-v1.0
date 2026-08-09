import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const dryRun = process.env.DRY_RUN === 'true';

if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
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

async function main() {
  const { data: rows, error } = await supabase
    .from('users')
    .select('auth_id,tenant_id,user_role,is_platform_owner,email')
    .not('auth_id', 'is', null);

  if (error) {
    console.error('Could not load users:', error);
    process.exit(1);
  }

  const appUsers = (rows as AppUser[] | null) || [];
  console.log(`Found ${appUsers.length} users with auth_id`);

  for (const u of appUsers) {
    if (!u.auth_id) continue;

    const { data: authData, error: getErr } = await supabase.auth.admin.getUserById(u.auth_id);
    if (getErr || !authData?.user) {
      console.warn(`Skipping ${u.email} — could not fetch auth user:`, getErr?.message);
      continue;
    }

    const existing = (authData.user.app_metadata as Record<string, unknown>) || {};
    const userMeta = (authData.user.user_metadata as Record<string, unknown>) || {};
    const role = u.user_role || (u.is_platform_owner ? 'creator' : null);

    const appMetadata: Record<string, unknown> = {
      ...existing,
      tenant_id: u.tenant_id,
      user_role: u.user_role,
      role,
      is_platform_owner: u.is_platform_owner === true,
    };

    // Do not keep stale null keys that could overwrite valid values.
    if (!appMetadata.tenant_id) delete appMetadata.tenant_id;
    if (!appMetadata.user_role) delete appMetadata.user_role;
    if (!appMetadata.role) delete appMetadata.role;

    const { cleanUserMetadata, hasPrivilegedKeys } = stripPrivilegedUserMetadata(userMeta);

    console.log(`${dryRun ? '[DRY RUN] ' : ''}${u.email}: app_metadata ->`, JSON.stringify(appMetadata));
    console.log(`${dryRun ? '[DRY RUN] ' : ''}${u.email}: user_metadata ->`, JSON.stringify(cleanUserMetadata));

    if (dryRun) continue;

    const { error: updateErr } = await supabase.auth.admin.updateUserById(u.auth_id, {
      app_metadata: appMetadata,
      user_metadata: cleanUserMetadata,
    });

    if (updateErr) {
      console.error(`Failed to update ${u.email}:`, updateErr.message);
    } else {
      console.log(`Updated ${u.email}`);
    }
  }

  // Second pass: clean user_metadata for any auth users not linked to a users row
  // (e.g. test / seed accounts) so tenant_id/role never lives in user_metadata.
  const { data: allAuth, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) {
    console.error('Could not list auth users for cleanup:', listErr);
    return;
  }
  for (const authUser of allAuth?.users || []) {
    const userMeta = (authUser.user_metadata as Record<string, unknown>) || {};
    const { cleanUserMetadata, hasPrivilegedKeys } = stripPrivilegedUserMetadata(userMeta);
    if (!hasPrivilegedKeys) continue;
    console.log(`${dryRun ? '[DRY RUN] ' : ''}${authUser.email}: stripping privileged user_metadata keys`);
    if (dryRun) continue;
    const { error: cleanErr } = await supabase.auth.admin.updateUserById(authUser.id, {
      user_metadata: cleanUserMetadata,
    });
    if (cleanErr) {
      console.error(`Failed to clean ${authUser.email}:`, cleanErr.message);
    } else {
      console.log(`Cleaned user_metadata for ${authUser.email}`);
    }
  }
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
