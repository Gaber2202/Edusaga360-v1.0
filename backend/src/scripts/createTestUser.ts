import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { realtime: { transport: ws as any } });

async function main() {
  const email = `test-${Date.now()}@edusaga.local`;
  const { data: userData, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password: 'TestPass123!',
    email_confirm: true,
    app_metadata: {
      tenant_id: '00000000-0000-0000-0000-000000000001',
      role: 'admin',
    },
    user_metadata: { name: 'Test Admin' },
  });
  if (createErr) {
    console.error('create user error', createErr);
    process.exit(1);
  }
  console.log('created user', userData.user?.id);
  const { data: signData, error: signErr } = await supabase.auth.signInWithPassword({ email, password: 'TestPass123!' });
  if (signErr) {
    console.error('sign in error', signErr);
    process.exit(1);
  }
  console.log('token', signData.session?.access_token);
}
main();
