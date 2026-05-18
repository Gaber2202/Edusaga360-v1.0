import { tenantQuery } from '../../api/supabaseClient';
import { logAuditEvent, AuditActions } from '../AuditService';

// Base HR document checklist (always included)
const BASE_HR_DOCS = [
  { id: 'id_copy',         ar: 'نسخة الهوية الوطنية / الإقامة',          en: 'National ID / Iqama Copy' },
  { id: 'bank_details',    ar: 'بيانات الحساب البنكي (IBAN)',              en: 'Bank Account Details (IBAN)' },
  { id: 'medical_check',   ar: 'الفحص الطبي',                              en: 'Medical Check Certificate' },
  { id: 'qiwa_contract',   ar: 'توقيع عقد قوى',                           en: 'Qiwa Contract Signing' },
  { id: 'gosi_reg',        ar: 'التسجيل في التأمينات الاجتماعية',           en: 'GOSI Registration' },
  { id: 'photo',           ar: 'صورة شخصية رسمية',                         en: 'Official Photo' },
  { id: 'edu_certs',       ar: 'الشهادات والمؤهلات الدراسية',              en: 'Educational Certificates' },
];

const MANDATORY_TRAININGS = [
  { id: 'safety_training',           ar: 'تدريب السلامة والأمن',           en: 'Safety & Security Training',       days: 7  },
  { id: 'data_protection',           ar: 'حماية البيانات والخصوصية',       en: 'Data Protection & Privacy',        days: 14 },
  { id: 'child_protection_training', ar: 'تدريب حماية الطفل',             en: 'Child Protection Training',        days: 14 },
];

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString().split('T')[0];
}

export async function triggerOnboardingForEmployee(employee, applicant) {
  const startDate = employee.hire_date || new Date().toISOString().split('T')[0];

  // Build HR docs list
  const hrDocs = BASE_HR_DOCS.map(d => ({
    ...d,
    required: true,
    completed: false,
    completed_date: null,
    completed_by: null,
    document_url: '',
    notes: '',
  }));

  // Pull published HR policies from library to auto-assign
  let policyAcks = [];
  try {
    const publishedPolicies = await tenantQuery('hr_policys').select('*').match({ status: 'published' });
    policyAcks = (publishedPolicies || []).map(p => ({
      id: `pol_${p.id}`,
      policy_id: p.id,
      ar: p.title_ar,
      en: p.title_en,
      category: p.category,
      body_ar: p.body_ar || '',
      body_en: p.body_en || '',
      required: true,
      acknowledged: false,
      acknowledged_date: null,
      acknowledged_by: null,
      acknowledged_by_email: null,
    }));
  } catch (_) {
    // If no policies exist yet, start empty
    policyAcks = [];
  }

  const trainings = MANDATORY_TRAININGS.map(t => ({
    ...t,
    assigned_date: startDate,
    deadline: addDays(startDate, t.days),
    completed: false,
    completion_date: null,
    certificate_url: null,
    completion_pct: 0,
  }));

  const onboardingRecord = {
    employee_id: employee.id || employee.employee_id,
    employee_name: employee.name_ar,
    employee_email: employee.email || '',
    job_title: employee.job_title_name || '',
    department_id: employee.department_id || '',
    branch_id: employee.branch_id,
    start_date: startDate,
    status: 'in_progress',
    overall_completion_pct: 0,
    hr_documents: hrDocs,
    policy_acknowledgements: policyAcks,
    training_assignments: trainings,
    applicant_id: applicant?.id || null,
    recruitment_id: applicant?.recruitment_id || null,
    created_from: 'auto_conversion',
    notes: '',
  };

  const created = await tenantQuery('onboardings').insert(onboardingRecord);

  await logAuditEvent({
    action: AuditActions.CREATE,
    entityType: 'Onboarding',
    entityId: created.id,
    newValues: { employee_id: employee.id, employee_name: employee.name_ar, trigger: 'auto_conversion' },
  });

  return created;
}