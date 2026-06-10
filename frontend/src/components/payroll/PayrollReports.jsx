import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useBranch } from '../BranchContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { format, subMonths } from 'date-fns';
import { toast } from 'sonner';
import { logAuditEvent, AuditActions } from '../AuditService';
import MonthPicker from '../ui/MonthPicker';
import {
  Download,
  FileText,
  Users,
  DollarSign,
  Landmark
} from 'lucide-react';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function PayrollReports() {
  const { isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter, branches: _branches } = useBranch();

  const [selectedPeriod, setSelectedPeriod] = useState(format(new Date(), 'yyyy-MM'));

  const { data: payRuns = [], isLoading: _isLoading } = useQuery({
    queryKey: ['payRuns', selectedBranchId],
    queryFn: () => fetchData(tenantQuery('pay_runs').select('*').match(branchFilter()).order('created_date', { ascending: false })),
  });

  const { data: payrollInputs = [] } = useQuery({
    queryKey: ['payrollInputs', selectedBranchId],
    queryFn: () => fetchData(tenantQuery('payroll_inputs').select('*').match(branchFilter()).order('created_date', { ascending: false })),
  });

  const { data: loans = [] } = useQuery({
    queryKey: ['employeeLoans', selectedBranchId],
    queryFn: () => fetchData(tenantQuery('employee_loans').select('*').match(branchFilter())),
  });

  const { data: tuitionAdvances = [] } = useQuery({
    queryKey: ['tuitionAdvances', selectedBranchId],
    queryFn: () => fetchData(tenantQuery('tuition_advances').select('*').match(branchFilter())),
  });

  const { data: gosiRecords = [] } = useQuery({
    queryKey: ['gosiRecords', selectedBranchId],
    queryFn: () => fetchData(tenantQuery('gosi_records').select('*').match(branchFilter()).order('created_date', { ascending: false })),
  });

  const filteredPayRuns = filterByBranch(payRuns);
  const currentInputs = payrollInputs.filter(p => p.period === selectedPeriod && (!selectedBranchId || p.branch_id === selectedBranchId));

  // Trend data (last 6 months)
  const trendData = [];
  for (let i = 5; i >= 0; i--) {
    const period = format(subMonths(new Date(), i), 'yyyy-MM');
    const monthRuns = filteredPayRuns.filter(p => p.period === period);
    const total = monthRuns.reduce((sum, r) => sum + (r.net_payroll || 0), 0);
    const gosi = monthRuns.reduce((sum, r) => sum + (r.total_gosi_employee || 0) + (r.total_gosi_employer || 0), 0);
    trendData.push({
      period: period.slice(5),
      net: total / 1000,
      gosi: gosi / 1000
    });
  }

  // Department breakdown (using job_title as proxy)
  const departmentData = [];
  const byDept = {};
  currentInputs.forEach(input => {
    const dept = input.job_title?.includes('معلم') || input.job_title?.toLowerCase().includes('teacher') 
      ? 'Teachers' : 'Admin';
    byDept[dept] = (byDept[dept] || 0) + (input.net_salary || 0);
  });
  Object.entries(byDept).forEach(([name, value]) => {
    departmentData.push({ name: isRTL ? (name === 'Teachers' ? 'معلمين' : 'إداريين') : name, value });
  });

  // Saudi vs Non-Saudi
  const nationalityData = [
    { 
      name: isRTL ? 'سعودي' : 'Saudi', 
      value: currentInputs.filter(i => i.is_saudi).reduce((sum, i) => sum + (i.net_salary || 0), 0)
    },
    { 
      name: isRTL ? 'غير سعودي' : 'Non-Saudi', 
      value: currentInputs.filter(i => !i.is_saudi).reduce((sum, i) => sum + (i.net_salary || 0), 0)
    }
  ];

  // Loans summary
  const activeLoans = filterByBranch(loans).filter(l => l.status === 'active');
  const loanSummary = {
    count: activeLoans.length,
    totalBalance: activeLoans.reduce((sum, l) => sum + (l.remaining_balance || 0), 0),
    monthlyDeduction: activeLoans.reduce((sum, l) => sum + (l.installment_amount || 0), 0)
  };

  // Tuition summary
  const activeTuition = filterByBranch(tuitionAdvances).filter(t => t.status === 'active');
  const tuitionSummary = {
    count: activeTuition.length,
    totalBalance: activeTuition.reduce((sum, t) => sum + (t.remaining_balance || 0), 0),
    monthlyDeduction: activeTuition.reduce((sum, t) => sum + (t.installment_amount || 0), 0)
  };

  // GOSI summary
  const currentGOSI = gosiRecords.find(g => g.period === selectedPeriod && (!selectedBranchId || g.branch_id === selectedBranchId));
  const gosiSummary = currentGOSI || {
    total_employee_contribution: currentInputs.reduce((sum, i) => sum + (i.gosi_employee || 0), 0),
    total_employer_contribution: currentInputs.reduce((sum, i) => sum + (i.gosi_employer || 0), 0),
    saudi_employees: currentInputs.filter(i => i.is_saudi).length,
    non_saudi_employees: currentInputs.filter(i => !i.is_saudi).length
  };

  const handleExportCSV = () => {
    if (currentInputs.length === 0) {
      toast.error(isRTL ? 'لا توجد بيانات للتصدير' : 'No data to export');
      return;
    }
    const headers = [
      isRTL ? 'الموظف' : 'Employee',
      isRTL ? 'المسمى الوظيفي' : 'Job Title',
      isRTL ? 'الأساسي' : 'Basic',
      isRTL ? 'بدل السكن' : 'Housing',
      isRTL ? 'بدل النقل' : 'Transport',
      isRTL ? 'إجمالي' : 'Gross',
      isRTL ? 'تأمينات' : 'GOSI',
      isRTL ? 'استقطاعات' : 'Deductions',
      isRTL ? 'صافي' : 'Net',
    ];
    const rows = currentInputs.map(i => [
      i.employee_name || '',
      i.job_title || '',
      i.basic_salary || 0,
      i.housing_allowance || 0,
      i.transport_allowance || 0,
      i.gross_salary || 0,
      i.gosi_employee || 0,
      i.total_deductions || 0,
      i.net_salary || 0,
    ]);
    const csv = '\uFEFF' + [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Payroll_Report_${selectedPeriod}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    logAuditEvent({ action: AuditActions.EXPORT, entityType: 'PayrollReport', entityId: null, newValues: { format: 'csv', period: selectedPeriod } });
    toast.success(isRTL ? 'تم تصدير التقرير بنجاح' : 'Report exported successfully');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">{isRTL ? 'تقارير الرواتب' : 'Payroll Reports'}</h2>
          <p className="text-sm text-slate-500">{isRTL ? 'تحليلات وإحصائيات الرواتب' : 'Payroll analytics and statistics'}</p>
        </div>
        <div className="flex gap-3 items-center">
          <MonthPicker
            value={selectedPeriod}
            onChange={setSelectedPeriod}
            isRTL={isRTL}
            placeholder={isRTL ? 'اختر الشهر' : 'Select month'}
          />
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="w-4 h-4 me-2" />
            {isRTL ? 'تصدير CSV' : 'Export CSV'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{isRTL ? 'صافي الرواتب' : 'Net Payroll'}</p>
                <p className="text-2xl font-bold">
                  {(currentInputs.reduce((sum, i) => sum + (i.net_salary || 0), 0) / 1000).toFixed(0)}K
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-emerald-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{isRTL ? 'تأمينات' : 'GOSI'}</p>
                <p className="text-2xl font-bold">
                  {((gosiSummary.total_employee_contribution + gosiSummary.total_employer_contribution) / 1000).toFixed(0)}K
                </p>
              </div>
              <Landmark className="w-8 h-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{isRTL ? 'قروض نشطة' : 'Active Loans'}</p>
                <p className="text-2xl font-bold">{loanSummary.count}</p>
                <p className="text-xs text-slate-400">{loanSummary.totalBalance.toLocaleString()} {isRTL ? 'متبقي' : 'remaining'}</p>
              </div>
              <FileText className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{isRTL ? 'سلف رسوم' : 'Tuition Advances'}</p>
                <p className="text-2xl font-bold">{tuitionSummary.count}</p>
                <p className="text-xs text-slate-400">{tuitionSummary.totalBalance.toLocaleString()} {isRTL ? 'متبقي' : 'remaining'}</p>
              </div>
              <Users className="w-8 h-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle>{isRTL ? 'اتجاه الرواتب (6 أشهر)' : 'Payroll Trend (6 Months)'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="net" 
                  stroke="#10b981" 
                  name={isRTL ? 'صافي (ألف)' : 'Net (K)'}
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="gosi" 
                  stroke="#8b5cf6" 
                  name={isRTL ? 'تأمينات (ألف)' : 'GOSI (K)'}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Department Pie */}
        <Card>
          <CardHeader>
            <CardTitle>{isRTL ? 'التوزيع حسب القسم' : 'By Department'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={departmentData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {departmentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => value.toLocaleString()} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Nationality Chart */}
        <Card>
          <CardHeader>
            <CardTitle>{isRTL ? 'سعودي / غير سعودي' : 'Saudi / Non-Saudi'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={nationalityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => value.toLocaleString()} />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* GOSI Summary */}
        <Card>
          <CardHeader>
            <CardTitle>{isRTL ? 'ملخص التأمينات' : 'GOSI Summary'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-500">{isRTL ? 'حصة الموظف' : 'Employee Share'}</p>
                <p className="text-xl font-bold">{gosiSummary.total_employee_contribution?.toLocaleString()}</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-500">{isRTL ? 'حصة صاحب العمل' : 'Employer Share'}</p>
                <p className="text-xl font-bold">{gosiSummary.total_employer_contribution?.toLocaleString()}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-emerald-50 rounded-lg">
                <p className="text-sm text-emerald-600">{isRTL ? 'موظفين سعوديين' : 'Saudi Employees'}</p>
                <p className="text-xl font-bold text-emerald-700">{gosiSummary.saudi_employees}</p>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-600">{isRTL ? 'غير سعوديين' : 'Non-Saudi'}</p>
                <p className="text-xl font-bold text-blue-700">{gosiSummary.non_saudi_employees}</p>
              </div>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg">
              <p className="text-sm text-purple-600">{isRTL ? 'إجمالي التأمينات' : 'Total GOSI'}</p>
              <p className="text-2xl font-bold text-purple-700">
                {((gosiSummary.total_employee_contribution || 0) + (gosiSummary.total_employer_contribution || 0)).toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card>
        <CardHeader>
          <CardTitle>{isRTL ? 'تفاصيل الرواتب' : 'Payroll Details'}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isRTL ? 'الموظف' : 'Employee'}</TableHead>
                <TableHead className="text-center">{isRTL ? 'الأساسي' : 'Basic'}</TableHead>
                <TableHead className="text-center">{isRTL ? 'البدلات' : 'Allowances'}</TableHead>
                <TableHead className="text-center">{isRTL ? 'الإجمالي' : 'Gross'}</TableHead>
                <TableHead className="text-center">{isRTL ? 'تأمينات' : 'GOSI'}</TableHead>
                <TableHead className="text-center">{isRTL ? 'استقطاعات' : 'Deductions'}</TableHead>
                <TableHead className="text-center">{isRTL ? 'الصافي' : 'Net'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentInputs.slice(0, 10).map(input => (
                <TableRow key={input.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{input.employee_name}</p>
                      <p className="text-xs text-slate-500">{input.job_title}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">{input.basic_salary?.toLocaleString()}</TableCell>
                  <TableCell className="text-center">
                    {((input.housing_allowance || 0) + (input.transport_allowance || 0) + (input.other_allowances || 0)).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-center font-medium">{input.gross_salary?.toLocaleString()}</TableCell>
                  <TableCell className="text-center text-purple-600">{input.gosi_employee?.toLocaleString()}</TableCell>
                  <TableCell className="text-center text-red-600">{input.total_deductions?.toLocaleString()}</TableCell>
                  <TableCell className="text-center font-bold text-emerald-600">{input.net_salary?.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}