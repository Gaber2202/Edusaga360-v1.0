/**
 * EOSB Calculator — AC#3: calculate final settlement in <60 seconds
 * Full Saudi Labor Law Article 84 compliance
 */
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { useBranch } from '../components/BranchContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import { differenceInDays, format, addDays } from 'date-fns';
import { Calculator, Download, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';

const SAR = v => (v || 0).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TERMINATION_REASONS = [
  { value: 'resigned_lt2', label: { ar: 'استقالة أقل من سنتين (لا يستحق)', en: 'Resigned < 2 years (no EOSB)' }, multiplier: 0 },
  { value: 'resigned_2to5', label: { ar: 'استقالة (2-5 سنوات — ثلث المستحق)', en: 'Resigned (2–5 years — 1/3 entitlement)' }, multiplier: 1/3 },
  { value: 'resigned_5to10', label: { ar: 'استقالة (5-10 سنوات — ثلثا المستحق)', en: 'Resigned (5–10 years — 2/3 entitlement)' }, multiplier: 2/3 },
  { value: 'resigned_10plus', label: { ar: 'استقالة (10+ سنوات — مستحق كامل)', en: 'Resigned (10+ years — full)' }, multiplier: 1 },
  { value: 'terminated_employer', label: { ar: 'إنهاء من صاحب العمل — مستحق كامل', en: 'Employer terminated — full entitlement' }, multiplier: 1 },
  { value: 'contract_expired', label: { ar: 'انتهاء عقد محدد المدة — مستحق كامل', en: 'Fixed-term contract expired — full entitlement' }, multiplier: 1 },
  { value: 'article80', label: { ar: 'الفصل بسبب مخالفة جسيمة (م. 80) — لا يستحق', en: 'Dismissed for misconduct (Art. 80) — no EOSB' }, multiplier: 0 },
];

function calcEOSB(basicSalary, startDate, endDate) {
  if (!basicSalary || !startDate || !endDate) return { total: 0, breakdown: [] };
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = differenceInDays(end, start);
  const totalYears = totalDays / 365;

  const breakdown = [];
  let total = 0;

  if (totalYears <= 0) return { total: 0, breakdown: [] };

  const first5 = Math.min(totalYears, 5);
  const after5 = Math.max(0, totalYears - 5);

  if (first5 > 0) {
    const amount = basicSalary * 0.5 * first5;
    breakdown.push({
      label: { ar: `أول 5 سنوات (${first5.toFixed(2)} سنة × نصف شهر)`, en: `First 5 years (${first5.toFixed(2)} yrs × 0.5 month)` },
      amount,
    });
    total += amount;
  }

  if (after5 > 0) {
    const amount = basicSalary * 1.0 * after5;
    breakdown.push({
      label: { ar: `بعد 5 سنوات (${after5.toFixed(2)} سنة × شهر كامل)`, en: `After 5 years (${after5.toFixed(2)} yrs × 1 month)` },
      amount,
    });
    total += amount;
  }

  return { total, breakdown, totalYears, totalDays };
}

export default function EOSBCalculator() {
  const { isRTL } = useLanguage();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  const { branchFilter } = useBranch();

  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [form, setForm] = useState({
    lastDay: format(new Date(), 'yyyy-MM-dd'),
    terminationReason: '',
    outstandingLoan: 0,
    unpaidLeaveBalance: 0,
    unpaidSalaryDays: 0,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-eosb', tenantId],
    queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_date').match(tenantFilter(branchFilter({ status: 'active' })))),
    enabled: hasTenantAccess,
  });

  const employee = employees.find(e => e.id === selectedEmployeeId);

  const termReason = TERMINATION_REASONS.find(r => r.value === form.terminationReason);

  const result = useMemo(() => {
    if (!employee || !form.terminationReason || !form.lastDay) return null;

    const basicSalary = employee.basic_salary || 0;
    const hireDate = employee.hire_date;
    const lastDay = form.lastDay;

    const { total: fullEOSB, breakdown, totalYears, totalDays } = calcEOSB(basicSalary, hireDate, lastDay);
    const multiplier = termReason?.multiplier || 0;
    const eosbDue = fullEOSB * multiplier;

    // Leave encashment: remaining leave days × (basic / 30)
    const dailyBasic = basicSalary / 30;
    const leaveEncashment = (form.unpaidLeaveBalance || 0) * dailyBasic;

    // Unpaid salary this month
    const unpaidSalary = (form.unpaidSalaryDays || 0) * dailyBasic;

    // Deductions
    const loanDeduction = parseFloat(form.outstandingLoan) || 0;

    const netSettlement = eosbDue + leaveEncashment + unpaidSalary - loanDeduction;

    // Payment deadline: 5 days after last day
    const paymentDeadline = addDays(new Date(lastDay), 5);
    const daysToDeadline = differenceInDays(paymentDeadline, new Date());

    return { basicSalary, fullEOSB, multiplier, eosbDue, breakdown, totalYears, totalDays, leaveEncashment, unpaidSalary, loanDeduction, netSettlement, paymentDeadline, daysToDeadline };
  }, [employee, form, termReason]);

  // Auto-detect resignation reason based on years of service
  const autoDetectReason = () => {
    if (!employee?.hire_date || !form.lastDay) return;
    const years = differenceInDays(new Date(form.lastDay), new Date(employee.hire_date)) / 365;
    if (years < 2) setForm(p => ({ ...p, terminationReason: 'resigned_lt2' }));
    else if (years < 5) setForm(p => ({ ...p, terminationReason: 'resigned_2to5' }));
    else if (years < 10) setForm(p => ({ ...p, terminationReason: 'resigned_5to10' }));
    else setForm(p => ({ ...p, terminationReason: 'resigned_10plus' }));
  };

  const exportPDF = () => {
    if (!result) return;
    const rows = [
      ['EOSB Final Settlement Calculation'],
      ['Employee:', employee?.name_ar],
      ['Employee ID:', employee?.employee_id],
      ['Last Day:', form.lastDay],
      ['Years of Service:', result.totalYears.toFixed(2)],
      ['Termination Reason:', termReason?.label?.en],
      [''],
      ['EOSB (Full Entitlement):', `SAR ${SAR(result.fullEOSB)}`],
      ['Applied Multiplier:', `${(result.multiplier * 100).toFixed(0)}%`],
      ['EOSB Due:', `SAR ${SAR(result.eosbDue)}`],
      ['Leave Encashment:', `SAR ${SAR(result.leaveEncashment)}`],
      ['Unpaid Salary:', `SAR ${SAR(result.unpaidSalary)}`],
      ['Outstanding Loan (deduction):', `(SAR ${SAR(result.loanDeduction)})`],
      ['NET FINAL SETTLEMENT:', `SAR ${SAR(result.netSettlement)}`],
      ['Payment Deadline:', format(result.paymentDeadline, 'dd/MM/yyyy')],
    ];
    const csv = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `EOSB_${employee?.employee_id}_${form.lastDay}.csv`;
    a.click();
    toast.success(isRTL ? 'تم التصدير' : 'Exported');
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{isRTL ? 'حاسبة نهاية الخدمة (EOSB)' : 'End of Service Benefit (EOSB) Calculator'}</h1>
        <p className="text-sm text-slate-500">{isRTL ? 'المادة 84 من نظام العمل السعودي — احتساب فوري دقيق' : 'Saudi Labor Law Article 84 — instant precise calculation'}</p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">{isRTL ? 'بيانات الإنهاء' : 'Termination Details'}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{isRTL ? 'اختر الموظف' : 'Select Employee'} *</Label>
            <Select value={selectedEmployeeId} onValueChange={v => { setSelectedEmployeeId(v); setForm(p => ({ ...p, terminationReason: '' })); }}>
              <SelectTrigger><SelectValue placeholder={isRTL ? 'ابحث عن موظف...' : 'Search employee...'} /></SelectTrigger>
              <SelectContent>
                {employees.map(e => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.employee_id} — {e.name_ar} {e.name_en ? `(${e.name_en})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {employee && (
            <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-500">{isRTL ? 'تاريخ التعيين:' : 'Hire Date:'}</span><span className="font-medium ms-2">{employee.hire_date ? format(new Date(employee.hire_date), 'dd/MM/yyyy') : '—'}</span></div>
              <div><span className="text-slate-500">{isRTL ? 'الراتب الأساسي:' : 'Basic Salary:'}</span><span className="font-medium ms-2">SAR {SAR(employee.basic_salary)}</span></div>
              <div><span className="text-slate-500">{isRTL ? 'النوع:' : 'Type:'}</span><span className="font-medium ms-2">{employee.employment_type}</span></div>
              <div><span className="text-slate-500">{isRTL ? 'العقد:' : 'Contract:'}</span><span className="font-medium ms-2">{employee.contract_type}</span></div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'آخر يوم عمل' : 'Last Working Day'} *</Label>
              <Input type="date" value={form.lastDay} onChange={e => setForm(p => ({ ...p, lastDay: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'سبب الإنهاء' : 'Termination Reason'} *</Label>
              <Select value={form.terminationReason} onValueChange={v => setForm(p => ({ ...p, terminationReason: v }))}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                <SelectContent>
                  {TERMINATION_REASONS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{isRTL ? r.label.ar : r.label.en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {employee?.hire_date && form.lastDay && (
            <Button variant="outline" size="sm" onClick={autoDetectReason} className="gap-1">
              <Calculator className="w-4 h-4" />
              {isRTL ? 'تحديد سبب الاستقالة تلقائياً' : 'Auto-detect resignation reason'}
            </Button>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">{isRTL ? 'رصيد الإجازة المتبقي (أيام)' : 'Remaining Leave (days)'}</Label>
              <Input type="number" value={form.unpaidLeaveBalance} onChange={e => setForm(p => ({ ...p, unpaidLeaveBalance: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{isRTL ? 'أيام الراتب غير المدفوعة' : 'Unpaid Salary Days'}</Label>
              <Input type="number" value={form.unpaidSalaryDays} onChange={e => setForm(p => ({ ...p, unpaidSalaryDays: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{isRTL ? 'قروض/سلف مستحقة (خصم)' : 'Outstanding Loans (deduction)'}</Label>
              <Input type="number" value={form.outstandingLoan} onChange={e => setForm(p => ({ ...p, outstandingLoan: parseFloat(e.target.value) || 0 }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Result */}
      {result && (
        <Card className="border-2 border-emerald-200">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{isRTL ? 'نتيجة الحساب' : 'Settlement Calculation'}</CardTitle>
              <Button size="sm" variant="outline" onClick={exportPDF} className="gap-1">
                <Download className="w-4 h-4" />{isRTL ? 'تصدير' : 'Export'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Service summary */}
            <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-3">
              <Clock className="w-5 h-5 text-slate-400 flex-shrink-0" />
              <div className="text-sm">
                <span className="font-semibold">{result.totalYears.toFixed(2)}</span>
                {isRTL ? ' سنة خدمة (' : ' years of service ('}
                <span className="font-semibold">{result.totalDays}</span>
                {isRTL ? ' يوم)' : ' days)'}
              </div>
              <Badge className={termReason?.multiplier === 0 ? 'bg-red-100 text-red-700' : termReason?.multiplier === 1 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
                {isRTL ? `${(result.multiplier * 100).toFixed(0)}% من المستحق` : `${(result.multiplier * 100).toFixed(0)}% of entitlement`}
              </Badge>
            </div>

            {/* EOSB breakdown */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{isRTL ? 'تفصيل مستحق نهاية الخدمة' : 'EOSB Breakdown'}</p>
              {result.breakdown.map((b, i) => (
                <div key={i} className="flex justify-between text-sm py-1 border-b border-slate-100">
                  <span className="text-slate-600">{isRTL ? b.label.ar : b.label.en}</span>
                  <span className="font-mono">SAR {SAR(b.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-semibold">
                <span>{isRTL ? 'مستحق كامل (قبل التطبيق)' : 'Full EOSB (before multiplier)'}</span>
                <span className="font-mono text-slate-700">SAR {SAR(result.fullEOSB)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-blue-700">
                <span>{isRTL ? `مكافأة نهاية الخدمة المستحقة (${(result.multiplier * 100).toFixed(0)}%)` : `EOSB Due (${(result.multiplier * 100).toFixed(0)}%)`}</span>
                <span className="font-mono">SAR {SAR(result.eosbDue)}</span>
              </div>
            </div>

            <Separator />

            {/* Other components */}
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">{isRTL ? '+ تعويض الإجازة المتبقية' : '+ Leave Encashment'}</span>
                <span className="font-mono text-emerald-600">+ SAR {SAR(result.leaveEncashment)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">{isRTL ? '+ راتب الأيام العاملة هذا الشهر' : '+ Current Month Unpaid Salary'}</span>
                <span className="font-mono text-emerald-600">+ SAR {SAR(result.unpaidSalary)}</span>
              </div>
              {result.loanDeduction > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-600">{isRTL ? '- قروض/سلف مستحقة' : '- Outstanding Loans'}</span>
                  <span className="font-mono text-red-600">− SAR {SAR(result.loanDeduction)}</span>
                </div>
              )}
            </div>

            {/* Net */}
            <div className={`p-4 rounded-xl ${result.netSettlement >= 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="flex items-center justify-between">
                <span className="font-bold text-lg text-slate-800">{isRTL ? 'صافي المستحق النهائي' : 'NET FINAL SETTLEMENT'}</span>
                <span className={`font-bold text-2xl ${result.netSettlement >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  SAR {SAR(Math.abs(result.netSettlement))}
                  {result.netSettlement < 0 && <span className="text-sm ms-1">({isRTL ? 'يستحق من الموظف' : 'owed by employee'})</span>}
                </span>
              </div>
            </div>

            {/* Payment deadline */}
            <div className={`flex items-center gap-3 p-3 rounded-xl ${result.daysToDeadline <= 2 ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'}`}>
              {result.daysToDeadline <= 2
                ? <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                : <CheckCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />}
              <div className="text-sm">
                <span className="font-medium">{isRTL ? 'الموعد النهائي للصرف (5 أيام قانونية):' : 'Payment deadline (5 working days):'}</span>
                <span className="ms-2 font-bold">{format(result.paymentDeadline, 'dd/MM/yyyy')}</span>
                <span className="ms-2 text-slate-500">
                  ({result.daysToDeadline > 0 ? `${result.daysToDeadline} ${isRTL ? 'يوم متبقي' : 'days remaining'}` : (isRTL ? 'انتهى الموعد!' : 'Deadline passed!')})
                </span>
              </div>
            </div>

            {termReason?.multiplier === 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 inline me-2" />
                {isRTL ? 'بناءً على سبب الإنهاء، لا يستحق الموظف مكافأة نهاية الخدمة' : 'Based on termination reason, employee is not entitled to EOSB'}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}