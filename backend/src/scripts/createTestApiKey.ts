import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { assertDemoDatabase } from './lib/demoGuard.js';
import { generateApiKey } from '../lib/apiKeys.js';

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { realtime: { transport: ws as any } });

async function main() {
  assertDemoDatabase();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const k = generateApiKey();
  const { error } = await supabase.from('api_keys').insert({
    tenant_id: tenantId,
    name: 'E2E test key',
    key_prefix: k.prefix,
    key_hash: k.hash,
    scopes: ['invoices:write', 'invoices:share', 'payments:read', 'bulk_import:write', 'webhooks:write'],
    created_by: 'system',
  });
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log('API_KEY=' + k.plaintext);
}
main();
