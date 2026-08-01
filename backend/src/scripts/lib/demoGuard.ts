import type { SupabaseClient } from '@supabase/supabase-js';

/** Thrown when a seed script is pointed at a target it must not write to. */
export class DemoGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DemoGuardError';
  }
}

/**
 * Verifies the DATABASE is an approved demo target.
 * Call this before ANY write, including tenant creation.
 * Fails closed: if the allowlist is unset, nothing runs.
 */
export function assertDemoDatabase(): void {
  if (!process.argv.includes('--confirm-demo-target')) {
    throw new DemoGuardError(
      'Refusing to run: --confirm-demo-target flag is required for seed scripts.',
    );
  }

  const raw = process.env.DEMO_SEED_ALLOWED_PROJECT_REFS ?? '';
  const allowlist = raw.split(',').map((s) => s.trim()).filter(Boolean);

  if (allowlist.length === 0) {
    throw new DemoGuardError(
      'Refusing to run: DEMO_SEED_ALLOWED_PROJECT_REFS is not set. ' +
        'Set it to a comma-separated list of Supabase project refs that may ' +
        'receive synthetic data. Production must never be listed.',
    );
  }

  const url = process.env.SUPABASE_URL ?? '';
  const projectRef = url.match(/https?:\/\/([a-z0-9]+)\.supabase\./i)?.[1];

  if (!projectRef) {
    throw new DemoGuardError(
      `Refusing to run: could not determine Supabase project ref from SUPABASE_URL ("${url}").`,
    );
  }

  if (!allowlist.includes(projectRef)) {
    throw new DemoGuardError(
      `Refusing to run: project ref "${projectRef}" is not in ` +
        `DEMO_SEED_ALLOWED_PROJECT_REFS. This is very likely production.`,
    );
  }
}

/**
 * Verifies the database is approved AND the tenant already exists and is demo.
 * Never creates anything. Throws — does not call process.exit, because exiting
 * the process from a shared library is unsafe if it is ever imported elsewhere.
 */
export async function assertDemoTarget(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<void> {
  assertDemoDatabase();

  const { data, error } = await supabase
    .from('tenants')
    .select('id, is_demo')
    .eq('id', tenantId)
    .maybeSingle();

  if (error) {
    throw new DemoGuardError(`Refusing to run: tenant lookup failed — ${error.message}`);
  }

  if (!data) {
    throw new DemoGuardError(
      `Refusing to run: tenant ${tenantId} does not exist. ` +
        'Seed scripts never create tenants — that is what made the previous ' +
        'guard useless. Create the demo tenant explicitly first.',
    );
  }

  if (data.is_demo !== true) {
    throw new DemoGuardError(
      `Refusing to run: tenant ${tenantId} is not flagged is_demo. ` +
        'Aborting to avoid writing synthetic data into a real school.',
    );
  }
}
