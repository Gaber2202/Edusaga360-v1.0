import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { assertDemoDatabase } from './lib/demoGuard.js';
import { validateJurisdictionCode } from '../lib/jurisdiction.js';

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { realtime: { transport: ws as any } });

const JURISDICTION_CODE = 'SA';

async function main() {
  assertDemoDatabase();
  const known = await validateJurisdictionCode(supabase, JURISDICTION_CODE);
  if (!known) {
    console.error(`Jurisdiction ${JURISDICTION_CODE} is not configured in jurisdictions table`);
    process.exit(1);
  }
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const { data: existing } = await supabase.from('tenants').select('id').eq('id', tenantId).maybeSingle();
  if (existing) {
    console.log('tenant exists');
    return;
  }
  const { error } = await supabase.from('tenants').insert({
    id: tenantId,
    name_en: 'Invoice Test Tenant',
    name_ar: 'مستأجر اختبار الفواتير',
    slug: 'invoice-test',
    tenant_code: 'INV-TEST',
    status: 'active',
    plan: 'enterprise',
    school_type: 'private',
    default_language: 'ar',
    num_grades: 12,
    max_students: 2000,
    is_demo: true,
    jurisdiction_code: JURISDICTION_CODE,
  });
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log('tenant created');
}
main();
