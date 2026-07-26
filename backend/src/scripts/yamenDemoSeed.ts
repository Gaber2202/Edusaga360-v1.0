/**
 * YAMEN Collections — 900-student fictional Saudi private-school seed.
 *
 * Run with:
 *   SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> npx tsx src/scripts/yamenDemoSeed.ts
 *
 * Creates a demo tenant, branch, 900 guardians/students, invoices (paid, partial,
 * overdue), collection settings and collection_profiles so the Finance Officer
 * Console and nightly cron have realistic data to evaluate.
 */
import crypto from 'crypto';
import { supabase } from '../lib/supabase.js';

const STUDENT_COUNT = 900;
const TENANT_NAME = 'YAMEN Demo School';
const TENANT_SLUG = 'yamen-demo';
const BRANCH_NAME = 'Main Campus';
const ACADEMIC_YEAR = '2026-2027';

function pad(n: number, len: number) {
  return String(n).padStart(len, '0');
}

async function findOrCreateTenant() {
  const { data: existing } = await supabase.from('tenants').select('id').eq('slug', TENANT_SLUG).maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data: tenant, error } = await supabase
    .from('tenants')
    .insert({
      name_en: TENANT_NAME,
      name_ar: 'مدرسة يامن التجريبية',
      slug: TENANT_SLUG,
      tenant_code: 'YAMEN-DEMO',
      status: 'active',
      plan: 'enterprise',
      school_type: 'private',
      default_language: 'ar',
      num_grades: 12,
      max_students: 2000,
    })
    .select('id')
    .single();
  if (error) throw error;
  return (tenant as { id: string }).id;
}

async function findOrCreateBranch(tenantId: string) {
  const { data: existing } = await supabase.from('branches').select('id').eq('tenant_id', tenantId).maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data: branch, error } = await supabase
    .from('branches')
    .insert({ tenant_id: tenantId, name_en: BRANCH_NAME, name_ar: 'الح campus الرئيسي', is_main: true })
    .select('id')
    .single();
  if (error) throw error;
  return (branch as { id: string }).id;
}

async function findOrCreateAcademicYear(tenantId: string) {
  const { data: existing } = await supabase.from('academic_years').select('id').eq('tenant_id', tenantId).eq('name', ACADEMIC_YEAR).maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data: year, error } = await supabase
    .from('academic_years')
    .insert({
      tenant_id: tenantId,
      name: ACADEMIC_YEAR,
      start_date: '2026-09-01',
      end_date: '2027-06-30',
      is_current: true,
    })
    .select('id')
    .single();
  if (error) throw error;
  return (year as { id: string }).id;
}

async function findOrCreateGrade(tenantId: string, branchId: string, academicYearId: string) {
  const { data: existing } = await supabase.from('grades').select('id').eq('tenant_id', tenantId).eq('name_en', 'Grade 1').maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data: grade, error } = await supabase
    .from('grades')
    .insert({ tenant_id: tenantId, name_en: 'Grade 1', name_ar: 'الصف الأول', code: 'G1', level: 1, capacity: 30 })
    .select('id')
    .single();
  if (error) throw error;

  const { error: sectionErr } = await supabase.from('sections').insert({
    tenant_id: tenantId,
    branch_id: branchId,
    grade_id: (grade as { id: string }).id,
    name: 'A',
    capacity: 30,
  });
  if (sectionErr) throw sectionErr;

  return (grade as { id: string }).id;
}

async function ensureSettings(tenantId: string) {
  const { data: existing } = await supabase.from('collection_settings').select('id').eq('tenant_id', tenantId).maybeSingle();
  if (existing) return;

  const { error } = await supabase.from('collection_settings').insert({
    tenant_id: tenantId,
    is_enabled: true,
    send_window_start: '10:00:00',
    send_window_end: '20:00:00',
    timezone: 'Asia/Riyadh',
    respect_friday_prayer: true,
    respect_ramadan: true,
    channels_priority: ['whatsapp', 'sms', 'email'],
    segment_rules: {
      reliableDaysMax: 7,
      slowDaysMin: 7,
      slowDaysMax: 30,
      strugglerPartialRatioMin: 0.01,
    },
  });
  if (error) throw error;
}

