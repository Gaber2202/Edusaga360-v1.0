#!/usr/bin/env node
/**
 * Apply SQL migration files via Supabase Management API.
 *
 * Requires in backend/.env (or env):
 *   SUPABASE_ACCESS_TOKEN
 *   DEMO_SEED_ALLOWED_PROJECT_REFS or SUPABASE_PROJECT_REF
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(path) {
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i === -1) continue;
    const key = trimmed.slice(0, i).trim();
    const value = trimmed.slice(i + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(resolve('backend/.env'));

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/applySupabaseMigrations.mjs <file.sql> [...]');
  process.exit(1);
}

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const projectRef =
  process.env.SUPABASE_PROJECT_REF?.trim() ||
  process.env.DEMO_SEED_ALLOWED_PROJECT_REFS?.split(',')[0]?.trim();

if (!token) {
  console.error('[apply] Missing SUPABASE_ACCESS_TOKEN in backend/.env');
  process.exit(1);
}
if (!projectRef) {
  console.error('[apply] Missing SUPABASE_PROJECT_REF or DEMO_SEED_ALLOWED_PROJECT_REFS');
  process.exit(1);
}

async function runSql(name, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${name} failed (${res.status}): ${text}`);
  }
  console.log(`[apply] OK ${name}`);
}

for (const file of files) {
  const path = resolve(file);
  const sql = readFileSync(path, 'utf8');
  await runSql(path.split('/').pop(), sql);
}

console.log('[apply] All migrations applied.');
