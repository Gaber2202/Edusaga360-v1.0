/**
 * Shared registration-template fields for parent intake (SCRUM-113/114).
 * Schools may only show/hide these — no custom fields.
 */

export const INTAKE_FORM_FIELDS = [
  { key: 'guardian_name_ar', group: 'guardian', label_en: 'Parent name (Arabic)', label_ar: 'اسم ولي الأمر (عربي)', required: true },
  { key: 'guardian_name_en', group: 'guardian', label_en: 'Parent name (English)', label_ar: 'اسم ولي الأمر (إنجليزي)', required: true },
  { key: 'guardian_email', group: 'guardian', label_en: 'Email', label_ar: 'البريد الإلكتروني', required: true },
  { key: 'guardian_whatsapp', group: 'guardian', label_en: 'WhatsApp number', label_ar: 'رقم واتساب', required: true },
  { key: 'guardian_phone', group: 'guardian', label_en: 'Phone', label_ar: 'الهاتف', required: false },
  { key: 'guardian_national_id', group: 'guardian', label_en: 'Parent National ID', label_ar: 'هوية ولي الأمر', required: false },
  { key: 'guardian_relationship', group: 'guardian', label_en: 'Relationship', label_ar: 'صلة القرابة', required: false },
  { key: 'address', group: 'guardian', label_en: 'Address', label_ar: 'العنوان', required: false },
  { key: 'student_name_ar', group: 'student', label_en: 'Student name (Arabic)', label_ar: 'اسم الطالب (عربي)', required: true },
  { key: 'student_name_en', group: 'student', label_en: 'Student name (English)', label_ar: 'اسم الطالب (إنجليزي)', required: false },
  { key: 'date_of_birth', group: 'student', label_en: 'Date of birth', label_ar: 'تاريخ الميلاد', required: false },
  { key: 'gender', group: 'student', label_en: 'Gender', label_ar: 'الجنس', required: false },
  { key: 'nationality', group: 'student', label_en: 'Nationality', label_ar: 'الجنسية', required: false },
  { key: 'national_id', group: 'student', label_en: 'Student National ID', label_ar: 'هوية الطالب', required: false },
  { key: 'applying_for_grade', group: 'student', label_en: 'Grade', label_ar: 'الصف', required: true },
  { key: 'academic_year', group: 'student', label_en: 'Academic year', label_ar: 'العام الدراسي', required: true },
  { key: 'previous_school', group: 'student', label_en: 'Previous school', label_ar: 'المدرسة السابقة', required: false },
  { key: 'has_special_needs', group: 'student', label_en: 'Special needs', label_ar: 'احتياجات خاصة', required: false },
  { key: 'documents', group: 'documents', label_en: 'Admission documents', label_ar: 'وثائق القبول', required: true },
];

export const DEFAULT_VISIBLE_FIELDS = Object.fromEntries(
  INTAKE_FORM_FIELDS.map((f) => [f.key, true])
);

export function resolveVisibleFields(config) {
  const base = { ...DEFAULT_VISIBLE_FIELDS };
  if (config && typeof config === 'object') {
    for (const [k, v] of Object.entries(config)) {
      if (k in base) base[k] = !!v;
    }
  }
  // Always keep locked required fields visible
  for (const f of INTAKE_FORM_FIELDS) {
    if (f.required) base[f.key] = true;
  }
  return base;
}

export function isFieldVisible(visible, key) {
  if (!visible) return true;
  return visible[key] !== false;
}
