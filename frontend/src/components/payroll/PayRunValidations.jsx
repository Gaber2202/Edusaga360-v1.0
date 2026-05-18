import React, { useState } from 'react';
import { useLanguage } from '../LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { AlertTriangle, AlertCircle, CheckCircle, ChevronRight, User, Landmark, DollarSign } from 'lucide-react';

const VIOLATION_META = {
  missing_iban: {
    severity: 'error',
    ar: 'IBAN مفقود',
    en: 'Missing IBAN',
    descAr: 'الموظفون التاليون لا يملكون رقم IBAN. لن يتمكن النظام من توليد ملف البنك لهم.',
    descEn: 'The following employees have no IBAN. Bank file export will exclude them.',
    fixAr: 'انتقل إلى ملف الموظف → التفاصيل البنكية وأضف رقم IBAN الصحيح.',
    fixEn: 'Go to Employee profile → Bank Details and add the correct IBAN.',
    icon: Landmark,
  },
  missing_bank: {
    severity: 'warning',
    ar: 'معلومات بنكية ناقصة',
    en: 'Missing Bank Info',
    descAr: 'الموظفون التاليون لا يملكون اسم البنك.',
    descEn: 'The following employees are missing bank name.',
    fixAr: 'انتقل إلى ملف الموظف → التفاصيل البنكية وأضف اسم البنك.',
    fixEn: 'Go to Employee profile → Bank Details and add bank name.',
    icon: Landmark,
  },
  zero_salary: {
    severity: 'warning',
    ar: 'راتب صفر',
    en: 'Zero Salary',
    descAr: 'الموظفون التاليون راتبهم الإجمالي صفر. قد يكون الراتب الأساسي غير محدد.',
    descEn: 'The following employees have zero gross salary. Basic salary may not be set.',
    fixAr: 'انتقل إلى ملف الموظف → التعويضات وأضف الراتب الأساسي.',
    fixEn: 'Go to Employee profile → Compensation and set the basic salary.',
    icon: DollarSign,
  },
  negative_net: {
    severity: 'error',
    ar: 'راتب صافي سالب',
    en: 'Negative Net Pay',
    descAr: 'الموظفون التاليون لديهم استقطاعات تتجاوز إجمالي الراتب.',
    descEn: 'The following employees have deductions exceeding gross salary.',
    fixAr: 'راجع بنود الاستقطاع وتأكد من صحتها.',
    fixEn: 'Review deduction items and verify correctness.',
    icon: AlertTriangle,
  },
  gosi_mismatch: {
    severity: 'warning',
    ar: 'تناقض في التأمينات',
    en: 'GOSI Mismatch',
    descAr: 'الراتب الخاضع للتأمينات يتجاوز الحد الأقصى أو يبدو غير صحيح.',
    descEn: 'GOSI wage exceeds the cap or appears incorrect.',
    fixAr: 'تحقق من الراتب الأساسي وبدل السكن.',
    fixEn: 'Verify basic salary and housing allowance.',
    icon: AlertCircle,
  },
};

