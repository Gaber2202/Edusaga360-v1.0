/**
 * Bilingual labels for CRM enums (P3.5).
 *
 * The CRM tables rendered raw keys (e.g. "in_progress", "critical", "vip") in
 * the status/priority/SLA/segment/category badges, even in Arabic — while the
 * status filter dropdown was already localized. These helpers give the badges
 * the same bilingual labels. Pure + unit-tested; unknown values fall back to
 * the raw key.
 */
const STATUS = {
  open: { en: 'Open', ar: 'مفتوح' },
  in_progress: { en: 'In Progress', ar: 'قيد المعالجة' },
  waiting: { en: 'Waiting', ar: 'بانتظار الرد' },
  resolved: { en: 'Resolved', ar: 'تم الحل' },
  closed: { en: 'Closed', ar: 'مغلق' },
};
const PRIORITY = {
  low: { en: 'Low', ar: 'منخفضة' },
  medium: { en: 'Medium', ar: 'متوسطة' },
  high: { en: 'High', ar: 'عالية' },
  critical: { en: 'Critical', ar: 'حرجة' },
};
const SLA = {
  on_track: { en: 'On Track', ar: 'ضمن المدة' },
  at_risk: { en: 'At Risk', ar: 'معرّضة للتجاوز' },
  breached: { en: 'Breached', ar: 'متجاوزة' },
};
const SEGMENT = {
  prospect: { en: 'Prospect', ar: 'محتمل' },
  active: { en: 'Active', ar: 'نشط' },
  vip: { en: 'VIP', ar: 'مميّز' },
  withdrawn: { en: 'Withdrawn', ar: 'منسحب' },
};
const CATEGORY = {
  academic: { en: 'Academic', ar: 'أكاديمي' },
  financial: { en: 'Financial', ar: 'مالي' },
  transport: { en: 'Transport', ar: 'نقل' },
  facilities: { en: 'Facilities', ar: 'مرافق' },
  general: { en: 'General', ar: 'عام' },
  complaint: { en: 'Complaint', ar: 'شكوى' },
  inquiry: { en: 'Inquiry', ar: 'استفسار' },
};

function pick(map, key, isRTL) {
  const v = map[key];
  if (!v) return key || '-';
  return isRTL ? v.ar : v.en;
}

export const ticketStatusLabel = (k, isRTL) => pick(STATUS, k, isRTL);
export const priorityLabel = (k, isRTL) => pick(PRIORITY, k, isRTL);
export const slaLabel = (k, isRTL) => pick(SLA, k, isRTL);
export const segmentLabel = (k, isRTL) => pick(SEGMENT, k, isRTL);
export const crmCategoryLabel = (k, isRTL) => pick(CATEGORY, k, isRTL);
