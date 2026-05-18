import React, { useState, useMemo } from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Card } from '../ui/card';
import StatCard from '../ui/StatCard';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { format } from 'date-fns';
import { logAuditEvent, AuditActions } from '../AuditService';
import { createPageUrl } from '../../utils';
import {
  Search, Download, CreditCard, FileText, Printer, MoreVertical,
  DollarSign, AlertCircle, Banknote, CheckCircle, Info,
  Building2, Wallet, Filter
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../ui/dropdown-menu';

const STATUS_CONFIG = {
  draft:    { label_ar: 'مسودة',        label_en: 'Draft',    cls: 'bg-slate-100 text-slate-600'  },
  issued:   { label_ar: 'صادرة',        label_en: 'Issued',   cls: 'bg-blue-100 text-blue-700'   },
  sent:     { label_ar: 'مرسلة',        label_en: 'Sent',     cls: 'bg-indigo-100 text-indigo-700'},
  partial:  { label_ar: 'مدفوع جزئياً', label_en: 'Partial',  cls: 'bg-yellow-100 text-yellow-700'},
  paid:     { label_ar: 'مدفوع',        label_en: 'Paid',     cls: 'bg-green-100 text-green-700'  },
  overdue:  { label_ar: 'متأخر',        label_en: 'Overdue',  cls: 'bg-red-100 text-red-700'     },
  cancelled:{ label_ar: 'ملغاة',        label_en: 'Cancelled',cls: 'bg-slate-100 text-slate-400'  },
  refunded: { label_ar: 'مسترد',        label_en: 'Refunded', cls: 'bg-purple-100 text-purple-700'},
};

const PAY_METHOD_ICONS = {
  credit_card: <CreditCard className="w-3 h-3" />,
  bank_transfer: <Building2 className="w-3 h-3" />,
  cash: <Banknote className="w-3 h-3" />,
  mada: <CreditCard className="w-3 h-3 text-green-600" />,
  cheque: <FileText className="w-3 h-3" />,
  internal_settlement: <Wallet className="w-3 h-3" />,
};

const PAY_METHOD_LABEL = {
  credit_card: { ar: 'بطاقة', en: 'Card' },
  bank_transfer: { ar: 'تحويل', en: 'Transfer' },
  cash: { ar: 'نقداً', en: 'Cash' },
  mada: { ar: 'مدى', en: 'Mada' },
  cheque: { ar: 'شيك', en: 'Cheque' },
  sadad: { ar: 'سداد', en: 'SADAD' },
  stc_pay: { ar: 'STC Pay', en: 'STC Pay' },
  apple_pay: { ar: 'Apple Pay', en: 'Apple Pay' },
  internal_settlement: { ar: 'تسوية', en: 'Settlement' },
};

export default function FeesInvoiceList({
  invoices, paymentLogs, loading, userRole, isRTL,
  onRecordPayment, onEditInvoice, onRefresh: _onRefresh
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');

  const filtered = useMemo(() => invoices.filter(inv => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      inv.student_name?.toLowerCase().includes(q) ||
      inv.invoice_number?.toLowerCase().includes(q) ||
      inv.grade?.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || inv.status === statusFilter;
    const matchGrade = gradeFilter === 'all' || inv.grade === gradeFilter;
    return matchSearch && matchStatus && matchGrade;
  }), [invoices, search, statusFilter, gradeFilter]);

  const stats = useMemo(() => {
    const active = invoices.filter(i => !['cancelled','draft'].includes(i.status));
    const total = active.reduce((s, i) => s + (i.total_amount || 0), 0);
    const paid = active.reduce((s, i) => s + (i.paid_amount || 0), 0);
    return {
      total, paid,
      pending: total - paid,
      overdue: invoices.filter(i => i.status === 'overdue').length,
    };
  }, [invoices]);

  const statusCounts = useMemo(() => {
    const counts = { all: invoices.length };
    Object.keys(STATUS_CONFIG).forEach(s => {
      counts[s] = invoices.filter(i => i.status === s).length;
    });
    return counts;
  }, [invoices]);

  const grades = [...new Set(invoices.map(i => i.grade).filter(Boolean))].sort();

  const getMethodsForInvoice = (inv) => {
    if (!inv.paid_amount) return null;
    const logs = paymentLogs.filter(l => l.invoice_id === inv.id && l.status !== 'reversed');
    if (!logs.length) return inv.preferred_payment_method ? { [inv.preferred_payment_method]: inv.paid_amount } : null;
    const map = {};
    logs.forEach(l => { map[l.payment_method] = (map[l.payment_method] || 0) + l.amount; });
    return map;
  };

  const exportCSV = async () => {
    const headers = ['Invoice #', 'Student', 'Grade', 'Total', 'Paid', 'Balance', 'Status', 'Due Date'];
    const rows = filtered.map(i => [
      i.invoice_number, i.student_name, i.grade,
      i.total_amount, i.paid_amount || 0,
      (i.total_amount || 0) - (i.paid_amount || 0),
      i.status, i.due_date
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'invoices.csv'; a.click();
    await logAuditEvent({ action: AuditActions.EXPORT, entityType: 'Invoice', entityId: 'bulk' });
  };

  const StatusBadge = ({ status }) => {
    const cfg = STATUS_CONFIG[status] || { label_ar: status, label_en: status, cls: 'bg-slate-100 text-slate-600' };
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>{isRTL ? cfg.label_ar : cfg.label_en}</span>;
  };

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title={isRTL ? 'إجمالي الرسوم' : 'Total Fees'} value={`${stats.total.toLocaleString()} ${isRTL ? 'ر.س' : 'SAR'}`} icon={DollarSign} iconClassName="bg-slate-100" />
        <StatCard title={isRTL ? 'المحصل' : 'Collected'} value={`${stats.paid.toLocaleString()} ${isRTL ? 'ر.س' : 'SAR'}`} icon={CheckCircle} iconClassName="bg-emerald-50" />
        <StatCard title={isRTL ? 'المتبقي' : 'Outstanding'} value={`${stats.pending.toLocaleString()} ${isRTL ? 'ر.س' : 'SAR'}`} icon={Banknote} iconClassName="bg-amber-50" />
        <StatCard title={isRTL ? 'متأخرة' : 'Overdue'} value={stats.overdue} icon={AlertCircle} iconClassName="bg-red-50" />
      </div>

      {/* Status tabs */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="bg-white border border-slate-200 flex-wrap h-auto gap-1">
          {[
            ['all', 'الكل', 'All'],
            ['issued', 'صادرة', 'Issued'],
            ['partial', 'جزئي', 'Partial'],
            ['paid', 'مدفوع', 'Paid'],
            ['overdue', 'متأخر', 'Overdue'],
            ['cancelled', 'ملغاة', 'Cancelled'],
          ].map(([val, ar, en]) => (
            <TabsTrigger key={val} value={val} className="data-[state=active]:bg-slate-900 data-[state=active]:text-white text-xs">
              {isRTL ? ar : en} ({statusCounts[val] || 0})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Filters + actions */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
          <Input
            placeholder={isRTL ? 'بحث بالاسم أو رقم الفاتورة...' : 'Search by name or invoice #...'}
            value={search} onChange={e => setSearch(e.target.value)}
            className={`${isRTL ? 'pr-9' : 'pl-9'} bg-white h-9 text-sm`}
          />
        </div>
        <Select value={gradeFilter} onValueChange={setGradeFilter}>
          <SelectTrigger className="w-36 bg-white h-9">
            <Filter className="w-3.5 h-3.5 me-1.5 text-slate-400" />
            <SelectValue placeholder={isRTL ? 'الصف' : 'Grade'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isRTL ? 'جميع الصفوف' : 'All Grades'}</SelectItem>
            {grades.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportCSV} className="h-9 gap-1.5">
          <Download className="w-3.5 h-3.5" />
          {isRTL ? 'تصدير' : 'Export'}
        </Button>
        <span className="text-xs text-slate-400">{filtered.length} {isRTL ? 'فاتورة' : 'invoices'}</span>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">{isRTL ? 'رقم الفاتورة' : 'Invoice #'}</TableHead>
                <TableHead>{isRTL ? 'الطالب' : 'Student'}</TableHead>
                <TableHead className="w-20">{isRTL ? 'الصف' : 'Grade'}</TableHead>
                <TableHead className="text-end">{isRTL ? 'الإجمالي' : 'Total'}</TableHead>
                <TableHead className="text-end">{isRTL ? 'المدفوع' : 'Paid'}</TableHead>
                <TableHead className="text-end">{isRTL ? 'المتبقي' : 'Balance'}</TableHead>
                <TableHead className="w-24">{isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}</TableHead>
                <TableHead className="w-28">{isRTL ? 'الحالة' : 'Status'}</TableHead>
                <TableHead className="w-32">{isRTL ? 'طريقة الدفع' : 'Method'}</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-12">
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-12 text-slate-400">
                  {isRTL ? 'لا توجد فواتير' : 'No invoices found'}
                </TableCell></TableRow>
              ) : (
                filtered.map(inv => {
                  const balance = (inv.total_amount || 0) - (inv.paid_amount || 0);
                  const methods = getMethodsForInvoice(inv);
                  const methodKeys = methods ? Object.keys(methods) : [];
                  return (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => { window.location.href = createPageUrl('InvoiceDetails') + '?id=' + inv.id; }}
                    >
                      <TableCell><span className="font-mono text-xs text-slate-600">{inv.invoice_number}</span></TableCell>
                      <TableCell>
                        <p className="font-medium text-slate-800 text-sm">{inv.student_name}</p>
                        {inv.academic_year && <p className="text-xs text-slate-400">{inv.academic_year}</p>}
                      </TableCell>
                      <TableCell><span className="text-sm text-slate-600">{inv.grade}</span></TableCell>
                      <TableCell className="text-end font-semibold text-sm">{inv.total_amount?.toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</TableCell>
                      <TableCell className="text-end text-emerald-600 text-sm">{(inv.paid_amount || 0).toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</TableCell>
                      <TableCell className="text-end">
                        <span className={`text-sm font-medium ${balance > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                          {balance.toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs ${inv.status === 'overdue' ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                          {inv.due_date ? format(new Date(inv.due_date), 'dd/MM/yyyy') : '-'}
                        </span>
                      </TableCell>
                      <TableCell><StatusBadge status={inv.status} /></TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        {methods && methodKeys.length === 1 ? (
                          <div className="flex items-center gap-1 text-slate-600">
                            {PAY_METHOD_ICONS[methodKeys[0]] || <CreditCard className="w-3 h-3" />}
                            <span className="text-xs">{isRTL ? PAY_METHOD_LABEL[methodKeys[0]]?.ar : PAY_METHOD_LABEL[methodKeys[0]]?.en || methodKeys[0]}</span>
                          </div>
                        ) : methods && methodKeys.length > 1 ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1">
                                <Info className="w-3 h-3" />{isRTL ? 'مختلط' : 'Mixed'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-52">
                              {methodKeys.map(m => (
                                <div key={m} className="flex justify-between text-xs py-1">
                                  <span>{isRTL ? PAY_METHOD_LABEL[m]?.ar : PAY_METHOD_LABEL[m]?.en || m}</span>
                                  <span className="font-medium">{methods[m].toLocaleString()}</span>
                                </div>
                              ))}
                            </PopoverContent>
                          </Popover>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7"><MoreVertical className="w-3.5 h-3.5" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align={isRTL ? 'start' : 'end'}>
                            {['admin','finance','accountant'].includes(userRole) && !['paid','cancelled'].includes(inv.status) && (
                              <DropdownMenuItem onClick={() => onRecordPayment(inv)}>
                                <CreditCard className="w-4 h-4 me-2" />{isRTL ? 'تسجيل دفعة' : 'Record Payment'}
                              </DropdownMenuItem>
                            )}
                            {['admin','finance'].includes(userRole) && (
                              <DropdownMenuItem onClick={() => onEditInvoice(inv)}>
                                <FileText className="w-4 h-4 me-2" />{isRTL ? 'تعديل' : 'Edit'}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem>
                              <Printer className="w-4 h-4 me-2" />{isRTL ? 'طباعة' : 'Print'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}