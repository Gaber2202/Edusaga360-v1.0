import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Badge } from '../ui/badge';
import DataTable from '../ui/DataTable';
import { Plus, CheckCircle, XCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const monthsAr = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

export default function MudadWPS() {
  const { isRTL } = useLanguage();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    branch_id: '', period_month: new Date().getMonth() + 1, period_year: new Date().getFullYear(),
    submission_date: format(new Date(), 'yyyy-MM-dd'), employee_count: 0,
    total_salary: 0, status: 'pending', compliance_percentage: 100, bank_name: 'Bank Albilad', file_format: 'wps', notes: ''
  });

  const { data: submissions = [], isLoading } = useQuery({ queryKey: ['mudad'], queryFn: () => fetchData(tenantQuery('mudad_submissions').select('*').order('-created_date')) });
  const { data: _branches = [] } = useQuery({ queryKey: ['branches'], queryFn: () => fetchData(tenantQuery('branches').select('*').match({ is_active: true })) });

  const statusIcon = { pending: <Clock className="w-3 h-3" />, submitted: <CheckCircle className="w-3 h-3" />, accepted: <CheckCircle className="w-3 h-3" />, rejected: <XCircle className="w-3 h-3" />, partial: <Clock className="w-3 h-3" /> };
  const statusColor = { pending: 'bg-amber-100 text-amber-700', submitted: 'bg-blue-100 text-blue-700', accepted: 'bg-emerald-100 text-emerald-700', rejected: 'bg-red-100 text-red-700', partial: 'bg-yellow-100 text-yellow-700' };

  const columns = [
    { header: isRTL ? 'الفترة' : 'Period', cell: r => `${isRTL ? monthsAr[r.period_month - 1] : months[r.period_month - 1]} ${r.period_year}` },
    { header: isRTL ? 'تاريخ الرفع' : 'Submission Date', accessorKey: 'submission_date' },
    { header: isRTL ? 'الموظفون' : 'Employees', accessorKey: 'employee_count' },
    { header: isRTL ? 'إجمالي الأجور' : 'Total Wages', cell: r => `${(r.total_salary || 0).toLocaleString()} ${isRTL ? 'ر.س' : 'SAR'}` },
    { header: isRTL ? 'الامتثال %' : 'Compliance %', cell: r => (
      <div className="flex items-center gap-2">
        <div className="w-16 bg-slate-200 rounded-full h-2">
          <div className="h-2 rounded-full" style={{ width: `${r.compliance_percentage || 0}%`, backgroundColor: (r.compliance_percentage || 0) >= 90 ? '#10b981' : '#ef4444' }} />
        </div>
        <span className="text-sm font-medium">{r.compliance_percentage || 0}%</span>
      </div>
    )},
    { header: isRTL ? 'البنك' : 'Bank', accessorKey: 'bank_name' },
    { header: isRTL ? 'الحالة' : 'Status', cell: r => (
      <Badge className={statusColor[r.status] || 'bg-slate-100 text-slate-700'}>
        <span className="me-1">{statusIcon[r.status]}</span>
        {r.status}
      </Badge>
    )},
  ];

  const handleSave = async () => {
    setSaving(true);
    try {
      await tenantQuery('mudad_submissions').insert({ ...form, submission_reference: `MUDAD-${Date.now().toString(36).toUpperCase()}` });
      qc.invalidateQueries({ queryKey: ['mudad'] });
      setShowForm(false);
      toast.success(isRTL ? 'تم التسجيل' : 'Submission recorded');
    } catch {
      toast.error(isRTL ? 'حدث خطأ' : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const lastSubmission = submissions[0];
  const avgCompliance = submissions.length > 0 ? Math.round(submissions.reduce((s, m) => s + (m.compliance_percentage || 0), 0) / submissions.length) : 0;

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <div className="text-2xl font-bold text-slate-900">{submissions.length}</div>
          <div className="text-sm text-slate-500">{isRTL ? 'إجمالي الرفوعات' : 'Total Submissions'}</div>
        </CardContent></Card>
        <Card className={avgCompliance >= 90 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}>
          <CardContent className="p-4">
            <div className={`text-2xl font-bold ${avgCompliance >= 90 ? 'text-emerald-700' : 'text-red-700'}`}>{avgCompliance}%</div>
            <div className="text-sm text-slate-500">{isRTL ? 'متوسط الامتثال' : 'Avg Compliance'}</div>
          </CardContent>
        </Card>
        <Card><CardContent className="p-4">
          <div className="text-2xl font-bold text-slate-900">{lastSubmission ? `${isRTL ? monthsAr[lastSubmission.period_month - 1] : months[lastSubmission.period_month - 1]} ${lastSubmission.period_year}` : '—'}</div>
          <div className="text-sm text-slate-500">{isRTL ? 'آخر فترة مرفوعة' : 'Last Submitted Period'}</div>
        </CardContent></Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setShowForm(true)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4 me-2" />{isRTL ? 'تسجيل رفع' : 'Record Submission'}
        </Button>
      </div>

      <DataTable columns={columns} data={submissions} loading={isLoading} emptyMessage={isRTL ? 'لا توجد رفوعات' : 'No submissions'} />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{isRTL ? 'تسجيل رفع مدد / WPS' : 'Record Mudad / WPS Submission'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>{isRTL ? 'الشهر' : 'Month'}</Label>
              <Select value={String(form.period_month)} onValueChange={v => setForm(p => ({ ...p, period_month: Number(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{months.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{isRTL ? monthsAr[i] : m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'السنة' : 'Year'}</Label>
              <Input type="number" value={form.period_year} onChange={e => setForm(p => ({ ...p, period_year: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'تاريخ الرفع' : 'Submission Date'}</Label>
              <Input type="date" value={form.submission_date} onChange={e => setForm(p => ({ ...p, submission_date: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'عدد الموظفين' : 'Employee Count'}</Label>
              <Input type="number" value={form.employee_count} onChange={e => setForm(p => ({ ...p, employee_count: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'إجمالي الأجور' : 'Total Wages'}</Label>
              <Input type="number" value={form.total_salary} onChange={e => setForm(p => ({ ...p, total_salary: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'نسبة الامتثال %' : 'Compliance %'}</Label>
              <Input type="number" min="0" max="100" value={form.compliance_percentage} onChange={e => setForm(p => ({ ...p, compliance_percentage: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'البنك' : 'Bank'}</Label>
              <Select value={form.bank_name} onValueChange={v => setForm(p => ({ ...p, bank_name: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Bank Albilad">Bank Albilad</SelectItem>
                  <SelectItem value="Al Rajhi Bank">Al Rajhi Bank</SelectItem>
                  <SelectItem value="SNB">SNB</SelectItem>
                  <SelectItem value="Riyad Bank">Riyad Bank</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'صيغة الملف' : 'File Format'}</Label>
              <Select value={form.file_format} onValueChange={v => setForm(p => ({ ...p, file_format: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wps">WPS</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="excel">Excel</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>{isRTL ? 'الحالة' : 'Status'}</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{isRTL ? 'قيد الانتظار' : 'Pending'}</SelectItem>
                  <SelectItem value="submitted">{isRTL ? 'مرسل' : 'Submitted'}</SelectItem>
                  <SelectItem value="accepted">{isRTL ? 'مقبول' : 'Accepted'}</SelectItem>
                  <SelectItem value="rejected">{isRTL ? 'مرفوض' : 'Rejected'}</SelectItem>
                  <SelectItem value="partial">{isRTL ? 'جزئي' : 'Partial'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{isRTL ? 'حفظ' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}