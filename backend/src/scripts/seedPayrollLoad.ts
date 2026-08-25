/**
 * Seed N employees for SCRUM-121 payroll load testing (demo tenants only).
 *
 * Usage:
 *   cd backend && npx tsx src/scripts/seedPayrollLoad.ts --confirm-demo-target [--count=10000] [--tenant=edusaga360]
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const args = process.argv.slice(2);
const confirm = args.includes('--confirm-demo-target');
const countArg = args.find((a) => a.startsWith('--count='));
const tenantArg = args.find((a) => a.startsWith('--tenant='));
const COUNT = Math.min(Math.max(Number(countArg?.split('=')[1] || 10000), 1), 12000);
const TENANT_SLUG = tenantArg?.split('=')[1] || 'edusaga360';

if (!confirm) {
  console.error('Refusing to seed without --confirm-demo-target');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data: tenant, error: tErr } = await sb
    .from('tenants')
    .select('id, slug, name_en, is_demo, jurisdiction_code')
    .eq('slug', TENANT_SLUG)
    .maybeSingle();
  if (tErr || !tenant) throw new Error(`Tenant ${TENANT_SLUG} not found: ${tErr?.message}`);
  if (!tenant.is_demo) throw new Error('Seed refused: tenant is not marked is_demo');

  const { count: existing } = await sb
    .from('employees')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
    .like('employee_number', 'LOAD-%');

  const have = existing ?? 0;
  console.log(`[seed] tenant=${tenant.slug} jur=${tenant.jurisdiction_code} existing LOAD-* = ${have} target=${COUNT}`);

  if (have >= COUNT) {
    console.log('[seed] already at/above target; skipping inserts');
    return { tenantId: tenant.id, employees: have };
  }

  const need = COUNT - have;
  const batchSize = 500;
  let inserted = 0;
  const startIdx = have + 1;

  for (let offset = 0; offset < need; offset += batchSize) {
    const n = Math.min(batchSize, need - offset);
    const rows = Array.from({ length: n }, (_, i) => {
      const seq = startIdx + offset + i;
      const saudi = seq % 3 === 0;
      return {
        tenant_id: tenant.id,
        employee_number: `LOAD-${String(seq).padStart(5, '0')}`,
        name_en: `Load Employee ${seq}`,
        name_ar: `موظف تحميل ${seq}`,
        nationality: saudi ? 'saudi' : 'egyptian',
        is_saudi: saudi,
        is_gosi_applicable: true,
        status: 'active',
        employment_type: 'full_time',
        basic_salary: 7000 + (seq % 40) * 250,
        housing_allowance: 1500 + (seq % 10) * 50,
        transport_allowance: 500,
        other_allowances: {},
        hire_date: '2020-01-15',
        bank_iban: `SA${String(1000000000000000000 + seq).slice(0, 20)}`,
      };
    });

    const { error } = await sb.from('employees').insert(rows);
    if (error) throw new Error(`Insert batch failed @${offset}: ${error.message}`);
    inserted += n;
    if (inserted % 2000 === 0 || inserted === need) {
      console.log(`[seed] inserted ${inserted}/${need}`);
    }
  }

  const { count: finalCount } = await sb
    .from('employees')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id);

  console.log(`[seed] done. tenant employees total=${finalCount}`);
  return { tenantId: tenant.id, employees: finalCount };
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
