import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, callApi } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { formatCurrency } from '../../lib/localization';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Alert, AlertDescription } from '../ui/alert';
import { Download, Mail, Building2, Shield, Info } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useTenantFilter } from '../../hooks/useTenantFilter';
import { useTenant } from '../TenantContext';

export default function PayslipViewer({ payslip, employee, branch, open, onClose }) {
  const { t: _t, isRTL } = useLanguage();
  const { tenant } = useTenant();
  const { tenantId } = useTenantFilter();
  const [showPasswordNote, setShowPasswordNote] = React.useState(false);

  const { data: securitySettings } = useQuery({ enabled: false /* payslip_settings table not built */, queryKey: ['payslipSettings', tenantId], queryFn: async () => {
      const { data: all = [] } = await tenantQuery('payslip_settings').select('*').order();
      return all[0];
    }, initialData: [] });

  if (!payslip) return null;

  const handleDownloadPDF = async () => {
    if (securitySettings?.pdf_password_enabled) {
      setShowPasswordNote(true);
      setTimeout(() => setShowPasswordNote(false), 5000);
    }
    try {
      toast.loading(isRTL ? 'جاري إنشاء كشف الراتب...' : 'Generating payslip PDF...');
      const [month, year] = payslip.period
        ? payslip.period.split('/').map(Number)
        : [new Date().getMonth() + 1, new Date().getFullYear()];
      const blob = await callApi('/api/payroll/payslip-pdf', {
        payslip_id:   payslip.id,
        employee_id:  employee.id,
        period_month: month,
        period_year:  year,
      }, { method: 'POST', responseType: 'blob' });
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `payslip_${employee.employee_id ?? employee.id}_${month}_${year}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.dismiss();
      toast.success(isRTL ? 'تم تحميل كشف الراتب' : 'Payslip downloaded');
    } catch (err) {
      toast.dismiss();
      toast.error(isRTL ? 'تعذّر إنشاء كشف الراتب' : 'Failed to generate payslip PDF');
      console.error('Payslip PDF error:', err);
    }
  };

  const handleSendEmail = async () => {
    try {
      await callApi('/api/email/send', {
        to: employee.email,
        subject: isRTL ? `كشف الراتب - ${payslip.period}` : `Payslip - ${payslip.period}`,
        body: isRTL 
          ? `عزيزي ${employee.name_ar}،\n\nمرفق كشف راتبك لشهر ${payslip.period}.\n\nمع التحية`
          : `Dear ${employee.name_en || employee.name_ar},\n\nPlease find attached your payslip for ${payslip.period}.\n\nBest regards`
      });
      
      toast.success(isRTL ? 'تم إرسال الكشف بنجاح' : 'Payslip sent successfully');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{isRTL ? 'كشف الراتب' : 'Payslip'}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleDownloadPDF}>
                <Download className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={handleSendEmail}>
                <Mail className="w-4 h-4" />
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {showPasswordNote && securitySettings?.pdf_password_enabled && (
          <Alert className="bg-amber-50 border-amber-200">
            <Shield className="w-4 h-4 text-amber-600" />
            <AlertDescription className="text-amber-900">
              <p className="font-medium">
                {isRTL ? 'ملف PDF محمي بكلمة مرور' : 'Password-Protected PDF'}
              </p>
              <p className="text-sm mt-1">
                {isRTL ? securitySettings.password_hint_ar : securitySettings.password_hint_en}
              </p>
            </AlertDescription>
          </Alert>
        )}

        {securitySettings?.watermark_enabled && (
          <div className="bg-sand border border-border rounded-lg p-3 flex items-start gap-2">
            <Info className="w-4 h-4 text-muted-foreground mt-0.5" />
            <p className="text-xs text-muted-foreground">
              {isRTL 
                ? 'سيتم إضافة علامة مائية إلى ملف PDF للحماية'
                : 'A watermark will be added to the PDF for protection'}
            </p>
          </div>
        )}

        <div className="bg-white rounded-lg border p-6 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between border-b pb-4">
            <div>
              <h3 className="font-bold text-xl">{isRTL ? 'كشف الراتب' : 'PAYSLIP'}</h3>
              <p className="text-sm text-muted-foreground">{payslip.period}</p>
            </div>
            <div className="text-end">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Building2 className="w-4 h-4" />
                <span>{isRTL ? branch?.name_ar : branch?.name_en || branch?.name_ar}</span>
              </div>
            </div>
          </div>

          {/* Employee Info */}
          <div className="grid grid-cols-2 gap-4 bg-sand rounded-lg p-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">{isRTL ? 'الموظف' : 'Employee'}</p>
              <p className="font-medium">{employee.name_ar}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">{isRTL ? 'الرقم الوظيفي' : 'Employee ID'}</p>
              <p className="font-medium">{employee.employee_id}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">{isRTL ? 'المسمى الوظيفي' : 'Job Title'}</p>
              <p className="font-medium">{employee.job_title_name || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">{isRTL ? 'رقم الحساب' : 'Account Number'}</p>
              <p className="font-medium font-mono text-sm">{employee.iban ? `***${employee.iban.slice(-4)}` : '-'}</p>
            </div>
          </div>

          {/* Earnings */}
          <div>
            <h4 className="font-semibold text-emerald-700 mb-3 border-b pb-2">{isRTL ? 'المكتسبات' : 'Earnings'}</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{isRTL ? 'الراتب الأساسي' : 'Basic Salary'}</span>
                <span className="font-medium">{payslip.basic_salary?.toLocaleString()}</span>
              </div>
              {payslip.housing_allowance > 0 && (
                <div className="flex justify-between text-sm">
                  <span>{isRTL ? 'بدل السكن' : 'Housing Allowance'}</span>
                  <span className="font-medium">{payslip.housing_allowance?.toLocaleString()}</span>
                </div>
              )}
              {payslip.transport_allowance > 0 && (
                <div className="flex justify-between text-sm">
                  <span>{isRTL ? 'بدل النقل' : 'Transport Allowance'}</span>
                  <span className="font-medium">{payslip.transport_allowance?.toLocaleString()}</span>
                </div>
              )}
              {payslip.teaching_allowance > 0 && (
                <div className="flex justify-between text-sm">
                  <span>{isRTL ? 'بدل التدريس' : 'Teaching Allowance'}</span>
                  <span className="font-medium">{payslip.teaching_allowance?.toLocaleString()}</span>
                </div>
              )}
              {payslip.overtime_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span>{isRTL ? 'العمل الإضافي' : 'Overtime'}</span>
                  <span className="font-medium">{payslip.overtime_amount?.toLocaleString()}</span>
                </div>
              )}
              {payslip.bonus > 0 && (
                <div className="flex justify-between text-sm">
                  <span>{isRTL ? 'مكافأة' : 'Bonus'}</span>
                  <span className="font-medium">{payslip.bonus?.toLocaleString()}</span>
                </div>
              )}
              {payslip.other_allowances > 0 && (
                <div className="flex justify-between text-sm">
                  <span>{isRTL ? 'بدلات أخرى' : 'Other Allowances'}</span>
                  <span className="font-medium">{payslip.other_allowances?.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t pt-2 mt-2 text-emerald-700">
                <span>{isRTL ? 'إجمالي المكتسبات' : 'Gross Salary'}</span>
                <span>{formatCurrency(payslip.gross_salary, tenant?.localization, isRTL)}</span>
              </div>
            </div>
          </div>

          {/* Deductions */}
          <div>
            <h4 className="font-semibold text-red-700 mb-3 border-b pb-2">{isRTL ? 'الاستقطاعات' : 'Deductions'}</h4>
            <div className="space-y-2">
              {payslip.gosi_employee > 0 && (
                <div className="flex justify-between text-sm">
                  <span>{isRTL ? 'التأمينات الاجتماعية' : 'GOSI'}</span>
                  <span className="font-medium">{payslip.gosi_employee?.toLocaleString()}</span>
                </div>
              )}
              {payslip.absence_deduction > 0 && (
                <div className="flex justify-between text-sm">
                  <span>{isRTL ? 'خصم الغياب' : 'Absence Deduction'}</span>
                  <span className="font-medium">{payslip.absence_deduction?.toLocaleString()}</span>
                </div>
              )}
              {payslip.loan_deduction > 0 && (
                <div className="flex justify-between text-sm">
                  <span>{isRTL ? 'قرض' : 'Loan'}</span>
                  <span className="font-medium">{payslip.loan_deduction?.toLocaleString()}</span>
                </div>
              )}
              {payslip.tuition_deduction > 0 && (
                <div className="flex justify-between text-sm">
                  <span>{isRTL ? 'سلفة رسوم دراسية' : 'Tuition Advance'}</span>
                  <span className="font-medium">{payslip.tuition_deduction?.toLocaleString()}</span>
                </div>
              )}
              {payslip.penalty_deduction > 0 && (
                <div className="flex justify-between text-sm">
                  <span>{isRTL ? 'جزاءات' : 'Penalties'}</span>
                  <span className="font-medium">{payslip.penalty_deduction?.toLocaleString()}</span>
                </div>
              )}
              {payslip.other_deductions > 0 && (
                <div className="flex justify-between text-sm">
                  <span>{isRTL ? 'استقطاعات أخرى' : 'Other Deductions'}</span>
                  <span className="font-medium">{payslip.other_deductions?.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t pt-2 mt-2 text-red-700">
                <span>{isRTL ? 'إجمالي الاستقطاعات' : 'Total Deductions'}</span>
                <span>{formatCurrency(payslip.total_deductions, tenant?.localization, isRTL)}</span>
              </div>
            </div>
          </div>

          {/* Net Salary */}
          <div className="bg-najdi-900 text-white rounded-lg p-6">
            <div className="flex justify-between items-center">
              <span className="text-lg">{isRTL ? 'صافي الراتب' : 'Net Salary'}</span>
              <span className="text-3xl font-bold">{formatCurrency(payslip.net_salary, tenant?.localization, isRTL)}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="text-xs text-muted-foreground text-center pt-4 border-t">
            {isRTL 
              ? `تم الإنشاء بتاريخ ${format(new Date(), 'dd/MM/yyyy')}`
              : `Generated on ${format(new Date(), 'dd/MM/yyyy')}`
            }
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}