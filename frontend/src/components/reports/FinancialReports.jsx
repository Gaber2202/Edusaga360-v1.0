import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { getCurrencySymbol, formatCurrency } from '../../lib/localization';
import { useBranch } from '../BranchContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Printer, Mail, FileSpreadsheet, FileText, Play, Loader2, MoreVertical } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { useTenantFilter } from '../../hooks/useTenantFilter';
import { useTenant } from '../TenantContext';

const FINANCIAL_REPORTS = [
  { id: 'income_statement', name_ar: 'قائمة الدخل', name_en: 'Income Statement' },
  { id: 'balance_sheet', name_ar: 'الميزانية العمومية', name_en: 'Balance Sheet' },
  { id: 'cashflow', name_ar: 'قائمة التدفقات النقدية', name_en: 'Cash Flow Statement' },
  { id: 'trial_balance', name_ar: 'ميزان المراجعة', name_en: 'Trial Balance' },
  { id: 'ar_summary', name_ar: 'ملخص الحسابات المدينة', name_en: 'AR Summary' },
  { id: 'ap_summary', name_ar: 'ملخص الحسابات الدائنة', name_en: 'AP Summary' },
  { id: 'revenue_analysis', name_ar: 'تحليل الإيرادات', name_en: 'Revenue Analysis' },
  { id: 'expense_analysis', name_ar: 'تحليل المصروفات', name_en: 'Expense Analysis' },
];

