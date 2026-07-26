import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { realtime: { transport: ws as any } });

async function main() {
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const { data: existing } = await supabase.from('tenant_compliance_settings').select('id').eq('tenant_id', tenantId).maybeSingle();
  if (existing) {
    console.log('compliance settings exist');
    return;
  }
  const { error } = await supabase.from('tenant_compliance_settings').insert({
    tenant_id: tenantId,
    legal_name_en: 'Invoice Test School',
    legal_name_ar: 'مدرسة اختبار الفواتير',
    vat_trn: '300000000000003',
    cr_number: '1234567890',
    address_en: 'Riyadh, Saudi Arabia',
    address_ar: 'الرياض، المملكة العربية السعودية',
    city: 'Riyadh',
    phone: '+966500000000',
    email: 'billing@example.com',
    default_vat_rate: 0.15,
    zatca_env: 'sandbox',
    country_code: 'SA',
  });
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log('compliance settings created');
}
main();
