/**
 * UAE childhood vaccination schedule — DHA (Dubai Health Authority) aligned
 * national EPI obligations used for school clinic diffs (SCRUM-137).
 */

import type { VaccinationSchedule } from '../contract/CountryPack.js';

export const aeVaccinationSchedule: VaccinationSchedule = {
  source: {
    authority: 'DHA_UAE',
    name_en: 'Dubai Health Authority / UAE EPI',
    name_ar: 'هيئة الصحة بدبي / البرنامج الوطني للتطعيم',
  },
  vaccines: [
    { code: 'bcg', name_en: 'BCG', name_ar: 'بي سي جي', age_label_en: 'Birth', age_label_ar: 'عند الولادة', age_months: 0, required: true, doses: 1 },
    { code: 'hep_b', name_en: 'Hepatitis B', name_ar: 'التهاب الكبد ب', age_label_en: 'Birth / 2 / 6 months', age_label_ar: 'ولادة / شهرين / 6 أشهر', age_months: 0, required: true, doses: 3 },
    { code: 'hexavalent', name_en: 'Hexavalent (DTaP-IPV-Hib-HepB)', name_ar: 'السداسي', age_label_en: '2 / 4 / 6 months', age_label_ar: 'شهرين / 4 / 6 أشهر', age_months: 2, required: true, doses: 3 },
    { code: 'pcv', name_en: 'PCV (Pneumococcal)', name_ar: 'المكورات الرئوية', age_label_en: '2 / 4 / 6 / 12 months', age_label_ar: 'شهرين / 4 / 6 / 12 شهراً', age_months: 2, required: true, doses: 4 },
    { code: 'rota', name_en: 'Rotavirus', name_ar: 'الفيروس العجلي', age_label_en: '2 / 4 months', age_label_ar: 'شهرين / 4 أشهر', age_months: 2, required: true, doses: 2 },
    { code: 'mmr', name_en: 'MMR', name_ar: 'الحصبة والنكاف والحصبة الألمانية', age_label_en: '12 months + booster', age_label_ar: '12 شهراً + معززة', age_months: 12, required: true, doses: 2 },
    { code: 'var', name_en: 'Varicella', name_ar: 'الجدري المائي', age_label_en: '12 months', age_label_ar: '12 شهراً', age_months: 12, required: true, doses: 1 },
    { code: 'menacwy', name_en: 'MenACWY', name_ar: 'المكورات السحائية', age_label_en: 'School entry / adolescence', age_label_ar: 'دخول المدرسة / المراهقة', age_months: 132, required: true, doses: 1 },
    { code: 'dtap_ipv_booster', name_en: 'DTaP-IPV booster', name_ar: 'معززة ثلاثي وشلل الأطفال', age_label_en: 'School entry (4–6 y)', age_label_ar: 'دخول المدرسة (4–6 سنوات)', age_months: 48, required: true, doses: 1 },
    { code: 'hpv', name_en: 'HPV', name_ar: 'فيروس الورم الحليمي', age_label_en: 'Adolescence (girls)', age_label_ar: 'المراهقة (فتيات)', age_months: 144, required: false, doses: 2 },
  ],
};
