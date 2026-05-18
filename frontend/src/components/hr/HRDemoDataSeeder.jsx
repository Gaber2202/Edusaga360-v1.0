import React, { useState } from 'react';
import { tenantQuery } from '../../api/supabaseClient';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Database, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useTenantFilter } from '../../hooks/useTenantFilter';

const DEPARTMENTS = [
  { name_ar: 'الأكاديمي', name_en: 'Academic', code: 'ACAD', is_active: true },
  { name_ar: 'الإدارة', name_en: 'Administration', code: 'ADMIN', is_active: true },
  { name_ar: 'المالية', name_en: 'Finance', code: 'FIN', is_active: true },
  { name_ar: 'تقنية المعلومات', name_en: 'IT', code: 'IT', is_active: true },
  { name_ar: 'العمليات', name_en: 'Operations', code: 'OPS', is_active: true },
];

const JOB_TITLES = [
  { name_ar: 'مدير المدرسة', name_en: 'Principal', code: 'PRINCIPAL', is_active: true },
  { name_ar: 'نائب المدير', name_en: 'Vice Principal', code: 'VPRINCIPAL', is_active: true },
  { name_ar: 'معلم', name_en: 'Teacher', code: 'TEACHER', is_active: true },
  { name_ar: 'مدير الموارد البشرية', name_en: 'HR Manager', code: 'HR_MGR', is_active: true },
  { name_ar: 'محاسب', name_en: 'Accountant', code: 'ACCT', is_active: true },
  { name_ar: 'أخصائي تقنية معلومات', name_en: 'IT Specialist', code: 'IT_SPEC', is_active: true },
  { name_ar: 'مساعد إداري', name_en: 'Administrative Assistant', code: 'ADMIN_ASST', is_active: true },
  { name_ar: 'حارس أمن', name_en: 'Security Guard', code: 'SECURITY', is_active: true },
];

const LEAVE_TYPES = [
  {
    name_ar: 'الإجازة السنوية', name_en: 'Annual Leave', code: 'ANNUAL',
    default_days: 21, is_paid: true, is_active: true, accrual_based: true,
    gender_restriction: null, max_per_year: 30, carryover_allowed: true, max_carryover_days: 15,
    description_ar: 'إجازة سنوية مدفوعة — 21 يوم خلال السنة الأولى، 30 يوم بعد ذلك',
    description_en: 'Paid annual leave — 21 days first year, 30 days thereafter',
  },
  {
    name_ar: 'إجازة مرضية', name_en: 'Sick Leave', code: 'SICK',
    default_days: 30, is_paid: true, is_active: true, accrual_based: false,
    gender_restriction: null, max_per_year: 120, carryover_allowed: false,
    description_ar: '30 يوم بأجر كامل، ثم 60 يوم بـ75%، ثم 30 يوم بدون أجر',
    description_en: '30 days full pay, 60 days 75% pay, 30 days unpaid',
  },
  {
    name_ar: 'إجازة الأمومة', name_en: 'Maternity Leave', code: 'MATERNITY',
    default_days: 70, is_paid: true, is_active: true, accrual_based: false,
    gender_restriction: 'female', max_per_year: 70, carryover_allowed: false,
    description_ar: '10 أسابيع إجازة أمومة مدفوعة (وفق نظام العمل السعودي)',
    description_en: '10 weeks paid maternity leave (Saudi Labor Law)',
  },
  {
    name_ar: 'إجازة الحج', name_en: 'Hajj Leave', code: 'HAJJ',
    default_days: 10, is_paid: true, is_active: true, accrual_based: false,
    gender_restriction: null, max_per_year: 10, carryover_allowed: false,
    description_ar: '10 أيام مدفوعة مرة واحدة طوال مدة الخدمة',
    description_en: '10 paid days once per employment period',
  },
  {
    name_ar: 'إجازة الوفاة', name_en: 'Bereavement Leave', code: 'BEREAVEMENT',
    default_days: 3, is_paid: true, is_active: true, accrual_based: false,
    gender_restriction: null, max_per_year: 3, carryover_allowed: false,
    description_ar: '3 أيام مدفوعة عند وفاة أحد أفراد العائلة',
    description_en: '3 paid days upon death of a family member',
  },
  {
    name_ar: 'إجازة الاختبارات', name_en: 'Exam Leave', code: 'EXAM',
    default_days: 1, is_paid: true, is_active: true, accrual_based: false,
    gender_restriction: null, max_per_year: 20, carryover_allowed: false,
    description_ar: 'يوم واحد لكل اختبار للموظفين الملتحقين بالدراسة',
    description_en: '1 day per exam for employees enrolled in academic studies',
  },
];

