/**
 * Parent Portal — demo family seed.
 *
 * WRITES SYNTHETIC DATA. Never run against production.
 *
 * Links parent Auth accounts to students that already exist on an is_demo tenant:
 *   parent.demo@edusaga.local  / ParentPass123!  — up to two roster children, full data
 *   parent.empty@edusaga.local / ParentPass123!  — one other roster child, empty modules
 *
 * The demo tenant must already exist and be flagged is_demo. This script
 * will not create it, and it will not insert students — add them in the
 * staff Students module first.
 *
 * Run with:
 *   DEMO_SEED_ALLOWED_PROJECT_REFS=<ref> \
 *   SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> \
 *   npx tsx src/scripts/parentPortalSeed.ts --confirm-demo-target
 *
 * Optional:
 *   PARENT_SEED_TENANT_ID=<uuid>   pin a specific demo tenant
 *   PARENT_DEMO_PASSWORD=<pass>    override the default password
 */
import crypto from 'crypto';
import { supabase } from '../lib/supabase.js';
import { assertDemoDatabase, assertDemoTarget, DemoGuardError } from './lib/demoGuard.js';

const PARENT_PASSWORD = process.env.PARENT_DEMO_PASSWORD || 'ParentPass123!';
const ACADEMIC_YEAR_LABEL = '2026-2027';
const DEMO_PREFIX = 'PP-DEMO';

const FULL_PARENT_EMAIL = 'parent.demo@edusaga.local';
const EMPTY_PARENT_EMAIL = 'parent.empty@edusaga.local';
const STAFF_DEMO_EMAIL = 'staff.demo@edusaga.local';
/** Same school Muhammed@edusaga360.com uses in the staff app (EduSaga 360 School). */
const PLATFORM_OWNER_TENANT_ID = 'b0000000-0000-0000-0000-000000000001';

function demoTodayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}

function buildCanteenMenuRows(tenantId: string): Row[] {
  return [
    { tenant_id: tenantId, name_en: 'Chicken shawarma wrap', name_ar: 'ساندويتش شاورما دجاج', category: 'main', price: 18, calories: 420, allergens: ['gluten'], is_halal: true, is_prohibited: false, is_available: true, stock_qty: 26, low_stock_threshold: 8 },
    { tenant_id: tenantId, name_en: 'Beef burger meal', name_ar: 'وجبة برجر لحم', category: 'main', price: 22, calories: 580, allergens: ['gluten', 'dairy', 'eggs'], is_halal: true, is_prohibited: false, is_available: true, stock_qty: 18, low_stock_threshold: 6 },
    { tenant_id: tenantId, name_en: 'Grilled fish fillet', name_ar: 'فيليه سمك مشوي', category: 'main', price: 24, calories: 350, allergens: ['fish'], is_halal: true, is_prohibited: false, is_available: true, stock_qty: 4, low_stock_threshold: 6 },
    { tenant_id: tenantId, name_en: 'Vegetable pasta', name_ar: 'معكرونة بالخضار', category: 'main', price: 16, calories: 380, allergens: ['gluten'], is_halal: true, is_prohibited: false, is_available: false, stock_qty: 0, low_stock_threshold: 5 },
    { tenant_id: tenantId, name_en: 'Granola bar', name_ar: 'لوح جرانولا', category: 'snack', price: 4, calories: 180, allergens: ['nuts', 'gluten'], is_halal: true, is_prohibited: false, is_available: true, stock_qty: 36, low_stock_threshold: 10 },
    { tenant_id: tenantId, name_en: 'Cheese crackers', name_ar: 'بسكويت بالجبن', category: 'snack', price: 5, calories: 150, allergens: ['dairy', 'gluten'], is_halal: true, is_prohibited: false, is_available: true, stock_qty: 40, low_stock_threshold: 10 },
    { tenant_id: tenantId, name_en: 'Fresh orange juice', name_ar: 'عصير برتقال طازج', category: 'drink', price: 6, calories: 90, allergens: [], is_halal: true, is_prohibited: false, is_available: true, stock_qty: 60, low_stock_threshold: 15 },
    { tenant_id: tenantId, name_en: 'Chocolate milk', name_ar: 'حليب بالشوكولاتة', category: 'drink', price: 5, calories: 140, allergens: ['dairy'], is_halal: true, is_prohibited: false, is_available: true, stock_qty: 32, low_stock_threshold: 10 },
    { tenant_id: tenantId, name_en: 'Energy drink (prohibited)', name_ar: 'مشروب طاقة (ممنوع)', category: 'drink', price: 8, calories: 110, allergens: [], is_halal: true, is_prohibited: true, is_available: true, stock_qty: 12, low_stock_threshold: 5 },
    { tenant_id: tenantId, name_en: 'Mixed fruit cup', name_ar: 'كوب فواكه مشكلة', category: 'fruit', price: 8, calories: 70, allergens: [], is_halal: true, is_prohibited: false, is_available: true, stock_qty: 21, low_stock_threshold: 8 },
    { tenant_id: tenantId, name_en: 'Banana', name_ar: 'موزة', category: 'fruit', price: 3, calories: 90, allergens: [], is_halal: true, is_prohibited: false, is_available: true, stock_qty: 95, low_stock_threshold: 20 },
    { tenant_id: tenantId, name_en: 'Chocolate muffin', name_ar: 'كعكة شوكولاتة', category: 'dessert', price: 7, calories: 320, allergens: ['gluten', 'dairy', 'eggs'], is_halal: true, is_prohibited: false, is_available: true, stock_qty: 6, low_stock_threshold: 8 },
    { tenant_id: tenantId, name_en: 'Rice pudding', name_ar: 'أرز بالحليب', category: 'dessert', price: 6, calories: 210, allergens: ['dairy'], is_halal: true, is_prohibited: false, is_available: true, stock_qty: 14, low_stock_threshold: 6 },
    { tenant_id: tenantId, name_en: 'Garden salad bowl', name_ar: 'سلطة خضار', category: 'other', price: 12, calories: 95, allergens: [], is_halal: true, is_prohibited: false, is_available: true, stock_qty: 10, low_stock_threshold: 5 },
    { tenant_id: tenantId, name_en: 'Shrimp rice bowl', name_ar: 'أرز بالروبيان', category: 'other', price: 26, calories: 410, allergens: ['shellfish', 'soy'], is_halal: false, is_prohibited: false, is_available: true, stock_qty: 8, low_stock_threshold: 4 },
  ];
}

/** Stable Unsplash URLs for demo store catalog thumbnails */
const STORE_IMAGES = {
  uniformWinter: 'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=640&q=80',
  uniformSummer: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=640&q=80',
  uniformPe: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=640&q=80',
  poolSeason: 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=640&q=80',
  poolDay: 'https://images.unsplash.com/photo-151931590136-fd8fac1d4d63?w=640&q=80',
  pitch: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=640&q=80',
  basketball: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=640&q=80',
  lunchBox: 'https://images.unsplash.com/photo-1604908177525-4519a93a4a2e?w=640&q=80',
  schoolBag: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=640&q=80',
} as const;

type Row = Record<string, unknown>;

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST205' || /could not find the .*?(table|column)/i.test(error.message || '');
}

function throwIfError(error: { message: string } | null, label: string): void {
  if (error) throw new Error(`${label}: ${error.message}`);
}

type RosterStudent = {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  student_id: string | null;
  grade: string | null;
  section: string | null;
};

async function loadRosterStudents(tenantId: string): Promise<RosterStudent[]> {
  const { data, error } = await supabase
    .from('students')
    .select('id, name_en, name_ar, student_id, grade, section, status')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });
  throwIfError(error, 'load roster students');
  return (data ?? []) as RosterStudent[];
}

function pickRosterStudent(
  roster: RosterStudent[],
  namePart: string,
  fallbackIndex: number,
): RosterStudent | null {
  const needle = namePart.toLowerCase();
  const named = roster.find((s) =>
    (s.name_en || '').toLowerCase().includes(needle) || (s.name_ar || '').includes(namePart),
  );
  return named || roster[fallbackIndex] || null;
}

function toSeedStudent(
  row: RosterStudent,
  fallbackGrade: string,
  fallbackSection: string,
): { id: string; nameEn: string; nameAr: string; grade: string; section: string } {
  return {
    id: row.id,
    nameEn: row.name_en || row.name_ar || 'Student',
    nameAr: row.name_ar || row.name_en || '',
    grade: row.grade || fallbackGrade,
    section: row.section || fallbackSection,
  };
}

async function attachGuardian(tenantId: string, studentId: string, guardianId: string): Promise<void> {
  const { error } = await supabase
    .from('students')
    .update({ guardian_id: guardianId })
    .eq('id', studentId)
    .eq('tenant_id', tenantId);
  throwIfError(error, `link guardian to student ${studentId}`);
}

