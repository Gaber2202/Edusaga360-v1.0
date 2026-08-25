/**
 * Qatar childhood vaccination schedule — MoPH (Ministry of Public Health).
 * School-clinic obligations used to diff student_health_records (SCRUM-137).
 */

import type { VaccinationSchedule } from '../contract/CountryPack.js';

export const qaVaccinationSchedule: VaccinationSchedule = {
  source: {
    authority: 'MOPH_QA',
    name_en: 'Ministry of Public Health — State of Qatar',
    name_ar: 'وزارة الصحة العامة — دولة قطر',
  },
  vaccines: [
    { code: 'bcg', name_en: 'BCG', name_ar: 'بي سي جي', age_label_en: 'Birth', age_label_ar: 'عند الولادة', age_months: 0, required: true, doses: 1 },
    { code: 'hep_b', name_en: 'Hepatitis B', name_ar: 'التهاب الكبد ب', age_label_en: 'Birth / 2 / 6 months', age_label_ar: 'ولادة / شهرين / 6 أشهر', age_months: 0, required: true, doses: 3 },
    { code: 'pentavalent', name_en: 'Pentavalent (DTwP-Hib-HepB)', name_ar: 'الخماسي', age_label_en: '2 / 4 / 6 months', age_label_ar: 'شهرين / 4 / 6 أشهر', age_months: 2, required: true, doses: 3 },
    { code: 'opv', name_en: 'OPV (Polio)', name_ar: 'شلل الأطفال الفموي', age_label_en: '2 / 4 / 6 months', age_label_ar: 'شهرين / 4 / 6 أشهر', age_months: 2, required: true, doses: 3 },
    { code: 'pcv', name_en: 'PCV (Pneumococcal)', name_ar: 'المكورات الرئوية', age_label_en: '2 / 4 / 6 / 12 months', age_label_ar: 'شهرين / 4 / 6 / 12 شهراً', age_months: 2, required: true, doses: 4 },
    { code: 'rota', name_en: 'Rotavirus', name_ar: 'الفيروس العجلي', age_label_en: '2 / 4 months', age_label_ar: 'شهرين / 4 أشهر', age_months: 2, required: true, doses: 2 },
    { code: 'mmr', name_en: 'MMR', name_ar: 'الحصبة والنكاف والحصبة الألمانية', age_label_en: '12 / 18 months', age_label_ar: '12 / 18 شهراً', age_months: 12, required: true, doses: 2 },
    { code: 'var', name_en: 'Varicella', name_ar: 'الجدري المائي', age_label_en: '12 months', age_label_ar: '12 شهراً', age_months: 12, required: true, doses: 1 },
    { code: 'hep_a', name_en: 'Hepatitis A', name_ar: 'التهاب الكبد أ', age_label_en: '18 months', age_label_ar: '18 شهراً', age_months: 18, required: true, doses: 1 },
    { code: 'dt_booster', name_en: 'DT / Td booster', name_ar: 'معززة الدفتيريا والتيتانوس', age_label_en: 'School entry', age_label_ar: 'دخول المدرسة', age_months: 48, required: true, doses: 1 },
    { code: 'opv_booster', name_en: 'OPV booster', name_ar: 'جرعة معززة شلل الأطفال', age_label_en: 'School entry', age_label_ar: 'دخول المدرسة', age_months: 48, required: true, doses: 1 },
  ],
};
