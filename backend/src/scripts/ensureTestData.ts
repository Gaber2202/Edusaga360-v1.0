import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import crypto from 'crypto';

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { realtime: { transport: ws as any } });

const tenantId = '00000000-0000-0000-0000-000000000001';

async function main() {
  const { data: branch } = await supabase.from('branches').insert({ tenant_id: tenantId, name_en: 'Main Campus', name_ar: 'الح campus الرئيسي', is_main: true }).select('id').single();
  const branchId = (branch as any).id;
  const { data: year } = await supabase.from('academic_years').insert({ tenant_id: tenantId, name: '2026-2027', start_date: '2026-09-01', end_date: '2027-06-30', is_current: true }).select('id').single();
  const yearId = (year as any).id;
  const { data: grade } = await supabase.from('grades').insert({ tenant_id: tenantId, name_en: 'Grade 1', name_ar: 'الصف الأول', code: 'G1', level: 1, capacity: 30 }).select('id').single();
  const gradeId = (grade as any).id;
  const { data: section } = await supabase.from('sections').insert({ tenant_id: tenantId, branch_id: branchId, grade_id: gradeId, name: 'A', capacity: 30 }).select('id').single();
  const sectionId = (section as any).id;

  const guardianId = crypto.randomUUID();
  await supabase.from('guardians').insert({
    id: guardianId, tenant_id: tenantId, name_en: 'Test Guardian', name_ar: 'ولي أمر تجريبي',
    phone: '+966500000001', email: 'guardian@example.com', relation: 'parent',
  });

  const studentId = crypto.randomUUID();
  await supabase.from('students').insert({
    id: studentId, tenant_id: tenantId, branch_id: branchId, student_id: 'STU-001',
    name_en: 'Test Student', name_ar: 'طالب تجريبي',
    grade_id: gradeId, section_id: sectionId, guardian_id: guardianId,
    academic_year: '2026-2027', enrollment_date: '2026-09-01', status: 'active',
  });

  const { data: cat } = await supabase.from('fee_categories').insert({
    tenant_id: tenantId, code: 'TUITION', name_en: 'Tuition', name_ar: 'رسوم دراسية', vat_treatment: 'standard', is_active: true,
  }).select('id').single();
  const categoryId = (cat as any).id;

  console.log('STUDENT_ID=' + studentId);
  console.log('CATEGORY_ID=' + categoryId);
}
main().catch((e) => { console.error(e); process.exit(1); });
