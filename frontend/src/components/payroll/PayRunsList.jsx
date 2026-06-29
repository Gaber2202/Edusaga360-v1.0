import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useBranch } from '../BranchContext';
import { useRole } from '../RoleContext';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import MonthPicker from '../ui/MonthPicker';
import {
  Plus,
  Eye,
  Loader2,
  Calendar,
  Users,
  DollarSign,
  AlertTriangle
} from 'lucide-react';
import { logAuditEvent, AuditActions } from '../AuditService';

export default function PayRunsList({ onViewPayRun }) {
  const { isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch: _filterByBranch, branchFilter, branches } = useBranch();
  const { user: currentUser, userRole } = useRole();
  const queryClient = useQueryClient();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newPayRun, setNewPayRun] = useState({
    period: format(new Date(), 'yyyy-MM'),
    branch_id: selectedBranchId || ''
  });
  const [creating, setCreating] = useState(false);

  // Update branch_id when selectedBranchId changes or dialog opens
  React.useEffect(() => {
    if (showCreateDialog && selectedBranchId) {
      setNewPayRun(prev => ({...prev, branch_id: selectedBranchId}));
    }
  }, [showCreateDialog, selectedBranchId]);

  const { data: payRuns = [], isLoading } = useQuery({
    queryKey: ['payRuns', selectedBranchId],
    queryFn: () => fetchData(tenantQuery('pay_runs').select('*').match(branchFilter()).order('created_at', { ascending: false })),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => fetchData(tenantQuery('employees').select('*').order()), // fetch ALL - filter client-side with fallback
  });

  const filteredPayRuns = selectedBranchId 
    ? payRuns.filter(p => p.branch_id === selectedBranchId)
    : payRuns;

  const handleCreatePayRun = async () => {
    // Only HR admin roles may create pay runs
    if (!['admin', 'hr_head', 'hr_admin'].includes(currentUser?.role || userRole)) {
      toast.error(isRTL ? 'ليس لديك صلاحية لإنشاء مسير الرواتب' : 'You do not have permission to create a pay run');
      return;
    }
    setCreating(true);
    try {
      const isAllBranches = !newPayRun.branch_id;
      const branch = branches.find(b => b.id === newPayRun.branch_id);
      // Include all active employees; filter by branch only if a specific branch is selected
      const activeEmployees = employees.filter(e => e.status === 'active' || !e.status);
      const branchEmployees = isAllBranches
        ? activeEmployees
        : activeEmployees.filter(e => !e.branch_id || e.branch_id === newPayRun.branch_id);
      
      // Check if pay run already exists. The cached `payRuns` is restricted to the
      // globally-selected branch, so query the server directly for the target branch
      // the user picked in the dialog (may differ from selectedBranchId).
      const targetBranchId = newPayRun.branch_id || 'all';
      const { data: existingForTarget = [] } = await tenantQuery('pay_runs').select('*').match({
        period: newPayRun.period,
        branch_id: targetBranchId,
      });
      if (existingForTarget && existingForTarget.length > 0) {
        toast.error(isRTL ? 'كشف الرواتب موجود مسبقاً لهذا الشهر' : 'Pay run already exists for this period');
        setCreating(false);
        return;
      }

      // Calculate totals
      let totalBasic = 0, totalHousing = 0, totalTransport = 0, totalOther = 0;
      let saudiCount = 0, nonSaudiCount = 0;

      branchEmployees.forEach(emp => {
        totalBasic += emp.basic_salary || 0;
        totalHousing += emp.housing_allowance || 0;
        totalTransport += emp.transport_allowance || 0;
        totalOther += emp.other_allowances || 0;
        const isSaudi = emp.is_saudi || emp.nationality === 'Saudi' || emp.nationality === 'سعودي';
        if (isSaudi) {
          saudiCount++;
        } else {
          nonSaudiCount++;
        }
      });

      const totalEarnings = totalBasic + totalHousing + totalTransport + totalOther;

      const user = await supabase.auth.getUser().then(r => r.data?.user);
      
      // Create pay run
      const payRun = await tenantQuery('pay_runs').insert({
        pay_run_number: `PR-${newPayRun.period.replace('-', '')}-${branch?.code || (isAllBranches ? 'ALL' : 'BR')}`,
        period: newPayRun.period,
        period_start: format(startOfMonth(new Date(newPayRun.period + '-01')), 'yyyy-MM-dd'),
        period_end: format(endOfMonth(new Date(newPayRun.period + '-01')), 'yyyy-MM-dd'),
        branch_id: newPayRun.branch_id || 'all',
        branch_name: isAllBranches ? (isRTL ? 'جميع الفروع' : 'All Branches') : (isRTL ? branch?.name_ar : branch?.name_en || branch?.name_ar),
        company_id: branch?.company_id,
        employee_count: branchEmployees.length,
        saudi_count: saudiCount,
        non_saudi_count: nonSaudiCount,
        total_basic: totalBasic,
        total_housing: totalHousing,
        total_transport: totalTransport,
        total_other_allowances: totalOther,
        total_earnings: totalEarnings,
        net_payroll: totalEarnings,
        status: 'draft',
        workflow_stage: 'draft',
        stage_history: [{
          from_stage: null,
          to_stage: 'draft',
          action: 'advance',
          timestamp: new Date().toISOString(),
          done_by: user.email,
          notes: 'Pay run created'
        }]
      });

      // Create payroll inputs for each employee
      const inputs = branchEmployees.map(emp => {
        const isSaudi = emp.is_saudi || emp.nationality === 'Saudi' || emp.nationality === 'سعودي';
        const grossSalary = (emp.basic_salary || 0) + (emp.housing_allowance || 0) + 
                          (emp.transport_allowance || 0) + (emp.other_allowances || 0);
        const gosiWage = Math.min((emp.basic_salary || 0) + (emp.housing_allowance || 0), 45000);
        const gosiEmployee = isSaudi ? gosiWage * 0.0975 : 0;
        const gosiEmployer = isSaudi ? gosiWage * 0.1175 : gosiWage * 0.02;

        return {
          pay_run_id: payRun.id,
          period: newPayRun.period,
          employee_id: emp.id,
          employee_name: emp.name_ar,
          employee_number: emp.employee_id,
          branch_id: emp.branch_id,
          department_id: emp.department_id,
          job_title: emp.job_title_name,
          is_saudi: isSaudi,
          basic_salary: emp.basic_salary || 0,
          housing_allowance: emp.housing_allowance || 0,
          transport_allowance: emp.transport_allowance || 0,
          other_allowances: emp.other_allowances || 0,
          gross_salary: grossSalary,
          gosi_employee: gosiEmployee,
          gosi_employer: gosiEmployer,
          gosi_wage: gosiWage,
          total_deductions: gosiEmployee,
          net_salary: grossSalary - gosiEmployee,
          bank_name: emp.bank_name,
          iban: emp.iban,
          status: 'draft'
        };
      });

      await supabase.PayrollInput.bulkCreate(inputs);

      // Update pay run with GOSI totals
      const totalGosiEmployee = inputs.reduce((sum, i) => sum + i.gosi_employee, 0);
      const totalGosiEmployer = inputs.reduce((sum, i) => sum + i.gosi_employer, 0);
      const netPayroll = inputs.reduce((sum, i) => sum + i.net_salary, 0);

      await tenantQuery('pay_runs').update({
        total_gosi_employee: totalGosiEmployee,
        total_gosi_employer: totalGosiEmployer,
        total_deductions: totalGosiEmployee,
        net_payroll: netPayroll
      });

      await queryClient.invalidateQueries({ queryKey: ['payRuns'] });
      await queryClient.invalidateQueries({ queryKey: ['payrollInputs'] });
      
      logAuditEvent({ action: AuditActions.PAYROLL_RUN, entityType: 'PayRun', entityId: payRun.id, newValues: { period: newPayRun.period, branch_id: newPayRun.branch_id } });
      toast.success(isRTL ? `تم إنشاء كشف الرواتب لـ ${branchEmployees.length} موظف` : `Pay run created for ${branchEmployees.length} employees`);
      
      setShowCreateDialog(false);
      
      // Navigate to the pay run details after creation
      setTimeout(() => {
        const updatedPayRun = {
          ...payRun,
          total_gosi_employee: totalGosiEmployee,
          total_gosi_employer: totalGosiEmployer,
          total_deductions: totalGosiEmployee,
          net_payroll: netPayroll
        };
        onViewPayRun(updatedPayRun);
      }, 500);
    } catch (error) {
      toast.error(isRTL ? `حدث خطأ: ${error?.message || 'خطأ غير معروف'}` : `Error: ${error?.message || 'Unknown error'}`);
    } finally {
      setCreating(false);
    }
  };

  const statusColors = {
    draft: 'bg-sand-alt text-ink',
    calculated: 'bg-najdi-50 text-najdi-900',
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">{isRTL ? 'كشوفات الرواتب' : 'Pay Runs'}</h2>
          <p className="text-sm text-muted-foreground">{isRTL ? 'إدارة دورات الرواتب الشهرية' : 'Manage monthly payroll cycles'}</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 me-2" />
          {isRTL ? 'كشف رواتب جديد' : 'New Pay Run'}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredPayRuns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 bg-sand-alt rounded-full flex items-center justify-center mb-4">
            <Calendar className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground font-medium">{isRTL ? 'لا توجد كشوفات رواتب' : 'No pay runs yet'}</p>
          <p className="text-sm text-muted-foreground mt-1">{isRTL ? 'أنشئ كشف رواتب جديداً للبدء' : 'Create a new pay run to get started'}</p>
          <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 me-2" />
            {isRTL ? 'كشف رواتب جديد' : 'New Pay Run'}
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredPayRuns.map(run => {
            const stage = run.workflow_stage || run.status;
            return (
              <div
                key={run.id}
                onClick={() => onViewPayRun(run)}
                className="bg-white border border-border rounded-xl p-5 hover:border-najdi-100 hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-najdi-50 flex items-center justify-center flex-shrink-0">
                      <DollarSign className="w-6 h-6 text-najdi-700" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-ink">{run.pay_run_number || run.period}</p>
                        <Badge className={`text-xs ${statusColors[stage]}`}>
                          {isRTL ? statusLabels[stage]?.ar : statusLabels[stage]?.en}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{run.branch_name} • {run.period}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="text-center hidden md:block">
                      <p className="text-xs text-muted-foreground">{isRTL ? 'الموظفون' : 'Employees'}</p>
                      <div className="flex items-center gap-1 justify-center mt-0.5">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span className="font-semibold text-ink">{run.employee_count || 0}</span>
                      </div>
                    </div>
                    <div className="text-center hidden lg:block">
                      <p className="text-xs text-muted-foreground">{isRTL ? 'الإجمالي' : 'Gross'}</p>
                      <p className="font-semibold text-ink mt-0.5">{(run.total_earnings || 0).toLocaleString()} <span className="text-xs font-normal text-muted-foreground">{isRTL ? 'ر.س' : 'SAR'}</span></p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">{isRTL ? 'الصافي' : 'Net'}</p>
                      <p className="font-bold text-emerald-600 mt-0.5">{(run.net_payroll || 0).toLocaleString()} <span className="text-xs font-normal text-muted-foreground">{isRTL ? 'ر.س' : 'SAR'}</span></p>
                    </div>
                    <Eye className="w-5 h-5 text-muted-foreground group-hover:text-najdi-500 transition-colors" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'إنشاء كشف رواتب جديد' : 'Create New Pay Run'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'الفترة' : 'Period'}</Label>
              <MonthPicker
                value={newPayRun.period}
                onChange={(v) => setNewPayRun({...newPayRun, period: v})}
                isRTL={isRTL}
                placeholder={isRTL ? 'اختر شهر الراتب' : 'Select payroll month'}
              />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الفرع' : 'Branch'}</Label>
              <Select value={newPayRun.branch_id} onValueChange={(v) => setNewPayRun({...newPayRun, branch_id: v === 'all' ? '' : v})}>
                <SelectTrigger>
                  <SelectValue placeholder={isRTL ? 'اختر الفرع' : 'Select branch'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isRTL ? '— الكل (جميع الفروع) —' : '— All Branches —'}</SelectItem>
                  {branches.map(branch => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {isRTL ? branch.name_ar : branch.name_en || branch.name_ar}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(() => {
              const isAllBranches = !newPayRun.branch_id || newPayRun.branch_id === '';
              const activeAll = employees.filter(e => e.status === 'active' || !e.status);
              const matched = isAllBranches
                ? activeAll
                : activeAll.filter(e => !e.branch_id || e.branch_id === newPayRun.branch_id);
              const missingBank = matched.filter(e => !e.iban && !e.bank_name);
              const missingSalary = matched.filter(e => !e.basic_salary);
              const missingAny = [...new Set([...missingBank, ...missingSalary].map(e => e.id))].length;
              return (
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex justify-between items-center">
                      <p className="text-sm text-muted-foreground">{isRTL ? 'الموظفون المؤهلون' : 'Eligible Employees'}</p>
                      <p className="text-2xl font-bold text-emerald-500">{matched.length}</p>
                    </div>
                    {matched.length === 0 && (
                      <div className="flex items-start gap-2 bg-red-900/20 border border-red-700 rounded p-2">
                        <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-red-400">
                          {isRTL ? 'لا يوجد موظفون نشطون في هذا الفرع' : 'No active employees found for this scope'}
                        </p>
                      </div>
                    )}
                    {missingAny > 0 && (
                      <div className="flex items-start gap-2 bg-amber-900/20 border border-amber-700 rounded p-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-300">
                          {isRTL
                            ? `${missingAny} موظف ناقص إعداد (راتب أساسي أو بنك). سيُضمَّن بقيم صفر.`
                            : `${missingAny} employee(s) missing payroll setup (salary/bank). Included with 0.`}
                        </p>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">{isRTL ? 'سيتم تضمينهم جميعاً في كشف الرواتب' : 'All will be included in pay run'}</p>
                  </CardContent>
                </Card>
              );
            })()}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleCreatePayRun} disabled={creating}>
              {creating && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'إنشاء' : 'Create'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}