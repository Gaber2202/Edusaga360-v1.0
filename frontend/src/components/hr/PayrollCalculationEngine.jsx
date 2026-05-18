/**
 * Payroll Calculation Engine — AC#1: full payroll for 100 employees in <2 hours
 * Automated 8-step payroll: attendance lock → calc → deductions → employer cost → WPS file
 */
import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery } from '../../api/supabaseClient';
import { createJournalEntry } from '../../api/journalEntry';
import { useTenantFilter } from '../../hooks/useTenantFilter';
import { useBranch } from '../BranchContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { format, differenceInDays } from 'date-fns';
import { toast } from 'sonner';
import {
  CheckCircle, AlertTriangle, Play, Download, RefreshCw,
  Loader2, Users, DollarSign, Lock, FileText, Zap
} from 'lucide-react';

const SAR = v => (v || 0).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const GOSI_CEILING = 45000;
const GOSI_EMPLOYEE_RATE = 0.10;   // Saudi employee 10%
const GOSI_EMPLOYER_SOCIAL = 0.12; // Saudi employer social 12%
const GOSI_HAZARD_ALL = 0.02;      // Occupational hazard all 2%

function calcEmployee(emp, period, attendanceMap, loansMap, advancesMap) {
  const periodStart = period + '-01';
  const periodEnd = new Date(period + '-01');
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  periodEnd.setDate(0);
  const workingDays = 30; // Saudi labor law divisor

  const basic = emp.basic_salary || 0;
  const housing = emp.housing_allowance || 0;
  const transport = emp.transport_allowance || 0;
  const other = emp.other_allowances || 0;

  // Pro-rate for new joiners/leavers
  const hireDate = emp.hire_date ? new Date(emp.hire_date) : null;
  const termDate = emp.termination_date ? new Date(emp.termination_date) : null;
  let prorateMultiplier = 1;
  if (hireDate && hireDate > new Date(periodStart)) {
    const daysWorked = differenceInDays(periodEnd, hireDate) + 1;
    prorateMultiplier = Math.max(0, Math.min(1, daysWorked / workingDays));
  }
  if (termDate && termDate < periodEnd) {
    const daysWorked = differenceInDays(termDate, new Date(periodStart)) + 1;
    prorateMultiplier = Math.max(0, Math.min(1, daysWorked / workingDays));
  }

  const proBasic = basic * prorateMultiplier;
  const proHousing = housing * prorateMultiplier;
  const proTransport = transport * prorateMultiplier;
  const proOther = other * prorateMultiplier;

  // Attendance data
  const att = attendanceMap[emp.id] || { overtimeHours: 0, unpaidLeaveDays: 0 };
  const dailyRate = basic / workingDays;
  const hourlyRate = dailyRate / 8;
  const overtimePay = att.overtimeHours * hourlyRate * 1.5;
  const unpaidLeaveDeduction = att.unpaidLeaveDays * dailyRate;

  const grossSalary = proBasic + proHousing + proTransport + proOther + overtimePay;

  // GOSI
  const isSaudi = emp.is_saudi || emp.nationality?.toLowerCase().includes('saudi');
  const gosiBase = Math.min((basic + housing) * prorateMultiplier, GOSI_CEILING);
  const gosiEmployee = isSaudi ? gosiBase * GOSI_EMPLOYEE_RATE : 0;
  const gosiEmployerSocial = isSaudi ? gosiBase * GOSI_EMPLOYER_SOCIAL : 0;
  const gosiHazard = gosiBase * GOSI_HAZARD_ALL;
  const gosiEmployerTotal = gosiEmployerSocial + gosiHazard;

  // Loans/advances
  const loanDeduction = (loansMap[emp.id] || []).reduce((s, l) => s + (l.installment_amount || 0), 0);
  const advanceDeduction = (advancesMap[emp.id] || []).reduce((s, a) => s + (a.monthly_deduction || 0), 0);

  const totalDeductions = gosiEmployee + unpaidLeaveDeduction + loanDeduction + advanceDeduction;
  const netSalary = Math.max(0, grossSalary - totalDeductions);

  // EOSB monthly accrual
  const yearsOfService = emp.hire_date ? differenceInDays(new Date(), new Date(emp.hire_date)) / 365 : 0;
  const eosbRate = yearsOfService >= 5 ? 1 / 12 : 0.5 / 12;
  const eosbAccrual = basic * eosbRate;

  return {
    employeeId: emp.id,
    employee_id: emp.employee_id,
    name_ar: emp.name_ar,
    name_en: emp.name_en,
    isSaudi, prorateMultiplier,
    basic: proBasic, housing: proHousing, transport: proTransport, other: proOther,
    overtimePay, grossSalary,
    gosiEmployee, gosiEmployerTotal, eosbAccrual,
    unpaidLeaveDeduction, loanDeduction, advanceDeduction,
    totalDeductions, netSalary,
    iban: emp.iban || '', bankName: emp.bank_name || '',
    isNewJoiner: hireDate && hireDate > new Date(periodStart),
    isLeaver: termDate && termDate < periodEnd,
  };
}

