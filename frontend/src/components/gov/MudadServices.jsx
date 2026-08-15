import React, { useState } from 'react';
import { useLanguage } from '../LanguageContext';
import { useTenant } from '../TenantContext';
import { formatCurrency } from '../../lib/localization';
import ServiceTile from './ServiceTile';
import ServiceWorkflowDialog from './ServiceWorkflowDialog';
import { Upload, CheckCircle, FileText, BarChart2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Badge } from '../ui/badge';
import DataTable from '../ui/DataTable';
import { Plus, Clock, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const monthsAr = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

const MUDAD_SERVICES = [
  {
    code: 'MUDAD-UPLOAD', nameAr: 'رفع ملف الرواتب', nameEn: 'Upload Payroll File',
    descAr: 'رفع ملف الرواتب الشهري إلى منصة مدد', descEn: 'Upload monthly payroll file to Mudad platform',
    icon: Upload, color: 'emerald',
  },
  {
    code: 'MUDAD-VALIDATE', nameAr: 'التحقق من صحة الرواتب', nameEn: 'Validate Payroll',
    descAr: 'التحقق من صحة بيانات الرواتب قبل الرفع', descEn: 'Validate payroll data accuracy before submission',
    icon: CheckCircle, color: 'blue',
  },
  {
    code: 'MUDAD-WPS-REPORT', nameAr: 'تقرير امتثال WPS', nameEn: 'WPS Compliance Report',
    descAr: 'تقرير مفصل عن مستوى الامتثال لنظام حماية الأجور', descEn: 'Detailed WPS compliance level report',
    icon: FileText, color: 'amber',
  },
  {
    code: 'MUDAD-MONITOR', nameAr: 'متابعة صرف الرواتب', nameEn: 'Salary Monitoring',
    descAr: 'مراقبة حالة صرف الرواتب وتتبع الامتثال', descEn: 'Monitor salary disbursement status and track compliance',
    icon: BarChart2, color: 'purple',
  },
];

const statusIcon = { pending: <Clock className="w-3 h-3" />, submitted: <CheckCircle className="w-3 h-3" />, accepted: <CheckCircle className="w-3 h-3" />, rejected: <XCircle className="w-3 h-3" />, partial: <Clock className="w-3 h-3" /> };
const statusColor = { pending: 'bg-amber-900/60 text-amber-300 border-amber-700', submitted: 'bg-najdi-900/60 text-najdi-500 border-najdi-700', accepted: 'bg-emerald-900/60 text-emerald-300 border-emerald-700', rejected: 'bg-red-900/60 text-red-300 border-red-700', partial: 'bg-yellow-900/60 text-yellow-300 border-yellow-700' };

export default function MudadServices() {
  const { isRTL } = useLanguage();
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    branch_id: '', period_month: new Date().getMonth() + 1, period_year: new Date().getFullYear(),
    submission_date: format(new Date(), 'yyyy-MM-dd'), employee_count: 0,
    total_salary: 0, status: 'pending', compliance_percentage: 100, bank_name: 'Al Rajhi Bank', file_format: 'wps', notes: ''
  });

  const { data: submissions = [], isLoading } = useQuery({ enabled: false /* mudad_submissions table not built */, queryKey: ['mudad'], queryFn: () => fetchData(tenantQuery('mudad_submissions').select('*').order('created_at', { ascending: false })), initialData: [] });

  const columns = [
    { header: isRTL ? 'الفترة' : 'Period', cell: r => `${isRTL ? monthsAr[r.period_month - 1] : months[r.period_month - 1]} ${r.period_year}` },
    { header: isRTL ? 'تاريخ الرفع' : 'Submission Date', accessorKey: 'submission_date' },
    { header: isRTL ? 'الموظفون' : 'Employees', accessorKey: 'employee_count' },
    { header: isRTL ? 'إجمالي الأجور' : 'Total Wages', cell: r => formatCurrency(r.total_salary || 0, tenant?.localization, isRTL) },
    { header: isRTL ? 'الامتثال %' : 'Compliance %', cell: r => (
      <div className="flex items-center gap-2">
        <div className="w-16 bg-ink rounded-full h-2">
          <div className="h-2 rounded-full" style={{ width: `${r.compliance_percentage || 0}%`, backgroundColor: (r.compliance_percentage || 0) >= 90 ? '#10b981' : '#ef4444' }} />
        </div>
        <span className="text-sm font-medium">{r.compliance_percentage || 0}%</span>
      </div>
    )},
    { header: isRTL ? 'البنك' : 'Bank', accessorKey: 'bank_name' },
    { header: isRTL ? 'الحالة' : 'Status', cell: r => (
      <Badge className={`border text-xs ${statusColor[r.status] || 'bg-najdi-900 text-muted-foreground border-najdi-900'}`}>
        {statusIcon[r.status]} {r.status}
      </Badge>
    )},
  ];

  const lastSubmission = submissions[0];
  const avgCompliance = submissions.length > 0 ? Math.round(submissions.reduce((s, m) => s + (m.compliance_percentage || 0), 0) / submissions.length) : 0;

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

  return (
    <div className="space-y-6 mt-4">
      {/* Service Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {MUDAD_SERVICES.map(service => (
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

      {/* WPS Submissions Log */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-white font-semibold text-base">{isRTL ? 'سجل رفوعات WPS' : 'WPS Submission Log'}</h2>
          <div className="flex-1 h-px bg-ink" />
          <Button onClick={() => setShowForm(true)} size="sm" className="bg-emerald-700 hover:bg-emerald-600">
            <Plus className="w-3 h-3 me-1" />{isRTL ? 'تسجيل رفع' : 'Record Submission'}
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <Card><CardContent className="p-4">
            <div className="text-2xl font-bold text-white">{submissions.length}</div>
            <div className="text-sm text-muted-foreground">{isRTL ? 'إجمالي الرفوعات' : 'Total Submissions'}</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className={`text-2xl font-bold ${avgCompliance >= 90 ? 'text-emerald-400' : 'text-red-400'}`}>{avgCompliance}%</div>
            <div className="text-sm text-muted-foreground">{isRTL ? 'متوسط الامتثال' : 'Avg Compliance'}</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-lg font-bold text-white">{lastSubmission ? `${isRTL ? monthsAr[lastSubmission.period_month - 1] : months[lastSubmission.period_month - 1]} ${lastSubmission.period_year}` : '—'}</div>
            <div className="text-sm text-muted-foreground">{isRTL ? 'آخر فترة' : 'Last Period'}</div>
          </CardContent></Card>
        </div>
        <DataTable columns={columns} data={submissions} loading={isLoading} emptyMessage={isRTL ? 'لا توجد رفوعات' : 'No submissions'} />
      </div>

      <ServiceWorkflowDialog open={!!selected} onClose={() => setSelected(null)} service={selected} isRTL={isRTL} />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg bg-najdi-900 border-najdi-900">
          <DialogHeader><DialogTitle className="text-white">{isRTL ? 'تسجيل رفع مدد / WPS' : 'Record Mudad / WPS Submission'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-muted-foreground">{isRTL ? 'الشهر' : 'Month'}</Label>
              <Select value={String(form.period_month)} onValueChange={v => setForm(p => ({ ...p, period_month: Number(v) }))}>
                <SelectTrigger className="bg-najdi-900 border-najdi-900 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>{months.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{isRTL ? monthsAr[i] : m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">{isRTL ? 'السنة' : 'Year'}</Label>
              <Input type="number" value={form.period_year} onChange={e => setForm(p => ({ ...p, period_year: Number(e.target.value) }))} className="bg-najdi-900 border-najdi-900 text-white" />
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">{isRTL ? 'تاريخ الرفع' : 'Submission Date'}</Label>
              <Input type="date" value={form.submission_date} onChange={e => setForm(p => ({ ...p, submission_date: e.target.value }))} className="bg-najdi-900 border-najdi-900 text-white" />
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">{isRTL ? 'عدد الموظفين' : 'Employee Count'}</Label>
              <Input type="number" value={form.employee_count} onChange={e => setForm(p => ({ ...p, employee_count: Number(e.target.value) }))} className="bg-najdi-900 border-najdi-900 text-white" />
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">{isRTL ? 'إجمالي الأجور' : 'Total Wages'}</Label>
              <Input type="number" value={form.total_salary} onChange={e => setForm(p => ({ ...p, total_salary: Number(e.target.value) }))} className="bg-najdi-900 border-najdi-900 text-white" />
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">{isRTL ? 'نسبة الامتثال %' : 'Compliance %'}</Label>
              <Input type="number" min="0" max="100" value={form.compliance_percentage} onChange={e => setForm(p => ({ ...p, compliance_percentage: Number(e.target.value) }))} className="bg-najdi-900 border-najdi-900 text-white" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-muted-foreground">{isRTL ? 'البنك' : 'Bank'}</Label>
              <Select value={form.bank_name} onValueChange={v => setForm(p => ({ ...p, bank_name: v }))}>
                <SelectTrigger className="bg-najdi-900 border-najdi-900 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Al Rajhi Bank">Al Rajhi Bank</SelectItem>
                  <SelectItem value="Bank Albilad">Bank Albilad</SelectItem>
                  <SelectItem value="SNB">SNB</SelectItem>
                  <SelectItem value="Riyad Bank">Riyad Bank</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-muted-foreground">{isRTL ? 'الحالة' : 'Status'}</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger className="bg-najdi-900 border-najdi-900 text-white"><SelectValue /></SelectTrigger>
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
            <Button variant="outline" onClick={() => setShowForm(false)} className="border-najdi-900 text-muted-foreground">{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-700 hover:bg-emerald-600">{isRTL ? 'حفظ' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}