const SALARY_COMPONENTS = [
  { name_ar: 'الراتب الأساسي', name_en: 'Basic Salary', code: 'BASIC', component_type: 'earning', is_percentage: false, is_active: true, is_taxable: false, is_recurring: true, affects_gosi: true, description_ar: 'المكوّن الأساسي للراتب', description_en: 'Base salary component' },
  { name_ar: 'بدل السكن', name_en: 'Housing Allowance', code: 'HOUSING', component_type: 'earning', is_percentage: true, percentage_of: 'basic', percentage_value: 25, is_active: true, is_taxable: false, is_recurring: true, affects_gosi: false, description_ar: '25% من الراتب الأساسي', description_en: '25% of basic salary' },
  { name_ar: 'بدل المواصلات', name_en: 'Transport Allowance', code: 'TRANSPORT', component_type: 'earning', is_percentage: false, fixed_amount: 400, is_active: true, is_taxable: false, is_recurring: true, affects_gosi: false, description_ar: 'بدل ثابت 400 ريال شهرياً', description_en: 'Fixed SAR 400 per month' },
  { name_ar: 'بدل الهاتف', name_en: 'Phone Allowance', code: 'PHONE', component_type: 'earning', is_percentage: false, fixed_amount: 200, is_active: true, is_taxable: false, is_recurring: true, affects_gosi: false, description_ar: 'بدل ثابت 200 ريال شهرياً', description_en: 'Fixed SAR 200 per month' },
  { name_ar: 'مكافأة الأداء', name_en: 'Performance Bonus', code: 'PERF_BONUS', component_type: 'earning', is_percentage: false, is_active: true, is_taxable: false, is_recurring: false, affects_gosi: false, description_ar: 'مكافأة متغيرة سنوية', description_en: 'Variable annual bonus' },
  { name_ar: 'استقطاع التأمينات (موظف)', name_en: 'GOSI Employee Deduction', code: 'GOSI_EMP', component_type: 'deduction', is_percentage: true, percentage_of: 'basic', percentage_value: 9.75, applies_to_saudi_only: true, is_active: true, is_taxable: false, is_recurring: true, affects_gosi: true, description_ar: '9.75% من الراتب الأساسي — للسعوديين فقط', description_en: '9.75% of basic salary — Saudi employees only' },
  { name_ar: 'اشتراك التأمينات (صاحب عمل)', name_en: 'GOSI Employer Contribution', code: 'GOSI_EMP_ER', component_type: 'employer_contribution', is_percentage: true, percentage_of: 'basic', percentage_value: 11.75, applies_to_saudi_only: true, is_active: true, is_taxable: false, is_recurring: true, affects_gosi: true, description_ar: '11.75% تحملها صاحب العمل — للسعوديين فقط', description_en: '11.75% employer contribution — Saudi employees only' },
];

const PAYSLIP_SETTINGS = {
  auto_send_enabled: false,
  auto_send_channel: 'email',
  pdf_password_enabled: true,
  password_rule: 'national_id_last4',
  password_hint_ar: 'آخر 4 أرقام من رقم الهوية',
  password_hint_en: 'Last 4 digits of National ID',
  watermark_enabled: true,
  watermark_type: 'company_name',
  watermark_opacity: 0.15,
  include_logo: true,
  language: 'both',
};