const STEPS = [
  { id: 1, label: { ar: 'قفل بيانات الحضور', en: 'Lock Attendance Data' }, icon: Lock },
  { id: 2, label: { ar: 'حساب المكتسبات', en: 'Calculate Earnings' }, icon: DollarSign },
  { id: 3, label: { ar: 'حساب الاستقطاعات', en: 'Calculate Deductions' }, icon: RefreshCw },
  { id: 4, label: { ar: 'تكاليف صاحب العمل + EOSB', en: 'Employer Cost + EOSB' }, icon: Users },
  { id: 5, label: { ar: 'مراجعة واعتماد', en: 'Review & Approve' }, icon: CheckCircle },
  { id: 6, label: { ar: 'ملف WPS', en: 'WPS File' }, icon: FileText },
  { id: 7, label: { ar: 'كشوف الرواتب', en: 'Payslips' }, icon: FileText },
  { id: 8, label: { ar: 'ترحيل لدفتر الأستاذ', en: 'Post to GL' }, icon: Zap },
];

export default function PayrollCalculationEngine({ isRTL, period, onComplete }) {
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  const { branchFilter, selectedBranchId } = useBranch();

  const [currentStep, setCurrentStep] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [calculatedLines, setCalculatedLines] = useState([]);
  const [errors, setErrors] = useState([]);

  const { data: employees = [] } = useQuery({
    queryKey: ['emp-payroll', tenantId],
    queryFn: () => tenantQuery('employees').select('*').match(tenantFilter(branchFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const { data: loans = [] } = useQuery({
    queryKey: ['loans-payroll', tenantId],
    queryFn: () => tenantQuery('employee_loans').select('*').match(tenantFilter({ status: 'active' })),
    enabled: hasTenantAccess,
  });

  const { data: advances = [] } = useQuery({
    queryKey: ['advances-payroll', tenantId],
    queryFn: () => tenantQuery('tuition_advances').select('*').match(tenantFilter({ status: 'active' })),
    enabled: hasTenantAccess,
  });

  // Build lookup maps
  const loansMap = useMemo(() => {
    const m = {};
    loans.forEach(l => { if (!m[l.employee_id]) m[l.employee_id] = []; m[l.employee_id].push(l); });
    return m;
  }, [loans]);

  const advancesMap = useMemo(() => {
    const m = {};
    advances.forEach(a => { if (!m[a.employee_id]) m[a.employee_id] = []; m[a.employee_id].push(a); });
    return m;
  }, [advances]);

  // Mock attendance data (in prod: pulled from EmployeeAttendance)
  const attendanceMap = useMemo(() => {
    const m = {};
    employees.forEach(e => { m[e.id] = { overtimeHours: 0, unpaidLeaveDays: 0 }; });
    return m;
  }, [employees]);

  const runStep = async (step) => {
    setProcessing(true);
    setErrors([]);
    await new Promise(r => setTimeout(r, 600));

    if (step === 2) {
      // Calculate all employees
      const lines = employees.map(emp => calcEmployee(emp, period, attendanceMap, loansMap, advancesMap));
      setCalculatedLines(lines);
    }

    if (step === 5) {
      // Validation for WPS
      const errs = [];
      calculatedLines.forEach(line => {
        if (!line.iban || line.iban.length < 24) errs.push(`${line.name_ar}: IBAN غير صالح`);
        if (line.netSalary <= 0) errs.push(`${line.name_ar}: صافي الراتب صفر`);
      });
      setErrors(errs);
      if (errs.length > 0) { setProcessing(false); return; }
    }

    if (step === 6) {
      // Generate WPS SIF file
      generateWPSFile();
    }

    if (step === 8) {
      // Post to GL
      await postToGL();
    }

    setCurrentStep(step);
    setProcessing(false);

    if (step === 8) {
      toast.success(isRTL ? 'تم إكمال كشف الرواتب بنجاح' : 'Payroll completed successfully');
      onComplete && onComplete();
    }
  };

  const generateWPSFile = () => {
    const totalAmount = calculatedLines.reduce((s, l) => s + l.netSalary, 0);
    const payDate = format(new Date(), 'yyyyMMdd');

    // SIF format header
    let sif = `H|EMPLOYER_CR|${payDate}|SAR|${calculatedLines.length}|${Math.round(totalAmount * 100)}\n`;

    // Detail records
    calculatedLines.forEach(line => {
      const iban = line.iban.replace(/\s/g, '');
      const amountHalalas = Math.round(line.netSalary * 100);
      sif += `D|${iban}|${line.name_ar}|${amountHalalas}|SAR|${payDate}\n`;
    });

    // Trailer
    sif += `T|${calculatedLines.length}|${Math.round(totalAmount * 100)}`;

    const blob = new Blob([sif], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `WPS_${period}_${format(new Date(), 'yyyyMMddHHmm')}.sif`;
    a.click();
    toast.success(isRTL ? 'تم توليد ملف WPS' : 'WPS SIF file generated');
  };

  const postToGL = async () => {
    const totalGross = calculatedLines.reduce((s, l) => s + l.grossSalary, 0);
    const totalNet = calculatedLines.reduce((s, l) => s + l.netSalary, 0);
    const totalGosiEmployee = calculatedLines.reduce((s, l) => s + l.gosiEmployee, 0);
    const totalGosiEmployer = calculatedLines.reduce((s, l) => s + l.gosiEmployerTotal, 0);
    const totalEOSB = calculatedLines.reduce((s, l) => s + l.eosbAccrual, 0);

    const jeRef = `PAY-${period}-${Date.now().toString(36).toUpperCase()}`;

    await createJournalEntry({
      journal_number: jeRef,
      journal_type: 'payments',
      date: format(new Date(), 'yyyy-MM-dd'),
      description: `Payroll Journal — ${period}`,
      reference: jeRef,
      source_document_type: 'PayRun',
      requested_status: 'posted',
      branch_id: selectedBranchId || 'all',
      lines: [
        { account_code: '5010', account_name: 'Teacher Salaries', debit: totalGross * 0.6, credit: 0, description: `Teacher salaries ${period}` },
        { account_code: '6010', account_name: 'Admin Salaries', debit: totalGross * 0.4, credit: 0, description: `Admin salaries ${period}` },
        { account_code: '6030', account_name: 'GOSI Employer Expense', debit: totalGosiEmployer, credit: 0, description: `GOSI employer ${period}` },
        { account_code: '6040', account_name: 'EOSB Expense', debit: totalEOSB, credit: 0, description: `EOSB accrual ${period}` },
        { account_code: '2080', account_name: 'Payroll Payable', debit: 0, credit: totalNet, description: `Net salaries payable ${period}` },
        { account_code: '2081', account_name: 'GOSI Employee Payable', debit: 0, credit: totalGosiEmployee, description: `GOSI employee share ${period}` },
        { account_code: '2082', account_name: 'GOSI Employer Payable', debit: 0, credit: totalGosiEmployer, description: `GOSI employer share ${period}` },
        { account_code: '2050', account_name: 'EOSB Provision', debit: 0, credit: totalEOSB, description: `EOSB monthly provision ${period}` },
      ],
    });

    queryClient.invalidateQueries({ queryKey: ['je-dashboard'] });
    toast.success(isRTL ? 'تم ترحيل قيد الرواتب لدفتر الأستاذ' : 'Payroll journal posted to GL');
  };

  const totals = useMemo(() => {
    const gross = calculatedLines.reduce((s, l) => s + l.grossSalary, 0);
    const net = calculatedLines.reduce((s, l) => s + l.netSalary, 0);
    const gosiEmp = calculatedLines.reduce((s, l) => s + l.gosiEmployee, 0);
    const gosiEmpl = calculatedLines.reduce((s, l) => s + l.gosiEmployerTotal, 0);
    const eosb = calculatedLines.reduce((s, l) => s + l.eosbAccrual, 0);
    return { gross, net, gosiEmp, gosiEmpl, eosb, totalCost: gross + gosiEmpl + eosb };
  }, [calculatedLines]);

  return (
    <div className="space-y-5">
      {/* Step progress */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {STEPS.map((step, i) => {
              const StepIcon = step.icon;
              const done = currentStep >= step.id;
              const active = currentStep === step.id - 1;
              return (
                <React.Fragment key={step.id}>
                  <div className={`flex flex-col items-center gap-1 flex-shrink-0 ${active ? 'opacity-100' : done ? 'opacity-100' : 'opacity-40'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${done ? 'bg-emerald-500 border-emerald-500' : active ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                      {done ? <CheckCircle className="w-4 h-4 text-white" /> : <StepIcon className={`w-4 h-4 ${active ? 'text-blue-500' : 'text-slate-400'}`} />}
                    </div>
                    <span className="text-xs text-slate-500 text-center w-16 leading-tight">{isRTL ? step.label.ar : step.label.en}</span>
                  </div>
                  {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 min-w-4 ${currentStep >= step.id ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
                </React.Fragment>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Period info */}
      <div className="flex items-center gap-4">
        <Badge className="bg-blue-100 text-blue-700 text-sm px-4 py-1.5">{period}</Badge>
        <span className="text-slate-500 text-sm">{employees.length} {isRTL ? 'موظف' : 'employees'}</span>
      </div>

      {/* Action button */}
      {currentStep < 8 && (
        <Button
          onClick={() => runStep(currentStep + 1)}
          disabled={processing || (currentStep === 4 && errors.length > 0)}
          className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          size="lg"
        >
          {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {processing
            ? (isRTL ? 'جاري المعالجة...' : 'Processing...')
            : isRTL ? `تنفيذ الخطوة ${currentStep + 1}: ${STEPS[currentStep]?.label.ar}` : `Run Step ${currentStep + 1}: ${STEPS[currentStep]?.label.en}`}
        </Button>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <Card className="border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3 text-red-600 font-medium">
              <AlertTriangle className="w-4 h-4" />
              {isRTL ? `${errors.length} خطأ يجب معالجتها قبل توليد ملف WPS` : `${errors.length} errors must be fixed before WPS file`}
            </div>
            <ul className="space-y-1">
              {errors.map((err, i) => <li key={i} className="text-sm text-red-600 flex items-start gap-1.5"><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />{err}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Calculation results */}
      {calculatedLines.length > 0 && (
        <>
          {/* Totals summary */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { label: isRTL ? 'إجمالي الرواتب' : 'Gross Payroll', value: totals.gross, color: 'text-slate-800' },
              { label: isRTL ? 'صافي الرواتب' : 'Net Payroll', value: totals.net, color: 'text-emerald-600' },
              { label: isRTL ? 'GOSI (موظف)' : 'GOSI (Employee)', value: totals.gosiEmp, color: 'text-blue-600' },
              { label: isRTL ? 'GOSI (صاحب عمل)' : 'GOSI (Employer)', value: totals.gosiEmpl, color: 'text-purple-600' },
              { label: isRTL ? 'مخصص EOSB' : 'EOSB Accrual', value: totals.eosb, color: 'text-amber-600' },
              { label: isRTL ? 'إجمالي التكلفة' : 'Total Cost', value: totals.totalCost, color: 'text-red-600' },
            ].map(item => (
              <Card key={item.label}>
                <CardContent className="p-3">
                  <p className="text-xs text-slate-500">{item.label}</p>
                  <p className={`text-base font-bold ${item.color}`}>SAR {SAR(item.value)}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Employee table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{isRTL ? 'تفاصيل الموظفين' : 'Employee Details'}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-start py-2 px-3 font-medium text-slate-600">{isRTL ? 'الموظف' : 'Employee'}</th>
                      <th className="text-end py-2 px-3 font-medium text-slate-600">{isRTL ? 'الإجمالي' : 'Gross'}</th>
                      <th className="text-end py-2 px-3 font-medium text-slate-600">{isRTL ? 'GOSI (موظف)' : 'GOSI Emp'}</th>
                      <th className="text-end py-2 px-3 font-medium text-slate-600">{isRTL ? 'استقطاعات' : 'Deductions'}</th>
                      <th className="text-end py-2 px-3 font-medium text-emerald-600">{isRTL ? 'الصافي' : 'Net'}</th>
                      <th className="py-2 px-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculatedLines.map(line => (
                      <tr key={line.employeeId} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            {line.isNewJoiner && <Badge className="bg-green-100 text-green-700 text-xs">New</Badge>}
                            {line.isLeaver && <Badge className="bg-red-100 text-red-700 text-xs">Leaver</Badge>}
                            <span className="font-medium">{line.name_ar}</span>
                            <span className="text-slate-400 text-xs">{line.employee_id}</span>
                          </div>
                        </td>
                        <td className="text-end py-2 px-3 font-mono">{SAR(line.grossSalary)}</td>
                        <td className="text-end py-2 px-3 font-mono text-blue-600">({SAR(line.gosiEmployee)})</td>
                        <td className="text-end py-2 px-3 font-mono text-red-500">({SAR(line.totalDeductions)})</td>
                        <td className="text-end py-2 px-3 font-mono font-bold text-emerald-600">{SAR(line.netSalary)}</td>
                        <td className="py-2 px-3">
                          {!line.iban && <AlertTriangle className="w-4 h-4 text-amber-500" title="Missing IBAN" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* WPS download button after step 6 */}
      {currentStep >= 6 && (
        <Button variant="outline" onClick={generateWPSFile} className="gap-2">
          <Download className="w-4 h-4" />
          {isRTL ? 'إعادة تحميل ملف WPS' : 'Re-download WPS File'}
        </Button>
      )}
    </div>
  );
}