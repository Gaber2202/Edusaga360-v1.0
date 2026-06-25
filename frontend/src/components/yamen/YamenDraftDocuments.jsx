import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { FileText, Plus, Download, Loader2, Edit3, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useTenantFilter } from '../../hooks/useTenantFilter';

const DOC_TYPES = [
  { id: 'warning', ar: 'إنذار خطي', en: 'Warning Letter' },
  { id: 'termination', ar: 'خطاب إنهاء خدمة', en: 'Termination Letter' },
  { id: 'increment', ar: 'خطاب زيادة راتب', en: 'Salary Increment Letter' },
  { id: 'probation_ext', ar: 'خطاب تمديد فترة تجربة', en: 'Probation Extension Letter' },
  { id: 'eos_settlement', ar: 'مخالصة نهائية', en: 'EOS Settlement Letter' },
  { id: 'iqama_renewal', ar: 'إشعار تجديد إقامة', en: 'Iqama Renewal Notice' },
];

function generateDocContent({ type, employee, params, isAr }) {
  const name = isAr ? employee.name_ar : (employee.name_en || employee.name_ar);
  const today = format(new Date(), 'dd/MM/yyyy');
  const empId = employee.employee_id || '-';
  const salary = employee.basic_salary || (employee.compensation?.basic_salary) || 0;

  if (type === 'warning') {
    return isAr
      ? `بسم الله الرحمن الرحيم\n\nإلى: ${name}\nالرقم الوظيفي: ${empId}\nالتاريخ: ${today}\n\nالموضوع: إنذار رسمي\n\nبناءً على ما تبين من ${params.reason || 'المخالفة المسجلة'}، نُصدر لك هذا الإنذار الرسمي.\n\nنأمل منك الالتزام التام بأنظمة العمل وسياسات الشركة، وإلا ستُتخذ إجراءات تأديبية أشد.\n\nإدارة الموارد البشرية\n${today}`
      : `Dear: ${name}\nEmployee ID: ${empId}\nDate: ${today}\n\nSubject: Official Warning Letter\n\nBased on: ${params.reason || 'recorded violation'}, we hereby issue this formal warning.\n\nYou are required to comply with all company policies. Failure to do so will result in further disciplinary action.\n\nHR Department\n${today}`;
  }
  if (type === 'increment') {
    const newSalary = salary + (Number(params.increment_amount) || 0);
    return isAr
      ? `بسم الله الرحمن الرحيم\n\nإلى: ${name}\nالرقم الوظيفي: ${empId}\nالتاريخ: ${today}\n\nالموضوع: خطاب زيادة الراتب\n\nيسعدنا إبلاغكم بأنه تقرر منحكم زيادة في الراتب اعترافاً بمجهوداتكم وأدائكم المتميز.\n\nالراتب الجديد: ${newSalary.toLocaleString()} ريال سعودي شهرياً\nاعتباراً من: ${params.effective_date || today}\n\nنتمنى لكم مزيداً من التوفيق.\n\nإدارة الموارد البشرية`
      : `Dear: ${name}\nEmployee ID: ${empId}\nDate: ${today}\n\nSubject: Salary Increment\n\nWe are pleased to inform you of a salary increment in recognition of your performance.\n\nNew Salary: SAR ${newSalary.toLocaleString()} per month\nEffective: ${params.effective_date || today}\n\nBest regards,\nHR Department`;
  }
  if (type === 'termination') {
    return isAr
      ? `بسم الله الرحمن الرحيم\n\nإلى: ${name}\nالرقم الوظيفي: ${empId}\nالتاريخ: ${today}\n\nالموضوع: إشعار إنهاء الخدمة\n\nنُحيطكم علماً بأنه تقرر إنهاء خدماتكم اعتباراً من تاريخ ${params.last_day || today}، وذلك بسبب: ${params.reason || '---'}.\n\nسيتم احتساب مستحقاتكم النهائية وفقاً لنظام العمل السعودي.\n\nإدارة الموارد البشرية`
      : `Dear: ${name}\nEmployee ID: ${empId}\nDate: ${today}\n\nSubject: Termination of Employment\n\nThis letter serves notice that your employment will be terminated effective ${params.last_day || today}, due to: ${params.reason || '---'}.\n\nYour end-of-service benefits will be calculated per Saudi Labor Law.\n\nHR Department`;
  }
  if (type === 'eos_settlement') {
    const years = params.years_of_service || 1;
    const eos = salary * (years <= 5 ? years * 0.5 : (5 * 0.5 + (years - 5) * 1));
    return isAr
      ? `بسم الله الرحمن الرحيم\n\nمخالصة نهائية\n\nالموظف: ${name}\nالرقم الوظيفي: ${empId}\nتاريخ الانضمام: ${params.hire_date || '-'}\nتاريخ المغادرة: ${params.last_day || today}\nسنوات الخدمة: ${years}\n\nالراتب الأساسي: ${salary.toLocaleString()} ريال\nمكافأة نهاية الخدمة (وفق نظام العمل السعودي): ${Math.round(eos).toLocaleString()} ريال\n\nإجمالي المستحقات: ${Math.round(eos).toLocaleString()} ريال\n\nوقّع الطرفان على هذه المخالصة إقراراً باستيفاء جميع المستحقات.\n\nإدارة الموارد البشرية`
      : `FINAL SETTLEMENT LETTER\n\nEmployee: ${name}\nEmployee ID: ${empId}\nJoin Date: ${params.hire_date || '-'}\nLast Day: ${params.last_day || today}\nYears of Service: ${years}\n\nBasic Salary: SAR ${salary.toLocaleString()}\nEnd of Service Benefit (per Saudi Labor Law): SAR ${Math.round(eos).toLocaleString()}\n\nTotal Dues: SAR ${Math.round(eos).toLocaleString()}\n\nBoth parties agree this settles all outstanding dues.\n\nHR Department`;
  }
  return isAr
    ? `بسم الله الرحمن الرحيم\n\nإلى: ${name} (${empId})\nالتاريخ: ${today}\n\nهذا المستند صادر من إدارة الموارد البشرية.`
    : `To: ${name} (${empId})\nDate: ${today}\n\nThis document is issued by the HR Department.`;
}

