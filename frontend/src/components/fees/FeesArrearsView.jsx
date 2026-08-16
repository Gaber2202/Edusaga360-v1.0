import React, { useState } from 'react';
import { useTenant } from '../TenantContext';
import { formatCurrency, getCurrencySymbol } from '../../lib/localization';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { differenceInDays } from 'date-fns';
import { AlertTriangle, Search, CreditCard } from 'lucide-react';

const AGING_BUCKETS = [
  { key: '0-30',   label_ar: '0–30 يوم',   label_en: '0–30 Days',   max: 30,  color: 'bg-yellow-100 text-yellow-700' },
  { key: '31-60',  label_ar: '31–60 يوم',  label_en: '31–60 Days',  max: 60,  color: 'bg-orange-100 text-orange-700' },
  { key: '61-90',  label_ar: '61–90 يوم',  label_en: '61–90 Days',  max: 90,  color: 'bg-red-100 text-red-700'    },
  { key: '90+',    label_ar: 'أكثر من 90', label_en: '90+ Days',    max: Infinity, color: 'bg-red-200 text-red-800' },
];

const ESCALATION_ACTIONS = {
  1:  { ar: 'تذكير واتساب', en: 'WhatsApp Reminder' },
  3:  { ar: 'بريد + واتساب', en: 'Email + WhatsApp' },
  7:  { ar: 'مكالمة هاتفية', en: 'Phone Call Task' },
  14: { ar: 'خطاب رسمي', en: 'Formal Notice' },
  30: { ar: 'إشعار مدير المالية', en: 'Finance Manager Alert' },
  45: { ar: 'تفعيل القيود', en: 'Activate Restrictions' },
};

export default function FeesArrearsView({ invoices, isRTL, userRole, onRecordPayment }) {
  const { tenant } = useTenant();
  const [search, setSearch] = useState('');
  const [bucketFilter, setBucketFilter] = useState('all');

  const now = new Date();

  const overdueInvoices = invoices.filter(i => ['overdue', 'issued', 'partial'].includes(i.status) && (i.total_amount || 0) > (i.paid_amount || 0));

  const withDays = overdueInvoices.map(inv => {
    const daysOverdue = inv.due_date ? Math.max(0, differenceInDays(now, new Date(inv.due_date))) : 0;
    const balance = (inv.total_amount || 0) - (inv.paid_amount || 0);
    let bucket = '0-30';
    if (daysOverdue > 90) bucket = '90+';
    else if (daysOverdue > 60) bucket = '61-90';
    else if (daysOverdue > 30) bucket = '31-60';

    const escalations = Object.entries(ESCALATION_ACTIONS)
      .filter(([days]) => daysOverdue >= parseInt(days))
      .map(([days, action]) => ({ days: parseInt(days), ...action }));

    return { ...inv, daysOverdue, balance, bucket, escalations };
  });

  const filtered = withDays.filter(inv => {
    const q = search.toLowerCase();
    const matchSearch = !q || inv.student_name?.toLowerCase().includes(q) || inv.invoice_number?.toLowerCase().includes(q);
    const matchBucket = bucketFilter === 'all' || inv.bucket === bucketFilter;
    return matchSearch && matchBucket;
  }).sort((a, b) => b.daysOverdue - a.daysOverdue);

  // Aging summary
  const agingSummary = AGING_BUCKETS.map(b => {
    const bucketItems = withDays.filter(i => i.bucket === b.key);
    return { ...b, count: bucketItems.length, amount: bucketItems.reduce((s, i) => s + i.balance, 0) };
  });

  const totalOverdue = withDays.reduce((s, i) => s + i.balance, 0);
  const canManage = ['admin', 'finance', 'accountant', 'creator'].includes(userRole);

  return (
    <div className="space-y-5">
      {/* Aging buckets */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {agingSummary.map(b => (
          <button
            key={b.key}
            onClick={() => setBucketFilter(bucketFilter === b.key ? 'all' : b.key)}
            className={`text-start p-4 rounded-xl border-2 transition-all ${bucketFilter === b.key ? 'border-slate-800 shadow-md' : 'border-border hover:border-border'} bg-white`}
          >
            <div className={`text-xs px-2 py-0.5 rounded-full font-medium w-fit mb-2 ${b.color}`}>
              {isRTL ? b.label_ar : b.label_en}
            </div>
            <div className="text-xl font-bold text-ink">{formatCurrency(b.amount, tenant?.localization, isRTL)}</div>
            <div className="text-xs text-muted-foreground">{getCurrencySymbol(tenant?.localization, isRTL)} · {b.count} {isRTL ? 'فاتورة' : 'invoices'}</div>
          </button>
        ))}
      </div>

      {/* Total summary */}
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-red-700">
            {isRTL ? `إجمالي المتأخرات: ${formatCurrency(totalOverdue, tenant?.localization, isRTL)}` : `Total Arrears: ${formatCurrency(totalOverdue, tenant?.localization, isRTL)}`}
          </p>
          <p className="text-xs text-red-500">{filtered.length} {isRTL ? 'فاتورة متأخرة' : 'overdue invoices'}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-72">
        <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
        <Input
          placeholder={isRTL ? 'بحث...' : 'Search...'}
          value={search} onChange={e => setSearch(e.target.value)}
          className={`${isRTL ? 'pr-9' : 'pl-9'} bg-white h-9 text-sm`}
        />
      </div>

      {/* Arrears table */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isRTL ? 'الطالب' : 'Student'}</TableHead>
                <TableHead className="w-28">{isRTL ? 'رقم الفاتورة' : 'Invoice #'}</TableHead>
                <TableHead className="text-end">{isRTL ? 'المبلغ المتبقي' : 'Balance'}</TableHead>
                <TableHead className="w-24 text-center">{isRTL ? 'أيام التأخر' : 'Days Late'}</TableHead>
                <TableHead className="w-28">{isRTL ? 'التصنيف' : 'Bucket'}</TableHead>
                <TableHead>{isRTL ? 'الإجراءات المفعّلة' : 'Escalations Active'}</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    {isRTL ? 'لا توجد متأخرات' : 'No arrears found'}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(inv => {
                  const bucket = AGING_BUCKETS.find(b => b.key === inv.bucket);
                  return (
                    <TableRow key={inv.id} className={inv.daysOverdue > 45 ? 'bg-red-50/30' : ''}>
                      <TableCell>
                        <p className="font-medium text-ink text-sm">{inv.student_name}</p>
                        <p className="text-xs text-muted-foreground">{inv.grade}</p>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">{inv.invoice_number}</span>
                      </TableCell>
                      <TableCell className="text-end font-bold text-red-600">
                        {formatCurrency(inv.balance, tenant?.localization, isRTL)}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-sm font-bold ${inv.daysOverdue > 30 ? 'text-red-600' : 'text-amber-600'}`}>
                          {inv.daysOverdue}
                        </span>
                      </TableCell>
                      <TableCell>
                        {bucket && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${bucket.color}`}>
                            {isRTL ? bucket.label_ar : bucket.label_en}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {inv.escalations.slice(-2).map((esc, i) => (
                            <span key={i} className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                              {isRTL ? esc.ar : esc.en}
                            </span>
                          ))}
                          {inv.escalations.length === 0 && (
                            <span className="text-xs text-muted-foreground">{isRTL ? 'لا إجراءات بعد' : 'None yet'}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {canManage && (
                          <Button size="sm" className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white px-2 text-xs" onClick={() => onRecordPayment(inv)}>
                            <CreditCard className="w-3 h-3 me-1" />
                            {isRTL ? 'تحصيل' : 'Collect'}
                          </Button>
                        )}
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