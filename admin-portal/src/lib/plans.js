// Plan catalog + shared presentation helpers for the admin portal.
// Prices are list defaults in SAR and pre-fill the conversion form; they remain editable per deal.

export const PLANS = [
  { code: 'starter',      name: 'Starter',      monthly: 499,  annual: 4990,  max_users: 10,  max_students: 300,  blurb: 'Single campus, core modules' },
  { code: 'professional', name: 'Professional', monthly: 1499, annual: 14990, max_users: 30,  max_students: 1500, blurb: 'Multi-branch, full HR & finance' },
  { code: 'enterprise',   name: 'Enterprise',   monthly: 3999, annual: 39990, max_users: 100, max_students: 9999, blurb: 'Unlimited modules + AI + SLA' },
  { code: 'government',   name: 'Government',    monthly: 0,    annual: 0,     max_users: 200, max_students: 9999, blurb: 'Custom public-sector terms' },
];

export const PLAN_BY_CODE = Object.fromEntries(PLANS.map((p) => [p.code, p]));

export const PLAN_LABELS = {
  free_trial: 'Free Trial', trial: 'Trial', basic: 'Basic',
  starter: 'Starter', professional: 'Professional', enterprise: 'Enterprise', government: 'Government',
};

export const PLAN_COLORS = {
  free_trial: 'bg-amber-100 text-amber-700',
  trial: 'bg-amber-100 text-amber-700',
  basic: 'bg-slate-100 text-slate-700',
  starter: 'bg-blue-100 text-blue-700',
  professional: 'bg-purple-100 text-purple-700',
  enterprise: 'bg-emerald-100 text-emerald-700',
  government: 'bg-slate-100 text-slate-700',
};

export const STATUS_COLORS = {
  active: 'bg-emerald-100 text-emerald-700',
  trial: 'bg-amber-100 text-amber-700',
  suspended: 'bg-red-100 text-red-700',
  inactive: 'bg-slate-100 text-slate-500',
  pending_approval: 'bg-blue-100 text-blue-700',
  denied: 'bg-slate-100 text-slate-500',
};

// Roles available across school tenants (mirrors backend role sets).
export const ROLES = [
  'admin', 'hr_head', 'hr_admin', 'hr_manager', 'hr_officer',
  'cfo', 'finance', 'accountant', 'teacher', 'staff', 'parent',
];

export const USER_STATUSES = ['active', 'inactive', 'suspended'];

export const planLabel = (code) => PLAN_LABELS[code] || code || 'trial';

/** Whole-day countdown to a trial end date. Negative = expired. */
export function trialDaysLeft(trialEndDate) {
  if (!trialEndDate) return null;
  const end = new Date(trialEndDate);
  const today = new Date();
  end.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((end - today) / 86400000);
}

export function formatMoney(amount, currency = 'SAR') {
  const n = Number(amount) || 0;
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currency}`;
}