export default function PayRunValidations({ payrollInputs }) {
  const { isRTL } = useLanguage();
  const [selectedViolation, setSelectedViolation] = useState(null);

  const validations = [];

  const missingIBAN = payrollInputs.filter(p => !p.iban);
  if (missingIBAN.length > 0) {
    validations.push({ type: 'missing_iban', employees: missingIBAN });
  }

  const negativeNet = payrollInputs.filter(p => (p.net_salary || 0) < 0);
  if (negativeNet.length > 0) {
    validations.push({ type: 'negative_net', employees: negativeNet });
  }

  const missingBank = payrollInputs.filter(p => !p.bank_name);
  if (missingBank.length > 0) {
    validations.push({ type: 'missing_bank', employees: missingBank });
  }

  const zeroSalary = payrollInputs.filter(p =>
    (p.gross_salary || 0) === 0 &&
    (p.basic_salary || 0) === 0 &&
    (p.housing_allowance || 0) === 0 &&
    (p.transport_allowance || 0) === 0 &&
    (p.other_allowances || 0) === 0
  );
  if (zeroSalary.length > 0) {
    validations.push({ type: 'zero_salary', employees: zeroSalary });
  }

  // GOSI mismatch: non-Saudi flagged as gosi applicable
  const gosiMismatch = payrollInputs.filter(p => !p.is_saudi && p.gosi_employee > 0);
  if (gosiMismatch.length > 0) {
    validations.push({ type: 'gosi_mismatch', employees: gosiMismatch });
  }

  const severityBg = {
    error: 'bg-red-50 border-red-200 hover:bg-red-100',
    warning: 'bg-amber-50 border-amber-200 hover:bg-amber-100',
  };
  const severityText = { error: 'text-red-700', warning: 'text-amber-700' };
  const severityIcon = { error: 'text-red-600', warning: 'text-amber-600' };
  const severityBadge = { error: 'bg-red-100 text-red-700', warning: 'bg-amber-100 text-amber-700' };

  if (validations.length === 0) {
    return (
      <Card className="bg-emerald-50 border-emerald-200">
        <CardContent className="p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          <p className="text-sm font-medium text-emerald-700">
            {isRTL ? 'لا توجد مشاكل — الكشف جاهز للمتابعة' : 'No issues found — pay run is ready to proceed'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            {isRTL ? `التحقق من الصحة (${validations.length} مشكلة)` : `Validations (${validations.length} issue${validations.length > 1 ? 's' : ''})`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {validations.map((v, idx) => {
            const meta = VIOLATION_META[v.type];
            if (!meta) return null;
            const Icon = meta.icon;
            const sev = meta.severity;
            return (
              <button
                key={idx}
                className={`w-full text-start border rounded-lg p-3 ${severityBg[sev]} transition-colors cursor-pointer`}
                onClick={() => setSelectedViolation(v)}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 flex-shrink-0 ${severityIcon[sev]}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium text-sm ${severityText[sev]}`}>
                      {isRTL ? meta.ar : meta.en}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {v.employees.slice(0, 3).map(e => e.employee_name).join('، ')}
                      {v.employees.length > 3 && (isRTL ? ` وآخرون (${v.employees.length - 3})` : ` +${v.employees.length - 3} more`)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge className={`text-xs ${severityBadge[sev]}`}>{v.employees.length}</Badge>
                    <ChevronRight className={`w-4 h-4 ${severityText[sev]}`} />
                  </div>
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {/* Violation Detail Dialog */}
      {selectedViolation && (() => {
        const meta = VIOLATION_META[selectedViolation.type];
        if (!meta) return null;
        const Icon = meta.icon;
        const sev = meta.severity;
        return (
          <Dialog open={!!selectedViolation} onOpenChange={() => setSelectedViolation(null)}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className={`flex items-center gap-2 ${sev === 'error' ? 'text-red-700' : 'text-amber-700'}`}>
                  <Icon className="w-5 h-5" />
                  {isRTL ? meta.ar : meta.en}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Description */}
                <div className={`p-3 rounded-lg border text-sm ${sev === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                  {isRTL ? meta.descAr : meta.descEn}
                </div>

                {/* Fix suggestion */}
                <div className="p-3 rounded-lg border bg-blue-50 border-blue-200 text-blue-800 text-sm">
                  <p className="font-semibold mb-1">{isRTL ? '📋 خطوات الحل:' : '📋 Resolution:'}</p>
                  {isRTL ? meta.fixAr : meta.fixEn}
                </div>

                {/* Impacted employees list */}
                <div>
                  <p className="font-semibold text-sm mb-2 text-slate-700">
                    {isRTL ? `الموظفون المتأثرون (${selectedViolation.employees.length})` : `Impacted Employees (${selectedViolation.employees.length})`}
                  </p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {selectedViolation.employees.map((emp, i) => (
                      <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 border border-slate-200 text-sm">
                        <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{emp.employee_name}</p>
                          {emp.employee_number && <p className="text-xs text-slate-400">{emp.employee_number}</p>}
                        </div>
                        <div className="text-right text-xs text-slate-500 flex-shrink-0">
                          <p>{isRTL ? 'صافي:' : 'Net:'} {(emp.net_salary || 0).toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
    </>
  );
}