async function resolveDemoTenantOrAbort(): Promise<{ id: string; jurisdiction_code: string | null }> {
  const pinned = process.env.PARENT_SEED_TENANT_ID?.trim();
  if (pinned) {
    const { data, error } = await supabase
      .from('tenants')
      .select('id, is_demo, jurisdiction_code')
      .eq('id', pinned)
      .maybeSingle();
    if (error) throw new DemoGuardError(`Tenant lookup failed: ${error.message}`);
    if (!data) throw new DemoGuardError(`PARENT_SEED_TENANT_ID ${pinned} does not exist.`);
    return data as { id: string; jurisdiction_code: string | null };
  }

  const { data: ownerTenant, error: ownerErr } = await supabase
    .from('tenants')
    .select('id, is_demo, jurisdiction_code')
    .eq('id', PLATFORM_OWNER_TENANT_ID)
    .maybeSingle();
  if (ownerErr) throw new DemoGuardError(`Tenant lookup failed: ${ownerErr.message}`);
  if (ownerTenant && (ownerTenant as { is_demo?: boolean }).is_demo) {
    return ownerTenant as { id: string; jurisdiction_code: string | null };
  }

  for (const slug of ['yamen-demo', 'invoice-test']) {
    const { data, error } = await supabase
      .from('tenants')
      .select('id, is_demo, jurisdiction_code')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw new DemoGuardError(`Tenant lookup failed: ${error.message}`);
    if (data) return data as { id: string; jurisdiction_code: string | null };
  }

  const { data, error } = await supabase
    .from('tenants')
    .select('id, is_demo, jurisdiction_code')
    .eq('is_demo', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new DemoGuardError(`Tenant lookup failed: ${error.message}`);
  if (!data) {
    throw new DemoGuardError(
      'No is_demo tenant found. Create a demo tenant first (this script never creates tenants).',
    );
  }
  return data as { id: string; jurisdiction_code: string | null };
}

async function ensureDemoSchoolIdentity(tenantId: string): Promise<{ slug: string; tenant_code: string }> {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, slug, tenant_code')
    .eq('id', tenantId)
    .maybeSingle();
  throwIfError(error, 'load demo tenant identity');
  const row = data as { slug?: string | null; tenant_code?: string | null } | null;
  const patch: Record<string, string> = {};
  if (!row?.slug) patch.slug = 'demo';
  if (!row?.tenant_code) patch.tenant_code = 'T-DEMO';
  if (Object.keys(patch).length > 0) {
    const { error: updateError } = await supabase.from('tenants').update(patch).eq('id', tenantId);
    throwIfError(updateError, 'set demo tenant slug/code');
  }
  return {
    slug: row?.slug || patch.slug || 'demo',
    tenant_code: row?.tenant_code || patch.tenant_code || 'T-DEMO',
  };
}

async function resolveCurrency(jurisdictionCode: string | null): Promise<string> {
  if (!jurisdictionCode) return 'SAR';
  const { data } = await supabase
    .from('jurisdictions')
    .select('currency_code')
    .eq('code', jurisdictionCode)
    .maybeSingle();
  return ((data as { currency_code?: string } | null)?.currency_code) || 'SAR';
}

async function findOrCreateBranch(tenantId: string): Promise<string> {
  const { data: existing } = await supabase.from('branches').select('id').eq('tenant_id', tenantId).limit(1).maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data, error } = await supabase
    .from('branches')
    .insert({
      tenant_id: tenantId,
      name_en: 'Main Campus',
      name_ar: 'الحرم الرئيسي',
      is_main: true,
    })
    .select('id')
    .single();
  throwIfError(error, 'create branch');
  return (data as { id: string }).id;
}

async function findOrCreateAcademicYear(tenantId: string): Promise<string> {
  const { data: existing } = await supabase
    .from('academic_years')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('name', ACADEMIC_YEAR_LABEL)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data, error } = await supabase
    .from('academic_years')
    .insert({
      tenant_id: tenantId,
      name: ACADEMIC_YEAR_LABEL,
      start_date: '2026-09-01',
      end_date: '2027-06-30',
      is_current: true,
    })
    .select('id')
    .single();
  throwIfError(error, 'create academic year');
  return (data as { id: string }).id;
}

async function findOrCreateGrade(
  tenantId: string,
  branchId: string,
  nameEn: string,
  nameAr: string,
  code: string,
  level: number,
): Promise<{ id: string; sectionName: string; sectionId: string | null }> {
  const { data: existing } = await supabase
    .from('grades')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('name_en', nameEn)
    .maybeSingle();

  let gradeId = (existing as { id: string } | null)?.id;
  if (!gradeId) {
    const { data, error } = await supabase
      .from('grades')
      .insert({ tenant_id: tenantId, name_en: nameEn, name_ar: nameAr, code, level, capacity: 30 })
      .select('id')
      .single();
    throwIfError(error, `create grade ${nameEn}`);
    gradeId = (data as { id: string }).id;
  }

  const { data: section } = await supabase
    .from('sections')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('grade_id', gradeId)
    .limit(1)
    .maybeSingle();
  if (!section) {
    const { data: created, error } = await supabase.from('sections').insert({
      tenant_id: tenantId,
      branch_id: branchId,
      grade_id: gradeId,
      name: 'A',
      capacity: 30,
    }).select('id, name').single();
    throwIfError(error, `create section for ${nameEn}`);
    return { id: gradeId, sectionName: 'A', sectionId: (created as { id: string }).id };
  }
  return {
    id: gradeId,
    sectionName: (section as { name: string }).name || 'A',
    sectionId: (section as { id: string }).id,
  };
}

