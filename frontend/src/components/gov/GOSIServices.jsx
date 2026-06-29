import React, { useState } from 'react';
import { useLanguage } from '../LanguageContext';
import ServiceTile from './ServiceTile';
import ServiceWorkflowDialog from './ServiceWorkflowDialog';
import { UserPlus, RefreshCw, UserMinus, FileText, BarChart2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import DataTable from '../ui/DataTable';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { useMemo } from 'react';

const GOSI_SERVICES = [
  {
    code: 'GOSI-REGISTER', nameAr: 'تسجيل موظف في التأمينات', nameEn: 'Register Employee',
    descAr: 'تسجيل موظف جديد في منظومة التأمينات الاجتماعية', descEn: 'Register a new employee in the GOSI system',
    icon: UserPlus, color: 'emerald',
  },
  {
    code: 'GOSI-SALARY-UPDATE', nameAr: 'تحديث راتب التأمينات', nameEn: 'Update Salary',
    descAr: 'تحديث الراتب المسجل في التأمينات الاجتماعية', descEn: 'Update the registered salary in GOSI',
    icon: RefreshCw, color: 'blue',
  },
  {
    code: 'GOSI-TERMINATE', nameAr: 'إنهاء خدمة في التأمينات', nameEn: 'Terminate Employee',
    descAr: 'تسجيل إنهاء خدمة موظف في التأمينات', descEn: 'Record employee termination in GOSI',
    icon: UserMinus, color: 'red',
  },
  {
    code: 'GOSI-CERTIFICATE', nameAr: 'إصدار شهادة تأمينات', nameEn: 'Generate Certificate',
    descAr: 'إصدار شهادة التسجيل في التأمينات الاجتماعية', descEn: 'Generate GOSI registration certificate',
    icon: FileText, color: 'amber',
  },
  {
    code: 'GOSI-REPORT', nameAr: 'تقرير الاشتراكات', nameEn: 'Contribution Report',
    descAr: 'تقرير تفصيلي باشتراكات التأمينات الاجتماعية', descEn: 'Detailed GOSI contribution report',
    icon: BarChart2, color: 'purple',
  },
];

export default function GOSIServices() {
  const { isRTL } = useLanguage();
  const [selected, setSelected] = useState(null);

  const { data: employees = [] } = useQuery({ queryKey: ['employees'], queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at').order()) });
  const { data: gosiRecords = [], isLoading } = useQuery({ queryKey: ['gosiRecords'], queryFn: () => fetchData(tenantQuery('gosi_records').select('*').order()) });

  const enriched = useMemo(() => {
    return employees.map(emp => {
      const gosi = gosiRecords.find(g => g.employee_id === emp.id);
      const payrollSalary = emp.basic_salary || 0;
      const gosiSalary = gosi?.registered_salary || 0;
      const diff = Math.abs(payrollSalary - gosiSalary);
      const isMismatch = diff > 100;
      const isSaudi = emp.nationality === 'Saudi' || emp.nationality === 'سعودي' || emp.is_saudi;
      return { ...emp, gosi, payrollSalary, gosiSalary, diff, isMismatch, isSaudi };
    });
  }, [employees, gosiRecords]);

  const mismatches = enriched.filter(e => e.isMismatch);

  const columns = [
    { header: isRTL ? 'الموظف' : 'Employee', cell: r => <span>{isRTL ? (r.name_ar || r.name_en) : (r.name_en || r.name_ar)}</span> },
    { header: isRTL ? 'الجنسية' : 'Nationality', cell: r => (
      <Badge className={r.isSaudi ? 'bg-emerald-900/60 text-emerald-300 border-emerald-700' : 'bg-najdi-900/60 text-najdi-500 border-najdi-700'}>
        {r.isSaudi ? (isRTL ? 'سعودي' : 'Saudi') : (isRTL ? 'غير سعودي' : 'Non-Saudi')}
      </Badge>
    )},
    { header: isRTL ? 'راتب الرواتب' : 'Payroll Salary', cell: r => `${r.payrollSalary.toLocaleString()} ${isRTL ? 'ر.س' : 'SAR'}` },
    { header: isRTL ? 'راتب التأمينات' : 'GOSI Salary', cell: r => `${r.gosiSalary.toLocaleString()} ${isRTL ? 'ر.س' : 'SAR'}` },
    { header: isRTL ? 'الفرق' : 'Difference', cell: r => (
      <span className={r.isMismatch ? 'text-red-400 font-semibold' : 'text-emerald-400'}>
        {r.diff > 0 ? `${r.diff.toLocaleString()} ${isRTL ? 'ر.س' : 'SAR'}` : '—'}
      </span>
    )},
    { header: isRTL ? 'الحالة' : 'Status', cell: r => r.isMismatch
      ? <Badge className="bg-red-900/60 text-red-300 border border-red-700"><AlertTriangle className="w-3 h-3 me-1 inline" />{isRTL ? 'تناقض' : 'Mismatch'}</Badge>
      : <Badge className="bg-emerald-900/60 text-emerald-300 border border-emerald-700"><CheckCircle className="w-3 h-3 me-1 inline" />{isRTL ? 'مطابق' : 'Matched'}</Badge>
    },
  ];

  return (
    <div className="space-y-6 mt-4">
      {/* Service Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {GOSI_SERVICES.map(service => (
          <ServiceTile
            key={service.code}
            icon={service.icon}
            nameAr={service.nameAr}
            nameEn={service.nameEn}
            descAr={service.descAr}
            descEn={service.descEn}
            color={service.color}
            isRTL={isRTL}
            onStart={() => setSelected(service)}
          />
        ))}
      </div>

      {/* GOSI Reconciliation Table */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-white font-semibold text-base">{isRTL ? 'مطابقة بيانات التأمينات' : 'GOSI Salary Reconciliation'}</h2>
          <div className="flex-1 h-px bg-ink" />
        </div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <Card><CardContent className="p-4">
            <div className="text-2xl font-bold text-white">{employees.length}</div>
            <div className="text-sm text-muted-foreground">{isRTL ? 'إجمالي الموظفين' : 'Total Employees'}</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-2xl font-bold text-emerald-400">{enriched.filter(e => !e.isMismatch).length}</div>
            <div className="text-sm text-muted-foreground">{isRTL ? 'بيانات مطابقة' : 'Records Matched'}</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-2xl font-bold text-red-400">{mismatches.length}</div>
            <div className="text-sm text-muted-foreground">{isRTL ? 'تناقضات' : 'Mismatches'}</div>
          </CardContent></Card>
        </div>
        {mismatches.length > 0 && (
          <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4 flex items-center gap-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-red-300 text-sm">{mismatches.length} {isRTL ? 'موظف لديه فارق بين راتب التأمينات وراتب الرواتب يتجاوز 100 ر.س' : 'employees have a GOSI salary mismatch exceeding 100 SAR'}</p>
          </div>
        )}
        <DataTable columns={columns} data={enriched} loading={isLoading} emptyMessage={isRTL ? 'لا توجد بيانات' : 'No data'} />
      </div>

      <ServiceWorkflowDialog open={!!selected} onClose={() => setSelected(null)} service={selected} isRTL={isRTL} />
    </div>
  );
}