async function seedBatch(
  tenantId: string,
  branchId: string,
  gradeId: string,
  academicYearId: string,
  start: number,
  end: number,
) {
  const guardians: Record<string, unknown>[] = [];
  const students: Record<string, unknown>[] = [];
  const invoices: Record<string, unknown>[] = [];
  const profiles: Record<string, unknown>[] = [];

  for (let i = start; i <= end; i++) {
    const suffix = pad(i, 5);
    const guardianId = crypto.randomUUID();
    const studentId = crypto.randomUUID();
    const phone = `+96650000${pad(i, 4)}`;
    const email = `guardian-${suffix}@yamen-demo.local`;
    const nationalId = `1${pad(i, 9)}`;

    guardians.push({
      id: guardianId,
      tenant_id: tenantId,
      name_en: `Guardian ${suffix}`,
      name_ar: `ولي الأمر ${suffix}`,
      phone,
      email,
      national_id: nationalId,
      relation: 'parent',
    });

    students.push({
      id: studentId,
      tenant_id: tenantId,
      branch_id: branchId,
      guardian_id: guardianId,
      student_id: `STU-${suffix}`,
      name_en: `Student ${suffix}`,
      name_ar: `الطالب ${suffix}`,
      grade_id: gradeId,
      academic_year: academicYearId,
      status: 'active',
      enrollment_date: '2026-09-01',
    });

    // Deterministic invoice mix: 40% paid, 20% partial, 40% outstanding/overdue.
    const total = 15000 + ((i % 7) * 1000);
    let paidAmount = 0;
    let status = 'issued';
    const dueDate = `2026-${pad(8 + (i % 3), 2)}-${pad(1 + (i % 28), 2)}`;

    if (i % 10 < 4) {
      paidAmount = total;
      status = 'paid';
    } else if (i % 10 < 6) {
      paidAmount = Math.round(total * 0.5);
      status = 'partial';
    } else if (i % 10 === 9) {
      status = 'overdue';
    }

    const invoiceId = crypto.randomUUID();
    const outstanding = total - paidAmount;
    const isOverdue = status === 'overdue';

    invoices.push({
      id: invoiceId,
      tenant_id: tenantId,
      branch_id: branchId,
      student_id: studentId,
      invoice_number: `INV-${suffix}`,
      date: '2026-08-01',
      due_date: dueDate,
      total_amount: total,
      paid_amount: paidAmount,
      status,
      items: [{ description: 'Tuition fee', amount: total }],
    });

    profiles.push({
      tenant_id: tenantId,
      guardian_id: guardianId,
      student_id: studentId,
      current_segment: isOverdue ? 'D' : outstanding > 0 ? 'C' : 'A',
      outstanding_balance: outstanding,
      avg_days_to_pay: 5 + (i % 20),
      partial_payment_ratio: paidAmount > 0 ? Number((paidAmount / total).toFixed(4)) : 0,
      missed_installments_count: 0,
      total_invoiced: total,
      total_collected: paidAmount,
      channel_responsiveness: {},
      preferred_language: 'ar',
      features_jsonb: {
        invoice_id: invoiceId,
        current_overdue_30_plus: isOverdue ? 1 : 0,
        current_overdue_60_plus: 0,
        current_overdue_90_plus: 0,
        cross_term_default: false,
        had_plan_ever: false,
        has_active_plan: false,
        message_reply_count: 0,
        risk_flag: false,
      },
    });
  }

  if (guardians.length) {
    const { error: gErr } = await supabase.from('guardians').insert(guardians);
    if (gErr) throw gErr;
  }
  if (students.length) {
    const { error: sErr } = await supabase.from('students').insert(students);
    if (sErr) throw sErr;
  }
  if (invoices.length) {
    const { error: iErr } = await supabase.from('invoices').insert(invoices);
    if (iErr) throw iErr;
  }
  if (profiles.length) {
    const { error: pErr } = await supabase.from('collection_profiles').insert(profiles);
    if (pErr) throw pErr;
  }
}

async function main() {
  const tenantId = await findOrCreateTenant();
  const branchId = await findOrCreateBranch(tenantId);
  const academicYearId = await findOrCreateAcademicYear(tenantId);
  const gradeId = await findOrCreateGrade(tenantId, branchId, academicYearId);
  await ensureSettings(tenantId);

  const batchSize = 100;
  for (let start = 1; start <= STUDENT_COUNT; start += batchSize) {
    const end = Math.min(start + batchSize - 1, STUDENT_COUNT);
    await seedBatch(tenantId, branchId, gradeId, academicYearId, start, end);
    console.log(`[seed] inserted rows ${start}-${end}`);
  }

  console.log(`[seed] completed for tenant ${tenantId}`);
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
