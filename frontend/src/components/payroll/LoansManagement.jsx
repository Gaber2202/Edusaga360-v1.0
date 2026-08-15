import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { formatCurrency } from '../../lib/localization';
import { useTenant } from '../TenantContext';
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
  DollarSign,
  Check,
  X,
  Loader2
} from 'lucide-react';

export default function LoansManagement() {
  const { isRTL } = useLanguage();
  const { tenant } = useTenant();
  const { selectedBranchId, filterByBranch, branchFilter, branches: _branches } = useBranch();
  const queryClient = useQueryClient();

  const [showNewLoan, setShowNewLoan] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [processing, setProcessing] = useState(false);

  const [newLoan, setNewLoan] = useState({
    employee_id: '',
    loan_type: 'personal',
    loan_amount: '',
    installment_count: 12,
    start_period: format(addMonths(new Date(), 1), 'yyyy-MM'),
    purpose: ''
  });

  const { data: loans = [], isLoading } = useQuery({ enabled: false /* employee_loans table not built */, queryKey: ['employeeLoans', selectedBranchId], queryFn: () => fetchData(tenantQuery('employee_loans').select('*').match(branchFilter()).order('created_at', { ascending: false })), initialData: [] });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', selectedBranchId],
    queryFn: () => fetchData(tenantQuery('employees').select('*').match(branchFilter({ status: 'active' }))),
  });

  const filteredLoans = filterByBranch(loans).filter(l => {
    if (activeTab === 'all') return true;
    if (activeTab === 'pending') return ['pending', 'manager_approved', 'hr_approved'].includes(l.status);
    if (activeTab === 'active') return l.status === 'active';
    if (activeTab === 'completed') return l.status === 'completed';
    return true;
  });

  const handleCreateLoan = async () => {
    if (!newLoan.employee_id || !newLoan.loan_amount) {
      toast.error(isRTL ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }

    setProcessing(true);
    try {
      const employee = employees.find(e => e.id === newLoan.employee_id);
      const loanAmount = parseFloat(newLoan.loan_amount);
      const installmentAmount = Math.ceil(loanAmount / newLoan.installment_count);

      // Calculate end period
      const startDate = new Date(newLoan.start_period + '-01');
      const endDate = addMonths(startDate, newLoan.installment_count - 1);

      const loan = await tenantQuery('employee_loans').insert({
        loan_number: `LN-${Date.now().toString().slice(-6)}`,
        employee_id: newLoan.employee_id,
        employee_name: employee.name_ar,
        branch_id: employee.branch_id,
        loan_type: newLoan.loan_type,
        request_date: format(new Date(), 'yyyy-MM-dd'),
        loan_amount: loanAmount,
        installment_count: newLoan.installment_count,
        installment_amount: installmentAmount,
        start_period: newLoan.start_period,
        end_period: format(endDate, 'yyyy-MM'),
        remaining_balance: loanAmount,
        remaining_installments: newLoan.installment_count,
        status: 'pending',
        purpose: newLoan.purpose
      });

      // Create installment records
      const installments = [];
      for (let i = 0; i < newLoan.installment_count; i++) {
        const installmentDate = addMonths(startDate, i);
        installments.push({
          loan_id: loan.id,
          loan_type: 'employee_loan',
          employee_id: newLoan.employee_id,
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

      queryClient.invalidateQueries({ queryKey: ['employeeLoans'] });
      setShowNewLoan(false);
      setNewLoan({
        employee_id: '',
        loan_type: 'personal',
        loan_amount: '',
        installment_count: 12,
        start_period: format(addMonths(new Date(), 1), 'yyyy-MM'),
        purpose: ''
      });
      toast.success(isRTL ? 'تم إنشاء طلب القرض بنجاح' : 'Loan request created successfully');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setProcessing(false);
    }
  };

  const handleApprove = async (loan, approvalType) => {
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
          status: 'finance_approved',
          finance_approved_by: user.email,
          finance_approved_date: format(new Date(), 'yyyy-MM-dd')
        };
      } else if (approvalType === 'disburse') {
        updateData = {
          status: 'active',
          disbursement_date: format(new Date(), 'yyyy-MM-dd'),
          disbursement_method: 'bank_transfer'
        };
      }

      await tenantQuery('employee_loans').update(updateData);
      queryClient.invalidateQueries({ queryKey: ['employeeLoans'] });
      toast.success(isRTL ? 'تم الاعتماد بنجاح' : 'Approved successfully');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (loan) => {
    setProcessing(true);
    try {
      await tenantQuery('employee_loans').update({
        status: 'cancelled',
        rejection_reason: 'Rejected by admin'
      });
      queryClient.invalidateQueries({ queryKey: ['employeeLoans'] });
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
    disbursed: 'bg-cyan-100 text-cyan-700',
    active: 'bg-emerald-100 text-emerald-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    written_off: 'bg-sand-alt text-ink'
  };

  const statusLabels = {
    pending: { ar: 'قيد الانتظار', en: 'Pending' },
    manager_approved: { ar: 'اعتماد المدير', en: 'Manager Approved' },
    hr_approved: { ar: 'اعتماد HR', en: 'HR Approved' },
    finance_approved: { ar: 'اعتماد المالية', en: 'Finance Approved' },
    disbursed: { ar: 'تم الصرف', en: 'Disbursed' },
    active: { ar: 'نشط', en: 'Active' },
    completed: { ar: 'مكتمل', en: 'Completed' },
    cancelled: { ar: 'ملغى', en: 'Cancelled' },
    written_off: { ar: 'شطب', en: 'Written Off' }
  };

  const loanTypeLabels = {
    personal: { ar: 'قرض شخصي', en: 'Personal Loan' },
    emergency: { ar: 'قرض طوارئ', en: 'Emergency Loan' },
    salary_advance: { ar: 'سلفة راتب', en: 'Salary Advance' }
  };

  // Summary stats
  const stats = {
    total: filteredLoans.length,
    pending: filteredLoans.filter(l => ['pending', 'manager_approved', 'hr_approved', 'finance_approved'].includes(l.status)).length,
    active: filteredLoans.filter(l => l.status === 'active').length,
    totalAmount: filteredLoans.filter(l => l.status === 'active').reduce((sum, l) => sum + (l.remaining_balance || 0), 0)
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">{isRTL ? 'القروض والسلف' : 'Loans & Advances'}</h2>
          <p className="text-sm text-muted-foreground">{isRTL ? 'إدارة قروض الموظفين' : 'Manage employee loans'}</p>
        </div>
        <Button onClick={() => setShowNewLoan(true)}>
          <Plus className="w-4 h-4 me-2" />
          {isRTL ? 'طلب قرض جديد' : 'New Loan Request'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{isRTL ? 'إجمالي القروض' : 'Total Loans'}</p>
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
            <p className="text-sm text-muted-foreground">{isRTL ? 'قروض نشطة' : 'Active'}</p>
            <p className="text-2xl font-bold text-emerald-600">{stats.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{isRTL ? 'الرصيد المتبقي' : 'Outstanding Balance'}</p>
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

      {/* Loans Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isRTL ? 'رقم القرض' : 'Loan #'}</TableHead>
              <TableHead>{isRTL ? 'الموظف' : 'Employee'}</TableHead>
              <TableHead>{isRTL ? 'النوع' : 'Type'}</TableHead>
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
                <TableCell colSpan={8} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredLoans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  {isRTL ? 'لا توجد قروض' : 'No loans found'}
                </TableCell>
              </TableRow>
            ) : (
              filteredLoans.map(loan => (
                <TableRow key={loan.id}>
                  <TableCell className="font-medium">{loan.loan_number}</TableCell>
                  <TableCell>{loan.employee_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {isRTL ? loanTypeLabels[loan.loan_type]?.ar : loanTypeLabels[loan.loan_type]?.en}
                    </Badge>
                  </TableCell>
                  <TableCell>{loan.loan_amount?.toLocaleString()}</TableCell>
                  <TableCell>
                    {loan.installment_amount?.toLocaleString()} × {loan.installment_count}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <span className="font-medium">{loan.remaining_balance?.toLocaleString()}</span>
                      {loan.status === 'active' && (
                        <Progress 
                          value={((loan.loan_amount - loan.remaining_balance) / loan.loan_amount) * 100} 
                          className="h-1.5"
                        />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[loan.status]}>
                      {isRTL ? statusLabels[loan.status]?.ar : statusLabels[loan.status]?.en}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {loan.status === 'pending' && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => handleApprove(loan, 'manager')}>
                            <Check className="w-4 h-4 text-emerald-600" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleReject(loan)}>
                            <X className="w-4 h-4 text-red-600" />
                          </Button>
                        </>
                      )}
                      {loan.status === 'manager_approved' && (
                        <Button size="sm" variant="ghost" onClick={() => handleApprove(loan, 'hr')}>
                          <Check className="w-4 h-4 text-emerald-600" />
                        </Button>
                      )}
                      {loan.status === 'hr_approved' && (
                        <Button size="sm" variant="ghost" onClick={() => handleApprove(loan, 'finance')}>
                          <Check className="w-4 h-4 text-emerald-600" />
                        </Button>
                      )}
                      {loan.status === 'finance_approved' && (
                        <Button size="sm" onClick={() => handleApprove(loan, 'disburse')}>
                          <DollarSign className="w-4 h-4 me-1" />
                          {isRTL ? 'صرف' : 'Disburse'}
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

      {/* New Loan Dialog */}
      <Dialog open={showNewLoan} onOpenChange={setShowNewLoan}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'طلب قرض جديد' : 'New Loan Request'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'الموظف' : 'Employee'}</Label>
              <Select value={newLoan.employee_id} onValueChange={(v) => setNewLoan({...newLoan, employee_id: v})}>
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
              <Label>{isRTL ? 'نوع القرض' : 'Loan Type'}</Label>
              <Select value={newLoan.loan_type} onValueChange={(v) => setNewLoan({...newLoan, loan_type: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">{isRTL ? 'قرض شخصي' : 'Personal Loan'}</SelectItem>
                  <SelectItem value="emergency">{isRTL ? 'قرض طوارئ' : 'Emergency Loan'}</SelectItem>
                  <SelectItem value="salary_advance">{isRTL ? 'سلفة راتب' : 'Salary Advance'}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'مبلغ القرض' : 'Loan Amount'}</Label>
                <Input 
                  type="number"
                  value={newLoan.loan_amount}
                  onChange={(e) => setNewLoan({...newLoan, loan_amount: e.target.value})}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'عدد الأقساط' : 'Installments'}</Label>
                <Select 
                  value={newLoan.installment_count.toString()} 
                  onValueChange={(v) => setNewLoan({...newLoan, installment_count: parseInt(v)})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[3, 6, 9, 12, 18, 24].map(n => (
                      <SelectItem key={n} value={n.toString()}>{n} {isRTL ? 'شهر' : 'months'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'بداية الاستقطاع' : 'Start Period'}</Label>
              <Input 
                type="month"
                value={newLoan.start_period}
                onChange={(e) => setNewLoan({...newLoan, start_period: e.target.value})}
              />
            </div>

            {newLoan.loan_amount && newLoan.installment_count && (
              <Card className="bg-sand">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{isRTL ? 'القسط الشهري' : 'Monthly Installment'}</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(Math.ceil(parseFloat(newLoan.loan_amount) / newLoan.installment_count), tenant?.localization, isRTL)}
                  </p>
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              <Label>{isRTL ? 'الغرض' : 'Purpose'}</Label>
              <Textarea 
                value={newLoan.purpose}
                onChange={(e) => setNewLoan({...newLoan, purpose: e.target.value})}
                placeholder={isRTL ? 'اكتب الغرض من القرض...' : 'Describe the loan purpose...'}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewLoan(false)}>
              {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleCreateLoan} disabled={processing}>
              {processing && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'تقديم الطلب' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}