import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData, callApi } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useBranch } from '../BranchContext';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Badge } from '../ui/badge';
import DataTable from '../ui/DataTable';
import { Plus, Upload, Download, RefreshCw, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import MonthPicker from '../ui/MonthPicker';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { logAuditEvent } from '../AuditService';

export default function GOSISubmissions() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const queryClient = useQueryClient();

  const [showDialog, setShowDialog] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    period: format(new Date(), 'yyyy-MM'),
    type: 'monthly'
  });

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ['gosiSubmissions', selectedBranchId],
    queryFn: () => fetchData(tenantQuery('gosi_records').select('*').match(branchFilter()).order('created_at', { ascending: false })),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', selectedBranchId],
    queryFn: () => fetchData(tenantQuery('employees').select('*').match(branchFilter({ status: 'active', is_gosi_applicable: true }))),
  });

  const filteredSubmissions = filterByBranch(submissions);
  const filteredEmployees = filterByBranch(employees);

  const handleGenerateFile = async () => {
    setGenerating(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      
      // Get payroll data for the period (any status)
      let payrollData = [];
      try {
        const { data = [] } = await tenantQuery('payroll_inputs').select('*').match({ period: formData.period });
        payrollData = data;
      } catch (_e) {
        // If filter fails, try listing all and filtering client-side
        const { data: all = [] } = await tenantQuery('payroll_inputs').select('*').order();
        payrollData = all.filter(p => p.period === formData.period);
      }

      // Calculate GOSI totals from GOSI-eligible employees
      const gosiData = filteredEmployees.map(emp => {
        const payroll = payrollData.find(p => p.employee_id === emp.id);
        return {
          employee_id: emp.id,
          employee_name: emp.name_ar || emp.name_en || '',
          employee_number: emp.employee_id || '',
          national_id: emp.national_id || emp.iqama_number || '',
          is_saudi: emp.is_saudi,
          gosi_wage: payroll?.gosi_wage || payroll?.basic_salary || emp.basic_salary || 0,
          gosi_employee: payroll?.gosi_employee || 0,
          gosi_employer: payroll?.gosi_employer || 0,
        };
      });

      const totalEmployees = gosiData.length;
      const totalWages = gosiData.reduce((sum, d) => sum + (d.gosi_wage || 0), 0);
      const totalEmployee = gosiData.reduce((sum, d) => sum + (d.gosi_employee || 0), 0);
      const totalEmployer = gosiData.reduce((sum, d) => sum + (d.gosi_employer || 0), 0);
      const totalContribution = totalEmployee + totalEmployer;

      // Generate CSV and trigger download immediately
      const headers = ['Employee Number', 'National ID', 'Name', 'Wage', 'Employee Share', 'Employer Share', 'Total'];
      const rows = gosiData.map(d => [
        d.employee_number,
        d.national_id,
        d.employee_name,
        d.gosi_wage,
        d.gosi_employee,
        d.gosi_employer,
        (d.gosi_employee || 0) + (d.gosi_employer || 0)
      ]);
      const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');

      // Download file
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `GOSI_${formData.period}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      // Save submission record (without large file_content)
      const submission = await tenantQuery('gosi_records').insert({
        period: formData.period,
        submission_type: formData.type,
        ...(selectedBranchId && selectedBranchId !== 'all' ? { branch_id: selectedBranchId } : {}),
        employee_count: totalEmployees,
        total_wages: totalWages,
        total_employee_contribution: totalEmployee,
        total_employer_contribution: totalEmployer,
        total_contribution: totalContribution,
        status: 'draft',
        generated_by: user?.email,
        generated_date: format(new Date(), 'yyyy-MM-dd'),
      });

      await logAuditEvent({
        action: 'GENERATE_GOSI',
        entityType: 'GOSIRecord',
        entityId: submission.id,
        newValues: { period: formData.period, employees: totalEmployees }
      });

      queryClient.invalidateQueries({ queryKey: ['gosiSubmissions'] });
      setShowDialog(false);
      toast.success(isRTL ? 'تم إنشاء ملف GOSI بنجاح' : 'GOSI file generated successfully');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async (record) => {
    setSubmitting(true);
    try {
      await tenantQuery('gosi_records').update({
        status: 'submitted',
        submitted_date: format(new Date(), 'yyyy-MM-dd')
      });

      await logAuditEvent({
        action: 'SUBMIT_GOSI',
        entityType: 'GOSIRecord',
        entityId: record.id
      });

      queryClient.invalidateQueries({ queryKey: ['gosiSubmissions'] });
      toast.success(isRTL ? 'تم رفع الملف بنجاح' : 'Submitted successfully');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = (record) => {
    // Regenerate a basic CSV from stored summary data
    const csv = `Period,Employees,Total Wages,Employee Share,Employer Share,Total Contribution\n${record.period},${record.employee_count},${record.total_wages},${record.total_employee_contribution},${record.total_employer_contribution},${record.total_contribution}`;
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `GOSI_${record.period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleRetry = async (record) => {
    try {
      await tenantQuery('gosi_records').update({
        status: 'submitted',
        submitted_date: format(new Date(), 'yyyy-MM-dd')
      });
      queryClient.invalidateQueries({ queryKey: ['gosiSubmissions'] });
      toast.success(isRTL ? 'تم إعادة الإرسال' : 'Resubmitted');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  };

  const columns = [
    { header: isRTL ? 'الفترة' : 'Period', accessorKey: 'period' },
    { header: isRTL ? 'النوع' : 'Type', cell: (row) => row.submission_type === 'monthly' ? (isRTL ? 'شهري' : 'Monthly') : (isRTL ? 'ربع سنوي' : 'Quarterly') },
    { header: isRTL ? 'عدد الموظفين' : 'Employees', accessorKey: 'employee_count' },
    { header: isRTL ? 'إجمالي الاشتراكات' : 'Total Contribution', cell: (row) => `${row.total_contribution?.toLocaleString()} ${t('sar')}` },
    { header: isRTL ? 'التاريخ' : 'Date', cell: (row) => row.generated_date ? format(new Date(row.generated_date), 'dd/MM/yyyy') : '-' },
    { header: t('status'), cell: (row) => {
      const colors = {
        draft: 'bg-slate-100 text-slate-700',
        submitted: 'bg-blue-100 text-blue-700',
        accepted: 'bg-emerald-100 text-emerald-700',
        rejected: 'bg-red-100 text-red-700'
      };
      const labels = {
        draft: isRTL ? 'مسودة' : 'Draft',
        submitted: isRTL ? 'مرسل' : 'Submitted',
        accepted: isRTL ? 'مقبول' : 'Accepted',
        rejected: isRTL ? 'مرفوض' : 'Rejected'
      };
      const icons = {
        draft: Clock,
        submitted: RefreshCw,
        accepted: CheckCircle,
        rejected: XCircle
      };
      const Icon = icons[row.status];
      return (
        <Badge className={`${colors[row.status]} flex items-center gap-1 w-fit`}>
          <Icon className="w-3 h-3" />
          {labels[row.status]}
        </Badge>
      );
    }},
    { header: t('actions'), cell: (row) => (
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => handleDownload(row)}>
          <Download className="w-4 h-4" />
        </Button>
        {row.status === 'draft' && (
          <Button size="sm" variant="ghost" onClick={() => handleSubmit(row)} disabled={submitting}>
            <Upload className="w-4 h-4" />
          </Button>
        )}
        {row.status === 'rejected' && (
          <Button size="sm" variant="ghost" onClick={() => handleRetry(row)}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        )}
      </div>
    )}
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{isRTL ? 'تقديمات GOSI' : 'GOSI Submissions'}</h2>
          <p className="text-slate-500">{isRTL ? 'إدارة ملفات التأمينات الاجتماعية' : 'Manage GOSI submission files'}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={async () => {
              try {
                const now = new Date();
                const blob = await callApi(
                  `/api/benchmarks/gosi-export?month=${now.getMonth() + 1}&year=${now.getFullYear()}`,
                  {}, { method: 'GET', responseType: 'blob' },
                );
                const url = URL.createObjectURL(blob);
                const a   = document.createElement('a');
                a.href     = url;
                a.download = `GOSI_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}.csv`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success(isRTL ? 'تم تحميل ملف GOSI CSV' : 'GOSI CSV downloaded');
              } catch {
                toast.error(isRTL ? 'فشل تحميل الملف' : 'Download failed');
              }
            }}
          >
            <Download className="w-4 h-4" />
            {isRTL ? 'تصدير CSV للبوابة' : 'Export CSV for Portal'}
          </Button>
          <Button onClick={() => setShowDialog(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            {isRTL ? 'إنشاء ملف جديد' : 'Generate New File'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-slate-500 mb-1">{isRTL ? 'موظفين GOSI' : 'GOSI Employees'}</div>
            <div className="text-2xl font-bold">{filteredEmployees.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-slate-500 mb-1">{isRTL ? 'ملفات معلقة' : 'Pending Submissions'}</div>
            <div className="text-2xl font-bold text-amber-600">{filteredSubmissions.filter(s => s.status === 'draft').length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-slate-500 mb-1">{isRTL ? 'ملفات مرسلة' : 'Submitted'}</div>
            <div className="text-2xl font-bold text-blue-600">{filteredSubmissions.filter(s => s.status === 'submitted').length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-slate-500 mb-1">{isRTL ? 'ملفات مقبولة' : 'Accepted'}</div>
            <div className="text-2xl font-bold text-emerald-600">{filteredSubmissions.filter(s => s.status === 'accepted').length}</div>
          </CardContent>
        </Card>
      </div>

      <DataTable columns={columns} data={filteredSubmissions} loading={isLoading} emptyMessage={t('noData')} />

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isRTL ? 'إنشاء ملف GOSI' : 'Generate GOSI File'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'الفترة' : 'Period'}</Label>
              <MonthPicker
                value={formData.period}
                onChange={(v) => setFormData(p => ({...p, period: v}))}
                isRTL={isRTL}
                placeholder={isRTL ? 'اختر الشهر' : 'Select month'}
              />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'النوع' : 'Type'}</Label>
              <select 
                className="w-full border rounded-md px-3 py-2"
                value={formData.type}
                onChange={(e) => setFormData(p => ({...p, type: e.target.value}))}
              >
                <option value="monthly">{isRTL ? 'شهري' : 'Monthly'}</option>
                <option value="quarterly">{isRTL ? 'ربع سنوي' : 'Quarterly'}</option>
              </select>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
              <p className="text-blue-900">
                {isRTL 
                  ? `سيتم إنشاء الملف لـ ${filteredEmployees.length} موظف مشمول بالتأمينات`
                  : `File will be generated for ${filteredEmployees.length} GOSI-eligible employees`
                }
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>{t('cancel')}</Button>
            <Button onClick={handleGenerateFile} disabled={generating}>
              {generating && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'إنشاء' : 'Generate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}