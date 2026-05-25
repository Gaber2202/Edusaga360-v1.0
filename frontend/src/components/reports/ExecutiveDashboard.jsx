import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useBranch } from '../BranchContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Users, GraduationCap, CreditCard, AlertTriangle, DollarSign, UserPlus, FileText, RefreshCw, Download, Printer, Mail, FileSpreadsheet } from 'lucide-react';
import { format, subMonths } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { useTenantFilter } from '../../hooks/useTenantFilter';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function ExecutiveDashboard() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  const [period, setPeriod] = useState('year');

  const { data: students = [] } = useQuery({
    queryKey: ['students', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('students').select('*').match(tenantFilter(branchFilter()))),
    enabled: hasTenantAccess,
  });

  const { data: applications = [] } = useQuery({
    queryKey: ['applications', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('applications').select('*').match(tenantFilter(branchFilter()))),
    enabled: hasTenantAccess,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('invoices').select('*').match(tenantFilter(branchFilter()))),
    enabled: hasTenantAccess,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['payments', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('payments').select('*').match(tenantFilter(branchFilter()))),
    enabled: hasTenantAccess,
  });

  const { data: _attendance = [] } = useQuery({
    queryKey: ['attendance', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('attendances').select('*').match(tenantFilter(branchFilter()))),
    enabled: hasTenantAccess,
  });

  // Filter by branch
  const filteredStudents = filterByBranch(students);
  const filteredApplications = filterByBranch(applications);
  const filteredInvoices = filterByBranch(invoices);
  const filteredPayments = filterByBranch(payments);

  // Calculate KPIs
  const activeStudents = filteredStudents.filter(s => s.status === 'active').length;
  const totalBilled = filteredInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
  const totalCollected = filteredPayments.filter(p => p.status === 'completed').reduce((sum, p) => sum + (p.amount || 0), 0);
  const collectionRate = totalBilled > 0 ? ((totalCollected / totalBilled) * 100).toFixed(1) : 0;
  
  const pendingApplications = filteredApplications.filter(a => ['submitted', 'under_review'].includes(a.status)).length;
  const acceptedApplications = filteredApplications.filter(a => a.status === 'accepted').length;
  const conversionRate = filteredApplications.length > 0 ? ((acceptedApplications / filteredApplications.length) * 100).toFixed(1) : 0;

  const overdueInvoices = filteredInvoices.filter(inv => inv.status === 'overdue').length;
  const failedPayments = filteredPayments.filter(p => p.status === 'failed').length;

  // Enrollment trends data (last 6 months)
  const enrollmentTrends = Array.from({ length: 6 }, (_, i) => {
    const month = subMonths(new Date(), 5 - i);
    const monthStudents = filteredStudents.filter(s => {
      const enrollDate = s.enrollment_date ? new Date(s.enrollment_date) : null;
      return enrollDate && enrollDate.getMonth() === month.getMonth() && enrollDate.getFullYear() === month.getFullYear();
    });
    return {
      month: format(month, 'MMM'),
      enrolled: monthStudents.length,
      applications: filteredApplications.filter(a => {
        const created = a.created_date ? new Date(a.created_date) : null;
        return created && created.getMonth() === month.getMonth() && created.getFullYear() === month.getFullYear();
      }).length
    };
  });

  // Collection trends
  const collectionTrends = Array.from({ length: 6 }, (_, i) => {
    const month = subMonths(new Date(), 5 - i);
    const monthPayments = filteredPayments.filter(p => {
      const payDate = p.payment_date ? new Date(p.payment_date) : null;
      return payDate && payDate.getMonth() === month.getMonth() && payDate.getFullYear() === month.getFullYear();
    });
    const monthInvoices = filteredInvoices.filter(inv => {
      const issueDate = inv.issue_date ? new Date(inv.issue_date) : null;
      return issueDate && issueDate.getMonth() === month.getMonth() && issueDate.getFullYear() === month.getFullYear();
    });
    return {
      month: format(month, 'MMM'),
      billed: monthInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0) / 1000,
      collected: monthPayments.filter(p => p.status === 'completed').reduce((sum, p) => sum + (p.amount || 0), 0) / 1000
    };
  });

  // AR Aging buckets
  const today = new Date();
  const arAging = [
    { name: isRTL ? 'حالي' : 'Current', value: filteredInvoices.filter(inv => inv.status !== 'paid' && inv.due_date && new Date(inv.due_date) >= today).length, color: '#10b981' },
    { name: isRTL ? '1-30 يوم' : '1-30 days', value: filteredInvoices.filter(inv => {
      if (inv.status === 'paid' || !inv.due_date) return false;
      const due = new Date(inv.due_date);
      const diff = Math.floor((today - due) / (1000 * 60 * 60 * 24));
      return diff > 0 && diff <= 30;
    }).length, color: '#f59e0b' },
    { name: isRTL ? '31-60 يوم' : '31-60 days', value: filteredInvoices.filter(inv => {
      if (inv.status === 'paid' || !inv.due_date) return false;
      const due = new Date(inv.due_date);
      const diff = Math.floor((today - due) / (1000 * 60 * 60 * 24));
      return diff > 30 && diff <= 60;
    }).length, color: '#ef4444' },
    { name: isRTL ? '+60 يوم' : '60+ days', value: filteredInvoices.filter(inv => {
      if (inv.status === 'paid' || !inv.due_date) return false;
      const due = new Date(inv.due_date);
      const diff = Math.floor((today - due) / (1000 * 60 * 60 * 24));
      return diff > 60;
    }).length, color: '#7f1d1d' }
  ];

  // Grade distribution
  const gradeDistribution = ['KG1', 'KG2', 'KG3', 'Grade1', 'Grade2', 'Grade3', 'Grade4', 'Grade5', 'Grade6'].map(grade => ({
    name: t(grade),
    students: filteredStudents.filter(s => s.grade === grade && s.status === 'active').length
  }));

  // Payment methods
  const paymentMethods = ['cash', 'mada', 'visa', 'bank_transfer', 'sadad'].map(method => ({
    name: t(method) || method,
    value: filteredPayments.filter(p => p.payment_method === method && p.status === 'completed').length
  })).filter(m => m.value > 0);

  const downloadPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(isRTL ? 'لوحة المؤشرات التنفيذية' : 'Executive Dashboard', 20, 20);
    doc.setFontSize(10);
    doc.text(`${isRTL ? 'التاريخ' : 'Date'}: ${format(new Date(), 'dd/MM/yyyy')}`, 20, 30);
    
    doc.setFontSize(12);
    let y = 45;
    doc.text(isRTL ? 'المؤشرات الرئيسية' : 'Key Metrics', 20, y);
    y += 10;
    doc.setFontSize(10);
    doc.text(`${isRTL ? 'الطلاب النشطين' : 'Active Students'}: ${activeStudents}`, 20, y);
    y += 7;
    doc.text(`${isRTL ? 'نسبة التحصيل' : 'Collection Rate'}: ${collectionRate}%`, 20, y);
    y += 7;
    doc.text(`${isRTL ? 'إجمالي المفوتر' : 'Total Billed'}: ${totalBilled.toLocaleString()} SAR`, 20, y);
    y += 7;
    doc.text(`${isRTL ? 'إجمالي المحصل' : 'Total Collected'}: ${totalCollected.toLocaleString()} SAR`, 20, y);
    
    doc.save(`dashboard_${format(new Date(), 'yyyyMMdd')}.pdf`);
    toast.success(isRTL ? 'تم التنزيل' : 'Downloaded');
  };

  const downloadExcel = () => {
    const data = [
      ['Metric', 'Value'],
      [isRTL ? 'الطلاب النشطين' : 'Active Students', activeStudents],
      [isRTL ? 'نسبة التحصيل' : 'Collection Rate', `${collectionRate}%`],
      [isRTL ? 'إجمالي المفوتر' : 'Total Billed', `${totalBilled.toLocaleString()} SAR`],
      [isRTL ? 'إجمالي المحصل' : 'Total Collected', `${totalCollected.toLocaleString()} SAR`],
      [isRTL ? 'فواتير متأخرة' : 'Overdue Invoices', overdueInvoices],
      ['', ''],
      [isRTL ? 'اتجاهات التسجيل' : 'Enrollment Trends', ''],
      ['Month', 'Applications', 'Enrolled'],
      ...enrollmentTrends.map(t => [t.month, t.applications, t.enrolled])
    ];
    
    const csvContent = data.map(row => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dashboard_${format(new Date(), 'yyyyMMdd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(isRTL ? 'تم التصدير' : 'Exported');
  };

  const printDashboard = () => {
    window.print();
  };

  const emailDashboard = () => {
    const subject = `${isRTL ? 'لوحة المؤشرات التنفيذية' : 'Executive Dashboard'} - ${format(new Date(), 'dd/MM/yyyy')}`;
    const body = `Active Students: ${activeStudents}\nCollection Rate: ${collectionRate}%\nTotal Billed: ${totalBilled.toLocaleString()} SAR`;
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  const KPICard = ({ title, value, subtitle, icon: Icon, trend, trendUp, color = 'bg-blue-50' }) => (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-500">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
            {trend !== undefined && (
              <div className={`flex items-center gap-1 mt-2 text-sm ${trendUp ? 'text-emerald-600' : 'text-red-600'}`}>
                {trendUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span>{trend}%</span>
              </div>
            )}
          </div>
          <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center`}>
            <Icon className="w-6 h-6 text-slate-700" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Period Selector & Export Actions */}
      <div className="flex justify-between items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 me-2" />
              {isRTL ? 'تصدير' : 'Export'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isRTL ? 'end' : 'start'}>
            <DropdownMenuItem onClick={downloadPDF}>
              <FileText className="w-4 h-4 me-2" />
              {isRTL ? 'تنزيل PDF' : 'Download PDF'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={downloadExcel}>
              <FileSpreadsheet className="w-4 h-4 me-2" />
              {isRTL ? 'تنزيل Excel' : 'Download Excel'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={printDashboard}>
              <Printer className="w-4 h-4 me-2" />
              {isRTL ? 'طباعة' : 'Print'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={emailDashboard}>
              <Mail className="w-4 h-4 me-2" />
              {isRTL ? 'بريد إلكتروني' : 'Email'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">{isRTL ? 'هذا الشهر' : 'This Month'}</SelectItem>
            <SelectItem value="quarter">{isRTL ? 'هذا الربع' : 'This Quarter'}</SelectItem>
            <SelectItem value="year">{isRTL ? 'هذا العام' : 'This Year'}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title={isRTL ? 'الطلاب النشطين' : 'Active Students'} value={activeStudents} icon={Users} color="bg-blue-50" />
        <KPICard title={isRTL ? 'نسبة التحصيل' : 'Collection Rate'} value={`${collectionRate}%`} icon={CreditCard} color="bg-emerald-50" trend={5.2} trendUp />
        <KPICard title={isRTL ? 'طلبات جديدة' : 'New Applications'} value={pendingApplications} icon={UserPlus} color="bg-amber-50" />
        <KPICard title={isRTL ? 'معدل التحويل' : 'Conversion Rate'} value={`${conversionRate}%`} icon={GraduationCap} color="bg-purple-50" />
      </div>

      {/* Second Row KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title={isRTL ? 'إجمالي المفوتر' : 'Total Billed'} value={`${(totalBilled/1000).toFixed(0)}K`} subtitle={t('sar')} icon={FileText} color="bg-slate-50" />
        <KPICard title={isRTL ? 'إجمالي المحصل' : 'Total Collected'} value={`${(totalCollected/1000).toFixed(0)}K`} subtitle={t('sar')} icon={DollarSign} color="bg-emerald-50" />
        <KPICard title={isRTL ? 'فواتير متأخرة' : 'Overdue Invoices'} value={overdueInvoices} icon={AlertTriangle} color="bg-red-50" />
        <KPICard title={isRTL ? 'مدفوعات فاشلة' : 'Failed Payments'} value={failedPayments} icon={RefreshCw} color="bg-amber-50" />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Enrollment Trends */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isRTL ? 'اتجاهات التسجيل' : 'Enrollment Trends'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={enrollmentTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="applications" name={isRTL ? 'الطلبات' : 'Applications'} stackId="1" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.6} />
                <Area type="monotone" dataKey="enrolled" name={isRTL ? 'المسجلين' : 'Enrolled'} stackId="2" stroke="#10b981" fill="#10b981" fillOpacity={0.6} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Collection Trends */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isRTL ? 'اتجاهات التحصيل' : 'Collection Trends'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={collectionTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => `${value}K SAR`} />
                <Legend />
                <Bar dataKey="billed" name={isRTL ? 'المفوتر' : 'Billed'} fill="#3b82f6" />
                <Bar dataKey="collected" name={isRTL ? 'المحصل' : 'Collected'} fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AR Aging */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isRTL ? 'أعمار الذمم' : 'AR Aging'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={arAging} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value" label={false} labelLine={false}>
                  {arAging.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip />
                <Legend formatter={(value) => <span className="text-xs">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Grade Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isRTL ? 'توزيع الصفوف' : 'Grade Distribution'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={gradeDistribution} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={60} />
                <Tooltip />
                <Bar dataKey="students" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isRTL ? 'طرق الدفع' : 'Payment Methods'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={paymentMethods} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={false} labelLine={false}>
                  {paymentMethods.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend formatter={(value) => <span className="text-xs">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}