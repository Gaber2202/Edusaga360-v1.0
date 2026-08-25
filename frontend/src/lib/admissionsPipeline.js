/**
 * Admissions pipeline defaults + helpers (P4-1 / SCRUM-111–112).
 * School-configurable stages live in `admission_pipeline_stages`;
 * this module provides defaults and presentation tokens when DB is empty.
 */

export const DEFAULT_ADMISSION_STAGES = [
  { key: 'inquiry',      label_ar: 'استفسار',           label_en: 'Inquiry',     color: 'bg-sand-alt border-border',         badge: 'bg-sand-alt text-ink',           sla: 2,   is_terminal: false },
  { key: 'submitted',    label_ar: 'مقدَّم',             label_en: 'Submitted',   color: 'bg-najdi-50 border-najdi-100',      badge: 'bg-najdi-50 text-najdi-900',     sla: 3,   is_terminal: false },
  { key: 'under_review', label_ar: 'مراجعة الوثائق',     label_en: 'Docs Review', color: 'bg-yellow-50 border-yellow-200',    badge: 'bg-yellow-100 text-yellow-700',  sla: 3,   is_terminal: false },
  { key: 'assessment',   label_ar: 'الاختبار',           label_en: 'Assessment',  color: 'bg-purple-50 border-purple-200',    badge: 'bg-purple-100 text-purple-700',  sla: 5,   is_terminal: false },
  { key: 'interview',    label_ar: 'مقابلة',             label_en: 'Interview',   color: 'bg-indigo-50 border-indigo-200',    badge: 'bg-indigo-100 text-indigo-700',  sla: 5,   is_terminal: false },
  { key: 'committee',    label_ar: 'اللجنة الأكاديمية', label_en: 'Committee',   color: 'bg-orange-50 border-orange-200',    badge: 'bg-orange-100 text-orange-700',  sla: 3,   is_terminal: false },
  { key: 'accepted',     label_ar: 'مقبول',              label_en: 'Accepted',    color: 'bg-green-50 border-green-200',      badge: 'bg-green-100 text-green-700',    sla: 7,   is_terminal: false },
  { key: 'waitlist',     label_ar: 'قائمة انتظار',       label_en: 'Waitlist',    color: 'bg-teal-50 border-teal-200',        badge: 'bg-teal-100 text-teal-700',      sla: 14,  is_terminal: false },
  { key: 'enrolled',     label_ar: 'ملتحق',              label_en: 'Enrolled',    color: 'bg-emerald-50 border-emerald-200',  badge: 'bg-emerald-100 text-emerald-700',sla: 999, is_terminal: true },
  { key: 'rejected',     label_ar: 'مرفوض',              label_en: 'Rejected',    color: 'bg-red-50 border-red-200',          badge: 'bg-red-100 text-red-700',        sla: 999, is_terminal: true },
];

export const STATUS_COLORS = Object.fromEntries(
  DEFAULT_ADMISSION_STAGES.map((s) => [s.key, s.badge])
);
STATUS_COLORS.pending = STATUS_COLORS.submitted;

const COLOR_TOKEN_MAP = {
  sand:    { color: 'bg-sand-alt border-border',        badge: 'bg-sand-alt text-ink' },
  najdi:   { color: 'bg-najdi-50 border-najdi-100',     badge: 'bg-najdi-50 text-najdi-900' },
  yellow:  { color: 'bg-yellow-50 border-yellow-200',   badge: 'bg-yellow-100 text-yellow-700' },
  purple:  { color: 'bg-purple-50 border-purple-200',   badge: 'bg-purple-100 text-purple-700' },
  indigo:  { color: 'bg-indigo-50 border-indigo-200',   badge: 'bg-indigo-100 text-indigo-700' },
  orange:  { color: 'bg-orange-50 border-orange-200',   badge: 'bg-orange-100 text-orange-700' },
  green:   { color: 'bg-green-50 border-green-200',     badge: 'bg-green-100 text-green-700' },
  teal:    { color: 'bg-teal-50 border-teal-200',       badge: 'bg-teal-100 text-teal-700' },
  emerald: { color: 'bg-emerald-50 border-emerald-200', badge: 'bg-emerald-100 text-emerald-700' },
  red:     { color: 'bg-red-50 border-red-200',         badge: 'bg-red-100 text-red-700' },
};

/** Map DB rows (or empty) → UI stage objects sorted by sort_order. */
export function mapPipelineStages(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return DEFAULT_ADMISSION_STAGES;
  }
  return [...rows]
    .filter((r) => r.is_active !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((r) => {
      const fallback = DEFAULT_ADMISSION_STAGES.find((d) => d.key === r.stage_key);
      const tokens = COLOR_TOKEN_MAP[r.color_token] || {
        color: fallback?.color || 'bg-sand-alt border-border',
        badge: fallback?.badge || 'bg-sand-alt text-ink',
      };
      return {
        key: r.stage_key,
        label_en: r.label_en || fallback?.label_en || r.stage_key,
        label_ar: r.label_ar || fallback?.label_ar || r.stage_key,
        sla: r.sla_days ?? fallback?.sla ?? 3,
        is_terminal: !!r.is_terminal,
        color: tokens.color,
        badge: tokens.badge,
      };
    });
}

export function stageLabel(stages, key, isRTL) {
  const s = (stages || DEFAULT_ADMISSION_STAGES).find((x) => x.key === key);
  if (!s) return key || '';
  return isRTL ? s.label_ar : s.label_en;
}

/** Normalize legacy status values onto pipeline keys. */
export function normalizeApplicationStage(app) {
  const status = app?.status;
  const pipeline = app?.pipeline_stage;
  if (status === 'pending') return 'submitted';
  if (status === 'interview' || pipeline === 'assessment_scheduled' || pipeline === 'assessment_done') {
    return status === 'interview' ? 'interview' : (pipeline === 'final_review' ? 'committee' : status || 'interview');
  }
  if (pipeline === 'final_review') return 'committee';
  return status || pipeline || 'inquiry';
}

export function appMatchesStage(app, stageKey) {
  const status = app?.status;
  const pipeline = app?.pipeline_stage;
  if (stageKey === 'submitted') return status === 'submitted' || status === 'pending';
  if (stageKey === 'interview') {
    return status === 'interview' || pipeline === 'assessment_scheduled' || pipeline === 'assessment_done';
  }
  if (stageKey === 'committee') return status === 'committee' || pipeline === 'final_review';
  return status === stageKey || pipeline === stageKey;
}
