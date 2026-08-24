#!/usr/bin/env node
/**
 * P1-G — Verify repo migrations are present (or pending) against a project.
 * PR / staging mode: dry verification only. Does not write.
 *
 * Env: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'shared/database/migrations');

const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF;

if (!token || !projectRef) {
  console.error('SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF are required');
  process.exit(1);
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
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  let applied = new Set();
  try {
    const rows = await queryDb(`select name, version from supabase_migrations.schema_migrations`);
    const list = Array.isArray(rows) ? rows : rows?.data ?? [];
    for (const row of list) {
      if (row?.name) applied.add(row.name);
      if (row?.version) applied.add(String(row.version));
    }
  } catch (err) {
    console.error('Failed to read schema_migrations:', err.message);
    process.exit(1);
  }

  const pending = [];
  for (const file of files) {
    const name = file.replace(/\.sql$/, '');
    if (!applied.has(name) && !applied.has(file)) pending.push(file);
  }

  console.log(JSON.stringify({
    project_ref: projectRef,
    repo_migrations: files.length,
    pending_count: pending.length,
    pending,
  }, null, 2));

  // Non-zero exit when VERIFY_FAIL_ON_PENDING=true (staging gate).
  if (process.env.VERIFY_FAIL_ON_PENDING === 'true' && pending.length > 0) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
