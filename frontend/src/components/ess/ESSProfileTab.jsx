import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData, callApi } from '../../api/supabaseClient';
import { extractAiText } from '../yamen/yamenUtils';
import { useLanguage } from '../LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { format, differenceInDays } from 'date-fns';
import { AlertTriangle, Bot, Loader2, Clock, BookOpen, Shield, CreditCard } from 'lucide-react';
import { toast } from 'sonner';

export default function ESSProfileTab({ employee, departments, jobTitles: _jobTitles, branches }) {
  const { isRTL } = useLanguage();
  const [aiInsight, setAiInsight] = useState('');
  const [loadingAI, setLoadingAI] = useState(false);
  const [showBankDialog, setShowBankDialog] = useState(false);
  const [bankForm, setBankForm] = useState({ bank_name: employee?.bank_name || '', iban: employee?.iban || '', bank_account: employee?.bank_account || '' });
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const { data: trainings = [] } = useQuery({
    queryKey: ['trainings_emp', employee?.id],
    queryFn: () => fetchData(tenantQuery('trainings').select('*').order()),
    enabled: !!employee?.id,
  });

  const { data: discCases = [] } = useQuery({
    queryKey: ['disc_cases_emp', employee?.id],
    queryFn: () => fetchData(tenantQuery('disciplinary_cases').select('*').match({ employee_id: employee?.id })),
    enabled: !!employee?.id,
  });

  const { data: assetAssignments = [] } = useQuery({
    queryKey: ['asset_assignments_emp', employee?.id],
    queryFn: () => fetchData(tenantQuery('asset_assignments').select('*').match({ employee_id: employee?.id })),
    enabled: !!employee?.id,
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ['emp_contracts', employee?.id],
    queryFn: () => fetchData(tenantQuery('employee_contracts').select('*').match({ employee_id: employee?.id })),
    enabled: !!employee?.id,
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ['att_emp', employee?.id],
    queryFn: () => fetchData(tenantQuery('employee_attendances').select('*').match({ employee_id: employee?.id })),
    enabled: !!employee?.id,
  });

  const myTrainings = trainings.filter(t => t.attendees?.some(a => a.employee_id === employee?.id));

  const probationEndDate = employee?.probation_end_date ? new Date(employee.probation_end_date) : null;
  const onProbation = probationEndDate && probationEndDate > new Date();
  const daysLeftProbation = probationEndDate ? differenceInDays(probationEndDate, new Date()) : 0;

  const licenseExpiring = employee?.license_expiry_date && differenceInDays(new Date(employee.license_expiry_date), new Date()) <= 60;

  const lateCount = attendance.filter(a => a.status === 'late').length;
  const absentCount = attendance.filter(a => a.status === 'absent').length;

  const handleAI = async () => {
    setLoadingAI(true);
    setAiInsight('');
    const prompt = `You are Yamen AI. Analyze this employee profile and provide a concise HR risk assessment in both Arabic and English:
    - Name: ${employee?.name_ar}
    - Hire Date: ${employee?.hire_date}
    - Status: ${employee?.status}
    - On Probation: ${onProbation ? 'Yes, ' + daysLeftProbation + ' days left' : 'No'}
    - MOE License Expiry: ${employee?.license_expiry_date || 'N/A'}
    - Disciplinary Cases: ${discCases.length} (open: ${discCases.filter(c => c.status === 'open').length})
    - Attendance (recent): Late ${lateCount}x, Absent ${absentCount}x
    - Completed Trainings: ${myTrainings.filter(t => t.status === 'completed').length}
    - Active Contracts: ${contracts.filter(c => c.status === 'active').length}
    
    Provide: risk score (Low/Medium/High), key alerts, and recommendations. If data is insufficient, state what is missing.`;
    const res = await callApi('/api/ai/invoke-llm', { prompt, source: 'ess' });
    setAiInsight(extractAiText(res));
    setLoadingAI(false);
  };

  const handleSaveBank = async () => {
    if (!employee?.id) return;
    setSaving(true);
    await tenantQuery('employees').update(bankForm).eq('id', employee.id);
    queryClient.invalidateQueries({ queryKey: ['employees'] });
    toast.success(isRTL ? 'تم حفظ البيانات البنكية' : 'Bank details saved');
    setShowBankDialog(false);
    setSaving(false);
  };

  const dept = departments?.find(d => d.id === employee?.department_id);
  const branch = branches?.find(b => b.id === employee?.branch_id);
  const latestContract = contracts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

  return (
    <div className="space-y-6">
      {/* Compliance Alerts */}
      {(licenseExpiring || discCases.filter(c => c.status === 'open').length > 0 || onProbation) && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader><CardTitle className="text-amber-700 flex items-center gap-2"><AlertTriangle className="w-5 h-5" />{isRTL ? 'تنبيهات الامتثال' : 'Compliance Alerts'}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {licenseExpiring && (
              <div className="flex items-center gap-2 text-sm text-amber-700">
                <AlertTriangle className="w-4 h-4" />
                {isRTL ? `ترخيص MOE ينتهي في ${format(new Date(employee.license_expiry_date), 'dd/MM/yyyy')}` : `MOE License expires ${format(new Date(employee.license_expiry_date), 'dd/MM/yyyy')}`}
              </div>
            )}
            {onProbation && (
              <div className="flex items-center gap-2 text-sm text-najdi-900">
                <Clock className="w-4 h-4" />
                {isRTL ? `قيد الاختبار — متبقي ${daysLeftProbation} يوم` : `On probation — ${daysLeftProbation} days remaining`}
              </div>
            )}
            {discCases.filter(c => c.status === 'open').length > 0 && (
              <div className="flex items-center gap-2 text-sm text-red-700">
                <Shield className="w-4 h-4" />
                {isRTL ? `${discCases.filter(c => c.status === 'open').length} قضية تأديبية مفتوحة` : `${discCases.filter(c => c.status === 'open').length} open disciplinary case(s)`}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main Profile Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">{isRTL ? 'معلومات الوظيفة' : 'Job Information'}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">{isRTL ? 'القسم' : 'Department'}</span><span className="font-medium">{dept?.name_ar || '-'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{isRTL ? 'الفرع' : 'Branch'}</span><span className="font-medium">{branch?.name_ar || '-'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{isRTL ? 'المدير المباشر' : 'Line Manager'}</span><span className="font-medium">{employee?.manager_id || '-'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{isRTL ? 'نوع التوظيف' : 'Employment Type'}</span><span className="font-medium">{employee?.employment_type || '-'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{isRTL ? 'تاريخ التعيين' : 'Hire Date'}</span><span className="font-medium">{employee?.hire_date ? format(new Date(employee.hire_date), 'dd/MM/yyyy') : '-'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{isRTL ? 'حالة الاختبار' : 'Probation'}</span>
              <Badge className={onProbation ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}>
                {onProbation ? (isRTL ? `جارٍ (${daysLeftProbation} يوم)` : `Active (${daysLeftProbation}d)`) : (isRTL ? 'مكتمل' : 'Completed')}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{isRTL ? 'هيكل الراتب' : 'Salary Structure'}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">{isRTL ? 'الراتب الأساسي' : 'Basic Salary'}</span><span className="font-medium">{employee?.compensation?.salary_structure?.basic_salary?.toLocaleString() || employee?.basic_salary?.toLocaleString() || '-'} {isRTL ? 'ر.س' : 'SAR'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{isRTL ? 'بدل السكن' : 'Housing'}</span><span className="font-medium">{employee?.housing_allowance?.toLocaleString() || '-'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{isRTL ? 'بدل النقل' : 'Transport'}</span><span className="font-medium">{employee?.transport_allowance?.toLocaleString() || '-'}</span></div>
            {(() => {
              const basic = employee?.compensation?.salary_structure?.basic_salary || employee?.basic_salary || 0;
              const allowances = (employee?.compensation?.salary_structure?.allowances || [])
                .filter(a => a.recurring !== false)
                .reduce((s, a) => s + (a.amount || 0), 0)
                + (employee?.housing_allowance || 0)
                + (employee?.transport_allowance || 0)
                + (employee?.other_allowances || 0);
              const deductions = (employee?.compensation?.deductions?.other_deductions || [])
                .filter(d => d.recurring !== false)
                .reduce((s, d) => s + (d.amount || 0), 0);
              const net = basic + allowances - deductions;
              return (
                <>
                  {allowances > 0 && <div className="flex justify-between text-emerald-700"><span className="text-muted-foreground">{isRTL ? 'البدلات الدورية' : 'Recurring Allowances'}</span><span>+{allowances.toLocaleString()}</span></div>}
                  {deductions > 0 && <div className="flex justify-between text-red-600"><span className="text-muted-foreground">{isRTL ? 'الخصومات الدورية' : 'Recurring Deductions'}</span><span>-{deductions.toLocaleString()}</span></div>}
                  <div className="flex justify-between border-t pt-2 font-semibold"><span>{isRTL ? 'صافي الراتب' : 'Net Salary'}</span><span className="text-emerald-600">{net.toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</span></div>
                </>
              );
            })()}
            <div className="flex justify-between"><span className="text-muted-foreground">{isRTL ? 'العقد الحالي' : 'Current Contract'}</span><span className="font-medium">{latestContract ? `${latestContract.contract_number || '-'} (${latestContract.status})` : '-'}</span></div>
          </CardContent>
        </Card>
      </div>

      {/* Bank Details */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><CreditCard className="w-4 h-4" />{isRTL ? 'البيانات البنكية' : 'Bank Details'}</CardTitle>
          <Button size="sm" variant="outline" onClick={() => { setBankForm({ bank_name: employee?.bank_name || '', iban: employee?.iban || '', bank_account: employee?.bank_account || '' }); setShowBankDialog(true); }}>
            {isRTL ? 'تحديث' : 'Update'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">{isRTL ? 'البنك' : 'Bank'}</span><span className="font-medium">{employee?.bank_name || '-'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">IBAN</span><span className="font-mono">{employee?.iban || '-'}</span></div>
        </CardContent>
      </Card>

      {/* Asset Assignments */}
      <Card>
        <CardHeader><CardTitle className="text-base">{isRTL ? 'الأصول المُخصصة' : 'Assigned Assets'}</CardTitle></CardHeader>
        <CardContent>
          {assetAssignments.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-2">{isRTL ? 'لا توجد أصول مُخصصة' : 'No assigned assets'}</p>
          ) : (
            <div className="space-y-2">
              {assetAssignments.map(a => (
                <div key={a.id} className="flex justify-between text-sm p-2 bg-sand rounded-lg">
                  <span className="font-medium">{a.asset_name || a.asset_id}</span>
                  <Badge className="bg-najdi-50 text-najdi-900">{a.status || 'active'}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Training History */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><BookOpen className="w-4 h-4" />{isRTL ? 'سجل التدريب' : 'Training History'}</CardTitle></CardHeader>
        <CardContent>
          {myTrainings.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-2">{isRTL ? 'لا توجد سجلات تدريب' : 'No training records'}</p>
          ) : (
            <div className="space-y-2">
              {myTrainings.map(t => (
                <div key={t.id} className="flex justify-between text-sm p-2 bg-sand rounded-lg">
                  <div><p className="font-medium">{t.training_name_ar}</p><p className="text-xs text-muted-foreground">{t.cpd_hours} CPD hrs</p></div>
                  <Badge className={t.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-najdi-50 text-najdi-900'}>{t.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disciplinary Cases */}
      {discCases.length > 0 && (
        <Card className="border-red-100">
          <CardHeader><CardTitle className="text-base flex items-center gap-2 text-red-700"><Shield className="w-4 h-4" />{isRTL ? 'القضايا التأديبية' : 'Disciplinary Cases'}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {discCases.map(c => (
              <div key={c.id} className="flex justify-between text-sm p-2 bg-red-50 rounded-lg">
                <span>{c.case_number} — {c.case_type}</span>
                <Badge className={c.status === 'closed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>{c.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Yamen AI */}
      <Card className="border-purple-200">
        <CardHeader><CardTitle className="text-base flex items-center gap-2 text-purple-700"><Bot className="w-4 h-4" />Yamen AI — {isRTL ? 'تقييم الموظف' : 'Employee Assessment'}</CardTitle></CardHeader>
        <CardContent>
          <Button onClick={handleAI} disabled={loadingAI} className="mb-4 bg-purple-600 hover:bg-purple-700 gap-2">
            {loadingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
            {isRTL ? 'تحليل الملف الشخصي' : 'Analyze Employee Profile'}
          </Button>
          {aiInsight && <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 whitespace-pre-wrap text-sm text-ink">{aiInsight}</div>}
        </CardContent>
      </Card>

      {/* Bank Dialog */}
      <Dialog open={showBankDialog} onOpenChange={setShowBankDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{isRTL ? 'تحديث البيانات البنكية' : 'Update Bank Details'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>{isRTL ? 'اسم البنك' : 'Bank Name'}</Label><Input value={bankForm.bank_name} onChange={e => setBankForm(p => ({...p, bank_name: e.target.value}))} /></div>
            <div className="space-y-2"><Label>IBAN</Label><Input value={bankForm.iban} onChange={e => setBankForm(p => ({...p, iban: e.target.value}))} /></div>
            <div className="space-y-2"><Label>{isRTL ? 'رقم الحساب' : 'Account Number'}</Label><Input value={bankForm.bank_account} onChange={e => setBankForm(p => ({...p, bank_account: e.target.value}))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBankDialog(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSaveBank} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}{isRTL ? 'حفظ' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}