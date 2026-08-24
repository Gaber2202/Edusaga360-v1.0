#!/usr/bin/env node
/**
 * P1-G — Apply shared/database/migrations/*.sql in filename order.
 *
 * Staging / founder-gated production only. Never runs against production unless
 * ALLOW_PROD_MIGRATE=true is set by the founder.
 *
 * Env:
 *   SUPABASE_ACCESS_TOKEN  — Management API token
 *   SUPABASE_PROJECT_REF   — project ref
 *   DRY_RUN=true           — list pending migrations without applying
 *   ALLOW_PROD_MIGRATE=true — required when PROJECT_REF is production
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'shared/database/migrations');
const PROD_REF = 'mhbfvewkjlfmkqdhxpyg';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF;
const dryRun = process.env.DRY_RUN === 'true';
const allowProd = process.env.ALLOW_PROD_MIGRATE === 'true';

if (!token || !projectRef) {
  console.error('SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF are required');
  process.exit(1);
}
if (projectRef === PROD_REF && !dryRun && !allowProd) {
  console.error('Refusing to apply migrations to production without ALLOW_PROD_MIGRATE=true');
  process.exit(1);
}

function listMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

function isPostDeploy(sql) {
  return /--\s*post_deploy:\s*true/i.test(sql);
}

async function queryDb(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Management API ${res.status}: ${body}`);
  }
  return res.json();
}

async function main() {
  const mode = process.argv.includes('--post-deploy') ? 'post_deploy' : 'pre_deploy';
  const files = listMigrationFiles();
  console.log(`Project ${projectRef} | mode=${mode} | dry_run=${dryRun} | files=${files.length}`);

  let appliedNames = new Set();
  try {
    const rows = await queryDb(
      `select name from supabase_migrations.schema_migrations order by version`,
    );
    const list = Array.isArray(rows) ? rows : rows?.data ?? [];
    for (const row of list) {
      if (row?.name) appliedNames.add(row.name);
      if (row?.version) appliedNames.add(String(row.version));
    }
  } catch (err) {
    console.warn('Could not read schema_migrations (continuing with empty set):', err.message);
  }

  for (const file of files) {
    const name = file.replace(/\.sql$/, '');
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const post = isPostDeploy(sql);
    if (mode === 'pre_deploy' && post) continue;
    if (mode === 'post_deploy' && !post) continue;
    if (appliedNames.has(name) || appliedNames.has(file)) {
      console.log(`skip (already applied): ${file}`);
      continue;
    }
    const wrapped = `
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
${sql}
COMMIT;
`;
    if (dryRun) {
      console.log(`[DRY RUN] would apply: ${file}`);
      continue;
    }
    console.log(`applying: ${file}`);
    await queryDb(wrapped);
    console.log(`applied: ${file}`);
  }
  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