export default function HRDemoDataSeeder({ isRTL }) {
  const [open, setOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [results, setResults] = useState(null);
  const { tenantId } = useTenantFilter();

  const seed = async () => {
    setSeeding(true);
    setResults(null);
    const log = [];

    try {
      // Departments
      let deptCount = 0;
      for (const dept of DEPARTMENTS) {
        await tenantQuery('departments').insert({ ...dept, tenant_id: tenantId }).catch(() => {});
        deptCount++;
      }
      log.push({ label: isRTL ? 'الأقسام' : 'Departments', count: deptCount });

      // Job Titles
      let jtCount = 0;
      for (const jt of JOB_TITLES) {
        await tenantQuery('job_titles').insert({ ...jt, tenant_id: tenantId }).catch(() => {});
        jtCount++;
      }
      log.push({ label: isRTL ? 'المسميات الوظيفية' : 'Job Titles', count: jtCount });

      // Leave Types
      let ltCount = 0;
      for (const lt of LEAVE_TYPES) {
        await tenantQuery('leave_types').insert({ ...lt, tenant_id: tenantId }).catch(() => {});
        ltCount++;
      }
      log.push({ label: isRTL ? 'أنواع الإجازات' : 'Leave Types', count: ltCount });

      // Salary Components
      let scCount = 0;
      for (const sc of SALARY_COMPONENTS) {
        await tenantQuery('salary_components').insert({ ...sc, tenant_id: tenantId }).catch(() => {});
        scCount++;
      }
      log.push({ label: isRTL ? 'مكونات الراتب' : 'Salary Components', count: scCount });

      // Payslip Settings (single record)
      await tenantQuery('payslip_settings').insert({ ...PAYSLIP_SETTINGS, tenant_id: tenantId }).catch(() => {});
      log.push({ label: isRTL ? 'إعدادات قسيمة الراتب' : 'Payslip Settings', count: 1 });

      setResults(log);
      toast.success(isRTL ? 'تم تحميل البيانات التجريبية بنجاح!' : 'Demo data loaded successfully!');
    } catch (err) {
      toast.error(err.message || 'Error seeding data');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-2">
        <Database className="w-4 h-4" />
        {isRTL ? 'تحميل بيانات تجريبية' : 'Load Demo Data'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-500" />
              {isRTL ? 'تحميل بيانات HR التجريبية' : 'Load HR Demo Data'}
            </DialogTitle>
          </DialogHeader>

          {!results ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-slate-500">
                {isRTL
                  ? 'سيتم إنشاء البيانات التالية للتجربة والاختبار:'
                  : 'The following demo data will be created for testing:'}
              </p>
              {[
                { ar: '5 أقسام', en: '5 Departments' },
                { ar: '8 مسميات وظيفية', en: '8 Job Titles' },
                { ar: '6 أنواع إجازات (متوافقة مع نظام العمل السعودي)', en: '6 Leave Types (Saudi Labor Law compliant)' },
                { ar: '7 مكونات راتب + GOSI', en: '7 Salary Components incl. GOSI' },
                { ar: 'إعدادات قسيمة الراتب', en: 'Payslip Settings' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  <span>{isRTL ? item.ar : item.en}</span>
                </div>
              ))}
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  {isRTL
                    ? 'قد يتم تكرار البيانات إذا تم التشغيل أكثر من مرة.'
                    : 'Running multiple times may create duplicate records.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2 py-2">
              {results.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    <span>{r.label}</span>
                  </div>
                  <span className="font-mono text-emerald-600">+{r.count}</span>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {isRTL ? 'إغلاق' : 'Close'}
            </Button>
            {!results && (
              <Button onClick={seed} disabled={seeding} className="bg-emerald-600 hover:bg-emerald-700">
                {seeding && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                {isRTL ? 'تحميل البيانات' : 'Load Data'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}