import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useTenant } from '../TenantContext';
import { formatCurrency } from '../../lib/localization';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import DataTable from '../ui/DataTable';
import { AlertTriangle, CheckCircle } from 'lucide-react';

export default function GOSIManagement() {
  const { isRTL } = useLanguage();
  const { tenant } = useTenant();

  const { data: employees = [] } = useQuery({ queryKey: ['employees'], queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at').order()) });
  const { data: gosiRecords = [], isLoading } = useQuery({ queryKey: ['gosiRecords'], queryFn: () => fetchData(tenantQuery('gosi_records').select('*').order()) });

  const enriched = useMemo(() => {
    return employees.map(emp => {
      const gosi = gosiRecords.find(g => g.employee_id === emp.id);
      const payrollSalary = emp.basic_salary || 0;
      const gosiSalary = gosi?.registered_salary || 0;
      const diff = Math.abs(payrollSalary - gosiSalary);
      const isMismatch = diff > 100;
      const isSaudi = emp.is_saudi ?? false;
      return { ...emp, gosi, payrollSalary, gosiSalary, diff, isMismatch, isSaudi };
    });
  }, [employees, gosiRecords]);

  const mismatches = enriched.filter(e => e.isMismatch);

  const columns = [
    { header: isRTL ? 'الموظف' : 'Employee', cell: r => <span>{isRTL ? (r.name_ar || r.name_en) : (r.name_en || r.name_ar)}</span> },
    { header: isRTL ? 'الجنسية' : 'Nationality', cell: r => (
      <Badge className={r.isSaudi ? 'bg-emerald-100 text-emerald-700' : 'bg-najdi-50 text-najdi-900'}>
        {r.isSaudi ? (isRTL ? 'سعودي' : 'Saudi') : (isRTL ? 'غير سعودي' : 'Non-Saudi')}
      </Badge>
    )},
    { header: isRTL ? 'راتب الرواتب' : 'Payroll Salary', cell: r => `${formatCurrency(r.payrollSalary, tenant?.localization, isRTL)}` },
    { header: isRTL ? 'راتب التأمينات' : 'GOSI Salary', cell: r => `${formatCurrency(r.gosiSalary, tenant?.localization, isRTL)}` },
    { header: isRTL ? 'الفرق' : 'Difference', cell: r => (
      <span className={r.isMismatch ? 'text-red-600 font-semibold' : 'text-emerald-600'}>
        {r.diff > 0 ? `${formatCurrency(r.diff, tenant?.localization, isRTL)}` : '—'}
      </span>
    )},
    { header: isRTL ? 'الحالة' : 'Status', cell: r => r.isMismatch
      ? <Badge className="bg-red-100 text-red-700"><AlertTriangle className="w-3 h-3 me-1 inline" />{isRTL ? 'تناقض' : 'Mismatch'}</Badge>
      : <Badge className="bg-emerald-100 text-emerald-700"><CheckCircle className="w-3 h-3 me-1 inline" />{isRTL ? 'مطابق' : 'Matched'}</Badge>
    },
  ];

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-ink">{employees.length}</div>
            <div className="text-sm text-muted-foreground">{isRTL ? 'إجمالي الموظفين' : 'Total Employees'}</div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-emerald-700">{enriched.filter(e => !e.isMismatch).length}</div>
            <div className="text-sm text-emerald-600">{isRTL ? 'بيانات مطابقة' : 'Records Matched'}</div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-700">{mismatches.length}</div>
            <div className="text-sm text-red-600">{isRTL ? 'تناقضات تحتاج مراجعة' : 'Mismatches to Review'}</div>
          </CardContent>
        </Card>
      </div>

      {mismatches.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-red-800 text-sm font-medium">
            {mismatches.length} {isRTL ? `موظف لديه فارق بين راتب التأمينات وراتب الرواتب يتجاوز ${formatCurrency(100, tenant?.localization, isRTL)}. يرجى المراجعة.` : `employees have a GOSI salary mismatch exceeding ${formatCurrency(100, tenant?.localization, isRTL)}. Please review.`}
          </p>
        </div>
      )}

      <DataTable columns={columns} data={enriched} loading={isLoading} emptyMessage={isRTL ? 'لا توجد بيانات' : 'No data'} />
    </div>
  );
}