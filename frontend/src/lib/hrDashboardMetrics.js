/**
 * HR Manager Dashboard — real-data metric helpers.
 * No fabricated sparklines; series derived from tenant employee / leave records.
 */

import { differenceInDays, differenceInYears } from 'date-fns';
import { countSeries, cumulativeSeries, periodTrend } from './dashboardMetrics';

const UNKNOWN_NATIONALITY = new Set(['unknown', 'غير معروف', '']);

export function isActiveEmployee(e) {
  return e?.status === 'active';
}

export function activeEmployees(employees = []) {
  return employees.filter(isActiveEmployee);
}

/** Nationality pie slices; optionally hide unknown bucket. */
export function nationalityBreakdown(active = [], { excludeUnknown = true } = {}) {
  const natMap = {};
  for (const e of active) {
    const raw = (e.nationality || '').trim();
    const key = excludeUnknown && UNKNOWN_NATIONALITY.has(raw.toLowerCase()) ? null : (raw || null);
    if (!key) continue;
    natMap[key] = (natMap[key] || 0) + 1;
  }
  return Object.entries(natMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name, value }));
}

export function countMissingNationality(active = []) {
  return active.filter((e) => UNKNOWN_NATIONALITY.has((e.nationality || '').trim().toLowerCase())).length;
}

export function saudizationMetrics(active = []) {
  const saudis = active.filter((e) => e.is_saudi);
  const pct = active.length > 0 ? (saudis.length / active.length) * 100 : null;
  return { saudis: saudis.length, nonSaudis: active.length - saudis.length, pct };
}

export function documentExpiryBuckets(active = [], today = new Date()) {
  let expired = 0;
  let in30 = 0;
  let in60 = 0;
  for (const e of active) {
    const dates = [e.iqama_expiry, e.passport_expiry, e.visa_expiry, e.license_expiry_date].filter(Boolean);
    if (!dates.length) continue;
    const hasExpired = dates.some((d) => new Date(d) < today);
    const has30 = dates.some((d) => {
      const diff = differenceInDays(new Date(d), today);
      return diff >= 0 && diff <= 30;
    });
    const has60 = dates.some((d) => {
      const diff = differenceInDays(new Date(d), today);
      return diff > 30 && diff <= 60;
    });
    if (hasExpired) expired += 1;
    else if (has30) in30 += 1;
    else if (has60) in60 += 1;
  }
  return { expired, in30, in60 };
}

export function headcountSparkline(employees = [], buckets = 8) {
  const active = activeEmployees(employees);
  return cumulativeSeries(active, 'hire_date', buckets);
}

export function leaveRequestSparkline(leaveRequests = [], buckets = 8) {
  return countSeries(leaveRequests, 'created_at', buckets);
}

export function payrollSparkline(payRuns = [], buckets = 8) {
  return countSeries(payRuns, 'created_at', buckets);
}

export function computeEosbProvision(active = [], today = new Date()) {
  return active.reduce((s, e) => {
    if (!e.hire_date) return s;
    const years = differenceInYears(today, new Date(e.hire_date));
    const basic = e.basic_salary || 0;
    if (years <= 5) return s + basic * 0.5 * years;
    return s + basic * 0.5 * 5 + basic * 1.0 * (years - 5);
  }, 0);
}

export function turnoverMetrics(employees = [], today = new Date()) {
  const active = activeEmployees(employees);
  const yearAgo = new Date(today);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const terminated = employees.filter((e) => {
    const d = e.end_date || e.updated_at || e.updated_date;
    if (!d || e.status !== 'terminated') return false;
    return new Date(d) >= yearAgo;
  });
  const rate = active.length > 0
    ? (terminated.length / (active.length + terminated.length)) * 100
    : null;
  return { terminated: terminated.length, rate };
}

/** Hires in the last N days (active employees only). */
export function newHireCount(active = [], days = 30, today = new Date()) {
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - days);
  return active.filter((e) => e.hire_date && new Date(e.hire_date) >= cutoff).length;
}

/** Active contracts with end_date within the next N days. */
export function contractsEndingSoon(active = [], days = 60, today = new Date()) {
  return active.filter((e) => {
    if (!e.end_date) return false;
    const diff = differenceInDays(new Date(e.end_date), today);
    return diff >= 0 && diff <= days;
  }).length;
}

/** Probation ending within N days (hire_date + 90). */
export function probationEndingSoon(active = [], days = 14, today = new Date()) {
  return active.filter((e) => {
    if (!e.hire_date) return false;
    const end = new Date(e.hire_date);
    end.setDate(end.getDate() + 90);
    const diff = differenceInDays(end, today);
    return diff >= 0 && diff <= days;
  }).length;
}

export function salaryMetrics(active = []) {
  const withPay = active
    .map((e) => Number(e.total_salary || e.salary || e.basic_salary) || 0)
    .filter((v) => v > 0);
  if (!withPay.length) return { avg: null, median: null, covered: 0, coveragePct: null };
  const sorted = [...withPay].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    avg: sum / sorted.length,
    median,
    covered: sorted.length,
    coveragePct: (sorted.length / active.length) * 100,
  };
}

export function tenureMetrics(active = [], today = new Date()) {
  const tenures = active
    .filter((e) => e.hire_date)
    .map((e) => differenceInDays(today, new Date(e.hire_date)) / 365.25)
    .filter((y) => y >= 0);
  if (!tenures.length) return { avgYears: null, withHireDate: 0 };
  const avgYears = tenures.reduce((s, y) => s + y, 0) / tenures.length;
  return { avgYears, withHireDate: tenures.length };
}

export function genderBreakdown(active = []) {
  const buckets = { male: 0, female: 0, unknown: 0 };
  for (const e of active) {
    const g = (e.gender || '').toLowerCase().trim();
    if (g === 'male' || g === 'm' || g === 'ذكر') buckets.male += 1;
    else if (g === 'female' || g === 'f' || g === 'أنثى' || g === 'انثى') buckets.female += 1;
    else buckets.unknown += 1;
  }
  const total = active.length || 1;
  return {
    ...buckets,
    malePct: (buckets.male / total) * 100,
    femalePct: (buckets.female / total) * 100,
  };
}

export function employmentTypeBreakdown(active = []) {
  const map = {};
  for (const e of active) {
    const key = (e.employment_type || 'unspecified').trim() || 'unspecified';
    map[key] = (map[key] || 0) + 1;
  }
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value, pct: active.length ? (value / active.length) * 100 : 0 }));
}

export function gosiCoverage(active = []) {
  const eligible = active.filter((e) => e.is_gosi_applicable).length;
  const pct = active.length > 0 ? (eligible / active.length) * 100 : null;
  return { eligible, pct };
}

/** Share of active staff with nationality + hire_date + any salary field. */
export function dataCompleteness(active = []) {
  if (!active.length) return { pct: null, complete: 0 };
  const complete = active.filter((e) => {
    const hasNat = !UNKNOWN_NATIONALITY.has((e.nationality || '').trim().toLowerCase());
    const hasHire = Boolean(e.hire_date);
    const hasPay = Number(e.total_salary || e.salary || e.basic_salary) > 0;
    return hasNat && hasHire && hasPay;
  }).length;
  return { pct: (complete / active.length) * 100, complete };
}

/** Non-Saudi actives missing iqama expiry (gov compliance gap). */
export function missingIqamaNonSaudi(active = []) {
  return active.filter((e) => !e.is_saudi && !e.iqama_expiry).length;
}

export function departmentCount(active = []) {
  const ids = new Set(active.map((e) => e.department_id).filter(Boolean));
  return ids.size;
}

export { periodTrend };