export default function FinancialReports() {
  const { t, isRTL } = useLanguage();
  const { tenant } = useTenant();
  const { selectedBranchId, filterByBranch, branchFilter, branches: _branches } = useBranch();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  
  const [reportType, setReportType] = useState('income_statement');
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);

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

  const { data: journalEntries = [] } = useQuery({
    queryKey: ['journalEntries', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('journal_entries').select('*').match(tenantFilter(branchFilter()))),
    enabled: hasTenantAccess,
  });

  const { data: apBills = [] } = useQuery({
    queryKey: ['apBills', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('ap_bills').select('*').match(tenantFilter(branchFilter()))),
    enabled: hasTenantAccess,
  });

  const currentReport = FINANCIAL_REPORTS.find(r => r.id === reportType);

  const generateReport = async () => {
    setLoading(true);
    try {
      let data = {};
      const from = new Date(dateFrom);
      const to = new Date(dateTo);

      const filteredInvoices = filterByBranch(invoices).filter(inv => {
        const date = inv.issue_date ? new Date(inv.issue_date) : null;
        return date && date >= from && date <= to;
      });

      const _filteredPayments = filterByBranch(payments).filter(p => {
        const date = p.payment_date ? new Date(p.payment_date) : null;
        return date && date >= from && date <= to;
      });

      const filteredJournals = filterByBranch(journalEntries).filter(je => {
        const date = je.date ? new Date(je.date) : null;
        return date && date >= from && date <= to;
      });

      const filteredBills = filterByBranch(apBills).filter(b => {
        const date = b.bill_date ? new Date(b.bill_date) : null;
        return date && date >= from && date <= to;
      });

      switch (reportType) {
        case 'income_statement':
          const revenue = filteredInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
          const expenses = filteredBills.reduce((sum, b) => sum + (b.total_amount || 0), 0);
          data = {
            revenue,
            expenses,
            netIncome: revenue - expenses,
            items: [
              { category: isRTL ? 'الإيرادات' : 'Revenue', amount: revenue },
              { category: isRTL ? 'المصروفات' : 'Expenses', amount: expenses },
              { category: isRTL ? 'صافي الدخل' : 'Net Income', amount: revenue - expenses, highlight: true }
            ]
          };
          break;

        case 'ar_summary':
          const totalAR = filteredInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
          const collectedAR = filteredInvoices.reduce((sum, inv) => sum + (inv.paid_amount || 0), 0);
          data = {
            totalBilled: totalAR,
            totalCollected: collectedAR,
            outstanding: totalAR - collectedAR,
            items: filteredInvoices.map(inv => ({
              invoice: inv.invoice_number,
              student: inv.student_name,
              total: inv.total_amount,
              collected: inv.paid_amount || 0,
              balance: (inv.total_amount || 0) - (inv.paid_amount || 0),
              dueDate: inv.due_date
            }))
          };
          break;

        case 'ap_summary':
          const totalAP = filteredBills.reduce((sum, b) => sum + (b.total_amount || 0), 0);
          const paidAP = filteredBills.reduce((sum, b) => sum + (b.paid_amount || 0), 0);
          data = {
            totalBills: totalAP,
            totalPaid: paidAP,
            outstanding: totalAP - paidAP,
            items: filteredBills.map(b => ({
              bill: b.bill_number,
              vendor: b.vendor_name,
              total: b.total_amount,
              paid: b.paid_amount || 0,
              balance: (b.total_amount || 0) - (b.paid_amount || 0),
              dueDate: b.due_date
            }))
          };
          break;

        case 'revenue_analysis':
          const revenueByMonth = Array.from({ length: 6 }, (_, i) => {
            const month = subMonths(to, 5 - i);
            const monthInvoices = filteredInvoices.filter(inv => {
              const date = new Date(inv.issue_date);
              return date.getMonth() === month.getMonth() && date.getFullYear() === month.getFullYear();
            });
            return {
              month: format(month, 'MMM yyyy'),
              revenue: monthInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0)
            };
          });
          data = { items: revenueByMonth, total: filteredInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0) };
          break;

        case 'trial_balance':
          const accountBalances = new Map();
          filteredJournals.forEach(je => {
            je.lines?.forEach(line => {
              const current = accountBalances.get(line.account_code) || { account: line.account_name, debit: 0, credit: 0 };
              accountBalances.set(line.account_code, {
                account: line.account_name,
                debit: current.debit + (line.debit || 0),
                credit: current.credit + (line.credit || 0)
              });
            });
          });
          data = {
            items: Array.from(accountBalances.values()).map(acc => ({
              ...acc,
              balance: acc.debit - acc.credit
            })),
            totalDebit: Array.from(accountBalances.values()).reduce((sum, acc) => sum + acc.debit, 0),
            totalCredit: Array.from(accountBalances.values()).reduce((sum, acc) => sum + acc.credit, 0)
          };
          break;

        default:
          data = { items: [], message: isRTL ? 'قريباً' : 'Coming soon' };
      }

      setReportData(data);
      toast.success(isRTL ? 'تم إنشاء التقرير' : 'Report generated');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = () => {
    if (!reportData) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(currentReport ? (isRTL ? currentReport.name_ar : currentReport.name_en) : 'Financial Report', 20, 20);
    doc.setFontSize(10);
    doc.text(`${isRTL ? 'الفترة' : 'Period'}: ${format(new Date(dateFrom), 'dd/MM/yyyy')} - ${format(new Date(dateTo), 'dd/MM/yyyy')}`, 20, 30);
    
    let y = 45;
    if (reportType === 'income_statement') {
      reportData.items?.forEach(item => {
        doc.setFontSize(item.highlight ? 12 : 10);
        doc.text(`${item.category}: $<Currency amount={item.amount} />`, 20, y);
        y += item.highlight ? 10 : 7;
      });
    } else if (reportType === 'ar_summary' || reportType === 'ap_summary') {
      doc.text(`${isRTL ? 'الإجمالي' : 'Total'}: ${formatCurrency((reportData.totalBilled || reportData.totalBills || 0).toLocaleString(), tenant?.localization, isRTL)}`, 20, y);
      y += 7;
      doc.text(`${isRTL ? 'المتبقي' : 'Outstanding'}: $<Currency amount={reportData.outstanding} />`, 20, y);
    }
    
    doc.save(`${reportType}_${format(new Date(), 'yyyyMMdd')}.pdf`);
    toast.success(isRTL ? 'تم التنزيل' : 'Downloaded');
  };

  const downloadExcel = () => {
    if (!reportData || !reportData.items) {
      toast.error(isRTL ? 'لا توجد بيانات' : 'No data');
      return;
    }

    const headers = Object.keys(reportData.items[0] || {});
    const rows = reportData.items.map(item => headers.map(h => item[h] || ''));
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${reportType}_${format(new Date(), 'yyyyMMdd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(isRTL ? 'تم التصدير' : 'Exported');
  };

  const printReport = () => {
    window.print();
  };

  const emailReport = () => {
    const subject = `${currentReport ? (isRTL ? currentReport.name_ar : currentReport.name_en) : 'Report'} - ${format(new Date(dateFrom), 'dd/MM/yyyy')} to ${format(new Date(dateTo), 'dd/MM/yyyy')}`;
    window.open(`mailto:?subject=${encodeURIComponent(subject)}`);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Settings Panel */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-base">{isRTL ? 'إعدادات' : 'Settings'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{isRTL ? 'نوع التقرير' : 'Report Type'}</Label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FINANCIAL_REPORTS.map(r => (
                  <SelectItem key={r.id} value={r.id}>{isRTL ? r.name_ar : r.name_en}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{isRTL ? 'من تاريخ' : 'From Date'}</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{isRTL ? 'إلى تاريخ' : 'To Date'}</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <Button className="w-full" onClick={generateReport} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <Play className="w-4 h-4 me-2" />}
            {isRTL ? 'إنشاء التقرير' : 'Generate Report'}
          </Button>
        </CardContent>
      </Card>

      {/* Report Display */}
      <Card className="lg:col-span-3">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{currentReport ? (isRTL ? currentReport.name_ar : currentReport.name_en) : 'Report'}</CardTitle>
            {reportData && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={isRTL ? 'start' : 'end'}>
                  <DropdownMenuItem onClick={downloadPDF}>
                    <FileText className="w-4 h-4 me-2" />
                    {isRTL ? 'تنزيل PDF' : 'Download PDF'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={downloadExcel}>
                    <FileSpreadsheet className="w-4 h-4 me-2" />
                    {isRTL ? 'تنزيل Excel' : 'Download Excel'}
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
            )}
          </div>
          {reportData && (
            <p className="text-sm text-muted-foreground">
              {format(new Date(dateFrom), 'dd MMM yyyy')} - {format(new Date(dateTo), 'dd MMM yyyy')}
            </p>
          )}
        </CardHeader>
        <CardContent>
          {!reportData ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{isRTL ? 'اختر التقرير وانقر على "إنشاء التقرير"' : 'Select report and click "Generate Report"'}</p>
            </div>
          ) : reportData.items ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              {(reportType === 'income_statement' || reportType === 'ar_summary' || reportType === 'ap_summary') && (
                <div className="grid grid-cols-3 gap-4">
                  {reportType === 'income_statement' && (
                    <>
                      <Card className="bg-emerald-50"><CardContent className="p-4"><div className="text-sm text-muted-foreground">{isRTL ? 'الإيرادات' : 'Revenue'}</div><div className="text-xl font-bold">{reportData.revenue?.toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}</div></CardContent></Card>
                      <Card className="bg-red-50"><CardContent className="p-4"><div className="text-sm text-muted-foreground">{isRTL ? 'المصروفات' : 'Expenses'}</div><div className="text-xl font-bold">{reportData.expenses?.toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}</div></CardContent></Card>
                      <Card className="bg-najdi-50"><CardContent className="p-4"><div className="text-sm text-muted-foreground">{isRTL ? 'صافي الدخل' : 'Net Income'}</div><div className="text-xl font-bold">{reportData.netIncome?.toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}</div></CardContent></Card>
                    </>
                  )}
                  {reportType === 'ar_summary' && (
                    <>
                      <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">{isRTL ? 'المفوتر' : 'Billed'}</div><div className="text-xl font-bold">{reportData.totalBilled?.toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}</div></CardContent></Card>
                      <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">{isRTL ? 'المحصل' : 'Collected'}</div><div className="text-xl font-bold text-emerald-600">{reportData.totalCollected?.toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}</div></CardContent></Card>
                      <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">{isRTL ? 'المتبقي' : 'Outstanding'}</div><div className="text-xl font-bold text-red-600">{reportData.outstanding?.toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}</div></CardContent></Card>
                    </>
                  )}
                </div>
              )}

              {/* Data Table */}
              <div className="overflow-x-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-sand">
                      {reportData.items[0] && Object.keys(reportData.items[0]).map(key => (
                        <TableHead key={key}>{t(key) || key}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.items.map((item, idx) => (
                      <TableRow key={idx} className={item.highlight ? 'bg-sand font-semibold' : ''}>
                        {Object.entries(item).map(([key, value]) => (
                          <TableCell key={key}>
                            {typeof value === 'number' && key.includes('amount') || key.includes('balance') || key.includes('total') || key.includes('revenue') 
                              ? `${value.toLocaleString()} ${getCurrencySymbol(tenant?.localization, isRTL)}` 
                              : value}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <p className="text-center py-12 text-muted-foreground">{reportData.message}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}