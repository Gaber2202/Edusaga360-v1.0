import React, { useState, useEffect } from 'react';
import { tenantQuery, callApi } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Card, CardContent } from '../ui/card';
import { UserCheck, Loader2, CheckCircle, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { format, addMonths } from 'date-fns';
import { logAuditEvent, AuditActions } from '../AuditService';
import { triggerOnboardingForEmployee } from './OnboardingEngine';

export default function ConvertToEmployee({ applicant, recruitment, employees, onConverted, autoOpen = false }) {
  const { isRTL } = useLanguage();
  const [open, setOpen] = useState(autoOpen);
  const [saving, setSaving] = useState(false);

  // Sync open state when autoOpen prop changes (e.g. triggered from parent after hire)
  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen, applicant?.id]);

  const offerData = applicant?.offer_data || {};

  const [form, setForm] = useState({
    name_ar: applicant?.full_name_ar || '',
    name_en: applicant?.full_name_en || '',
    email: applicant?.email || '',
    phone: applicant?.phone || '',
    national_id: applicant?.national_id || '',
    nationality: applicant?.nationality || '',
    gender: applicant?.gender || 'male',
    date_of_birth: applicant?.date_of_birth || '',
    branch_id: applicant?.branch_id || recruitment?.branch_id || '',
    department_id: applicant?.department_id || recruitment?.department_id || '',
    job_title_name: applicant?.job_title || recruitment?.position_name || '',
    employment_type: applicant?.employment_type || recruitment?.employment_type || 'full_time',
    contract_type: offerData?.contract_type || 'limited',
    hire_date: offerData?.start_date || format(new Date(), 'yyyy-MM-dd'),
    probation_end_date: offerData?.probation_months
      ? format(addMonths(new Date(offerData.start_date || new Date()), offerData.probation_months), 'yyyy-MM-dd')
      : '',
    contract_end_date: (offerData?.contract_type === 'limited' && offerData?.contract_duration_months && offerData?.start_date)
      ? format(addMonths(new Date(offerData.start_date), offerData.contract_duration_months), 'yyyy-MM-dd')
      : '',
    basic_salary: offerData?.basic_salary || applicant?.expected_salary || 0,
    housing_allowance: offerData?.housing_allowance || 0,
    transport_allowance: offerData?.transport_allowance || 0,
    other_allowances: offerData?.other_allowances || 0,
    work_email: '',
    manager_id: '',
    status: 'active',
    is_saudi: (applicant?.nationality?.toLowerCase().includes('saudi') || applicant?.residency_status === 'citizen'),
    recruitment_history: {
      applicant_id: applicant?.id,
      recruitment_id: recruitment?.id,
      applicant_number: applicant?.applicant_number,
      applied_date: applicant?.created_at,
      offer_status: applicant?.offer_status,
      interview_scores: {
        technical: applicant?.interview_technical_score,
        communication: applicant?.interview_communication_score,
        culture: applicant?.interview_culture_score,
      },
    },
  });

  const totalSalary = form.basic_salary + form.housing_allowance + form.transport_allowance + form.other_allowances;

  const handleConvert = async () => {
    if (!form.name_ar || !form.branch_id) {
      toast.error(isRTL ? 'يرجى ملء الحقول المطلوبة' : 'Please fill required fields');
      return;
    }
    if (!form.work_email || !form.work_email.includes('@')) {
      toast.error(isRTL ? 'يرجى إدخال البريد الإلكتروني الوظيفي الصحيح' : 'Please enter a valid work email address');
      return;
    }
    setSaving(true);
    try {
      const empId = `EMP-${Date.now().toString(36).toUpperCase()}`;

      const employeeData = {
        ...form,
        email: form.work_email,
        employee_id: empId,
        total_salary: totalSalary,
        salary: totalSalary,
        is_gosi_applicable: form.is_saudi || !!applicant?.national_id,
        compensation: {
          salary_structure: {
            basic_salary: form.basic_salary,
            pay_frequency: 'monthly',
            allowances: [
              { name: isRTL ? 'بدل السكن' : 'Housing', amount: form.housing_allowance, recurring: true },
              { name: isRTL ? 'بدل النقل' : 'Transport', amount: form.transport_allowance, recurring: true },
              ...(form.other_allowances > 0 ? [{ name: isRTL ? 'بدلات أخرى' : 'Other', amount: form.other_allowances, recurring: true }] : []),
            ].filter(a => a.amount > 0),
          },
        },
      };

      const created = await tenantQuery('employees').insert(employeeData);
      await logAuditEvent({ action: AuditActions.CREATE, entityType: 'Employee', entityId: created.id, newValues: employeeData });

      // Send system invitation to the work email
      try {
        await callApi('/api/auth/invite', { email: form.work_email, role: 'user' });
      } catch (inviteErr) {
        // Non-blocking — user may already exist
        console.warn('Invite warning:', inviteErr?.message);
      }

      // Send welcome onboarding email
      try {
        await callApi('/api/email/send', {
          to: form.work_email,
          subject: isRTL ? `مرحباً ${form.name_ar} — بدء برنامج الإلحاق` : `Welcome ${form.name_en || form.name_ar} — Your Onboarding Begins`,
          body: isRTL
            ? `عزيزي ${form.name_ar}،\n\nيسعدنا انضمامك إلى فريقنا!\n\nتم إنشاء حسابك في نظام EduSaga 360 باستخدام هذا البريد الإلكتروني. يرجى تسجيل الدخول للبدء في برنامج الإلحاق الخاص بك، الذي يتضمن مستندات مطلوبة وسياسات يجب الإقرار بها وبرامج تدريبية.\n\nتاريخ الالتحاق: ${form.hire_date}\nالمسمى الوظيفي: ${form.job_title_name}\n\nمع تحيات فريق الموارد البشرية`
            : `Dear ${form.name_en || form.name_ar},\n\nWelcome to the team!\n\nYour account on EduSaga 360 has been created using this email. Please log in to begin your onboarding program, which includes required documents, policy acknowledgements, and training modules.\n\nStart Date: ${form.hire_date}\nJob Title: ${form.job_title_name}\n\nBest regards,\nHR Team`
        });
      } catch (emailErr) {
        console.warn('Welcome email warning:', emailErr?.message);
      }

      // Archive applicant as converted
      await tenantQuery('applicants').update({
        status: 'hired',
        converted_employee_id: created.id,
        converted_date: new Date().toISOString(),
      });

      // Trigger automated onboarding
      await triggerOnboardingForEmployee(created, applicant);

      // Auto-generate draft employment contract
      await tenantQuery('employee_documents').insert({
        employee_id: created.id,
        employee_name: form.name_ar,
        branch_id: form.branch_id,
        document_type: 'employment_contract',
        document_name: isRTL ? `عقد توظيف — ${form.name_ar}` : `Employment Contract — ${form.name_ar}`,
        version: '1.0',
        issue_date: form.hire_date,
        expiry_date: form.contract_end_date || '',
        requires_signature: true,
        status: 'draft',
        notes: isRTL ? 'تم الإنشاء تلقائياً من التوظيف' : 'Auto-generated from recruitment',
        contract_data: {
          contract_type: form.contract_type,
          start_date: form.hire_date,
          end_date: form.contract_end_date,
          probation_end_date: form.probation_end_date,
          basic_salary: form.basic_salary,
          total_salary: totalSalary,
          job_title: form.job_title_name,
          employment_type: form.employment_type,
        },
      });

      onConverted?.(created);
      setOpen(false);
      toast.success(isRTL ? `تم تحويل المتقدم إلى موظف بنجاح — ${empId} | تم إرسال دعوة النظام إلى ${form.work_email}` : `Converted to Employee — ${empId} | System invite sent to ${form.work_email}`);
    } catch (e) {
      toast.error(isRTL ? `حدث خطأ أثناء التحويل: ${e.message}` : `Error during conversion: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (applicant?.offer_status !== 'accepted' && applicant?.offer_accepted !== true && applicant?.status !== 'hired' && !autoOpen) return null;

  return (
    <>
      <Button className="gap-2 bg-blue-700 hover:bg-blue-800" onClick={() => setOpen(true)}>
        <UserCheck className="w-4 h-4" />
        {isRTL ? 'تحويل إلى موظف' : 'Convert to Employee'}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v && autoOpen) onConverted?.(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-blue-600" />
              {isRTL ? 'تحويل المتقدم إلى موظف' : 'Convert Candidate to Employee'}
            </DialogTitle>
          </DialogHeader>

          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4 text-sm space-y-1">
              <p className="font-semibold text-blue-800">{isRTL ? 'تنبيه: لا يلزم إعادة إدخال البيانات' : 'Note: No re-entry required'}</p>
              <p className="text-blue-700">{isRTL ? 'جميع البيانات مستوردة تلقائياً من ملف المتقدم وخطاب العرض.' : 'All data auto-imported from applicant profile and offer letter.'}</p>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {/* Work Email — required for system invite */}
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
              <Label className="flex items-center gap-2 text-amber-800 font-semibold">
                <Mail className="w-4 h-4" />
                {isRTL ? 'البريد الإلكتروني الوظيفي *' : 'Work Email *'}
                <span className="text-xs font-normal text-amber-700">
                  {isRTL ? '(مطلوب لإرسال دعوة النظام وبدء الإلحاق)' : '(Required to send system invite & start onboarding)'}
                </span>
              </Label>
              <Input
                type="email"
                value={form.work_email}
                onChange={e => setForm(p => ({...p, work_email: e.target.value}))}
                placeholder={isRTL ? 'example@company.com' : 'example@company.com'}
                className="border-amber-300 focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'} *</Label>
                <Input value={form.name_ar} onChange={e => setForm(p => ({...p, name_ar: e.target.value}))} dir="rtl" />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'}</Label>
                <Input value={form.name_en} onChange={e => setForm(p => ({...p, name_en: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ الالتحاق' : 'Start Date'} *</Label>
                <Input type="date" value={form.hire_date} onChange={e => setForm(p => ({...p, hire_date: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'نهاية الاختبار' : 'Probation End'}</Label>
                <Input type="date" value={form.probation_end_date} onChange={e => setForm(p => ({...p, probation_end_date: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'المسمى الوظيفي' : 'Job Title'}</Label>
                <Input value={form.job_title_name} onChange={e => setForm(p => ({...p, job_title_name: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'المدير المباشر' : 'Line Manager'}</Label>
                <Select value={form.manager_id} onValueChange={v => setForm(p => ({...p, manager_id: v}))}>
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                  <SelectContent>
                    {employees?.filter(e => e.status === 'active').map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.name_ar}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
              <h4 className="font-semibold text-slate-700">{isRTL ? 'ملخص الراتب' : 'Salary Summary'}</h4>
              <div className="flex justify-between"><span className="text-slate-500">{isRTL ? 'الأساسي' : 'Basic'}</span><span>{form.basic_salary.toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{isRTL ? 'السكن' : 'Housing'}</span><span>{form.housing_allowance.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{isRTL ? 'النقل' : 'Transport'}</span><span>{form.transport_allowance.toLocaleString()}</span></div>
              <div className="flex justify-between font-bold border-t pt-2"><span>{isRTL ? 'الإجمالي' : 'Total'}</span><span className="text-emerald-600">{totalSalary.toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</span></div>
            </div>

            <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 rounded-lg p-3">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              {isRTL ? 'سيتم إنشاء عقد التوظيف تلقائياً كمسودة وربطه بالملف الشخصي.' : 'Employment contract will be auto-generated as draft and linked to the employee profile.'}
            </div>
          </div>

          <DialogFooter className="sticky bottom-0 bg-white pt-4 border-t">
            <Button variant="outline" onClick={() => setOpen(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleConvert} disabled={saving} className="bg-blue-700 hover:bg-blue-800 gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
              {isRTL ? 'تأكيد التحويل' : 'Confirm Conversion'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}