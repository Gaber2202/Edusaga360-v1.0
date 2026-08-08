import { formatNumber, getCurrencySymbol } from './localization';
/**
 * Client-side report builders (P3.4 / fix).
 *
 * The Reports page used to POST to /api/functions/generateReport, which does
 * not exist on the backend — every preview/download errored. These pure
 * builders shape already-fetched, tenant-scoped data into { headers, rows } for
 * the on-screen preview, CSV export and the print view. Pure → unit-tested.
 */
const nameOf = (r, isRTL) => (isRTL ? (r?.name_ar || r?.name_en) : (r?.name_en || r?.name_ar)) || r?.student_name || '';
const fmt = (n, localization, isRTL) => formatNumber(n, localization, isRTL);

export function buildStudentList(students = [], isRTL = false) {
  return {
    headers: isRTL ? ['رقم الطالب', 'الاسم', 'الصف', 'الحالة', 'العام الدراسي'] : ['Student ID', 'Name', 'Grade', 'Status', 'Academic Year'],
    rows: students.map((s) => [s.student_id || s.id || '', nameOf(s, isRTL), s.grade || '', s.status || '', s.academic_year || '']),
  };
}

export function buildFeeCollection(invoices = [], isRTL = false, localization = null) {
  return {
    headers: isRTL ? ['رقم الفاتورة', 'الطالب', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة', 'التاريخ'] : ['Invoice #', 'Student', 'Total', 'Paid', 'Balance', 'Status', 'Date'],
    rows: invoices.map((i) => [
      i.invoice_number || '', i.student_name || '', fmt(i.total_amount, localization, isRTL), fmt(i.paid_amount, localization, isRTL),
      fmt((i.total_amount || 0) - (i.paid_amount || 0), localization, isRTL), i.status || '', i.issue_date || i.date || '',
    ]),
  };
}

export function buildInvoiceAging(invoices = [], isRTL = false, now = new Date(), localization = null) {
  const open = invoices.filter((i) => ((i.total_amount || 0) - (i.paid_amount || 0)) > 0.01 && i.status !== 'cancelled');
  return {
    headers: isRTL ? ['رقم الفاتورة', 'الطالب', 'تاريخ الاستحقاق', 'المتبقي', 'أيام التأخر'] : ['Invoice #', 'Student', 'Due Date', 'Balance', 'Days Overdue'],
    rows: open.map((i) => {
      const due = i.due_date ? new Date(i.due_date) : null;
      const days = due && !Number.isNaN(due.getTime()) ? Math.max(0, Math.floor((now - due) / 86400000)) : 0;
      return [i.invoice_number || '', i.student_name || '', i.due_date || '', fmt((i.total_amount || 0) - (i.paid_amount || 0), localization, isRTL), days];
    }),
  };
}

export function buildAttendanceSummary(records = [], isRTL = false) {
  const map = {};
  records.forEach((r) => {
    const k = r.student_id || r.student_name || 'unknown';
    if (!map[k]) map[k] = { name: r.student_name || k, present: 0, absent: 0, late: 0 };
    if (r.status === 'present') map[k].present++;
    else if (r.status === 'absent') map[k].absent++;
    else if (r.status === 'late') map[k].late++;
  });
  return {
    headers: isRTL ? ['الطالب', 'حاضر', 'غائب', 'متأخر'] : ['Student', 'Present', 'Absent', 'Late'],
    rows: Object.values(map).map((s) => [s.name, s.present, s.absent, s.late]),
  };
}

export function buildPayrollSummary(inputs = [], isRTL = false, localization = null) {
  return {
    headers: isRTL ? ['الموظف', 'الفترة', 'الأساسي', 'البدلات', 'الاستقطاعات', 'الصافي'] : ['Employee', 'Period', 'Basic', 'Allowances', 'Deductions', 'Net'],
    rows: inputs.map((p) => [
      p.employee_name || p.employee_id || '', p.period || '', fmt(p.basic_salary, localization, isRTL),
      fmt((p.housing_allowance || 0) + (p.transport_allowance || 0) + (p.other_allowances || 0), localization, isRTL),
      fmt(p.total_deductions ?? p.deductions, localization, isRTL), fmt(p.net_salary, localization, isRTL),
    ]),
  };
}

export function buildFinancialStatement(invoices = [], expenses = [], isRTL = false, localization = null) {
  const live = invoices.filter((i) => i.status !== 'cancelled');
  const revenue = live.reduce((s, i) => s + (i.subtotal ?? ((i.total_amount || 0) - (i.vat_amount || 0))), 0);
  const vat = live.reduce((s, i) => s + (i.vat_amount || 0), 0);
  const collected = invoices.reduce((s, i) => s + (i.paid_amount || 0), 0);
  const exp = expenses.filter((e) => e.status === 'approved').reduce((s, e) => s + (e.amount || 0), 0);
  const symbol = getCurrencySymbol(localization, isRTL);
  return {
    headers: isRTL ? ['البند', `المبلغ (${symbol})`] : ['Item', `Amount (${symbol})`],
    rows: [
      [isRTL ? 'إجمالي الإيرادات (قبل الضريبة)' : 'Gross Revenue (ex-VAT)', fmt(revenue, localization, isRTL)],
      [isRTL ? 'ضريبة القيمة المضافة' : 'VAT', fmt(vat, localization, isRTL)],
      [isRTL ? 'المحصّل' : 'Collected', fmt(collected, localization, isRTL)],
      [isRTL ? 'المصروفات المعتمدة' : 'Approved Expenses', fmt(exp, localization, isRTL)],
      [isRTL ? 'صافي الدخل' : 'Net Income', fmt(revenue - exp, localization, isRTL)],
    ],
  };
}

/** Which tenant tables each report needs (the page fetches these). */
export const REPORT_SOURCES = {
  student_list: ['students'],
  fee_collection: ['invoices'],
  invoice_aging: ['invoices'],
  attendance_summary: ['attendances'],
  payroll_summary: ['payroll_inputs'],
  financial_statement: ['invoices', 'expenses'],
};

export function buildReport(reportId, datasets = {}, isRTL = false, localization = null) {
  switch (reportId) {
    case 'student_list': return buildStudentList(datasets.students, isRTL);
    case 'fee_collection': return buildFeeCollection(datasets.invoices, isRTL, localization);
    case 'invoice_aging': return buildInvoiceAging(datasets.invoices, isRTL, undefined, localization);
    case 'attendance_summary': return buildAttendanceSummary(datasets.attendances, isRTL);
    case 'payroll_summary': return buildPayrollSummary(datasets.payroll_inputs, isRTL, localization);
    case 'financial_statement': return buildFinancialStatement(datasets.invoices, datasets.expenses, isRTL, localization);
    default: return { headers: [], rows: [] };
  }
}
