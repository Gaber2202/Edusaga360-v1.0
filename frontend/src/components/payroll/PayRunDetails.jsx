import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { createJournalEntry } from '../../api/journalEntry';
import { reportError } from '../../lib/errorReporter';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  ArrowLeft,
  X,
  Download,
  Loader2,
  Users,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RotateCcw
} from 'lucide-react';
import PayRunWorkflowStepper from './PayRunWorkflowStepper';
import PayRunValidations from './PayRunValidations';

export default function PayRunDetails({ payRun: initialPayRun, onBack }) {
  const { isRTL } = useLanguage();
  const queryClient = useQueryClient();

  // Local state for payRun so UI updates instantly after actions
  const [payRun, setPayRun] = useState(initialPayRun);
  const [processing, setProcessing] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAbortDialog, setShowAbortDialog] = useState(false);
  const [showRollbackDialog, setShowRollbackDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [abortReason, setAbortReason] = useState('');
  const [rollbackStage, setRollbackStage] = useState('');
  const [rollbackReason, setRollbackReason] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  const { data: payrollInputs = [], isLoading } = useQuery({
    queryKey: ['payrollInputs', payRun.id],
    queryFn: () => tenantQuery('payroll_inputs').select('*').match({ pay_run_id: payRun.id }),
  });

  const filteredInputs = payrollInputs.filter(p => 
    p.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.employee_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleStatusChange = async (newStatus) => {
    setProcessing(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const currentStage = payRun.workflow_stage || payRun.status;
      const updateData = { 
        status: newStatus,
        workflow_stage: newStatus,
        stage_history: [
          ...(payRun.stage_history || []),
          {
            from_stage: currentStage,
            to_stage: newStatus,
            action: 'advance',
            timestamp: new Date().toISOString(),
            done_by: user.email,
            notes: ''
          }
        ]
      };

      if (newStatus === 'calculated') {
        updateData.calculated_by = user.email;
        updateData.calculated_date = new Date().toISOString();
      } else if (newStatus === 'review') {
        updateData.attendance_locked = true;
        updateData.reviewed_by = user.email;
        updateData.reviewed_date = new Date().toISOString();
      } else if (newStatus === 'approved') {
        updateData.approved_by = user.email;
        updateData.approved_date = new Date().toISOString();
      } else if (newStatus === 'exported') {
        updateData.exported_by = user.email;
        updateData.exported_date = new Date().toISOString();
      } else if (newStatus === 'completed') {
        updateData.completed_by = user.email;
        updateData.completed_date = new Date().toISOString();
        updateData.posted_by = user.email;
        updateData.posted_date = format(new Date(), 'yyyy-MM-dd');
        updateData.is_posted_to_finance = true;
      }

      await tenantQuery('pay_runs').update(updateData);

      // Create payroll journal entry when completing
      if (newStatus === 'completed') {
        try {
          const grossTotal = summary.totalEarnings;
          const gosiEmployeeTotal = summary.totalGOSIEmployee;
          const gosiEmployerTotal = summary.totalGOSIEmployer;
          const netTotal = summary.netPayroll;
          const period = payRun.period || `${payRun.period_month}/${payRun.period_year}`;

          const jeLines = [
            { line_number: 1, account_code: '6000', account_name: 'Salary Expense', debit: grossTotal, credit: 0, description: `Gross Salaries - ${period}` },
            { line_number: 2, account_code: '6010', account_name: 'GOSI Employer Expense', debit: gosiEmployerTotal, credit: 0, description: `GOSI Employer - ${period}` },
            { line_number: 3, account_code: '2100', account_name: 'Salaries Payable', debit: 0, credit: netTotal, description: `Net Payroll - ${period}` },
            { line_number: 4, account_code: '2200', account_name: 'GOSI Payable', debit: 0, credit: gosiEmployeeTotal + gosiEmployerTotal, description: `GOSI Payable - ${period}` },
          ];

          const je = await createJournalEntry({
            journal_type: 'payments',
            branch_id: payRun.branch_id || 'all',
            date: updateData.posted_date,
            reference: payRun.pay_run_number,
            description: `Payroll - ${period} - ${payRun.branch_name || ''}`,
            lines: jeLines,
            source_document_type: 'PayRun',
            source_document_id: payRun.id,
            requested_status: 'approved',
          });

          await tenantQuery('pay_runs').update({ journal_entry_id: je.id });
          setPayRun(prev => ({ ...prev, journal_entry_id: je.id }));
        } catch (jeErr) {
          reportError({
            error: jeErr,
            module: 'payroll',
            action: 'create_payrun_journal_entry',
            severity: 'high',
            context: { pay_run_id: payRun.id, pay_run_number: payRun.pay_run_number },
          });
        }
      }

      // Update local state immediately so UI reflects change without going back
      setPayRun(prev => ({ ...prev, ...updateData }));
      queryClient.invalidateQueries({ queryKey: ['payRuns'] });
      queryClient.invalidateQueries({ queryKey: ['payrollInputs'] });
      
      const statusMessages = {
        calculated: isRTL ? 'تم الإعداد' : 'Calculated',
        review: isRTL ? 'تم إرسال للمراجعة' : 'Sent for review',
        approved: isRTL ? 'تم الاعتماد' : 'Approved',
        exported: isRTL ? 'تم التصدير' : 'Exported',
        completed: isRTL ? 'تم الإكمال' : 'Completed'
      };
      toast.success(statusMessages[newStatus]);
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setProcessing(false);
    }
  };

  const handleAbort = async () => {
    if (!abortReason.trim()) {
      toast.error(isRTL ? 'يرجى إدخال السبب' : 'Please enter reason');
      return;
    }

    setProcessing(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      await tenantQuery('pay_runs').update({
        status: 'aborted',
        workflow_stage: 'aborted',
        abort_reason: abortReason,
        aborted_by: user.email,
        aborted_date: new Date().toISOString(),
        stage_history: [
          ...(payRun.stage_history || []),
          {
            from_stage: payRun.workflow_stage || payRun.status,
            to_stage: 'aborted',
            action: 'abort',
            timestamp: new Date().toISOString(),
            done_by: user.email,
            reason: abortReason
          }
        ]
      });

      // Update local state immediately
      setPayRun(prev => ({ ...prev, status: 'aborted', workflow_stage: 'aborted', abort_reason: abortReason }));
      queryClient.invalidateQueries({ queryKey: ['payRuns'] });
      setShowAbortDialog(false);
      setAbortReason('');
      toast.success(isRTL ? 'تم إلغاء مسير الرواتب' : 'Pay run aborted');
    } catch (error) {
      toast.error(isRTL ? `حدث خطأ: ${error?.message || 'خطأ غير معروف'}` : `Error: ${error?.message || 'Unknown error'}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleRollback = async () => {
    if (!rollbackStage || !rollbackReason.trim()) {
      toast.error(isRTL ? 'يرجى اختيار المرحلة وإدخال السبب' : 'Please select stage and enter reason');
      return;
    }

    // Check if trying to rollback from completed with finance posting
    if ((payRun.workflow_stage === 'completed' || payRun.status === 'completed') && payRun.is_posted_to_finance) {
      toast.error(isRTL 
        ? 'لا يمكن الرجوع - تم الترحيل للمالية. يجب إجراء عكس القيد'
        : 'Cannot rollback - posted to finance. Reversal required');
      return;
    }

    setProcessing(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      await tenantQuery('pay_runs').update({
        status: rollbackStage,
        workflow_stage: rollbackStage,
        stage_history: [
          ...(payRun.stage_history || []),
          {
            from_stage: payRun.workflow_stage || payRun.status,
            to_stage: rollbackStage,
            action: 'rollback',
            timestamp: new Date().toISOString(),
            done_by: user.email,
            reason: rollbackReason
          }
        ]
      });

      // Update local state immediately
      setPayRun(prev => ({ ...prev, status: rollbackStage, workflow_stage: rollbackStage }));
      queryClient.invalidateQueries({ queryKey: ['payRuns'] });
      setShowRollbackDialog(false);
      setRollbackStage('');
      setRollbackReason('');
      toast.success(isRTL ? 'تم الرجوع للمرحلة السابقة' : 'Rolled back successfully');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error(isRTL ? 'يرجى إدخال سبب الرفض' : 'Please enter rejection reason');
      return;
    }

    setProcessing(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const previousStage = payRun.workflow_stage === 'review' ? 'calculated' : 'review';
      
      await tenantQuery('pay_runs').update({
        status: previousStage,
        workflow_stage: previousStage,
        rejection_reason: rejectReason,
        rejected_by: user.email,
        rejected_date: new Date().toISOString(),
        stage_history: [
          ...(payRun.stage_history || []),
          {
            from_stage: payRun.workflow_stage || payRun.status,
            to_stage: previousStage,
            action: 'reject',
            timestamp: new Date().toISOString(),
            done_by: user.email,
            reason: rejectReason
          }
        ]
      });

      // Update local state immediately
      setPayRun(prev => ({ ...prev, status: previousStage, workflow_stage: previousStage }));
      queryClient.invalidateQueries({ queryKey: ['payRuns'] });
      setShowRejectDialog(false);
      setRejectReason('');
      toast.success(isRTL ? 'تم رفض الاعتماد وإعادته للمرحلة السابقة' : 'Rejected and returned to previous stage');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setProcessing(false);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Employee ID', 'Name', 'Basic', 'Housing', 'Transport', 'Other', 'Gross', 'GOSI', 'Deductions', 'Net', 'IBAN'];
    const rows = filteredInputs.map(p => [
      p.employee_number,
      p.employee_name,
      p.basic_salary,
      p.housing_allowance,
      p.transport_allowance,
      p.other_allowances,
      p.gross_salary,
      p.gosi_employee,
      p.total_deductions,
      p.net_salary,
      p.iban
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payroll_${payRun.period}_${payRun.branch_name}.csv`;
    link.click();
    toast.success(isRTL ? 'تم التصدير' : 'Exported');
  };

  const _statusColors = {
    draft: 'bg-slate-100 text-slate-700',
    calculated: 'bg-blue-100 text-blue-700',
    review: 'bg-amber-100 text-amber-700',
    approved: 'bg-purple-100 text-purple-700',
    exported: 'bg-indigo-100 text-indigo-700',
    completed: 'bg-emerald-100 text-emerald-700',
    aborted: 'bg-red-100 text-red-700'
  };

  const statusLabels = {
    draft: { ar: 'مسودة', en: 'Draft' },
    calculated: { ar: 'تم الإعداد', en: 'Calculated' },
    review: { ar: 'قيد المراجعة', en: 'Review' },
    approved: { ar: 'معتمد', en: 'Approved' },
    exported: { ar: 'تم التصدير', en: 'Exported' },
    completed: { ar: 'مكتمل', en: 'Completed' },
    aborted: { ar: 'ملغي', en: 'Aborted' }
  };

  const getNextStatus = () => {
    const statusFlow = ['draft', 'calculated', 'review', 'approved', 'exported', 'completed'];
    const currentStage = payRun.workflow_stage || payRun.status;
    const currentIndex = statusFlow.indexOf(currentStage);
    return currentIndex < statusFlow.length - 1 ? statusFlow[currentIndex + 1] : null;
  };

  const getPreviousStages = () => {
    const statusFlow = ['draft', 'calculated', 'review', 'approved', 'exported', 'completed'];
    const currentStage = payRun.workflow_stage || payRun.status;
    const currentIndex = statusFlow.indexOf(currentStage);
    return statusFlow.slice(0, currentIndex);
  };

  const nextStatus = getNextStatus();
  const previousStages = getPreviousStages();
  const isAborted = payRun.status === 'aborted' || payRun.workflow_stage === 'aborted';

  const actionLabels = {
    calculated: { ar: 'إعداد الحسابات', en: 'Calculate' },
    review: { ar: 'إرسال للمراجعة', en: 'Submit for Review' },
    approved: { ar: 'اعتماد', en: 'Approve' },
    exported: { ar: 'تصدير للبنك', en: 'Export to Bank' },
    completed: { ar: 'إكمال وترحيل', en: 'Complete & Post' }
  };

  // Calculate summary
  const summary = {
    employees: payrollInputs.length,
    saudis: payrollInputs.filter(p => p.is_saudi).length,
    nonSaudis: payrollInputs.filter(p => !p.is_saudi).length,
    totalEarnings: payrollInputs.reduce((sum, p) => sum + (p.gross_salary || 0), 0),
    totalGOSIEmployee: payrollInputs.reduce((sum, p) => sum + (p.gosi_employee || 0), 0),
    totalGOSIEmployer: payrollInputs.reduce((sum, p) => sum + (p.gosi_employer || 0), 0),
    totalDeductions: payrollInputs.reduce((sum, p) => sum + (p.total_deductions || 0), 0),
    netPayroll: payrollInputs.reduce((sum, p) => sum + (p.net_salary || 0), 0),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 me-2" />
            {isRTL ? 'رجوع' : 'Back'}
          </Button>
          <div>
            <h2 className="text-xl font-semibold">{payRun.pay_run_number}</h2>
            <p className="text-sm text-slate-500">{payRun.period} • {payRun.branch_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isAborted && previousStages.length > 0 && (
            <Button variant="outline" onClick={() => setShowRollbackDialog(true)} disabled={processing}>
              <RotateCcw className="w-4 h-4 me-2" />
              {isRTL ? 'الرجوع لمرحلة' : 'Return to Stage'}
            </Button>
          )}
          {!isAborted && (payRun.workflow_stage === 'review' || payRun.workflow_stage === 'approved') && (
            <Button variant="outline" onClick={() => setShowRejectDialog(true)} disabled={processing} className="text-red-600 border-red-200 hover:bg-red-50">
              <X className="w-4 h-4 me-2" />
              {isRTL ? 'رفض' : 'Reject'}
            </Button>
          )}
          {!isAborted && payRun.workflow_stage !== 'completed' && (
            <Button variant="outline" onClick={() => setShowAbortDialog(true)} disabled={processing} className="text-red-600 border-red-200 hover:bg-red-50">
              <XCircle className="w-4 h-4 me-2" />
              {isRTL ? 'إلغاء المسير' : 'Abort Pay Run'}
            </Button>
          )}
          <Button variant="outline" onClick={handleExportCSV} disabled={isAborted}>
            <Download className="w-4 h-4 me-2" />
            {isRTL ? 'تصدير' : 'Export'}
          </Button>
          {nextStatus && !isAborted && (
            <Button onClick={() => handleStatusChange(nextStatus)} disabled={processing} className="bg-blue-600 hover:bg-blue-700">
              {processing && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              <CheckCircle2 className="w-4 h-4 me-2" />
              {isRTL ? actionLabels[nextStatus]?.ar : actionLabels[nextStatus]?.en}
            </Button>
          )}
        </div>
      </div>

      {/* Workflow Stepper */}
      <PayRunWorkflowStepper payRun={payRun} />

      {/* Validations */}
      <PayRunValidations payrollInputs={payrollInputs} />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="bg-white">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">{isRTL ? 'الموظفين' : 'Employees'}</p>
            <p className="text-xl font-bold mt-1">{summary.employees}</p>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">{isRTL ? 'سعودي / غير سعودي' : 'Saudi / Non'}</p>
            <p className="text-xl font-bold mt-1">{summary.saudis} / {summary.nonSaudis}</p>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">{isRTL ? 'إجمالي المكتسبات' : 'Total Earnings'}</p>
            <p className="text-xl font-bold mt-1">{(summary.totalEarnings / 1000).toFixed(1)}K</p>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">{isRTL ? 'تأمينات الموظف' : 'GOSI Employee'}</p>
            <p className="text-xl font-bold mt-1 text-red-600">{(summary.totalGOSIEmployee / 1000).toFixed(1)}K</p>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">{isRTL ? 'تأمينات صاحب العمل' : 'GOSI Employer'}</p>
            <p className="text-xl font-bold mt-1 text-amber-600">{(summary.totalGOSIEmployer / 1000).toFixed(1)}K</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50">
          <CardContent className="p-4">
            <p className="text-xs text-emerald-700">{isRTL ? 'صافي الرواتب' : 'Net Payroll'}</p>
            <p className="text-xl font-bold mt-1 text-emerald-700">{(summary.netPayroll / 1000).toFixed(1)}K</p>
          </CardContent>
        </Card>
      </div>

      {/* Payroll Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>{isRTL ? 'تفاصيل الرواتب' : 'Payroll Details'}</CardTitle>
            <Input 
              placeholder={isRTL ? 'بحث...' : 'Search...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold">{isRTL ? 'الموظف' : 'Employee'}</TableHead>
                  <TableHead className="text-center">{isRTL ? 'الأساسي' : 'Basic'}</TableHead>
                  <TableHead className="text-center">{isRTL ? 'السكن' : 'Housing'}</TableHead>
                  <TableHead className="text-center">{isRTL ? 'النقل' : 'Transport'}</TableHead>
                  <TableHead className="text-center">{isRTL ? 'أخرى' : 'Other'}</TableHead>
                  <TableHead className="text-center">{isRTL ? 'الإجمالي' : 'Gross'}</TableHead>
                  <TableHead className="text-center">{isRTL ? 'تأمينات' : 'GOSI'}</TableHead>
                  <TableHead className="text-center">{isRTL ? 'استقطاعات' : 'Deductions'}</TableHead>
                  <TableHead className="text-center font-semibold">{isRTL ? 'الصافي' : 'Net'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                    </TableCell>
                  </TableRow>
                ) : filteredInputs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-slate-400">
                      {isRTL ? 'لا توجد بيانات' : 'No data'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInputs.map(input => (
                    <TableRow key={input.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedRow(input)}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{input.employee_name}</p>
                          <p className="text-xs text-slate-500">{input.employee_number} • {input.job_title}</p>
                          {!input.iban && (
                            <span className="inline-flex items-center gap-1 text-xs text-red-600 mt-1">
                              <AlertTriangle className="w-3 h-3" />{isRTL ? 'IBAN مفقود' : 'IBAN missing'}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{(input.basic_salary || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-center">{(input.housing_allowance || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-center">{(input.transport_allowance || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-center">{(input.other_allowances || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-center font-medium">{(input.gross_salary || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-center text-red-600">{(input.gosi_employee || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-center text-red-600">{(input.total_deductions || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-center font-bold text-emerald-600">{(input.net_salary || 0).toLocaleString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Employee Salary Drill-down Dialog */}
      {selectedRow && (
        <Dialog open={!!selectedRow} onOpenChange={() => setSelectedRow(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                {selectedRow.employee_name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p className="text-xs text-slate-400">{selectedRow.employee_number} • {selectedRow.job_title}</p>

              {/* Earnings */}
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 space-y-2">
                <p className="font-semibold text-slate-700 text-xs uppercase tracking-wide">{isRTL ? 'المكتسبات' : 'Earnings'}</p>
                {[
                  { label: isRTL ? 'الراتب الأساسي' : 'Basic Salary', value: selectedRow.basic_salary },
                  { label: isRTL ? 'بدل السكن' : 'Housing Allowance', value: selectedRow.housing_allowance },
                  { label: isRTL ? 'بدل النقل' : 'Transport Allowance', value: selectedRow.transport_allowance },
                  { label: isRTL ? 'بدلات أخرى' : 'Other Allowances', value: selectedRow.other_allowances },
                ].map((item, i) => item.value > 0 && (
                  <div key={i} className="flex justify-between">
                    <span className="text-slate-600">{item.label}</span>
                    <span className="font-medium">{(item.value || 0).toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</span>
                  </div>
                ))}
                <div className="flex justify-between font-semibold border-t pt-2 text-blue-700">
                  <span>{isRTL ? 'الإجمالي' : 'Gross'}</span>
                  <span>{(selectedRow.gross_salary || 0).toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</span>
                </div>
              </div>

              {/* Deductions */}
              <div className="bg-red-50 rounded-lg p-3 border border-red-100 space-y-2">
                <p className="font-semibold text-red-700 text-xs uppercase tracking-wide">{isRTL ? 'الاستقطاعات' : 'Deductions'}</p>
                {selectedRow.gosi_employee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">{isRTL ? 'تأمينات الموظف (9.75%)' : 'GOSI Employee (9.75%)'}</span>
                    <span className="text-red-600 font-medium">{(selectedRow.gosi_employee || 0).toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</span>
                  </div>
                )}
                {(selectedRow.total_deductions || 0) - (selectedRow.gosi_employee || 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">{isRTL ? 'استقطاعات أخرى' : 'Other Deductions'}</span>
                    <span className="text-red-600 font-medium">{((selectedRow.total_deductions || 0) - (selectedRow.gosi_employee || 0)).toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t pt-2 text-red-700">
                  <span>{isRTL ? 'إجمالي الاستقطاعات' : 'Total Deductions'}</span>
                  <span>{(selectedRow.total_deductions || 0).toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</span>
                </div>
              </div>

              {/* Net */}
              <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200 flex justify-between items-center">
                <span className="font-bold text-emerald-800 text-base">{isRTL ? 'صافي الراتب' : 'Net Salary'}</span>
                <span className="text-2xl font-bold text-emerald-700">{(selectedRow.net_salary || 0).toLocaleString()} <span className="text-sm font-normal">{isRTL ? 'ر.س' : 'SAR'}</span></span>
              </div>

              {/* Employer GOSI */}
              {selectedRow.gosi_employer > 0 && (
                <div className="bg-amber-50 rounded-lg p-3 border border-amber-200 text-xs">
                  <p className="text-amber-800 font-semibold mb-1">{isRTL ? 'تكلفة صاحب العمل' : 'Employer Cost'}</p>
                  <div className="flex justify-between">
                    <span>{isRTL ? 'تأمينات صاحب العمل' : 'GOSI Employer'}</span>
                    <span className="font-medium">{(selectedRow.gosi_employer || 0).toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</span>
                  </div>
                </div>
              )}

              {/* Bank Info */}
              <div className={`rounded-lg p-3 border text-xs ${selectedRow.iban ? 'bg-slate-50 border-slate-200' : 'bg-red-50 border-red-200'}`}>
                <p className="font-semibold text-slate-700 mb-1">{isRTL ? 'معلومات التحويل البنكي' : 'Bank Transfer Info'}</p>
                {selectedRow.bank_name && <p>{isRTL ? 'البنك:' : 'Bank:'} {selectedRow.bank_name}</p>}
                {selectedRow.iban
                  ? <p className="font-mono mt-1">{isRTL ? 'IBAN:' : 'IBAN:'} {selectedRow.iban}</p>
                  : <p className="text-red-600 flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3" />{isRTL ? 'IBAN غير محدد — سيُستبعد من تصدير البنك' : 'No IBAN — will be excluded from bank export'}</p>
                }
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Abort Dialog */}
      <Dialog open={showAbortDialog} onOpenChange={setShowAbortDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">{isRTL ? 'إلغاء مسير الرواتب' : 'Abort Pay Run'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-red-50 border border-red-200 p-3 rounded-lg">
              <p className="text-sm text-red-800">
                {isRTL 
                  ? 'تحذير: سيتم إلغاء مسير الرواتب بالكامل ولن يمكن استكماله. البيانات ستبقى محفوظة للمراجعة.'
                  : 'Warning: This will abort the entire pay run. It cannot be resumed. Data will be preserved for audit.'}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'سبب الإلغاء' : 'Reason for Aborting'} *</Label>
              <Textarea 
                value={abortReason}
                onChange={(e) => setAbortReason(e.target.value)}
                rows={3}
                placeholder={isRTL ? 'اكتب السبب...' : 'Enter reason...'}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAbortDialog(false)}>
              {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleAbort} disabled={processing} className="bg-red-600 hover:bg-red-700">
              {processing && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              <XCircle className="w-4 h-4 me-2" />
              {isRTL ? 'تأكيد الإلغاء' : 'Confirm Abort'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rollback Dialog */}
      <Dialog open={showRollbackDialog} onOpenChange={setShowRollbackDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'الرجوع لمرحلة سابقة' : 'Return to Previous Stage'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {payRun.is_posted_to_finance && (
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  {isRTL 
                    ? 'تحذير: تم الترحيل للمالية. يجب إجراء عكس القيد أولاً.'
                    : 'Warning: Posted to finance. Reversal required first.'}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>{isRTL ? 'اختر المرحلة' : 'Select Stage'} *</Label>
              <Select value={rollbackStage} onValueChange={setRollbackStage}>
                <SelectTrigger>
                  <SelectValue placeholder={isRTL ? 'اختر المرحلة...' : 'Select stage...'} />
                </SelectTrigger>
                <SelectContent>
                  {previousStages.map(stage => (
                    <SelectItem key={stage} value={stage}>
                      {isRTL ? statusLabels[stage]?.ar : statusLabels[stage]?.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'سبب الرجوع' : 'Reason for Rollback'} *</Label>
              <Textarea 
                value={rollbackReason}
                onChange={(e) => setRollbackReason(e.target.value)}
                rows={3}
                placeholder={isRTL ? 'اكتب السبب...' : 'Enter reason...'}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRollbackDialog(false)}>
              {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleRollback} disabled={processing || payRun.is_posted_to_finance} className="bg-amber-600 hover:bg-amber-700">
              {processing && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              <RotateCcw className="w-4 h-4 me-2" />
              {isRTL ? 'تأكيد الرجوع' : 'Confirm Rollback'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">{isRTL ? 'رفض الاعتماد' : 'Reject Approval'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
              <p className="text-sm text-amber-800">
                {isRTL 
                  ? 'سيتم إرجاع مسير الرواتب للمرحلة السابقة للمراجعة والتصحيح'
                  : 'Pay run will be returned to previous stage for review and correction'}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'سبب الرفض' : 'Rejection Reason'} *</Label>
              <Textarea 
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder={isRTL ? 'اكتب السبب...' : 'Enter reason...'}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleReject} disabled={processing} className="bg-red-600 hover:bg-red-700">
              {processing && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              <X className="w-4 h-4 me-2" />
              {isRTL ? 'تأكيد الرفض' : 'Confirm Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}