import React, { useState } from 'react';
import { tenantQuery } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useBranch } from '../BranchContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Download, FileText, Play, Loader2, Filter, Printer, Mail, FileSpreadsheet } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useTenantFilter } from '../../hooks/useTenantFilter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

const REPORT_TYPES = [
  { id: 'students', name_ar: 'تقرير الطلاب', name_en: 'Students Report', entity: 'Student' },
  { id: 'invoices', name_ar: 'تقرير الفواتير', name_en: 'Invoices Report', entity: 'Invoice' },
  { id: 'payments', name_ar: 'تقرير المدفوعات', name_en: 'Payments Report', entity: 'Payment' },
  { id: 'applications', name_ar: 'تقرير الطلبات', name_en: 'Applications Report', entity: 'Application' },
  { id: 'attendance', name_ar: 'تقرير الحضور', name_en: 'Attendance Report', entity: 'Attendance' },
  { id: 'ar_aging', name_ar: 'تقرير أعمار الذمم', name_en: 'AR Aging Report', entity: 'Invoice' },
  { id: 'collections', name_ar: 'تقرير التحصيل', name_en: 'Collections Report', entity: 'Payment' },
];

const FIELD_OPTIONS = {
  students: ['student_id', 'name_ar', 'name_en', 'grade', 'section', 'status', 'enrollment_date', 'nationality', 'gender'],
  invoices: ['invoice_number', 'student_name', 'grade', 'total_amount', 'paid_amount', 'balance', 'status', 'due_date', 'issue_date'],
  payments: ['payment_number', 'student_name', 'amount', 'payment_method', 'payment_date', 'status', 'reference_number'],
  applications: ['application_number', 'student_name_ar', 'applying_for_grade', 'status', 'guardian_name_ar', 'guardian_phone', 'created_at'],
  attendance: ['student_name', 'date', 'status', 'grade', 'section'],
  ar_aging: ['invoice_number', 'student_name', 'total_amount', 'balance', 'due_date', 'days_overdue', 'aging_bucket'],
  collections: ['payment_date', 'student_name', 'amount', 'payment_method', 'status'],
};

