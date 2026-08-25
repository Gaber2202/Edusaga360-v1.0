/**
 * Saudi Arabia childhood vaccination schedule — MOH KSA (Ministry of Health).
 * School-clinic obligations used to diff student_health_records (SCRUM-137).
 */

import type { VaccinationSchedule } from '../contract/CountryPack.js';

export const saVaccinationSchedule: VaccinationSchedule = {
  source: {
    authority: 'MOH_KSA',
    name_en: 'Ministry of Health — Kingdom of Saudi Arabia',
    name_ar: 'وزارة الصحة — المملكة العربية السعودية',
  },
  vaccines: [
    { code: 'bcg', name_en: 'BCG', name_ar: 'بي سي جي', age_label_en: 'Birth', age_label_ar: 'عند الولادة', age_months: 0, required: true, doses: 1 },
    { code: 'hep_b', name_en: 'Hepatitis B', name_ar: 'التهاب الكبد ب', age_label_en: 'Birth / 2 / 6 months', age_label_ar: 'ولادة / شهرين / 6 أشهر', age_months: 0, required: true, doses: 3 },
    { code: 'opv', name_en: 'OPV (Polio)', name_ar: 'شلل الأطفال الفموي', age_label_en: '2 / 4 / 6 months', age_label_ar: 'شهرين / 4 / 6 أشهر', age_months: 2, required: true, doses: 3 },
    { code: 'dtap', name_en: 'DTaP', name_ar: 'الثلاثي البكتيري', age_label_en: '2 / 4 / 6 months', age_label_ar: 'شهرين / 4 / 6 أشهر', age_months: 2, required: true, doses: 3 },
    { code: 'hib', name_en: 'Hib', name_ar: 'المستدمية النزلية', age_label_en: '2 / 4 / 6 months', age_label_ar: 'شهرين / 4 / 6 أشهر', age_months: 2, required: true, doses: 3 },
    { code: 'pcv', name_en: 'PCV (Pneumococcal)', name_ar: 'المكورات الرئوية', age_label_en: '2 / 4 / 6 / 12 months', age_label_ar: 'شهرين / 4 / 6 / 12 شهراً', age_months: 2, required: true, doses: 4 },
    { code: 'rota', name_en: 'Rotavirus', name_ar: 'الفيروس العجلي', age_label_en: '2 / 4 months', age_label_ar: 'شهرين / 4 أشهر', age_months: 2, required: true, doses: 2 },
    { code: 'mmr', name_en: 'MMR', name_ar: 'الحصبة والنكاف والحصبة الألمانية', age_label_en: '12 / 18 months', age_label_ar: '12 / 18 شهراً', age_months: 12, required: true, doses: 2 },
    { code: 'var', name_en: 'Varicella', name_ar: 'الجدري المائي', age_label_en: '18 months', age_label_ar: '18 شهراً', age_months: 18, required: true, doses: 1 },
    { code: 'hep_a', name_en: 'Hepatitis A', name_ar: 'التهاب الكبد أ', age_label_en: '18 / 24 months', age_label_ar: '18 / 24 شهراً', age_months: 18, required: true, doses: 2 },
    { code: 'dtap_booster', name_en: 'DTaP booster', name_ar: 'جرعة معززة ثلاثي', age_label_en: 'School entry (4–6 y)', age_label_ar: 'دخول المدرسة (4–6 سنوات)', age_months: 48, required: true, doses: 1 },
    { code: 'opv_booster', name_en: 'OPV booster', name_ar: 'جرعة معززة شلل الأطفال', age_label_en: 'School entry (4–6 y)', age_label_ar: 'دخول المدرسة (4–6 سنوات)', age_months: 48, required: true, doses: 1 },
  ],
};
