import { invoiceBalance, displayStatus } from './invoiceStatus';

export function attendanceRate(records) {
  if (!records?.length) return null;
  const presentish = records.filter((r) => r.status === 'present' || r.status === 'late' || r.status === 'excused').length;
  return Math.round((presentish / records.length) * 100);
}

export function attendanceBreakdown(records) {
  const counts = { present: 0, late: 0, absent: 0, excused: 0 };
  for (const row of records || []) {
    if (counts[row.status] != null) counts[row.status] += 1;
  }
  return counts;
}

export function attendanceTrend(records, dayCount = 14) {
  const byDate = new Map();
  for (const row of records || []) {
    if (!row.date) continue;
    const key = String(row.date).slice(0, 10);
    const bucket = byDate.get(key) || { date: key, total: 0, presentish: 0 };
    bucket.total += 1;
    if (row.status === 'present' || row.status === 'late' || row.status === 'excused') bucket.presentish += 1;
    byDate.set(key, bucket);
  }

  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-dayCount)
    .map((bucket) => ({
      date: bucket.date,
      rate: Math.round((bucket.presentish / bucket.total) * 100),
    }));
}

export function averageScore(grades) {
  if (!grades?.length) return null;
  let sum = 0;
  let count = 0;
  for (const grade of grades) {
    const max = Number(grade.max_score) || 100;
    const score = Number(grade.score);
    if (!Number.isFinite(score) || max <= 0) continue;
    sum += (score / max) * 100;
    count += 1;
  }
  return count ? Math.round(sum / count) : null;
}

export function latestSubjectScores(grades, isRTL = false) {
  const latest = new Map();
  const sorted = [...(grades || [])].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  for (const grade of sorted) {
    const key = grade.subject || grade.subject_ar;
    if (!key || latest.has(key)) continue;
    const max = Number(grade.max_score) || 100;
    const score = Number(grade.score);
    latest.set(key, {
      subject: isRTL ? (grade.subject_ar || grade.subject) : (grade.subject || grade.subject_ar),
      score,
      max,
      pct: max ? Math.round((score / max) * 100) : 0,
    });
  }
  return [...latest.values()].sort((a, b) => b.pct - a.pct);
}

export function homeworkCounts(rows, now = new Date()) {
  const counts = { assigned: 0, submitted: 0, graded: 0, overdue: 0 };
  for (const hw of rows || []) {
    if (hw.status === 'submitted' || hw.status === 'graded') {
      counts[hw.status] += 1;
      continue;
    }
    if (hw.due_date && new Date(hw.due_date) < now && (hw.status === 'assigned' || !hw.status)) {
      counts.overdue += 1;
      continue;
    }
    counts.assigned += 1;
  }
  return counts;
}

export function feesOutstanding(invoices) {
  return (invoices || []).reduce((sum, inv) => {
    if (inv?.document_type && inv.document_type !== 'invoice') return sum;
    const st = displayStatus(inv);
    return st === 'cancelled' || st === 'paid' ? sum : sum + invoiceBalance(inv);
  }, 0);
}

export function forStudent(rows, studentId) {
  return (rows || []).filter((row) => row.student_id === studentId);
}
