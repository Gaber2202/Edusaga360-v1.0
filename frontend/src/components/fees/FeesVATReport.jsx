import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Download, Receipt, CheckCircle, AlertCircle } from 'lucide-react';
import { logAuditEvent, AuditActions } from '../AuditService';

const VAT_RATE = 0.15;

export default function FeesVATReport({ invoices, payments: _payments, isRTL }) {
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  const filteredInvoices = invoices.filter(inv => {
    if (!inv.issue_date && !inv.created_date) return false;
    const d = new Date(inv.issue_date || inv.created_date);
    return d >= new Date(dateFrom) && d <= new Date(dateTo);
  }).filter(inv => !['draft','cancelled'].includes(inv.status));

  const totalExVAT = filteredInvoices.reduce((s, i) => s + ((i.subtotal || i.total_amount || 0) / (1 + VAT_RATE)), 0);
  const totalVAT = filteredInvoices.reduce((s, i) => s + (i.vat_amount || ((i.total_amount||0) - ((i.subtotal || i.total_amount||0)/(1+VAT_RATE)))), 0);
  const totalIncVAT = filteredInvoices.reduce((s, i) => s + (i.total_amount || 0), 0);
  const paidVAT = filteredInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.vat_amount || ((i.total_amount||0) * VAT_RATE / (1 + VAT_RATE))), 0);

  const exportVATReport = () => {
    const headers = ['Invoice #', 'Student', 'Issue Date', 'Total (ex-VAT)', 'VAT (15%)', 'Total (inc-VAT)', 'Status'];
    const rows = filteredInvoices.map(inv => {
      const exVAT = (inv.subtotal || inv.total_amount || 0) / (1 + VAT_RATE);
      const vat = inv.vat_amount || (inv.total_amount||0) * VAT_RATE / (1 + VAT_RATE);
      return [
        inv.invoice_number, inv.student_name,
        inv.issue_date || inv.created_date?.slice(0,10),
        exVAT.toFixed(2), vat.toFixed(2), (inv.total_amount||0).toFixed(2),
        inv.status
      ];
    });
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `vat-report-${dateFrom}-${dateTo}.csv`; a.click();
    logAuditEvent({ action: AuditActions.EXPORT, entityType: 'VATReport', entityId: null, newValues: { format: 'csv', dateFrom, dateTo } });
  };

  return (
    <div className="space-y-6">
      {/* Date filter */}
      <div className="flex gap-4 flex-wrap items-end">
        <div>
          <Label className="text-xs">{isRTL ? 'من' : 'From'}</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-white h-9 mt-1" />
        </div>
        <div>
          <Label className="text-xs">{isRTL ? 'إلى' : 'To'}</Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-white h-9 mt-1" />
        </div>
        <Button onClick={exportVATReport} variant="outline" className="h-9 gap-1.5">
          <Download className="w-4 h-4" />
          {isRTL ? 'تصدير تقرير الضريبة' : 'Export VAT Report'}
        </Button>
      </div>

      {/* VAT Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: isRTL ? 'الإجمالي (بدون ضريبة)' : 'Total (ex-VAT)', value: `${totalExVAT.toLocaleString('en', {maximumFractionDigits:2})} SAR`, icon: Receipt, cls: 'bg-slate-100 text-slate-600' },
          { label: isRTL ? 'ضريبة القيمة المضافة (15%)' : 'VAT (15%)', value: `${totalVAT.toLocaleString('en', {maximumFractionDigits:2})} SAR`, icon: Receipt, cls: 'bg-blue-100 text-blue-600' },
          { label: isRTL ? 'الإجمالي (شامل الضريبة)' : 'Total (inc-VAT)', value: `${totalIncVAT.toLocaleString('en', {maximumFractionDigits:2})} SAR`, icon: CheckCircle, cls: 'bg-emerald-100 text-emerald-600' },
          { label: isRTL ? 'ضريبة مدفوعة فعلياً' : 'VAT Collected', value: `${paidVAT.toLocaleString('en', {maximumFractionDigits:2})} SAR`, icon: CheckCircle, cls: 'bg-green-100 text-green-600' },
        ].map((kpi, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${kpi.cls}`}>
                <kpi.icon className="w-4 h-4" />
              </div>
              <div className="text-lg font-bold text-slate-800 leading-tight">{kpi.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ZATCA compliance note */}
      <div className="flex gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-700">{isRTL ? 'الامتثال لمتطلبات هيئة الزكاة والضريبة (ZATCA)' : 'ZATCA Compliance Notice'}</p>
          <p className="text-xs text-blue-600 mt-0.5">
            {isRTL
              ? 'يُلزم نظام هيئة الزكاة والضريبة والجمارك بإصدار فواتير إلكترونية لجميع المعاملات. يُرجى مراجعة الفواتير قبل التقديم للهيئة.'
              : 'ZATCA requires e-invoicing for all transactions. Please review invoices before submission to the authority. Phase 2 requires cryptographic stamping.'}
          </p>
        </div>
      </div>

      {/* Invoice detail table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {isRTL ? `الفواتير في الفترة (${filteredInvoices.length})` : `Invoices in Period (${filteredInvoices.length})`}
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isRTL ? 'رقم الفاتورة' : 'Invoice #'}</TableHead>
                <TableHead>{isRTL ? 'الطالب' : 'Student'}</TableHead>
                <TableHead>{isRTL ? 'تاريخ الإصدار' : 'Issue Date'}</TableHead>
                <TableHead className="text-end">{isRTL ? 'بدون ضريبة' : 'Ex-VAT'}</TableHead>
                <TableHead className="text-end">{isRTL ? 'الضريبة 15%' : 'VAT 15%'}</TableHead>
                <TableHead className="text-end">{isRTL ? 'الإجمالي' : 'Total'}</TableHead>
                <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-slate-400">
                    {isRTL ? 'لا توجد فواتير في هذه الفترة' : 'No invoices in this period'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvoices.map(inv => {
                  const exVAT = (inv.subtotal || inv.total_amount || 0) / (1 + VAT_RATE);
                  const vat = inv.vat_amount || (inv.total_amount||0) * VAT_RATE / (1 + VAT_RATE);
                  return (
                    <TableRow key={inv.id}>
                      <TableCell><span className="font-mono text-xs">{inv.invoice_number}</span></TableCell>
                      <TableCell><span className="text-sm">{inv.student_name}</span></TableCell>
                      <TableCell><span className="text-xs text-slate-500">{(inv.issue_date || inv.created_date?.slice(0,10)) || '-'}</span></TableCell>
                      <TableCell className="text-end text-sm">{exVAT.toLocaleString('en', {maximumFractionDigits:2})}</TableCell>
                      <TableCell className="text-end text-sm text-blue-600">{vat.toLocaleString('en', {maximumFractionDigits:2})}</TableCell>
                      <TableCell className="text-end font-semibold text-sm">{(inv.total_amount||0).toLocaleString('en', {maximumFractionDigits:2})}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${inv.status === 'paid' ? 'bg-green-100 text-green-700' : inv.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                          {inv.status}
                        </span>
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