async function findAuthUserByEmail(email: string): Promise<string | null> {
  const { data: appUser } = await supabase
    .from('users')
    .select('auth_id')
    .eq('email', email)
    .maybeSingle();
  if ((appUser as { auth_id?: string } | null)?.auth_id) {
    return (appUser as { auth_id: string }).auth_id;
  }

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const found = data.users.find((u: { id: string; email?: string }) => u.email?.toLowerCase() === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function upsertDemoAuth(opts: {
  email: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  nameAr: string;
  role: 'parent' | 'admin';
}): Promise<string> {
  const fullName = `${opts.firstName} ${opts.lastName}`;
  const existingId = await findAuthUserByEmail(opts.email);
  const metadata = {
    user_metadata: {
      first_name: opts.firstName,
      last_name: opts.lastName,
      full_name: fullName,
      name: fullName,
      name_ar: opts.nameAr,
    },
    app_metadata: {
      role: opts.role,
      user_role: opts.role,
      tenant_id: opts.tenantId,
    },
  };

  if (existingId) {
    const { error } = await supabase.auth.admin.updateUserById(existingId, {
      password: PARENT_PASSWORD,
      email_confirm: true,
      ...metadata,
    });
    throwIfError(error, `update auth ${opts.email}`);
    return existingId;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: opts.email,
    password: PARENT_PASSWORD,
    email_confirm: true,
    ...metadata,
  });
  throwIfError(error, `create auth ${opts.email}`);
  if (!data.user) throw new Error(`create auth ${opts.email}: no user returned`);
  return data.user.id;
}

async function upsertParentAuth(opts: {
  email: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  nameAr: string;
}): Promise<string> {
  return upsertDemoAuth({ ...opts, role: 'parent' });
}

async function upsertGuardian(opts: {
  tenantId: string;
  email: string;
  nameEn: string;
  nameAr: string;
  phone: string;
  authId: string;
}): Promise<string> {
  const { data: existing } = await supabase
    .from('guardians')
    .select('id')
    .eq('tenant_id', opts.tenantId)
    .eq('email', opts.email)
    .maybeSingle();

  const row = {
    tenant_id: opts.tenantId,
    name_en: opts.nameEn,
    name_ar: opts.nameAr,
    email: opts.email,
    phone: opts.phone,
    relation: 'father',
    auth_id: opts.authId,
  };

  if (existing) {
    const { error } = await supabase.from('guardians').update(row).eq('id', (existing as { id: string }).id);
    throwIfError(error, `update guardian ${opts.email}`);
    return (existing as { id: string }).id;
  }

  const id = crypto.randomUUID();
  const { error } = await supabase.from('guardians').insert({ id, ...row });
  throwIfError(error, `insert guardian ${opts.email}`);
  return id;
}

async function upsertStudent(opts: {
  tenantId: string;
  branchId: string;
  guardianId: string;
  gradeId: string;
  sectionId: string | null;
  academicYearId: string;
  studentCode: string;
  nameEn: string;
  nameAr: string;
  gender: 'male' | 'female';
  dob: string;
}): Promise<string> {
  const { data: existing } = await supabase
    .from('students')
    .select('id')
    .eq('tenant_id', opts.tenantId)
    .eq('student_id', opts.studentCode)
    .maybeSingle();

  const row: Row = {
    tenant_id: opts.tenantId,
    branch_id: opts.branchId,
    guardian_id: opts.guardianId,
    grade_id: opts.gradeId,
    section_id: opts.sectionId,
    academic_year: opts.academicYearId,
    student_id: opts.studentCode,
    name_en: opts.nameEn,
    name_ar: opts.nameAr,
    gender: opts.gender,
    nationality: 'Saudi',
    date_of_birth: opts.dob,
    enrollment_date: '2026-09-01',
    status: 'active',
  };

  if (existing) {
    const { error } = await supabase.from('students').update(row).eq('id', (existing as { id: string }).id);
    throwIfError(error, `update student ${opts.studentCode}`);
    return (existing as { id: string }).id;
  }

  const id = crypto.randomUUID();
  const { error } = await supabase.from('students').insert({ id, ...row });
  throwIfError(error, `insert student ${opts.studentCode}`);
  return id;
}

async function upsertParentUser(opts: {
  authId: string;
  tenantId: string;
  branchId: string;
  email: string;
  name: string;
  nameAr: string;
  studentIds: string[];
}): Promise<void> {
  const { data: existingRows, error: existingErr } = await supabase
    .from('users')
    .select('id')
    .eq('email', opts.email);
  throwIfError(existingErr, `lookup user ${opts.email}`);
  const existing = (existingRows ?? []) as Array<{ id: string }>;

  const row: Row = {
    auth_id: opts.authId,
    tenant_id: opts.tenantId,
    branch_id: opts.branchId,
    email: opts.email,
    name: opts.name,
    name_ar: opts.nameAr,
    user_role: 'parent',
    linked_student_ids: opts.studentIds,
    status: 'active',
  };

  if (existing.length > 0) {
    const keepId = existing[0].id;
    const { error } = await supabase.from('users').update(row).eq('id', keepId);
    throwIfError(error, `update user ${opts.email}`);
    const extras = existing.slice(1).map((r) => r.id);
    if (extras.length > 0) {
      const { error: delErr } = await supabase.from('users').delete().in('id', extras);
      throwIfError(delErr, `remove extra user rows ${opts.email}`);
    }
    return;
  }

  const { error } = await supabase.from('users').insert(row);
  throwIfError(error, `insert user ${opts.email}`);
}

async function upsertStaffUser(opts: {
  authId: string;
  tenantId: string;
  branchId: string;
  email: string;
  name: string;
  nameAr: string;
}): Promise<void> {
  const { data: existingRows, error: existingErr } = await supabase
    .from('users')
    .select('id')
    .eq('email', opts.email);
  throwIfError(existingErr, `lookup staff user ${opts.email}`);
  const existing = (existingRows ?? []) as Array<{ id: string }>;

  const row: Row = {
    auth_id: opts.authId,
    tenant_id: opts.tenantId,
    branch_id: opts.branchId,
    email: opts.email,
    name: opts.name,
    name_ar: opts.nameAr,
    user_role: 'admin',
    linked_student_ids: [],
    status: 'active',
  };

  if (existing.length > 0) {
    const keepId = existing[0].id;
    const { error } = await supabase.from('users').update(row).eq('id', keepId);
    throwIfError(error, `update staff user ${opts.email}`);
    const extras = existing.slice(1).map((r) => r.id);
    if (extras.length > 0) {
      const { error: delErr } = await supabase.from('users').delete().in('id', extras);
      throwIfError(delErr, `remove extra staff rows ${opts.email}`);
    }
    return;
  }

  const { error } = await supabase.from('users').insert(row);
  throwIfError(error, `insert staff user ${opts.email}`);
}

function weekdaysEnding(endDate: string, count: number): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${endDate}T00:00:00Z`);
  while (dates.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 5 && day !== 6) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return dates.reverse();
}

async function replaceChildRows(table: string, tenantId: string, studentIds: string[]): Promise<boolean> {
  if (!studentIds.length) return true;
  const { error } = await supabase.from(table).delete().eq('tenant_id', tenantId).in('student_id', studentIds);
  if (isMissingRelation(error)) {
    console.log(`[seed] skip ${table} (table not in this database)`);
    return false;
  }
  throwIfError(error, `clear ${table}`);
  return true;
}

async function seedAttendance(tenantId: string, branchId: string, students: Array<{ id: string; nameEn: string; grade: string; section: string }>): Promise<void> {
  const dates = weekdaysEnding('2026-08-14', 20);
  const rows: Row[] = [];
  for (const student of students) {
    dates.forEach((date, i) => {
      let status = 'present';
      if (i === 4) status = 'late';
      if (i === 11) status = 'absent';
      if (i === 16) status = 'excused';
      rows.push({
        tenant_id: tenantId,
        branch_id: branchId,
        student_id: student.id,
        student_name: student.nameEn,
        date,
        status,
        grade: student.grade,
        section: student.section,
        notes: status === 'excused' ? 'Medical appointment' : null,
        marked_by: 'Demo Teacher',
      });
    });
  }
  const { error } = await supabase.from('attendances').insert(rows);
  throwIfError(error, 'insert attendances');
}

async function seedGrades(tenantId: string, studentId: string, subjects: Array<{ en: string; ar: string; score: number }>): Promise<void> {
  const rows = subjects.map((s) => ({
    tenant_id: tenantId,
    student_id: studentId,
    subject: s.en,
    subject_ar: s.ar,
    assessment_name: 'Term 2 assessment',
    assessment_name_ar: 'تقييم الفصل الثاني',
    score: s.score,
    max_score: 100,
    letter_grade: s.score >= 90 ? 'A' : s.score >= 80 ? 'B' : s.score >= 70 ? 'C' : 'D',
    term: 'Term 2 2025-2026',
    teacher_name: 'Ms. Noura Al-Qahtani',
    teacher_notes: s.score >= 85 ? 'Excellent progress this term.' : 'Needs extra practice at home.',
  }));
  const { error } = await supabase.from('student_grades').insert(rows);
  if (isMissingRelation(error)) {
    console.log('[seed] skip student_grades (table not in this database)');
    return;
  }
  throwIfError(error, 'insert student_grades');
}

async function seedHomework(tenantId: string, students: Array<{ id: string; grade: string }>): Promise<void> {
  const rows: Row[] = [
    {
      tenant_id: tenantId,
      student_id: students[0].id,
      grade: students[0].grade,
      subject: 'Mathematics',
      subject_ar: 'الرياضيات',
      title_en: 'Fractions worksheet pages 12–14',
      title_ar: 'ورقة عمل الكسور صفحات 12–14',
      description_en: 'Complete the even-numbered exercises and show working.',
      description_ar: 'أكملي التمارين ذات الأرقام الزوجية مع إظهار خطوات الحل.',
      due_date: '2026-08-20',
      status: 'assigned',
      teacher_name: 'Ms. Noura Al-Qahtani',
    },
    {
      tenant_id: tenantId,
      student_id: students[0].id,
      grade: students[0].grade,
      subject: 'Arabic',
      subject_ar: 'اللغة العربية',
      title_en: 'Read unit 4 and summarise',
      title_ar: 'قراءة الوحدة 4 وتلخيصها',
      description_en: 'Write a half-page summary of the story in unit 4.',
      description_ar: 'اكتبي ملخصاً بنصف صفحة لقصة الوحدة الرابعة.',
      due_date: '2026-08-10',
      status: 'submitted',
      teacher_name: 'Mr. Faisal Al-Harbi',
    },
    {
      tenant_id: tenantId,
      student_id: students[1]?.id ?? students[0].id,
      grade: students[1]?.grade ?? students[0].grade,
      subject: 'Science',
      subject_ar: 'العلوم',
      title_en: 'Plant life-cycle diagram',
      title_ar: 'مخطط دورة حياة النبات',
      description_en: 'Draw and label the stages of a plant life cycle.',
      description_ar: 'ارسم مراحل دورة حياة النبات مع التسميات.',
      due_date: '2026-08-22',
      status: 'assigned',
      teacher_name: 'Ms. Huda Al-Mutairi',
    },
  ];
  const { error } = await supabase.from('homework_assignments').insert(rows);
  if (isMissingRelation(error)) {
    console.log('[seed] skip homework_assignments (table not in this database)');
    return;
  }
  throwIfError(error, 'insert homework_assignments');
}

async function seedInvoices(opts: {
  tenantId: string;
  branchId: string;
  currencyCode: string;
  guardianId: string;
  buyerName: string;
  students: Array<{ id: string; nameEn: string; grade: string }>;
}): Promise<void> {
  const { data: demoInvoices } = await supabase
    .from('invoices')
    .select('id')
    .eq('tenant_id', opts.tenantId)
    .like('invoice_number', `${DEMO_PREFIX}-%`);
  const invoiceIds = (demoInvoices ?? []).map((row) => (row as { id: string }).id);
  if (invoiceIds.length > 0) {
    const { error: payDelErr } = await supabase
      .from('payments')
      .delete()
      .eq('tenant_id', opts.tenantId)
      .in('invoice_id', invoiceIds);
    if (payDelErr && !isMissingRelation(payDelErr)) throwIfError(payDelErr, 'clear demo payments');
  }

  const { error: delErr } = await supabase
    .from('invoices')
    .delete()
    .eq('tenant_id', opts.tenantId)
    .like('invoice_number', `${DEMO_PREFIX}-%`);
  throwIfError(delErr, 'clear demo invoices');

  const tuition = (student: { id: string; nameEn: string; grade: string }, extra: Row) => ({
    tenant_id: opts.tenantId,
    currency_code: opts.currencyCode,
    branch_id: opts.branchId,
    student_id: student.id,
    student_name: student.nameEn,
    grade: student.grade,
    guardian_id: opts.guardianId,
    buyer_name: opts.buyerName,
    academic_year: ACADEMIC_YEAR_LABEL,
    document_type: 'invoice',
    invoice_type: 'simplified',
    zatca_invoice_type: 'simplified',
    items: [{
      category_code: 'TUITION',
      description_en: 'Tuition fee',
      description_ar: 'رسوم دراسية',
      quantity: 1,
      unit_amount: extra.subtotal,
      unit_price_net: extra.subtotal,
      subtotal: extra.subtotal,
      vat_rate: 0.15,
      vat_amount: extra.vat_amount,
      vat_category: 'standard',
      vat_category_code: 'S',
      discount: 0,
    }],
    ...extra,
  });

  const sara = opts.students[0];
  const omar = opts.students[1] ?? opts.students[0];

  const rows: Row[] = [
    tuition(sara, {
      invoice_number: `${DEMO_PREFIX}-INV-PAID`,
      date: '2026-01-15',
      issue_date: '2026-01-15',
      supply_date: '2026-01-15',
      due_date: '2026-02-15',
      subtotal: 8000,
      vat_amount: 1200,
      discount_amount: 0,
      total_amount: 9200,
      paid_amount: 9200,
      status: 'paid',
    }),
    tuition(sara, {
      invoice_number: `${DEMO_PREFIX}-INV-PARTIAL`,
      date: '2026-03-01',
      issue_date: '2026-03-01',
      supply_date: '2026-03-01',
      due_date: '2026-09-15',
      subtotal: 4000,
      vat_amount: 600,
      discount_amount: 0,
      total_amount: 4600,
      paid_amount: 2000,
      status: 'partial',
    }),
    tuition(omar, {
      invoice_number: `${DEMO_PREFIX}-INV-UNPAID`,
      date: '2026-06-01',
      issue_date: '2026-06-01',
      supply_date: '2026-06-01',
      due_date: '2026-09-30',
      subtotal: 3500,
      vat_amount: 525,
      discount_amount: 0,
      total_amount: 4025,
      paid_amount: 0,
      status: 'issued',
    }),
    tuition(omar, {
      invoice_number: `${DEMO_PREFIX}-INV-OVERDUE`,
      date: '2026-04-01',
      issue_date: '2026-04-01',
      supply_date: '2026-04-01',
      due_date: '2026-05-01',
      subtotal: 1500,
      vat_amount: 225,
      discount_amount: 0,
      total_amount: 1725,
      paid_amount: 0,
      status: 'overdue',
    }),
  ];

  const { error } = await supabase.from('invoices').insert(rows);
  throwIfError(error, 'insert invoices');
}

async function seedAnnouncements(tenantId: string): Promise<void> {
  const titles = [
    'Parent–teacher meetings next week',
    'National Day holiday — school closed',
    'Winter uniform from 1 October',
  ];
  const { error: delErr } = await supabase
    .from('communications')
    .delete()
    .eq('tenant_id', tenantId)
    .in('subject', titles);
  if (isMissingRelation(delErr)) {
    console.log('[seed] skip communications (table not in this database)');
    return;
  }
  throwIfError(delErr, 'clear demo communications');

  const { error } = await supabase.from('communications').insert([
    {
      tenant_id: tenantId,
      type: 'in_app',
      subject: titles[0],
      body: 'Meetings run Sunday–Tuesday from 4:00 to 7:00 PM. Book a slot with your child\'s homeroom teacher.\n\nتُعقد الاجتماعات من الأحد إلى الثلاثاء من 4:00 إلى 7:00 مساءً.',
      status: 'sent',
      sent_at: '2026-08-12T08:00:00Z',
      recipients: [{ audience: 'parents' }],
    },
    {
      tenant_id: tenantId,
      type: 'in_app',
      subject: titles[1],
      body: 'School will be closed on 23 September. Classes resume on 24 September.\n\nستكون المدرسة مغلقة يوم 23 سبتمبر. تُستأنف الدراسة يوم 24 سبتمبر.',
      status: 'sent',
      sent_at: '2026-08-10T08:00:00Z',
      recipients: [{ audience: 'all' }],
    },
    {
      tenant_id: tenantId,
      type: 'in_app',
      subject: titles[2],
      body: 'Students should wear the winter uniform starting 1 October. The shop is open Sunday–Thursday.\n\nيرجى ارتداء الزي الشتوي ابتداءً من 1 أكتوبر.',
      status: 'sent',
      sent_at: '2026-08-08T08:00:00Z',
      recipients: [{ audience: 'parents' }],
    },
  ]);
  throwIfError(error, 'insert communications');
}

async function seedMessages(opts: {
  tenantId: string;
  parentEmail: string;
  parentName: string;
  students: Array<{ id: string; nameEn: string }>;
}): Promise<void> {
  const { error } = await supabase.from('messages').insert([
    {
      tenant_id: opts.tenantId,
      student_id: opts.students[0].id,
      from_user_email: 'noura.teacher@edusaga.local',
      from_user_name: 'Ms. Noura Al-Qahtani',
      from_user_role: 'teacher',
      to_user_email: opts.parentEmail,
      to_user_name: opts.parentName,
      subject: `${opts.students[0].nameEn} — excellent work in maths`,
      content: `${opts.students[0].nameEn} scored 92 on the latest fractions quiz. Please keep encouraging practice at home.`,
      message_type: 'academic',
      is_read: false,
      created_at: '2026-08-13T09:15:00Z',
    },
    {
      tenant_id: opts.tenantId,
      student_id: opts.students[0].id,
      from_user_email: 'office@edusaga.local',
      from_user_name: 'School Office',
      from_user_role: 'staff',
      to_user_email: opts.parentEmail,
      to_user_name: opts.parentName,
      subject: 'Absence recorded on 30 July',
      content: 'An unexcused absence was recorded. Please submit a medical note if applicable.',
      message_type: 'attendance',
      is_read: true,
      created_at: '2026-07-30T11:00:00Z',
    },
    {
      tenant_id: opts.tenantId,
      student_id: opts.students[1]?.id ?? opts.students[0].id,
      from_user_email: 'finance@edusaga.local',
      from_user_name: 'Finance Office',
      from_user_role: 'staff',
      to_user_email: opts.parentEmail,
      to_user_name: opts.parentName,
      subject: 'Term 2 invoice is ready',
      content: 'A new invoice has been issued. You can view and pay it from Fees & Billing in the parent portal.',
      message_type: 'invoice',
      is_read: false,
      created_at: '2026-08-01T08:00:00Z',
    },
  ]);
  if (isMissingRelation(error)) {
    console.log('[seed] skip messages (table not in this database)');
    return;
  }
  throwIfError(error, 'insert messages');
}

async function seedNotifications(tenantId: string, authUserId: string): Promise<void> {
  const { error: delErr } = await supabase
    .from('notifications')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('user_id', authUserId);
  throwIfError(delErr, 'clear notifications');

  const { error } = await supabase.from('notifications').insert([
    {
      tenant_id: tenantId,
      user_id: authUserId,
      title: 'New invoice issued',
      body: 'Term 2 fees are now available in Fees & Billing.',
      type: 'invoice',
      is_read: false,
      link: '/fees',
    },
    {
      tenant_id: tenantId,
      user_id: authUserId,
      title: 'Absence recorded',
      body: 'An absence was recorded for 30 July. Open Attendance for details.',
      type: 'attendance',
      is_read: false,
      link: '/attendance',
    },
    {
      tenant_id: tenantId,
      user_id: authUserId,
      title: 'Parent–teacher meetings',
      body: 'Book a slot for next week\'s meetings.',
      type: 'announcement',
      is_read: true,
      link: '/announcements',
    },
  ]);
  throwIfError(error, 'insert notifications');
}

async function seedPayments(tenantId: string, invoiceNumber: string): Promise<void> {
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, total_amount')
    .eq('tenant_id', tenantId)
    .eq('invoice_number', invoiceNumber)
    .maybeSingle();
  if (!invoice) return;

  await supabase.from('payments').delete().eq('tenant_id', tenantId).eq('invoice_id', (invoice as { id: string }).id);
  const { error } = await supabase.from('payments').insert({
    tenant_id: tenantId,
    invoice_id: (invoice as { id: string }).id,
    amount: (invoice as { total_amount: number }).total_amount,
    method: 'online',
    reference: `${DEMO_PREFIX}-PAY-1`,
    date: '2026-01-20',
    status: 'completed',
  });
  if (isMissingRelation(error)) {
    console.log('[seed] skip payments (table not in this database)');
    return;
  }
  throwIfError(error, 'insert payments');
}

async function seedApplicationsAndContracts(opts: {
  tenantId: string;
  branchId: string;
  academicYearId: string;
  guardianEmail: string;
  students: Array<{ id: string; nameEn: string; nameAr: string }>;
}): Promise<void> {
  for (const student of opts.students) {
    const docs = [
      { type: 'birth_cert', name: 'birth-certificate.pdf', doc_code: 'birth_cert', path: `${opts.tenantId}/demo/admissions/${student.id}/birth-cert.pdf` },
      { type: 'passport', name: 'passport.pdf', doc_code: 'passport', path: `${opts.tenantId}/demo/admissions/${student.id}/passport.pdf` },
      { type: 'vaccination', name: 'vaccination.pdf', doc_code: 'vaccination', path: `${opts.tenantId}/demo/admissions/${student.id}/vaccination.pdf` },
    ];

    const appRow: Row = {
      tenant_id: opts.tenantId,
      branch_id: opts.branchId,
      application_number: `${DEMO_PREFIX}-APP-${student.nameEn.split(' ')[0].toUpperCase()}`,
      student_name_en: student.nameEn,
      student_name_ar: student.nameAr,
      guardian_email: opts.guardianEmail,
      guardian_name_en: 'Abdullah Al-Farsi',
      stage: 'enrolled',
      pipeline_stage: 'enrolled',
      status: 'accepted',
      document_status: 'documents_complete',
      documents: docs,
      missing_documents: [],
      submitted_at: '2025-05-10T08:00:00Z',
    };

    await supabase
      .from('applications')
      .delete()
      .eq('tenant_id', opts.tenantId)
      .eq('application_number', appRow.application_number as string);

    const { data: app, error: appErr } = await supabase
      .from('applications')
      .insert(appRow)
      .select('id')
      .single();
    if (isMissingRelation(appErr)) {
      console.log('[seed] skip applications (table not in this database)');
      return;
    }
    throwIfError(appErr, 'upsert application');

    if (app?.id) {
      await supabase.from('students').update({ application_id: app.id }).eq('id', student.id).eq('tenant_id', opts.tenantId);
    }

    if (student.nameEn.includes('Sara')) {
      const { data: tpl } = await supabase
        .from('contract_templates')
        .select('id')
        .eq('tenant_id', opts.tenantId)
        .limit(1)
        .maybeSingle();
      let templateId = (tpl as { id: string } | null)?.id;
      if (!templateId) {
        const { data: createdTpl, error: tplErr } = await supabase.from('contract_templates').insert({
          tenant_id: opts.tenantId,
          name: 'Enrollment Agreement 2026-2027',
          type: 'enrollment',
          content: 'Demo enrollment contract',
          is_active: true,
        }).select('id').single();
        if (isMissingRelation(tplErr)) return;
        throwIfError(tplErr, 'insert contract template');
        templateId = (createdTpl as { id: string }).id;
      }

      await supabase.from('student_contracts').delete().eq('tenant_id', opts.tenantId).eq('student_id', student.id);
      const { error: contractErr } = await supabase.from('student_contracts').insert({
        tenant_id: opts.tenantId,
        student_id: student.id,
        template_id: templateId,
        academic_year: opts.academicYearId,
        status: 'signed',
        signed_at: '2026-06-01T10:00:00Z',
        content: 'Signed enrollment agreement for Sara Al-Farsi.',
      });
      if (isMissingRelation(contractErr)) {
        console.log('[seed] skip student_contracts (table not in this database)');
        return;
      }
      throwIfError(contractErr, 'insert student contract');
    }
  }
}

async function seedStudentCanteenAllergens(rows: Array<{ id: string; allergens: string[] }>): Promise<void> {
  for (const row of rows) {
    const { error } = await supabase
      .from('students')
      .update({ canteen_allergens: row.allergens })
      .eq('id', row.id);
    if (isMissingRelation(error)) {
      console.log('[seed] skip canteen_allergens (column not in this database)');
      return;
    }
    throwIfError(error, `set canteen allergens for ${row.id}`);
  }
}

async function ensureCanteenModuleEnabled(tenantId: string): Promise<void> {
  const { data, error } = await supabase.from('tenants').select('enabled_modules').eq('id', tenantId).single();
  throwIfError(error, 'load tenant enabled_modules');
  const modules = (data as { enabled_modules?: string[] | null })?.enabled_modules ?? [];
  if (modules.includes('canteen')) return;
  const { error: updateErr } = await supabase
    .from('tenants')
    .update({ enabled_modules: [...modules, 'canteen'] })
    .eq('id', tenantId);
  throwIfError(updateErr, 'enable canteen module on tenant');
}

async function seedCanteenStockHistory(
  tenantId: string,
  items: Array<{ id: string; name_en: string; name_ar?: string | null; stock_qty: number }>,
): Promise<Map<string, { id: string; name_ar?: string | null; name_en: string; stock_qty: number }>> {
  const byName = new Map<string, { id: string; name_ar?: string | null; name_en: string; stock_qty: number }>();
  const openingRows: Row[] = [];
  for (const item of items) {
    byName.set(item.name_en, { ...item });
    if (item.stock_qty > 0) {
      openingRows.push({
        tenant_id: tenantId,
        item_id: item.id,
        item_name: item.name_ar || item.name_en,
        movement_type: 'opening',
        qty_delta: item.stock_qty,
        qty_before: 0,
        qty_after: item.stock_qty,
        reason: 'Opening stock for term',
        performed_by: 'seed',
      });
    }
  }
  if (openingRows.length) {
    const { error: openingErr } = await supabase.from('canteen_stock_movements').insert(openingRows);
    if (isMissingRelation(openingErr)) {
      console.log('[seed] skip canteen_stock_movements (table not in this database)');
      return byName;
    }
    throwIfError(openingErr, 'insert canteen opening stock');
  }

  const extras: Array<{ nameEn: string; type: string; delta: number; reason: string }> = [
    { nameEn: 'Fresh orange juice', type: 'receive', delta: 20, reason: 'Morning delivery from supplier' },
    { nameEn: 'Banana', type: 'waste', delta: -5, reason: 'Overripe fruit discarded' },
  ];
  const extraRows: Row[] = [];
  for (const extra of extras) {
    const item = byName.get(extra.nameEn);
    if (!item) continue;
    const before = item.stock_qty;
    const after = before + extra.delta;
    extraRows.push({
      tenant_id: tenantId,
      item_id: item.id,
      item_name: item.name_ar || item.name_en,
      movement_type: extra.type,
      qty_delta: extra.delta,
      qty_before: before,
      qty_after: after,
      reason: extra.reason,
      performed_by: 'seed',
    });
    item.stock_qty = after;
    const { error: updErr } = await supabase
      .from('canteen_menu_items')
      .update({ stock_qty: after })
      .eq('id', item.id);
    throwIfError(updErr, `update stock for ${extra.nameEn}`);
  }
  if (extraRows.length) {
    const { error: extraErr } = await supabase.from('canteen_stock_movements').insert(extraRows);
    throwIfError(extraErr, 'insert canteen extra stock movements');
  }
  return byName;
}

async function seedCanteen(tenantId: string, students: Array<{ id: string; nameEn: string; grade: string }>): Promise<void> {
  await ensureCanteenModuleEnabled(tenantId);
  const { error: clearMovementsErr } = await supabase.from('canteen_stock_movements').delete().eq('tenant_id', tenantId);
  if (clearMovementsErr && !isMissingRelation(clearMovementsErr)) {
    throwIfError(clearMovementsErr, 'clear canteen stock movements');
  }
  await replaceChildRows('canteen_transactions', tenantId, students.map((s) => s.id));
  await replaceChildRows('canteen_wallets', tenantId, students.map((s) => s.id));

  const menuRows = buildCanteenMenuRows(tenantId);
  const { error: menuErr } = await supabase.from('canteen_menu_items').delete().eq('tenant_id', tenantId);
  if (isMissingRelation(menuErr)) {
    console.log('[seed] skip canteen_menu_items (table not in this database)');
    return;
  }
  throwIfError(menuErr, 'clear canteen menu');
  const { data: insertedMenu, error: insertMenuErr } = await supabase
    .from('canteen_menu_items')
    .insert(menuRows)
    .select('id, name_en, name_ar, stock_qty');
  throwIfError(insertMenuErr, 'insert canteen menu');
  const menuByName = await seedCanteenStockHistory(
    tenantId,
    (insertedMenu || []) as Array<{ id: string; name_en: string; name_ar?: string | null; stock_qty: number }>,
  );

  const today = demoTodayIso();
  const namedProfiles = [
    { studentMatch: 'Sara', balance: 62.5, dailyLimit: 35, topups: [100, 50], purchases: [37.5, 12, 38] },
    { studentMatch: 'Omar', balance: 14, dailyLimit: 25, topups: [100], purchases: [86] },
    { studentMatch: 'Layla', balance: 28, dailyLimit: 20, topups: [50], purchases: [22] },
  ];
  const fallbackProfiles = [
    { balance: 62.5, dailyLimit: 35, topups: [100, 50], purchases: [37.5, 12, 38] },
    { balance: 14, dailyLimit: 25, topups: [100], purchases: [86] },
    { balance: 0, dailyLimit: 15, topups: [40], purchases: [40] },
    { balance: 28, dailyLimit: 20, topups: [50], purchases: [22] },
  ];

  for (const [index, student] of students.entries()) {
    const profile =
      namedProfiles.find((p) => student.nameEn.includes(p.studentMatch))
      ?? fallbackProfiles[index % fallbackProfiles.length];
    const { data: wallet, error: walletErr } = await supabase.from('canteen_wallets').insert({
      tenant_id: tenantId,
      student_id: student.id,
      student_name: student.nameEn,
      grade: student.grade,
      balance: profile.balance,
      daily_spend_limit: profile.dailyLimit,
      is_active: true,
      last_transaction_date: today,
    }).select('id').single();
    throwIfError(walletErr, 'insert canteen wallet');

    let running = 0;
    const txRows: Row[] = [];
    for (const [topupIdx, topupAmount] of profile.topups.entries()) {
      const before = running;
      running += topupAmount;
      txRows.push({
        tenant_id: tenantId,
        wallet_id: (wallet as { id: string }).id,
        student_id: student.id,
        student_name: student.nameEn,
        transaction_type: 'topup',
        amount: topupAmount,
        balance_before: before,
        balance_after: running,
        payment_method: 'online',
        transaction_date: `2026-08-${String(1 + topupIdx).padStart(2, '0')}`,
        transaction_time: '09:00',
        notes: topupIdx === 0 ? 'Initial wallet top-up' : 'Monthly top-up',
      });
    }
    for (const [purchaseIdx, purchaseAmount] of profile.purchases.entries()) {
      const menuItem = menuRows[purchaseIdx % menuRows.length] as { name_en: string; name_ar?: string; price: number };
      const before = running;
      running -= purchaseAmount;
      txRows.push({
        tenant_id: tenantId,
        wallet_id: (wallet as { id: string }).id,
        student_id: student.id,
        student_name: student.nameEn,
        transaction_type: 'purchase',
        amount: purchaseAmount,
        balance_before: before,
        balance_after: running,
        payment_method: 'wallet',
        items: [{
          item_name: menuItem.name_ar || menuItem.name_en,
          name_en: menuItem.name_en,
          quantity: 1,
          unit_price: purchaseAmount,
          price: purchaseAmount,
        }],
        transaction_date: `2026-08-${String(10 + purchaseIdx).padStart(2, '0')}`,
        transaction_time: '12:30',
      });
    }

    // Today's POS sales — powers dashboard "Today's Revenue" and "Top Items"
    if (index === 0 && profile.balance > 0) {
      const lunchItems = [
        { item_name: (menuRows[0] as Row).name_ar, quantity: 2, unit_price: 18 },
        { item_name: (menuRows[9] as Row).name_ar, quantity: 1, unit_price: 8 },
      ];
      const todayAmount = 44;
      const beforeTopup = running;
      running += todayAmount;
      txRows.push({
        tenant_id: tenantId,
        wallet_id: (wallet as { id: string }).id,
        student_id: student.id,
        student_name: student.nameEn,
        transaction_type: 'topup',
        amount: todayAmount,
        balance_before: beforeTopup,
        balance_after: running,
        payment_method: 'online',
        transaction_date: today,
        transaction_time: '08:00',
        notes: 'Morning top-up before lunch',
      });
      const beforePurchase = running;
      running -= todayAmount;
      txRows.push({
        tenant_id: tenantId,
        wallet_id: (wallet as { id: string }).id,
        student_id: student.id,
        student_name: student.nameEn,
        transaction_type: 'purchase',
        amount: todayAmount,
        balance_before: beforePurchase,
        balance_after: running,
        payment_method: 'wallet',
        items: lunchItems,
        transaction_date: today,
        transaction_time: '12:15',
      });
    }

    const { error: txErr } = await supabase.from('canteen_transactions').insert(txRows);
    throwIfError(txErr, 'insert canteen transactions');

    if (running !== profile.balance) {
      throw new Error(`canteen balance mismatch for ${student.nameEn}: ledger ${running} vs wallet ${profile.balance}`);
    }
  }

  const todaySaleLines = [
    { nameEn: 'Chicken shawarma wrap', qty: 2 },
    { nameEn: 'Mixed fruit cup', qty: 1 },
  ];
  const saleMovementRows: Row[] = [];
  for (const line of todaySaleLines) {
    const item = menuByName.get(line.nameEn);
    if (!item) continue;
    const before = item.stock_qty;
    const after = Math.max(0, before - line.qty);
    saleMovementRows.push({
      tenant_id: tenantId,
      item_id: item.id,
      item_name: item.name_ar || item.name_en,
      movement_type: 'sale',
      qty_delta: -line.qty,
      qty_before: before,
      qty_after: after,
      reason: 'POS lunch sale',
      performed_by: 'seed',
    });
    item.stock_qty = after;
    const { error: saleStockErr } = await supabase
      .from('canteen_menu_items')
      .update({ stock_qty: after })
      .eq('id', item.id);
    throwIfError(saleStockErr, `decrement stock for ${line.nameEn}`);
  }
  if (saleMovementRows.length) {
    const { error: saleMoveErr } = await supabase.from('canteen_stock_movements').insert(saleMovementRows);
    if (saleMoveErr && !isMissingRelation(saleMoveErr)) {
      throwIfError(saleMoveErr, 'insert canteen sale stock movements');
    }
  }
}

/** Seed canteen on the platform-owner tenant so Muhammed@edusaga360.com sees data in Canteen Management. */
async function seedCanteenForPlatformOwnerTenant(primaryTenantId: string): Promise<void> {
  if (primaryTenantId === PLATFORM_OWNER_TENANT_ID) return;

  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, is_demo, name_en')
    .eq('id', PLATFORM_OWNER_TENANT_ID)
    .maybeSingle();
  if (tenantErr) throw new Error(tenantErr.message);
  if (!tenant || !(tenant as { is_demo?: boolean }).is_demo) return;

  const { data: students, error: studentErr } = await supabase
    .from('students')
    .select('id, name_en, grade')
    .eq('tenant_id', PLATFORM_OWNER_TENANT_ID)
    .eq('status', 'active')
    .order('name_en', { ascending: true })
    .limit(3);
  if (studentErr) throw new Error(studentErr.message);
  if (!students?.length) {
    console.log('[seed] skip platform-owner canteen (no active students on edusaga360 tenant)');
    return;
  }

  const rows = students.map((s) => ({
    id: (s as { id: string }).id,
    nameEn: (s as { name_en: string }).name_en,
    grade: (s as { grade?: string | null }).grade || 'Grade 1',
  }));

  await seedCanteen(PLATFORM_OWNER_TENANT_ID, rows);
  await seedStudentCanteenAllergens(rows.map((row, index) => ({
    id: row.id,
    allergens: index === 0 ? ['dairy', 'gluten'] : index === 1 ? ['nuts'] : [],
  })));
  console.log(`[seed] canteen seeded for platform owner tenant (${(tenant as { name_en?: string }).name_en}) — ${rows.length} wallets`);
}

async function ensureStoreModuleEnabled(tenantId: string): Promise<void> {
  const { data, error } = await supabase.from('tenants').select('enabled_modules').eq('id', tenantId).single();
  throwIfError(error, 'load tenant enabled_modules for store');
  const modules = (data as { enabled_modules?: string[] | null })?.enabled_modules ?? [];
  if (modules.includes('store')) return;
  const { error: updateErr } = await supabase
    .from('tenants')
    .update({ enabled_modules: [...modules, 'store'] })
    .eq('id', tenantId);
  throwIfError(updateErr, 'enable store module on tenant');
}

async function seedStoreCategories(tenantId: string): Promise<void> {
  const rows = [
    { slug: 'uniform', name_en: 'Uniforms', name_ar: 'الزي المدرسي', sort_order: 1 },
    { slug: 'pool', name_en: 'Pool', name_ar: 'المسبح', sort_order: 2 },
    { slug: 'playground', name_en: 'Playground', name_ar: 'الملاعب', sort_order: 3 },
    { slug: 'other', name_en: 'Other', name_ar: 'أخرى', sort_order: 4 },
  ].map((row) => ({ tenant_id: tenantId, ...row, is_active: true }));
  const { error } = await supabase.from('store_categories').upsert(rows, { onConflict: 'tenant_id,slug' });
  if (isMissingRelation(error)) {
    console.log('[seed] skip store_categories (table not in this database)');
    return;
  }
  throwIfError(error, 'upsert store categories');
}

const BOOKABLE_WEEKDAYS = [0, 1, 2, 3, 4, 6];

async function seedStoreAvailability(opts: {
  tenantId: string;
  productIds: string[];
}): Promise<void> {
  const { error: clearHours } = await supabase.from('store_product_hours').delete().eq('tenant_id', opts.tenantId);
  if (isMissingRelation(clearHours)) {
    console.log('[seed] skip store_product_hours (table not in this database)');
    return;
  }
  throwIfError(clearHours, 'clear store hours');
  const { error: clearBlackouts } = await supabase.from('store_product_blackouts').delete().eq('tenant_id', opts.tenantId);
  throwIfError(clearBlackouts, 'clear store blackouts');
  const { error: clearBookings } = await supabase.from('store_bookings').delete().eq('tenant_id', opts.tenantId);
  throwIfError(clearBookings, 'clear store bookings');

  const hours = opts.productIds.flatMap((productId) =>
    BOOKABLE_WEEKDAYS.map((weekday) => ({
      tenant_id: opts.tenantId,
      product_id: productId,
      weekday,
      start_time: '16:00:00',
      end_time: '21:00:00',
      slot_minutes: 60,
      capacity: 1,
    })),
  );
  if (hours.length) {
    const { error } = await supabase.from('store_product_hours').insert(hours);
    throwIfError(error, 'insert store hours');
  }
}

async function seedStore(opts: {
  tenantId: string;
  branchId: string;
  currencyCode: string;
  students: Array<{ id: string; nameEn: string }>;
  guardianId: string;
}): Promise<void> {
  await ensureStoreModuleEnabled(opts.tenantId);
  await seedStoreCategories(opts.tenantId);

  const { error: clearProductsErr } = await supabase
    .from('store_products')
    .delete()
    .eq('tenant_id', opts.tenantId)
    .like('sku', `${DEMO_PREFIX}-%`);
  if (isMissingRelation(clearProductsErr)) {
    console.log('[seed] skip store_products (table not in this database)');
    return;
  }
  throwIfError(clearProductsErr, 'clear store products');

  const products = [
    {
      tenant_id: opts.tenantId,
      sku: `${DEMO_PREFIX}-UNI-WIN`,
      name_en: 'Winter uniform kit',
      name_ar: 'طقم الزي الشتوي',
      description_en: 'Blazer, trousers, and school tie for the winter term.',
      description_ar: 'سترة وبنطلون وربطة عنق للفصل الشتوي.',
      category: 'uniform',
      fulfillment_mode: 'purchase',
      tax_code: 'UNIFORM',
      price_purchase: 350,
      variants: [{ label: 'S' }, { label: 'M' }, { label: 'L' }],
      stock_qty: 40,
      collect_location: 'Uniform shop — main reception',
      image_url: STORE_IMAGES.uniformWinter,
      is_active: true,
      is_bookable: false,
    },
    {
      tenant_id: opts.tenantId,
      sku: `${DEMO_PREFIX}-UNI-SUM`,
      name_en: 'Summer uniform set',
      name_ar: 'طقم الزي الصيفي',
      description_en: 'Lightweight polo and shorts for warmer months.',
      description_ar: 'قميص بولو وشورت خفيف للأشهر الدافئة.',
      category: 'uniform',
      fulfillment_mode: 'purchase',
      tax_code: 'UNIFORM',
      price_purchase: 220,
      variants: [{ label: 'S' }, { label: 'M' }, { label: 'L' }],
      stock_qty: 55,
      collect_location: 'Uniform shop — main reception',
      image_url: STORE_IMAGES.uniformSummer,
      is_active: true,
      is_bookable: false,
    },
    {
      tenant_id: opts.tenantId,
      sku: `${DEMO_PREFIX}-UNI-PE`,
      name_en: 'PE sports kit',
      name_ar: 'طقم التربية البدنية',
      description_en: 'House-colour shirt, shorts, and trainers bag.',
      description_ar: 'قميص بألوان البيت وشورت وحقيبة أحذية.',
      category: 'uniform',
      fulfillment_mode: 'purchase',
      tax_code: 'UNIFORM',
      price_purchase: 180,
      variants: [{ label: 'S' }, { label: 'M' }],
      stock_qty: 30,
      collect_location: 'Uniform shop — main reception',
      image_url: STORE_IMAGES.uniformPe,
      is_active: true,
      is_bookable: false,
    },
    {
      tenant_id: opts.tenantId,
      sku: `${DEMO_PREFIX}-POOL-SEASON`,
      name_en: 'Pool season pass',
      name_ar: 'تذكرة موسم المسبح',
      description_en: 'Unlimited pool access for the full academic year.',
      description_ar: 'دخول غير محدود للمسبح طوال العام الدراسي.',
      category: 'pool',
      fulfillment_mode: 'purchase',
      tax_code: 'ACTIVITIES',
      price_purchase: 500,
      variants: [],
      stock_qty: 25,
      collect_location: 'Sports office',
      image_url: STORE_IMAGES.poolSeason,
      is_active: true,
      is_bookable: false,
    },
    {
      tenant_id: opts.tenantId,
      sku: `${DEMO_PREFIX}-POOL-DAY`,
      name_en: 'Pool day pass',
      name_ar: 'تذكرة يوم المسبح',
      description_en: 'Single-day family pool access on weekends.',
      description_ar: 'دخول عائلي ليوم واحد في عطلة نهاية الأسبوع.',
      category: 'pool',
      fulfillment_mode: 'purchase',
      tax_code: 'ACTIVITIES',
      price_purchase: 45,
      variants: [],
      stock_qty: 100,
      collect_location: 'Sports office',
      image_url: STORE_IMAGES.poolDay,
      is_active: true,
      is_bookable: false,
    },
    {
      tenant_id: opts.tenantId,
      sku: `${DEMO_PREFIX}-PITCH`,
      name_en: 'Football pitch — hourly rental',
      name_ar: 'إيجار ملعب كرة القدم — بالساعة',
      description_en: 'Artificial turf pitch with floodlights.',
      description_ar: 'ملعب عشب صناعي مع إضاءة ليلية.',
      category: 'playground',
      fulfillment_mode: 'rental',
      tax_code: 'ACTIVITIES',
      price_rental: 120,
      rental_unit: 'hour',
      variants: [],
      stock_qty: 10,
      collect_location: 'Sports office',
      image_url: STORE_IMAGES.pitch,
      is_active: true,
      is_bookable: true,
    },
    {
      tenant_id: opts.tenantId,
      sku: `${DEMO_PREFIX}-BASKET`,
      name_en: 'Basketball court — hourly rental',
      name_ar: 'إيجار ملعب كرة السلة — بالساعة',
      description_en: 'Indoor court booking for practice sessions.',
      description_ar: 'حجز ملعب داخلي لجلسات التدريب.',
      category: 'playground',
      fulfillment_mode: 'both',
      tax_code: 'ACTIVITIES',
      price_purchase: 800,
      price_rental: 90,
      rental_unit: 'hour',
      variants: [],
      stock_qty: 8,
      collect_location: 'Sports office',
      image_url: STORE_IMAGES.basketball,
      is_active: true,
      is_bookable: true,
    },
    {
      tenant_id: opts.tenantId,
      sku: `${DEMO_PREFIX}-LUNCH`,
      name_en: 'Insulated lunch box',
      name_ar: 'علبة غداء معزولة',
      description_en: 'School-branded bento box with cutlery set.',
      description_ar: 'علبة بينتو بشعار المدرسة مع أدوات مائدة.',
      category: 'other',
      fulfillment_mode: 'purchase',
      tax_code: 'UNIFORM',
      price_purchase: 65,
      variants: [{ label: 'Blue' }, { label: 'Green' }],
      stock_qty: 60,
      collect_location: 'Uniform shop — main reception',
      image_url: STORE_IMAGES.lunchBox,
      is_active: true,
      is_bookable: false,
    },
    {
      tenant_id: opts.tenantId,
      sku: `${DEMO_PREFIX}-BAG`,
      name_en: 'School backpack',
      name_ar: 'حقيبة مدرسية',
      description_en: 'Ergonomic backpack with laptop sleeve.',
      description_ar: 'حقيبة ظهر مريحة مع جيب للحاسوب.',
      category: 'other',
      fulfillment_mode: 'purchase',
      tax_code: 'UNIFORM',
      price_purchase: 145,
      variants: [{ label: 'Standard' }],
      stock_qty: 35,
      collect_location: 'Uniform shop — main reception',
      image_url: STORE_IMAGES.schoolBag,
      is_active: true,
      is_bookable: false,
    },
  ];
  const { data: insertedProducts, error: prodErr } = await supabase
    .from('store_products')
    .insert(products)
    .select('id, sku, name_en, price_purchase, price_rental');
  throwIfError(prodErr, 'insert store products');

  const bySku = Object.fromEntries(
    (insertedProducts ?? []).map((p) => [(p as { sku: string }).sku, p as { id: string; name_en: string; price_purchase: number }]),
  );

  const student = opts.students[0];
  const uniform = bySku[`${DEMO_PREFIX}-UNI-WIN`];
  if (!uniform || !student) return;

  const subtotal = Number(uniform.price_purchase);
  const vat = Math.round(subtotal * 0.15 * 100) / 100;
  const total = subtotal + vat;
  const orderNumber = `${DEMO_PREFIX}-ORD-READY`;

  await supabase.from('store_orders').delete().eq('tenant_id', opts.tenantId).like('order_number', `${DEMO_PREFIX}-%`);
  const { data: order, error: orderErr } = await supabase.from('store_orders').insert({
    tenant_id: opts.tenantId,
    branch_id: opts.branchId,
    student_id: student.id,
    order_number: orderNumber,
    status: 'ready_for_collect',
    subtotal,
    vat_amount: vat,
    total_amount: total,
    currency_code: opts.currencyCode,
    collect_location: 'Uniform shop — main reception',
    paid_at: '2026-08-10T11:00:00Z',
  }).select('id').single();
  throwIfError(orderErr, 'insert store order');

  await supabase.from('store_order_lines').insert({
    tenant_id: opts.tenantId,
    order_id: (order as { id: string }).id,
    product_id: uniform.id,
    line_type: 'purchase',
    product_name_en: uniform.name_en,
    product_name_ar: 'طقم الزي الشتوي',
    variant_label: 'M',
    quantity: 1,
    unit_price: subtotal,
    line_total: subtotal,
    tax_code: 'UNIFORM',
  });

  const pendingOrderNumber = `${DEMO_PREFIX}-ORD-PENDING`;
  const { data: pendingOrder, error: pendingErr } = await supabase.from('store_orders').insert({
    tenant_id: opts.tenantId,
    branch_id: opts.branchId,
    student_id: student.id,
    order_number: pendingOrderNumber,
    status: 'pending_payment',
    subtotal: 120,
    vat_amount: 18,
    total_amount: 138,
    currency_code: opts.currencyCode,
    collect_location: 'Sports office',
  }).select('id').single();
  throwIfError(pendingErr, 'insert pending store order');

  const pitch = bySku[`${DEMO_PREFIX}-PITCH`];
  const basket = bySku[`${DEMO_PREFIX}-BASKET`];
  await seedStoreAvailability({
    tenantId: opts.tenantId,
    productIds: [pitch?.id, basket?.id].filter(Boolean) as string[],
  });

  if (pitch) {
    const slotStart = '2026-08-23T16:00:00+03:00';
    const slotEnd = '2026-08-23T17:00:00+03:00';
    await supabase.from('store_order_lines').insert({
      tenant_id: opts.tenantId,
      order_id: (pendingOrder as { id: string }).id,
      product_id: pitch.id,
      line_type: 'rental',
      product_name_en: pitch.name_en,
      quantity: 1,
      unit_price: 120,
      line_total: 120,
      tax_code: 'ACTIVITIES',
      slot_start: slotStart,
      slot_end: slotEnd,
    });
    const { error: heldErr } = await supabase.from('store_bookings').insert({
      tenant_id: opts.tenantId,
      product_id: pitch.id,
      order_id: (pendingOrder as { id: string }).id,
      student_id: student.id,
      starts_at: slotStart,
      ends_at: slotEnd,
      kind: 'booking',
      status: 'held',
    });
    if (!isMissingRelation(heldErr)) throwIfError(heldErr, 'insert held pitch booking');

    const confirmedStart = '2026-08-22T16:00:00+03:00';
    const confirmedEnd = '2026-08-22T17:00:00+03:00';
    const { data: bookedOrder, error: bookedErr } = await supabase.from('store_orders').insert({
      tenant_id: opts.tenantId,
      branch_id: opts.branchId,
      student_id: student.id,
      order_number: `${DEMO_PREFIX}-ORD-BOOKED`,
      status: 'ready_for_collect',
      subtotal: 120,
      vat_amount: 18,
      total_amount: 138,
      currency_code: opts.currencyCode,
      collect_location: 'Sports office',
      paid_at: '2026-08-15T10:00:00Z',
    }).select('id').single();
    throwIfError(bookedErr, 'insert confirmed pitch order');
    await supabase.from('store_order_lines').insert({
      tenant_id: opts.tenantId,
      order_id: (bookedOrder as { id: string }).id,
      product_id: pitch.id,
      line_type: 'rental',
      product_name_en: pitch.name_en,
      quantity: 1,
      unit_price: 120,
      line_total: 120,
      tax_code: 'ACTIVITIES',
      slot_start: confirmedStart,
      slot_end: confirmedEnd,
    });
    const { error: confErr } = await supabase.from('store_bookings').insert({
      tenant_id: opts.tenantId,
      product_id: pitch.id,
      order_id: (bookedOrder as { id: string }).id,
      student_id: student.id,
      starts_at: confirmedStart,
      ends_at: confirmedEnd,
      kind: 'booking',
      status: 'confirmed',
    });
    if (!isMissingRelation(confErr)) throwIfError(confErr, 'insert confirmed pitch booking');
  }
}

async function main() {
  assertDemoDatabase();
  const tenant = await resolveDemoTenantOrAbort();
  const identity = await ensureDemoSchoolIdentity(tenant.id);
  await assertDemoTarget(supabase, tenant.id);

  const currencyCode = await resolveCurrency(tenant.jurisdiction_code);
  const branchId = await findOrCreateBranch(tenant.id);
  const academicYearId = await findOrCreateAcademicYear(tenant.id);
  const grade3 = await findOrCreateGrade(tenant.id, branchId, 'Grade 3', 'الصف الثالث', 'G3', 3);
  const grade1 = await findOrCreateGrade(tenant.id, branchId, 'Grade 1', 'الصف الأول', 'G1', 1);

  const fullAuthId = await upsertParentAuth({
    email: FULL_PARENT_EMAIL,
    tenantId: tenant.id,
    firstName: 'Abdullah',
    lastName: 'Al-Farsi',
    nameAr: 'عبدالله الفارسي',
  });
  const emptyAuthId = await upsertParentAuth({
    email: EMPTY_PARENT_EMAIL,
    tenantId: tenant.id,
    firstName: 'Noura',
    lastName: 'Al-Saud',
    nameAr: 'نورة آل سعود',
  });
  const staffAuthId = await upsertDemoAuth({
    email: STAFF_DEMO_EMAIL,
    tenantId: tenant.id,
    firstName: 'Khalid',
    lastName: 'Al-Otaibi',
    nameAr: 'خالد العتيبي',
    role: 'admin',
  });

  const fullGuardianId = await upsertGuardian({
    tenantId: tenant.id,
    email: FULL_PARENT_EMAIL,
    nameEn: 'Abdullah Al-Farsi',
    nameAr: 'عبدالله الفارسي',
    phone: '+966501001001',
    authId: fullAuthId,
  });
  const emptyGuardianId = await upsertGuardian({
    tenantId: tenant.id,
    email: EMPTY_PARENT_EMAIL,
    nameEn: 'Noura Al-Saud',
    nameAr: 'نورة آل سعود',
    phone: '+966501001002',
    authId: emptyAuthId,
  });

  const roster = await loadRosterStudents(tenant.id);
  const schoolRoster = roster.filter((s) => !String(s.student_id || '').startsWith(DEMO_PREFIX));
  const pool = schoolRoster.length > 0 ? schoolRoster : roster;
  if (pool.length === 0) {
    throw new Error('No students on this demo tenant. Add students in the Students module first, then re-run the seed.');
  }

  const fullFirst = pickRosterStudent(pool, 'sara', 0);
  if (!fullFirst) {
    throw new Error('No students on this demo tenant. Add students in the Students module first, then re-run the seed.');
  }
  const remainingAfterFirst = pool.filter((s) => s.id !== fullFirst.id);
  const fullSecond = pickRosterStudent(remainingAfterFirst, 'omar', 0);
  const remainingAfterFull = remainingAfterFirst.filter((s) => s.id !== fullSecond?.id);
  const emptyChild = pickRosterStudent(remainingAfterFull, 'layla', 0);

  const saraId = fullFirst.id;
  const omarId = fullSecond?.id;
  const laylaId = emptyChild?.id;

  await attachGuardian(tenant.id, saraId, fullGuardianId);
  if (omarId) await attachGuardian(tenant.id, omarId, fullGuardianId);
  if (laylaId) await attachGuardian(tenant.id, laylaId, emptyGuardianId);

  await upsertParentUser({
    authId: fullAuthId,
    tenantId: tenant.id,
    branchId,
    email: FULL_PARENT_EMAIL,
    name: 'Abdullah Al-Farsi',
    nameAr: 'عبدالله الفارسي',
    studentIds: [saraId, omarId].filter((id): id is string => Boolean(id)),
  });
  await upsertParentUser({
    authId: emptyAuthId,
    tenantId: tenant.id,
    branchId,
    email: EMPTY_PARENT_EMAIL,
    name: 'Noura Al-Saud',
    nameAr: 'نورة آل سعود',
    studentIds: laylaId ? [laylaId] : [],
  });
  await upsertStaffUser({
    authId: staffAuthId,
    tenantId: tenant.id,
    branchId,
    email: STAFF_DEMO_EMAIL,
    name: 'Khalid Al-Otaibi',
    nameAr: 'خالد العتيبي',
  });

  const firstSeed = toSeedStudent(fullFirst, 'Grade 3', grade3.sectionName);
  const secondSeed = fullSecond
    ? toSeedStudent(fullSecond, 'Grade 1', grade1.sectionName)
    : null;
  const emptySeed = emptyChild
    ? toSeedStudent(emptyChild, 'Grade 1', grade1.sectionName)
    : null;

  const allStudents = [firstSeed, secondSeed, emptySeed].filter(Boolean) as Array<{
    id: string; nameEn: string; nameAr: string; grade: string; section: string;
  }>;
  const fullStudents = [firstSeed, secondSeed].filter(Boolean) as Array<{
    id: string; nameEn: string; nameAr: string; grade: string; section: string;
  }>;
  const childIds = allStudents.map((s) => s.id);

  await seedStudentCanteenAllergens(
    allStudents.map((student, index) => ({
      id: student.id,
      allergens: index === 0 ? ['dairy', 'gluten'] : index === 1 ? ['nuts'] : [],
    })),
  );

  await replaceChildRows('attendances', tenant.id, childIds);
  await replaceChildRows('student_grades', tenant.id, childIds);
  await replaceChildRows('homework_assignments', tenant.id, childIds);
  await replaceChildRows('messages', tenant.id, childIds);

  await seedAttendance(tenant.id, branchId, fullStudents);
  await seedGrades(tenant.id, firstSeed.id, [
    { en: 'Mathematics', ar: 'الرياضيات', score: 92 },
    { en: 'Arabic', ar: 'اللغة العربية', score: 88 },
    { en: 'English', ar: 'اللغة الإنجليزية', score: 85 },
    { en: 'Science', ar: 'العلوم', score: 79 },
    { en: 'Islamic Studies', ar: 'الدراسات الإسلامية', score: 94 },
  ]);
  if (secondSeed) {
    await seedGrades(tenant.id, secondSeed.id, [
      { en: 'Mathematics', ar: 'الرياضيات', score: 81 },
      { en: 'Arabic', ar: 'اللغة العربية', score: 90 },
      { en: 'English', ar: 'اللغة الإنجليزية', score: 74 },
      { en: 'Science', ar: 'العلوم', score: 86 },
    ]);
  }
  await seedHomework(tenant.id, fullStudents);
  await seedInvoices({
    tenantId: tenant.id,
    branchId,
    currencyCode,
    guardianId: fullGuardianId,
    buyerName: 'Abdullah Al-Farsi',
    students: fullStudents,
  });
  await seedAnnouncements(tenant.id);
  await seedMessages({
    tenantId: tenant.id,
    parentEmail: FULL_PARENT_EMAIL,
    parentName: 'Abdullah Al-Farsi',
    students: fullStudents,
  });
  await seedNotifications(tenant.id, fullAuthId);
  await seedPayments(tenant.id, `${DEMO_PREFIX}-INV-PAID`);
  await seedApplicationsAndContracts({
    tenantId: tenant.id,
    branchId,
    academicYearId,
    guardianEmail: FULL_PARENT_EMAIL,
    students: fullStudents.map((s) => ({ id: s.id, nameEn: s.nameEn, nameAr: s.nameAr })),
  });
  await seedCanteen(tenant.id, allStudents);
  await seedCanteenForPlatformOwnerTenant(tenant.id);
  await seedStore({
    tenantId: tenant.id,
    branchId,
    currencyCode,
    students: fullStudents,
    guardianId: fullGuardianId,
  });

  const { data: tenantRow } = await supabase
    .from('tenants')
    .select('name_en')
    .eq('id', tenant.id)
    .maybeSingle();
  const schoolName = (tenantRow as { name_en?: string } | null)?.name_en || identity.slug;

  console.log('[parent-portal seed] completed');
  console.log(`  school=${schoolName}`);
  console.log(`  tenant_id=${tenant.id}`);
  console.log(`  slug=${identity.slug}  tenant_code=${identity.tenant_code}`);
  console.log(`  full:  ${FULL_PARENT_EMAIL}  /  ${PARENT_PASSWORD}`);
  console.log(`         children: ${fullStudents.map((s) => `${s.nameEn} (${s.grade})`).join(', ') || '(none)'}`);
  console.log('         linked to existing Students-module roster (no extra student rows created)');
  console.log(`  staff: ${STAFF_DEMO_EMAIL}  /  ${PARENT_PASSWORD}`);
  console.log(`  empty: ${EMPTY_PARENT_EMAIL}  /  ${PARENT_PASSWORD}`);
  console.log(`         child: ${emptySeed ? `${emptySeed.nameEn} (${emptySeed.grade})` : '(none — add another student to the roster)'}`);
}

main().catch((err) => {
  console.error('[parent-portal seed] failed:', err);
  process.exit(1);
});