export default function ReportBuilder() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch: _filterByBranch, branches } = useBranch();
  const { tenantFilter, tenantId: _tenantId, hasTenantAccess: _hasTenantAccess } = useTenantFilter();
  
  const [reportType, setReportType] = useState('students');
  const [selectedFields, setSelectedFields] = useState(['name_ar', 'grade', 'status']);
  const [filters, setFilters] = useState({
    branch_id: selectedBranchId || 'all',
    status: 'all',
    grade: 'all',
    date_from: '',
    date_to: '',
  });
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);

  const currentReport = REPORT_TYPES.find(r => r.id === reportType);
  const availableFields = FIELD_OPTIONS[reportType] || [];

  const handleFieldToggle = (field) => {
    setSelectedFields(prev => 
      prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]
    );
  };

  const generateReport = async () => {
    setLoading(true);
    try {
      let data = [];
      
      switch (reportType) {
        case 'students':
          ({ data = [] } = await tenantQuery('students').select('*').match(tenantFilter()));
          break;
        case 'invoices':
        case 'ar_aging':
          ({ data = [] } = await tenantQuery('invoices').select('*').match(tenantFilter()));
          if (reportType === 'ar_aging') {
            const today = new Date();
            data = data.filter(inv => inv.status !== 'paid').map(inv => {
              const dueDate = inv.due_date ? new Date(inv.due_date) : today;
              const daysOverdue = Math.max(0, Math.floor((today - dueDate) / (1000 * 60 * 60 * 24)));
              let agingBucket = 'Current';
              if (daysOverdue > 0 && daysOverdue <= 30) agingBucket = '1-30 days';
              else if (daysOverdue > 30 && daysOverdue <= 60) agingBucket = '31-60 days';
              else if (daysOverdue > 60) agingBucket = '60+ days';
              return { ...inv, days_overdue: daysOverdue, aging_bucket: agingBucket, balance: (inv.total_amount || 0) - (inv.paid_amount || 0) };
            });
          }
          break;
        case 'payments':
        case 'collections':
          ({ data = [] } = await tenantQuery('payments').select('*').match(tenantFilter()));
          break;
        case 'applications':
          ({ data = [] } = await tenantQuery('applications').select('*').match(tenantFilter()));
          break;
        case 'attendance':
          ({ data = [] } = await tenantQuery('attendances').select('*').match(tenantFilter()));
          break;
      }

      // Apply filters
      if (filters.branch_id && filters.branch_id !== 'all') {
        data = data.filter(item => item.branch_id === filters.branch_id);
      }
      if (filters.status && filters.status !== 'all') {
        data = data.filter(item => item.status === filters.status);
      }
      if (filters.grade && filters.grade !== 'all') {
        data = data.filter(item => item.grade === filters.grade || item.applying_for_grade === filters.grade);
      }
      if (filters.date_from) {
        data = data.filter(item => {
          const dateField = item.payment_date || item.issue_date || item.enrollment_date || item.date || item.created_at;
          return dateField && new Date(dateField) >= new Date(filters.date_from);
        });
      }
      if (filters.date_to) {
        data = data.filter(item => {
          const dateField = item.payment_date || item.issue_date || item.enrollment_date || item.date || item.created_at;
          return dateField && new Date(dateField) <= new Date(filters.date_to);
        });
      }

      setReportData(data);
      toast.success(isRTL ? `تم تحميل ${data.length} سجل` : `Loaded ${data.length} records`);
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (reportData.length === 0) {
      toast.error(isRTL ? 'لا توجد بيانات للتصدير' : 'No data to export');
      return;
    }

    const headers = selectedFields.map(f => t(f) || f);
    const rows = reportData.map(item => 
      selectedFields.map(field => {
        const value = item[field];
        if (value === null || value === undefined) return '';
        if (typeof value === 'number') return value;
        return String(value).replace(/,/g, ';');
      })
    );

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${reportType}_report_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(isRTL ? 'تم التصدير بنجاح' : 'Exported successfully');
  };

  const printReport = () => {
    window.print();
  };

  const emailReport = () => {
    const reportName = REPORT_TYPES.find(r => r.id === reportType);
    const subject = `${reportName ? (isRTL ? reportName.name_ar : reportName.name_en) : 'Report'}`;
    window.open(`mailto:?subject=${encodeURIComponent(subject)}`);
  };

  const formatCellValue = (value, field) => {
    if (value === null || value === undefined) return '-';
    if (field.includes('amount') || field.includes('balance')) return `${Number(value).toLocaleString()} SAR`;
    if (field.includes('date')) return value ? format(new Date(value), 'dd/MM/yyyy') : '-';
    if (field === 'status' || field === 'grade') return t(value) || value;
    return value;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Filters Panel */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="w-4 h-4" />
            {isRTL ? 'إعدادات التقرير' : 'Report Settings'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Report Type */}
          <div className="space-y-2">
            <Label>{isRTL ? 'نوع التقرير' : 'Report Type'}</Label>
            <Select value={reportType} onValueChange={(v) => { setReportType(v); setSelectedFields(FIELD_OPTIONS[v]?.slice(0, 5) || []); setReportData([]); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map(r => (
                  <SelectItem key={r.id} value={r.id}>{isRTL ? r.name_ar : r.name_en}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Branch Filter */}
          <div className="space-y-2">
            <Label>{t('branch')}</Label>
            <Select value={filters.branch_id} onValueChange={(v) => setFilters(p => ({...p, branch_id: v}))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all')}</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name_ar}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Status Filter */}
          <div className="space-y-2">
            <Label>{t('status')}</Label>
            <Select value={filters.status} onValueChange={(v) => setFilters(p => ({...p, status: v}))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all')}</SelectItem>
                <SelectItem value="active">{t('active')}</SelectItem>
                <SelectItem value="paid">{t('paid')}</SelectItem>
                <SelectItem value="overdue">{t('overdue')}</SelectItem>
                <SelectItem value="pending">{t('pending')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date Range */}
          <div className="space-y-2">
            <Label>{isRTL ? 'من تاريخ' : 'From Date'}</Label>
            <Input type="date" value={filters.date_from} onChange={(e) => setFilters(p => ({...p, date_from: e.target.value}))} />
          </div>
          <div className="space-y-2">
            <Label>{isRTL ? 'إلى تاريخ' : 'To Date'}</Label>
            <Input type="date" value={filters.date_to} onChange={(e) => setFilters(p => ({...p, date_to: e.target.value}))} />
          </div>

          {/* Fields Selection */}
          <div className="space-y-2">
            <Label>{isRTL ? 'الحقول المعروضة' : 'Display Fields'}</Label>
            <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2">
              {availableFields.map(field => (
                <div key={field} className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedFields.includes(field)}
                    onCheckedChange={() => handleFieldToggle(field)}
                  />
                  <span className="text-sm">{t(field) || field}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-4">
            <Button className="w-full" onClick={generateReport} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <Play className="w-4 h-4 me-2" />}
              {isRTL ? 'تنفيذ التقرير' : 'Run Report'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full" disabled={reportData.length === 0}>
                  <Download className="w-4 h-4 me-2" />
                  {isRTL ? 'تصدير' : 'Export'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-56">
                <DropdownMenuItem onClick={exportToCSV}>
                  <FileSpreadsheet className="w-4 h-4 me-2" />
                  {isRTL ? 'تصدير Excel/CSV' : 'Export Excel/CSV'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={printReport}>
                  <Printer className="w-4 h-4 me-2" />
                  {isRTL ? 'طباعة' : 'Print'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={emailReport}>
                  <Mail className="w-4 h-4 me-2" />
                  {isRTL ? 'بريد إلكتروني' : 'Email'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>

      {/* Report Results */}
      <Card className="lg:col-span-3">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" />
              {currentReport ? (isRTL ? currentReport.name_ar : currentReport.name_en) : 'Report'}
            </CardTitle>
            {reportData.length > 0 && (
              <span className="text-sm text-slate-500">
                {reportData.length} {isRTL ? 'سجل' : 'records'}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {reportData.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{isRTL ? 'اختر نوع التقرير وانقر على "تنفيذ التقرير"' : 'Select report type and click "Run Report"'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    {selectedFields.map(field => (
                      <TableHead key={field}>{t(field) || field}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.slice(0, 100).map((item, idx) => (
                    <TableRow key={item.id || idx}>
                      {selectedFields.map(field => (
                        <TableCell key={field}>{formatCellValue(item[field], field)}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {reportData.length > 100 && (
                <p className="text-center text-sm text-slate-500 mt-4">
                  {isRTL ? `يتم عرض أول 100 سجل من ${reportData.length}` : `Showing first 100 of ${reportData.length} records`}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}