export default function YamenDraftDocuments({ isRTL }) {
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  const [showDialog, setShowDialog] = useState(false);
  const [selectedType, setSelectedType] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [params, setParams] = useState({});
  const [docContent, setDocContent] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);

  const { data: employees = [] } = useQuery({ queryKey: ['employees', tenantId], queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at').match(tenantFilter())), enabled: hasTenantAccess });

  const emp = employees.find(e => e.id === selectedEmployee);

  const handleGenerate = async () => {
    if (!selectedType || !selectedEmployee) { toast.error(isRTL ? 'اختر نوع المستند والموظف' : 'Select document type and employee'); return; }
    setGenerating(true);
    await new Promise(r => setTimeout(r, 600));
    const content = generateDocContent({ type: selectedType, employee: emp, params, isAr: isRTL });
    setDocContent(content);
    setGenerating(false);
    setStep(2);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const docType = DOC_TYPES.find(d => d.id === selectedType);
      await tenantQuery('employee_documents').insert({
        employee_id: emp.id,
        employee_name: emp.name_ar,
        document_type: selectedType,
        title: isRTL ? docType?.ar : docType?.en,
        notes: docContent,
        status: 'active',
        issue_date: format(new Date(), 'yyyy-MM-dd'),
      });
      toast.success(isRTL ? 'تم حفظ المستند في الأرشيف' : 'Document saved to archive');
      setShowDialog(false);
      setStep(1);
      setDocContent('');
      setParams({});
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setShowDialog(true); setStep(1); setDocContent(''); }} className="bg-slate-900 hover:bg-slate-800">
            <Plus className="w-4 h-4 me-2" />{isRTL ? 'مسودة مستند جديد' : 'New Document Draft'}
          </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
         {DOC_TYPES.map(dt => (
           <Card key={dt.id} className="cursor-pointer bg-white hover:shadow-md hover:border-emerald-400 transition-all border-2 border-slate-200" onClick={() => { setSelectedType(dt.id); setShowDialog(true); setStep(1); setDocContent(''); }}>
             <CardContent className="p-4 flex items-center gap-3">
               <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                 <FileText className="w-5 h-5 text-emerald-600" />
               </div>
               <div>
                 <p className="font-medium text-sm text-slate-900">{isRTL ? dt.ar : dt.en}</p>
                 <p className="text-xs text-slate-500">{isRTL ? dt.en : dt.ar}</p>
               </div>
             </CardContent>
           </Card>
         ))}
       </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-400" />
              {isRTL ? 'مسودة مستند' : 'Document Draft'}
              {step === 2 && <span className="text-xs text-emerald-400 ms-2">({isRTL ? 'معاينة وتحرير' : 'Preview & Edit'})</span>}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            {step === 1 && (
              <>
                <div className="space-y-1">
                  <Label>{isRTL ? 'نوع المستند' : 'Document Type'} *</Label>
                  <Select value={selectedType} onValueChange={setSelectedType}>
                    <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                    <SelectContent>
                      {DOC_TYPES.map(dt => <SelectItem key={dt.id} value={dt.id}>{isRTL ? dt.ar : dt.en}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{isRTL ? 'الموظف' : 'Employee'} *</Label>
                  <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                    <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر موظفاً' : 'Select employee'} /></SelectTrigger>
                    <SelectContent>
                      {employees.filter(e => e.status === 'active').map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.employee_id} — {e.name_ar}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedType === 'warning' && (
                  <div className="space-y-1">
                    <Label>{isRTL ? 'سبب الإنذار' : 'Reason for Warning'}</Label>
                    <Input value={params.reason || ''} onChange={e => setParams(p => ({ ...p, reason: e.target.value }))} />
                  </div>
                )}
                {selectedType === 'termination' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label>{isRTL ? 'آخر يوم عمل' : 'Last Working Day'}</Label><Input type="date" value={params.last_day || ''} onChange={e => setParams(p => ({ ...p, last_day: e.target.value }))} /></div>
                    <div className="space-y-1"><Label>{isRTL ? 'السبب' : 'Reason'}</Label><Input value={params.reason || ''} onChange={e => setParams(p => ({ ...p, reason: e.target.value }))} /></div>
                  </div>
                )}
                {selectedType === 'increment' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label>{isRTL ? 'مبلغ الزيادة (SAR)' : 'Increment Amount (SAR)'}</Label><Input type="number" value={params.increment_amount || ''} onChange={e => setParams(p => ({ ...p, increment_amount: e.target.value }))} /></div>
                    <div className="space-y-1"><Label>{isRTL ? 'تاريخ التطبيق' : 'Effective Date'}</Label><Input type="date" value={params.effective_date || ''} onChange={e => setParams(p => ({ ...p, effective_date: e.target.value }))} /></div>
                  </div>
                )}
                {selectedType === 'eos_settlement' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label>{isRTL ? 'سنوات الخدمة' : 'Years of Service'}</Label><Input type="number" value={params.years_of_service || ''} onChange={e => setParams(p => ({ ...p, years_of_service: e.target.value }))} /></div>
                    <div className="space-y-1"><Label>{isRTL ? 'آخر يوم عمل' : 'Last Day'}</Label><Input type="date" value={params.last_day || ''} onChange={e => setParams(p => ({ ...p, last_day: e.target.value }))} /></div>
                  </div>
                )}
              </>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <CheckCircle className="w-4 h-4" />
                  {isRTL ? 'يمكنك تحرير النص قبل الحفظ' : 'You can edit the content before saving'}
                </div>
                <Textarea
                  value={docContent}
                  onChange={e => setDocContent(e.target.value)}
                  rows={18}
                  className="font-mono text-sm"
                  dir={isRTL ? 'rtl' : 'ltr'}
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            {step === 1 ? (
              <>
                <Button variant="outline" onClick={() => setShowDialog(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
                <Button onClick={handleGenerate} disabled={generating}>
                  {generating ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <Edit3 className="w-4 h-4 me-2" />}
                  {isRTL ? 'توليد المسودة' : 'Generate Draft'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setStep(1)}>{isRTL ? 'رجوع' : 'Back'}</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <Download className="w-4 h-4 me-2" />}
                  {isRTL ? 'حفظ في الأرشيف' : 'Save to Archive'}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}