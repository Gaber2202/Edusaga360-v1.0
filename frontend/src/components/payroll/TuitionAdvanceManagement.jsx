import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useBranch } from '../BranchContext';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Progress } from '../ui/progress';
import { toast } from 'sonner';
import { format, addMonths } from 'date-fns';
import {
  Plus,
  GraduationCap,
  Check,
  X,
  Loader2,
  DollarSign,
  School
} from 'lucide-react';

export default function TuitionAdvanceManagement() {
  const { isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter, branches: _branches } = useBranch();
  const queryClient = useQueryClient();

  const [showNewAdvance, setShowNewAdvance] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [processing, setProcessing] = useState(false);

  const [newAdvance, setNewAdvance] = useState({
    employee_id: '',
    student_id: '',
    academic_year: '2024-2025',
    advance_amount: '',
    installment_plan: '10_months',
    start_period: format(addMonths(new Date(), 1), 'yyyy-MM'),
    notes: ''
  });

  const { data: advances = [], isLoading } = useQuery({
    queryKey: ['tuitionAdvances', selectedBranchId],
    queryFn: () => fetchData(tenantQuery('tuition_advances').select('*').match(branchFilter()).order('created_at', { ascending: false })),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', selectedBranchId],
    queryFn: () => fetchData(tenantQuery('employees').select('*').match(branchFilter({ status: 'active' }))),
  });

  const { data: students = [] } = useQuery({
    queryKey: ['students', selectedBranchId],
    queryFn: () => fetchData(tenantQuery('students').select('*').match(branchFilter({ status: 'active' }))),
  });

  const filteredAdvances = filterByBranch(advances).filter(a => {
    if (activeTab === 'all') return true;
    if (activeTab === 'pending') return ['pending', 'manager_approved', 'hr_approved'].includes(a.status);
    if (activeTab === 'active') return a.status === 'active';
    if (activeTab === 'completed') return a.status === 'completed';
    return true;
  });

  const getInstallmentCount = (plan) => {
    const counts = { '6_months': 6, '10_months': 10, '12_months': 12 };
    return counts[plan] || 10;
  };

  const handleCreateAdvance = async () => {
    if (!newAdvance.employee_id || !newAdvance.student_id || !newAdvance.advance_amount) {
      toast.error(isRTL ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }

    setProcessing(true);
    try {
      const employee = employees.find(e => e.id === newAdvance.employee_id);
      const student = students.find(s => s.id === newAdvance.student_id);
      const advanceAmount = parseFloat(newAdvance.advance_amount);
      const installmentCount = getInstallmentCount(newAdvance.installment_plan);
      const installmentAmount = Math.ceil(advanceAmount / installmentCount);

      const startDate = new Date(newAdvance.start_period + '-01');
      const endDate = addMonths(startDate, installmentCount - 1);

      const advance = await tenantQuery('tuition_advances').insert({
        advance_number: `TA-${Date.now().toString().slice(-6)}`,
        employee_id: newAdvance.employee_id,
        employee_name: employee.name_ar,
        branch_id: employee.branch_id,
        student_id: newAdvance.student_id,
        student_name: student.name_ar,
        student_grade: student.grade,
        student_branch_id: student.branch_id,
        academic_year: newAdvance.academic_year,
        relationship: 'son', // Could be detected or selected
        request_date: format(new Date(), 'yyyy-MM-dd'),
        total_tuition_amount: advanceAmount,
        advance_amount: advanceAmount,
        installment_plan: newAdvance.installment_plan,
        installment_count: installmentCount,
        installment_amount: installmentAmount,
        start_period: newAdvance.start_period,
        end_period: format(endDate, 'yyyy-MM'),
        remaining_balance: advanceAmount,
        remaining_installments: installmentCount,
        status: 'pending',
        notes: newAdvance.notes
      });

      // Create installment records
      const installments = [];
      for (let i = 0; i < installmentCount; i++) {
        const installmentDate = addMonths(startDate, i);
        installments.push({
          loan_id: advance.id,
          loan_type: 'tuition_advance',
          employee_id: newAdvance.employee_id,
          employee_name: employee.name_ar,
          branch_id: employee.branch_id,
          installment_number: i + 1,
          period: format(installmentDate, 'yyyy-MM'),
          due_date: format(installmentDate, 'yyyy-MM-dd'),
          amount: installmentAmount,
          status: 'pending'
        });
      }
      await supabase.LoanInstallment.bulkCreate(installments);

      queryClient.invalidateQueries({ queryKey: ['tuitionAdvances'] });
      setShowNewAdvance(false);
      setNewAdvance({
        employee_id: '',
        student_id: '',
        academic_year: '2024-2025',
        advance_amount: '',
        installment_plan: '10_months',
        start_period: format(addMonths(new Date(), 1), 'yyyy-MM'),
        notes: ''
      });
      toast.success(isRTL ? 'تم إنشاء طلب السلفة بنجاح' : 'Tuition advance request created');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setProcessing(false);
    }
  };

  const handleApprove = async (advance, approvalType) => {
    setProcessing(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      let updateData = {};

      if (approvalType === 'manager') {
        updateData = {
          status: 'manager_approved',
          manager_approved_by: user.email,
          manager_approved_date: format(new Date(), 'yyyy-MM-dd')
        };
      } else if (approvalType === 'hr') {
        updateData = {
          status: 'hr_approved',
          hr_approved_by: user.email,
          hr_approved_date: format(new Date(), 'yyyy-MM-dd')
        };
      } else if (approvalType === 'finance') {
        updateData = {
          status: 'active',
          finance_approved_by: user.email,
          finance_approved_date: format(new Date(), 'yyyy-MM-dd'),
          invoice_settlement_date: format(new Date(), 'yyyy-MM-dd')
        };
        // TODO: Settle student invoice
      }

      await tenantQuery('tuition_advances').update(updateData);
      queryClient.invalidateQueries({ queryKey: ['tuitionAdvances'] });
      toast.success(isRTL ? 'تم الاعتماد بنجاح' : 'Approved successfully');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (advance) => {
    setProcessing(true);
    try {
      await tenantQuery('tuition_advances').update({ status: 'cancelled' });
      queryClient.invalidateQueries({ queryKey: ['tuitionAdvances'] });
      toast.success(isRTL ? 'تم الرفض' : 'Rejected');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setProcessing(false);
    }
  };

  const statusColors = {
    pending: 'bg-amber-100 text-amber-700',
    manager_approved: 'bg-najdi-50 text-najdi-900',
    hr_approved: 'bg-indigo-100 text-indigo-700',
    finance_approved: 'bg-purple-100 text-purple-700',
    active: 'bg-emerald-100 text-emerald-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700'
  };

  const statusLabels = {
    pending: { ar: 'قيد الانتظار', en: 'Pending' },
    manager_approved: { ar: 'اعتماد المدير', en: 'Manager Approved' },
    hr_approved: { ar: 'اعتماد HR', en: 'HR Approved' },
    finance_approved: { ar: 'اعتماد المالية', en: 'Finance Approved' },
    active: { ar: 'نشط', en: 'Active' },
    completed: { ar: 'مكتمل', en: 'Completed' },
    cancelled: { ar: 'ملغى', en: 'Cancelled' }
  };

  const _planLabels = {
    '6_months': { ar: '6 أشهر', en: '6 Months' },
    '10_months': { ar: '10 أشهر', en: '10 Months' },
    '12_months': { ar: '12 شهر', en: '12 Months' }
  };

  // Summary
  const stats = {
    total: filteredAdvances.length,
    pending: filteredAdvances.filter(a => ['pending', 'manager_approved', 'hr_approved'].includes(a.status)).length,
    active: filteredAdvances.filter(a => a.status === 'active').length,
    totalAmount: filteredAdvances.filter(a => a.status === 'active').reduce((sum, a) => sum + (a.remaining_balance || 0), 0)
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">{isRTL ? 'سلف الرسوم الدراسية' : 'Tuition Advances'}</h2>
          <p className="text-sm text-muted-foreground">{isRTL ? 'إدارة سلف رسوم أبناء الموظفين' : 'Manage employee children tuition advances'}</p>
        </div>
        <Button onClick={() => setShowNewAdvance(true)}>
          <Plus className="w-4 h-4 me-2" />
          {isRTL ? 'طلب سلفة جديدة' : 'New Advance Request'}
        </Button>
      </div>

      {/* Info Banner */}
      <Card className="bg-najdi-50 border-najdi-100">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <School className="w-5 h-5 text-najdi-700 mt-0.5" />
            <div>
              <p className="font-medium text-najdi-900">{isRTL ? 'كيف تعمل سلفة الرسوم؟' : 'How Tuition Advance Works'}</p>
              <p className="text-sm text-najdi-900 mt-1">
                {isRTL 
                  ? 'يتم تسوية فاتورة الطالب فوراً عند الاعتماد، ويظهر في كشف حساب الطالب "مدفوع عبر ميزة الموظف". يتم استقطاع الأقساط من راتب الموظف شهرياً.'
                  : 'Student invoice is settled immediately upon approval. Student account shows "Paid via Employee Benefit". Monthly installments are deducted from employee salary.'
                }
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{isRTL ? 'إجمالي السلف' : 'Total Advances'}</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{isRTL ? 'طلبات معلقة' : 'Pending'}</p>
            <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{isRTL ? 'سلف نشطة' : 'Active'}</p>
            <p className="text-2xl font-bold text-emerald-600">{stats.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{isRTL ? 'الرصيد المتبقي' : 'Outstanding'}</p>
            <p className="text-2xl font-bold">{stats.totalAmount.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">{isRTL ? 'الكل' : 'All'}</TabsTrigger>
          <TabsTrigger value="pending">{isRTL ? 'معلق' : 'Pending'}</TabsTrigger>
          <TabsTrigger value="active">{isRTL ? 'نشط' : 'Active'}</TabsTrigger>
          <TabsTrigger value="completed">{isRTL ? 'مكتمل' : 'Completed'}</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isRTL ? 'رقم السلفة' : 'Advance #'}</TableHead>
              <TableHead>{isRTL ? 'الموظف' : 'Employee'}</TableHead>
              <TableHead>{isRTL ? 'الطالب' : 'Student'}</TableHead>
              <TableHead>{isRTL ? 'العام الدراسي' : 'Academic Year'}</TableHead>
              <TableHead>{isRTL ? 'المبلغ' : 'Amount'}</TableHead>
              <TableHead>{isRTL ? 'القسط' : 'Installment'}</TableHead>
              <TableHead>{isRTL ? 'المتبقي' : 'Remaining'}</TableHead>
              <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredAdvances.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  {isRTL ? 'لا توجد سلف' : 'No advances found'}
                </TableCell>
              </TableRow>
            ) : (
              filteredAdvances.map(advance => (
                <TableRow key={advance.id}>
                  <TableCell className="font-medium">{advance.advance_number}</TableCell>
                  <TableCell>{advance.employee_name}</TableCell>
                  <TableCell>
                    <div>
                      <p>{advance.student_name}</p>
                      <p className="text-xs text-muted-foreground">{advance.student_grade}</p>
                    </div>
                  </TableCell>
                  <TableCell>{advance.academic_year}</TableCell>
                  <TableCell>{advance.advance_amount?.toLocaleString()}</TableCell>
                  <TableCell>
                    {advance.installment_amount?.toLocaleString()} × {advance.installment_count}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <span className="font-medium">{advance.remaining_balance?.toLocaleString()}</span>
                      {advance.status === 'active' && (
                        <Progress 
                          value={((advance.advance_amount - advance.remaining_balance) / advance.advance_amount) * 100} 
                          className="h-1.5"
                        />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[advance.status]}>
                      {isRTL ? statusLabels[advance.status]?.ar : statusLabels[advance.status]?.en}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {advance.status === 'pending' && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => handleApprove(advance, 'manager')}>
                            <Check className="w-4 h-4 text-emerald-600" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleReject(advance)}>
                            <X className="w-4 h-4 text-red-600" />
                          </Button>
                        </>
                      )}
                      {advance.status === 'manager_approved' && (
                        <Button size="sm" variant="ghost" onClick={() => handleApprove(advance, 'hr')}>
                          <Check className="w-4 h-4 text-emerald-600" />
                        </Button>
                      )}
                      {advance.status === 'hr_approved' && (
                        <Button size="sm" onClick={() => handleApprove(advance, 'finance')}>
                          <DollarSign className="w-4 h-4 me-1" />
                          {isRTL ? 'تفعيل' : 'Activate'}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* New Advance Dialog */}
      <Dialog open={showNewAdvance} onOpenChange={setShowNewAdvance}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'طلب سلفة رسوم جديدة' : 'New Tuition Advance Request'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'الموظف' : 'Employee'}</Label>
              <Select value={newAdvance.employee_id} onValueChange={(v) => setNewAdvance({...newAdvance, employee_id: v})}>
                <SelectTrigger>
                  <SelectValue placeholder={isRTL ? 'اختر الموظف' : 'Select employee'} />
                </SelectTrigger>
                <SelectContent>
                  {filterByBranch(employees).map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name_ar} - {emp.employee_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'الطالب (الابن/الابنة)' : 'Student (Child)'}</Label>
              <Select value={newAdvance.student_id} onValueChange={(v) => setNewAdvance({...newAdvance, student_id: v})}>
                <SelectTrigger>
                  <SelectValue placeholder={isRTL ? 'اختر الطالب' : 'Select student'} />
                </SelectTrigger>
                <SelectContent>
                  {students.map(student => (
                    <SelectItem key={student.id} value={student.id}>
                      {student.name_ar} - {student.grade}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'العام الدراسي' : 'Academic Year'}</Label>
                <Select value={newAdvance.academic_year} onValueChange={(v) => setNewAdvance({...newAdvance, academic_year: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2024-2025">2024-2025</SelectItem>
                    <SelectItem value="2025-2026">2025-2026</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'مبلغ الرسوم' : 'Tuition Amount'}</Label>
                <Input 
                  type="number"
                  value={newAdvance.advance_amount}
                  onChange={(e) => setNewAdvance({...newAdvance, advance_amount: e.target.value})}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'خطة السداد' : 'Installment Plan'}</Label>
                <Select value={newAdvance.installment_plan} onValueChange={(v) => setNewAdvance({...newAdvance, installment_plan: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6_months">{isRTL ? '6 أشهر' : '6 Months'}</SelectItem>
                    <SelectItem value="10_months">{isRTL ? '10 أشهر' : '10 Months'}</SelectItem>
                    <SelectItem value="12_months">{isRTL ? '12 شهر' : '12 Months'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'بداية الاستقطاع' : 'Start Period'}</Label>
                <Input 
                  type="month"
                  value={newAdvance.start_period}
                  onChange={(e) => setNewAdvance({...newAdvance, start_period: e.target.value})}
                />
              </div>
            </div>

            {newAdvance.advance_amount && (
              <Card className="bg-emerald-50 border-emerald-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-emerald-700">{isRTL ? 'القسط الشهري' : 'Monthly Installment'}</p>
                      <p className="text-2xl font-bold text-emerald-700">
                        {Math.ceil(parseFloat(newAdvance.advance_amount) / getInstallmentCount(newAdvance.installment_plan)).toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}
                      </p>
                    </div>
                    <GraduationCap className="w-10 h-10 text-emerald-600" />
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              <Label>{isRTL ? 'ملاحظات' : 'Notes'}</Label>
              <Textarea 
                value={newAdvance.notes}
                onChange={(e) => setNewAdvance({...newAdvance, notes: e.target.value})}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewAdvance(false)}>
              {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleCreateAdvance} disabled={processing}>
              {processing && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'تقديم الطلب' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}