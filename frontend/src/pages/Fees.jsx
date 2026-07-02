import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import {
  Plus, BarChart3, List, AlertTriangle, Receipt, Settings,
  Percent, CreditCard, Send, RefreshCw, CheckCircle,
  Clock, TrendingUp, FileText, Zap, Eye, Download,
} from 'lucide-react';
import { createPageUrl } from '../utils';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { supabase, tenantQuery, fetchData } from '../api/supabaseClient';

// ─── API helpers ───────────────────────────────────────────────────────────────

async function billingGet(path, token) {
  const r = await fetch(`/api/billing${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error((await r.json()).error || r.statusText);
  return r.json();
}

async function billingPost(path, body, token) {
  const r = await fetch(`/api/billing${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json()).error || r.statusText);
  return r.json();
}

function useToken() {
  const [token, setToken] = useState(null);
  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
  }, []);
  return token;
}

// ─── SAR formatter ─────────────────────────────────────────────────────────────

const sarFmt = (n) => `SAR ${(Number(n) || 0).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  issued: 'bg-najdi-50 text-najdi-900 border-najdi-100',
  partial: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  paid: 'bg-green-50 text-green-700 border-green-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-sand text-muted-foreground border-border',
  credit_note: 'bg-purple-50 text-purple-700 border-purple-200',
};

function StatusBadge({ status, isRTL }) {
  const labels = {
    issued: { ar: 'مُصدرة', en: 'Issued' },
    partial: { ar: 'مدفوعة جزئياً', en: 'Partial' },
    paid: { ar: 'مدفوعة', en: 'Paid' },
    overdue: { ar: 'متأخرة', en: 'Overdue' },
    cancelled: { ar: 'ملغاة', en: 'Cancelled' },
    credit_note: { ar: 'إشعار دائن', en: 'Credit Note' },
  };
  const label = labels[status]?.[isRTL ? 'ar' : 'en'] ?? status;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[status] ?? 'bg-sand text-muted-foreground border-border'}`}>
      {label}
    </span>
  );
}

// ─── VAT treatment badge ────────────────────────────────────────────────────────

function VatBadge({ treatment }) {
  if (treatment === 'exempt') return <span className="text-xs text-green-600 font-medium">VAT Exempt</span>;
  if (treatment === 'zero_rated') return <span className="text-xs text-najdi-700 font-medium">0%</span>;
  return <span className="text-xs text-orange-600 font-medium">15% VAT</span>;
}

// ─── KPI cards ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color = 'blue' }) {
  const colors = {
    blue: 'bg-najdi-50 text-najdi-700',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
  };
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`p-2.5 rounded-lg ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-lg font-bold text-ink truncate">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Invoice list tab ──────────────────────────────────────────────────────────

function InvoicesTab({ token, isRTL, userRole, tenantId }) {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ status: '', page: 1 });
  const [dunningOpen, setDunningOpen] = useState(false);
  const [dunningLoading, setDunningLoading] = useState(false);
  const [dunningResult, setDunningResult] = useState(null);

  const { tenantFilter, hasTenantAccess } = useTenantFilter();
  const PAGE_SIZE = 20;

  // Load invoices directly from Supabase (RLS-scoped) instead of via the billing
  // backend. The backend list resolved the wrong tenant for a platform owner
  // (it falls back to "first active tenant"), which showed an empty list even
  // when invoices existed. Reading through tenantFilter shows this tenant's
  // invoices (or all of them for the platform owner) and survives a backend outage.
  const { data: allInvoices = [], isLoading } = useQuery({
    queryKey: ['invoices-list', tenantId, filters.status],
    queryFn: () => fetchData(
      // Select only invoice columns — the previous students(...) embed referenced
      // students.grade, which doesn't exist (the column is grade_id), so PostgREST
      // rejected the whole query and the list came back empty. The invoice already
      // carries denormalized student_name + grade, so no join is needed.
      tenantQuery('invoices')
        .select('*')
        .match(tenantFilter(filters.status ? { status: filters.status } : {}))
        .order('created_at', { ascending: false })
        .limit(500)
    ),
    enabled: hasTenantAccess,
  });

  const total = allInvoices.length;
  const invoices = allInvoices.slice((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE);
  const pagination = { page: filters.page, limit: PAGE_SIZE, total, pages: Math.ceil(total / PAGE_SIZE) };

  const triggerDunning = async (dry_run) => {
    setDunningLoading(true);
    try {
      const result = await billingPost('/dunning/trigger', { dry_run, channel: 'whatsapp' }, token);
      setDunningResult(result);
      if (!dry_run) qc.invalidateQueries({ queryKey: ['invoices-list'] });
    } catch (e) {
      setDunningResult({ error: e.message });
    } finally {
      setDunningLoading(false);
    }
  };

  const canAction = ['admin', 'finance', 'accountant', 'creator'].includes(userRole);

  return (
    <div className="space-y-4">
      {/* Filters row */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          className="h-9 rounded-md border border-border px-3 text-sm bg-white"
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
        >
          <option value="">{isRTL ? 'كل الحالات' : 'All Status'}</option>
          <option value="issued">{isRTL ? 'مُصدرة' : 'Issued'}</option>
          <option value="partial">{isRTL ? 'جزئية' : 'Partial'}</option>
          <option value="paid">{isRTL ? 'مدفوعة' : 'Paid'}</option>
          <option value="overdue">{isRTL ? 'متأخرة' : 'Overdue'}</option>
        </select>
        {canAction && (
          <Button size="sm" variant="outline" className="h-9 gap-1.5 ms-auto" onClick={() => setDunningOpen(true)}>
            <Send className="w-4 h-4" />
            {isRTL ? 'تنبيه المتأخرين' : 'Dunning'}
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-sand border-b border-border">
            <tr>
              <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wide">{isRTL ? 'رقم الفاتورة' : 'Invoice #'}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wide">{isRTL ? 'الطالب' : 'Student'}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wide">{isRTL ? 'التاريخ' : 'Date'}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wide">{isRTL ? 'تاريخ الاستحقاق' : 'Due'}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-muted-foreground uppercase tracking-wide">{isRTL ? 'المبلغ' : 'Total'}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-muted-foreground uppercase tracking-wide">{isRTL ? 'المتبقي' : 'Balance'}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wide">{isRTL ? 'الحالة' : 'Status'}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wide">ZATCA</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wide">{isRTL ? 'إجراءات' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={9} className="py-12 text-center text-muted-foreground">{isRTL ? 'جاري التحميل…' : 'Loading…'}</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={9} className="py-12 text-center text-muted-foreground">{isRTL ? 'لا توجد فواتير' : 'No invoices found'}</td></tr>
            ) : invoices.map((inv) => {
              const balance = (Number(inv.total_amount) || 0) - (Number(inv.paid_amount) || 0);
              return (
                <tr
                  key={inv.id}
                  className="hover:bg-sand transition-colors cursor-pointer"
                  onClick={() => { window.location.href = createPageUrl('InvoiceDetails') + '?id=' + inv.id; }}
                >
                  <td className="px-4 py-3 font-mono text-xs text-najdi-900 font-semibold">{inv.invoice_number}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink text-xs">{inv.student_name || '—'}</div>
                    {inv.grade && <div className="text-xs text-muted-foreground">{isRTL ? 'الصف' : 'Grade'} {inv.grade}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{inv.date}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{inv.due_date || '—'}</td>
                  <td className="px-4 py-3 text-end font-semibold text-ink text-xs">{sarFmt(inv.total_amount)}</td>
                  <td className="px-4 py-3 text-end text-xs">
                    <span className={balance > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>{sarFmt(balance)}</span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={inv.status} isRTL={isRTL} /></td>
                  <td className="px-4 py-3">
                    {inv.qr_code
                      ? <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle className="w-3.5 h-3.5" />{isRTL ? 'معتمد' : 'QR OK'}</span>
                      : <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="w-3.5 h-3.5" />{isRTL ? 'معلق' : 'Pending'}</span>}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <button
                        className="p-1 rounded hover:bg-najdi-50 text-najdi-700"
                        title={isRTL ? 'عرض الفاتورة' : 'View Invoice'}
                        onClick={() => { window.location.href = createPageUrl('InvoiceDetails') + '?id=' + inv.id; }}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        className="p-1 rounded hover:bg-green-50 text-green-600"
                        title={isRTL ? 'تحميل PDF' : 'Download PDF'}
                        onClick={async () => {
                          try {
                            const r = await fetch(`/api/invoices/${inv.id}/download-pdf`, {
                              headers: { Authorization: `Bearer ${token}` },
                            });
                            if (!r.ok) throw new Error('Download failed');
                            const blob = await r.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `invoice-${inv.invoice_number}.pdf`;
                            a.click();
                            URL.revokeObjectURL(url);
                          } catch {
                            window.location.href = createPageUrl('InvoiceDetails') + '?id=' + inv.id;
                          }
                        }}
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{isRTL ? `${pagination.total} فاتورة` : `${pagination.total} invoices`}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>
              {isRTL ? 'السابق' : 'Prev'}
            </Button>
            <Button size="sm" variant="outline" disabled={filters.page >= pagination.pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>
              {isRTL ? 'التالي' : 'Next'}
            </Button>
          </div>
        </div>
      )}

      {/* Dunning dialog */}
      <Dialog open={dunningOpen} onOpenChange={setDunningOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{isRTL ? 'تنبيه المتأخرين' : 'Smart Dunning'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 text-sm text-muted-foreground">
            <p>{isRTL ? 'سيتم إرسال رسائل واتساب تلقائية لجميع أولياء الأمور الذين تجاوزت فواتيرهم تاريخ الاستحقاق.' : 'Automatically send WhatsApp reminders to all families with overdue invoices.'}</p>
            {dunningResult && (
              <div className={`rounded-lg p-3 text-sm ${dunningResult.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {dunningResult.error
                  ? dunningResult.error
                  : isRTL
                    ? `تم إرسال ${dunningResult.triggered} تنبيه`
                    : `Triggered ${dunningResult.triggered} reminders`}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => triggerDunning(true)} disabled={dunningLoading}>
              {isRTL ? 'تجربة' : 'Dry Run'}
            </Button>
            <Button onClick={() => triggerDunning(false)} disabled={dunningLoading} className="bg-orange-600 hover:bg-orange-700 text-white">
              <Send className="w-4 h-4 me-1" />
              {isRTL ? 'إرسال' : 'Send Now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Collections / Arrears tab ─────────────────────────────────────────────────

function ArrearsTab({ token, isRTL, tenantId }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(`${currentYear}-${currentYear + 1}`);

  const { data, isLoading } = useQuery({
    queryKey: ['billing-arrears', tenantId, year],
    queryFn: () => billingGet(`/arrears?academic_year=${year}`, token),
    enabled: !!token,
  });

  const buckets = data?.buckets ?? {};
  const items = data?.items ?? [];

  const BUCKET_LABELS = {
    '1_30': { ar: '1–30 يوم', en: '1–30 Days' },
    '31_60': { ar: '31–60 يوم', en: '31–60 Days' },
    '61_90': { ar: '61–90 يوم', en: '61–90 Days' },
    '90_plus': { ar: '+90 يوم', en: '90+ Days' },
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          type="text"
          className="h-9 rounded-md border border-border px-3 text-sm w-40"
          placeholder="2025-2026"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        />
        <span className="text-sm text-muted-foreground">{isRTL ? 'السنة الأكاديمية' : 'Academic Year'}</span>
      </div>

      {/* Aging buckets */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(BUCKET_LABELS).map(([k, labels]) => (
          <Card key={k} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{isRTL ? labels.ar : labels.en}</p>
              <p className="text-lg font-bold text-ink mt-1">{sarFmt(buckets[k] ?? 0)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Total */}
      {data?.total_outstanding != null && (
        <div className="rounded-lg bg-red-50 border border-red-100 p-4 flex items-center justify-between">
          <span className="font-semibold text-red-700">{isRTL ? 'إجمالي المتأخرات' : 'Total Outstanding'}</span>
          <span className="text-xl font-bold text-red-700">{sarFmt(data.total_outstanding)}</span>
        </div>
      )}

      {/* Overdue invoices */}
      <div className="rounded-xl border border-border overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-sand border-b border-border">
            <tr>
              <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase">{isRTL ? 'الطالب' : 'Student'}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase">{isRTL ? 'رقم الفاتورة' : 'Invoice'}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase">{isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-muted-foreground uppercase">{isRTL ? 'الرصيد' : 'Balance'}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase">{isRTL ? 'أيام التأخر' : 'Days Late'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">{isRTL ? 'جاري التحميل…' : 'Loading…'}</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-green-600 font-medium">{isRTL ? 'لا توجد متأخرات' : 'No arrears — all clear!'}</td></tr>
            ) : items.map((inv) => (
              <tr key={inv.id} className="hover:bg-sand">
                <td className="px-4 py-3 text-xs font-medium text-ink">
                  {isRTL ? inv.students?.name_ar || inv.students?.name_en : inv.students?.name_en || inv.students?.name_ar}
                  {inv.students?.grade && <span className="text-muted-foreground ms-1">({inv.students.grade})</span>}
                </td>
                <td className="px-4 py-3 text-xs font-mono text-najdi-900">{inv.invoice_number}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{inv.due_date}</td>
                <td className="px-4 py-3 text-end text-xs font-semibold text-red-600">{sarFmt(inv.outstanding_balance)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    inv.days_overdue > 90 ? 'bg-red-100 text-red-700' :
                    inv.days_overdue > 60 ? 'bg-orange-100 text-orange-700' :
                    inv.days_overdue > 30 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-najdi-50 text-najdi-900'
                  }`}>{inv.days_overdue}d</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

// ─── VAT Report tab ────────────────────────────────────────────────────────────

function VATReportTab({ token, isRTL, tenantId }) {
  const now = new Date();
  const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
  const [to, setTo] = useState(now.toISOString().split('T')[0]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['billing-vat', tenantId, from, to],
    queryFn: () => billingGet(`/vat-report?from_date=${from}&to_date=${to}`, token),
    enabled: !!token,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">{isRTL ? 'من' : 'From'}</label>
          <input type="date" className="h-9 rounded-md border border-border px-3 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">{isRTL ? 'إلى' : 'To'}</label>
          <input type="date" className="h-9 rounded-md border border-border px-3 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button size="sm" variant="outline" className="h-9" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 me-1" />{isRTL ? 'تحديث' : 'Refresh'}
        </Button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">{isRTL ? 'جاري التحميل…' : 'Loading…'}</div>
      ) : data ? (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: isRTL ? 'إجمالي الإيرادات' : 'Gross Revenue', value: sarFmt(data.gross_revenue), color: 'blue' },
              { label: isRTL ? 'إجمالي الخصومات' : 'Total Discounts', value: sarFmt(data.total_discounts), color: 'yellow' },
              { label: isRTL ? 'الإيرادات الخاضعة للضريبة' : 'Net Taxable', value: sarFmt(data.net_taxable_revenue), color: 'purple' },
              { label: isRTL ? 'ضريبة القيمة المضافة المحصلة' : 'VAT Collected', value: sarFmt(data.vat_collected), color: 'green' },
              { label: isRTL ? 'إشعارات الخصم' : 'Credit Notes VAT', value: sarFmt(data.credit_notes?.vat), color: 'red' },
              { label: isRTL ? 'صافي الضريبة المستحقة' : 'Net VAT Payable', value: sarFmt(data.net_vat_payable), color: 'green' },
            ].map((item) => (
              <Card key={item.label} className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-base font-bold text-ink mt-1">{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="rounded-lg bg-najdi-50 border border-najdi-100 p-4 text-sm text-najdi-900">
            <strong>{isRTL ? 'ملاحظة ZATCA:' : 'ZATCA Note:'}</strong>{' '}
            {isRTL
              ? 'التعليم معفى من ضريبة القيمة المضافة. يخضع للضريبة: النقل، الوجبات، الزي، الكتب، الأنشطة.'
              : 'Tuition is VAT-exempt per ZATCA/GAZT rules. Taxable at 15%: transport, meals, uniforms, books, activities.'}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Fee Structures tab ────────────────────────────────────────────────────────

function FeeStructuresTab({ token, isRTL, tenantId }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ academic_year: '', category_id: '', grade: '', amount: '', installment_count: '1', is_mandatory: true });

  const { data: structures = [], isLoading } = useQuery({
    queryKey: ['fee-structures', tenantId],
    queryFn: () => billingGet('/fee-structures', token),
    enabled: !!token,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['fee-categories', tenantId],
    queryFn: () => billingGet('/fee-categories', token),
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: (body) => billingPost('/fee-structures', body, token),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fee-structures'] }); setShowForm(false); setForm({ academic_year: '', category_id: '', grade: '', amount: '', installment_count: '1', is_mandatory: true }); },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{isRTL ? 'هياكل الرسوم حسب السنة الأكاديمية والصف' : 'Fee structures per academic year and grade'}</p>
        <Button size="sm" onClick={() => setShowForm(true)} className="h-9 gap-1.5">
          <Plus className="w-4 h-4" />{isRTL ? 'إضافة هيكل' : 'Add Structure'}
        </Button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-sand border-b border-border">
            <tr>
              <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase">{isRTL ? 'الفئة' : 'Category'}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase">{isRTL ? 'السنة' : 'Year'}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase">{isRTL ? 'الصف' : 'Grade'}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-muted-foreground uppercase">{isRTL ? 'المبلغ' : 'Amount'}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase">VAT</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase">{isRTL ? 'أقساط' : 'Installments'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">{isRTL ? 'جاري التحميل…' : 'Loading…'}</td></tr>
            ) : structures.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">{isRTL ? 'لا توجد هياكل رسوم' : 'No fee structures yet'}</td></tr>
            ) : structures.map((s) => (
              <tr key={s.id} className="hover:bg-sand">
                <td className="px-4 py-3">
                  <div className="font-medium text-ink text-xs">{isRTL ? s.fee_categories?.name_ar : s.fee_categories?.name_en}</div>
                  <div className="text-xs text-muted-foreground font-mono">{s.fee_categories?.code}</div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{s.academic_year}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{s.grade || (isRTL ? 'كل الصفوف' : 'All Grades')}</td>
                <td className="px-4 py-3 text-end text-xs font-semibold text-ink">{sarFmt(s.amount)}</td>
                <td className="px-4 py-3"><VatBadge treatment={s.fee_categories?.vat_treatment} /></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{s.installment_count > 1 ? `${s.installment_count}×` : (isRTL ? 'دفعة واحدة' : 'Lump sum')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{isRTL ? 'إضافة هيكل رسوم' : 'Add Fee Structure'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {[
              { key: 'academic_year', label: isRTL ? 'السنة الأكاديمية' : 'Academic Year', placeholder: '2025-2026' },
              { key: 'grade', label: isRTL ? 'الصف (اختياري)' : 'Grade (optional)', placeholder: 'G1' },
              { key: 'amount', label: isRTL ? 'المبلغ (ريال)' : 'Amount (SAR)', type: 'number' },
              { key: 'installment_count', label: isRTL ? 'عدد الأقساط' : 'Installments', type: 'number' },
            ].map(({ key, label, placeholder, type }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-ink mb-1">{label}</label>
                <input
                  type={type || 'text'}
                  className="w-full h-9 rounded-md border border-border px-3 text-sm"
                  placeholder={placeholder}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-ink mb-1">{isRTL ? 'الفئة' : 'Category'}</label>
              <select className="w-full h-9 rounded-md border border-border px-3 text-sm bg-white" value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}>
                <option value="">{isRTL ? 'اختر فئة' : 'Select category'}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{isRTL ? c.name_ar : c.name_en} ({c.code})</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button
              onClick={() => createMutation.mutate({ ...form, amount: parseFloat(form.amount), installment_count: parseInt(form.installment_count) })}
              disabled={createMutation.isPending || !form.academic_year || !form.category_id || !form.amount}
            >
              {createMutation.isPending ? '…' : (isRTL ? 'حفظ' : 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Discount Rules tab ────────────────────────────────────────────────────────

function DiscountRulesTab({ token, isRTL, tenantId }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    code: '', name_en: '', name_ar: '', discount_type: 'sibling',
    calculation: 'percentage', value: '', max_amount: '', priority: '100',
    stacking: 'allowed', academic_year: '',
  });

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['discount-rules', tenantId],
    queryFn: () => billingGet('/discount-rules', token),
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: (body) => billingPost('/discount-rules', body, token),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['discount-rules'] }); setShowForm(false); },
  });

  const TYPE_LABELS = {
    sibling: { ar: 'الأشقاء', en: 'Sibling' },
    scholarship: { ar: 'منحة', en: 'Scholarship' },
    staff: { ar: 'موظف', en: 'Staff' },
    early_bird: { ar: 'مبكر', en: 'Early Bird' },
    bulk: { ar: 'جماعي', en: 'Bulk' },
    custom: { ar: 'مخصص', en: 'Custom' },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{isRTL ? 'قواعد الخصم والمنح الدراسية' : 'Discount and scholarship rules with stacking logic'}</p>
        <Button size="sm" onClick={() => setShowForm(true)} className="h-9 gap-1.5">
          <Plus className="w-4 h-4" />{isRTL ? 'إضافة قاعدة' : 'Add Rule'}
        </Button>
      </div>

      <div className="grid gap-3">
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">{isRTL ? 'جاري التحميل…' : 'Loading…'}</div>
        ) : rules.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">{isRTL ? 'لا توجد قواعد خصم' : 'No discount rules yet'}</div>
        ) : rules.map((r) => (
          <Card key={r.id} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-50">
                  <Percent className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <div className="font-semibold text-ink text-sm">{isRTL ? r.name_ar : r.name_en}</div>
                  <div className="text-xs text-muted-foreground font-mono">{r.code}</div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="px-2 py-0.5 rounded-full bg-sand-alt">{TYPE_LABELS[r.discount_type]?.[isRTL ? 'ar' : 'en'] ?? r.discount_type}</span>
                <span className="font-semibold">{r.calculation === 'percentage' ? `${r.value}%` : sarFmt(r.value)}</span>
                {r.max_amount && <span className="text-muted-foreground">{isRTL ? 'حد' : 'cap'} {sarFmt(r.max_amount)}</span>}
                <span className={`px-2 py-0.5 rounded-full ${r.stacking === 'allowed' ? 'bg-green-50 text-green-700' : r.stacking === 'blocked' ? 'bg-red-50 text-red-700' : 'bg-najdi-50 text-najdi-900'}`}>
                  {r.stacking}
                </span>
                <span className={`px-1.5 py-0.5 rounded-full ${r.is_active ? 'bg-green-100 text-green-700' : 'bg-sand-alt text-muted-foreground'}`}>
                  {r.is_active ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'معطل' : 'Inactive')}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{isRTL ? 'إضافة قاعدة خصم' : 'Add Discount Rule'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'code', label: 'Code', placeholder: 'SIBLING_2' },
              { key: 'name_en', label: 'Name (EN)' },
              { key: 'name_ar', label: 'Name (AR)' },
              { key: 'value', label: isRTL ? 'القيمة' : 'Value', type: 'number' },
              { key: 'max_amount', label: isRTL ? 'الحد الأقصى' : 'Max Amount (SAR)', type: 'number' },
              { key: 'priority', label: isRTL ? 'الأولوية' : 'Priority', type: 'number' },
              { key: 'academic_year', label: isRTL ? 'السنة (اختياري)' : 'Year (optional)', placeholder: '2025-2026' },
            ].map(({ key, label, placeholder, type }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-ink mb-1">{label}</label>
                <input type={type || 'text'} className="w-full h-9 rounded-md border border-border px-3 text-sm" placeholder={placeholder} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
            {[
              { key: 'discount_type', label: isRTL ? 'النوع' : 'Type', options: [['sibling', 'Sibling'], ['scholarship', 'Scholarship'], ['staff', 'Staff'], ['early_bird', 'Early Bird'], ['bulk', 'Bulk'], ['custom', 'Custom']] },
              { key: 'calculation', label: isRTL ? 'الحساب' : 'Calculation', options: [['percentage', 'Percentage %'], ['fixed_amount', 'Fixed Amount SAR']] },
              { key: 'stacking', label: isRTL ? 'التراكم' : 'Stacking', options: [['allowed', 'Allowed'], ['blocked', 'Blocked'], ['override', 'Override']] },
            ].map(({ key, label, options }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-ink mb-1">{label}</label>
                <select className="w-full h-9 rounded-md border border-border px-3 text-sm bg-white" value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}>
                  {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            ))}
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={() => createMutation.mutate({ ...form, value: parseFloat(form.value), max_amount: form.max_amount ? parseFloat(form.max_amount) : undefined, priority: parseInt(form.priority) })} disabled={createMutation.isPending || !form.code || !form.name_en || !form.value}>
              {createMutation.isPending ? '…' : (isRTL ? 'حفظ' : 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Payment Plans tab ─────────────────────────────────────────────────────────

function PaymentPlansTab({ token, isRTL, tenantId }) {
  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['payment-plans', tenantId],
    queryFn: () => billingGet('/payment-plans', token),
    enabled: !!token,
  });

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="py-8 text-center text-muted-foreground">{isRTL ? 'جاري التحميل…' : 'Loading…'}</div>
      ) : plans.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">{isRTL ? 'لا توجد خطط دفع' : 'No payment plans yet'}</div>
      ) : plans.map((plan) => {
        const installments = plan.payment_plan_installments ?? [];
        const paidCount = installments.filter((i) => i.status === 'paid').length;
        return (
          <Card key={plan.id} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-semibold text-ink text-sm">{plan.student_id?.slice(0, 8)}… — {plan.academic_year}</div>
                  <div className="text-xs text-muted-foreground">{plan.plan_type} · {paidCount}/{installments.length} {isRTL ? 'مدفوع' : 'paid'}</div>
                </div>
                <div className="text-end">
                  <div className="font-bold text-ink">{sarFmt(plan.total_amount)}</div>
                  <StatusBadge status={plan.status} isRTL={isRTL} />
                </div>
              </div>
              {installments.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {installments.map((inst) => (
                    <div key={inst.id} className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                      inst.status === 'paid' ? 'bg-green-50 text-green-700' :
                      inst.status === 'overdue' ? 'bg-red-50 text-red-700' :
                      inst.status === 'waived' ? 'bg-sand-alt text-muted-foreground' :
                      'bg-najdi-50 text-najdi-900'
                    }`}>
                      #{inst.installment_no} · {sarFmt(inst.amount)} · {inst.due_date}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Dashboard summary tab ─────────────────────────────────────────────────────

function DashboardTab({ token, isRTL, tenantId }) {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const to = today.toISOString().split('T')[0];

  const { data: vat } = useQuery({
    queryKey: ['billing-vat-dash', tenantId, from, to],
    queryFn: () => billingGet(`/vat-report?from_date=${from}&to_date=${to}`, token),
    enabled: !!token,
  });
  const { data: arrears } = useQuery({
    queryKey: ['billing-arrears-dash', tenantId],
    queryFn: () => billingGet('/arrears', token),
    enabled: !!token,
  });
  const { data: invoiceData } = useQuery({
    queryKey: ['billing-invoices-dash', tenantId],
    queryFn: () => billingGet('/invoices?limit=5', token),
    enabled: !!token,
  });

  const kpis = [
    { label: isRTL ? 'إيرادات الشهر' : 'Month Revenue', value: sarFmt(vat?.gross_revenue), icon: TrendingUp, color: 'green' },
    { label: isRTL ? 'ضريبة القيمة المضافة' : 'VAT Collected', value: sarFmt(vat?.vat_collected), icon: Receipt, color: 'purple' },
    { label: isRTL ? 'إجمالي المتأخرات' : 'Total Arrears', value: sarFmt(arrears?.total_outstanding), icon: AlertTriangle, color: 'red' },
    { label: isRTL ? 'فواتير هذا الشهر' : 'Invoices (month)', value: invoiceData?.pagination?.total ?? '—', icon: FileText, color: 'blue' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* Aging breakdown */}
      {arrears?.buckets && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm">{isRTL ? 'تحليل المتأخرات' : 'Arrears Aging'}</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-4 gap-3">
            {[['1_30', '1–30d'], ['31_60', '31–60d'], ['61_90', '61–90d'], ['90_plus', '90+d']].map(([key, label]) => (
              <div key={key} className="text-center">
                <div className="text-xs text-muted-foreground mb-1">{label}</div>
                <div className="text-sm font-bold text-ink">{sarFmt(arrears.buckets[key] ?? 0)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent invoices */}
      {invoiceData?.data?.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm">{isRTL ? 'أحدث الفواتير' : 'Recent Invoices'}</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border">
            {invoiceData.data.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between py-2 cursor-pointer hover:bg-sand rounded px-1 -mx-1 transition-colors"
                onClick={() => { window.location.href = createPageUrl('InvoiceDetails') + '?id=' + inv.id; }}
              >
                <div>
                  <div className="text-xs font-mono text-najdi-900">{inv.invoice_number}</div>
                  <div className="text-xs text-muted-foreground">{isRTL ? inv.students?.name_ar : inv.students?.name_en}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-ink">{sarFmt(inv.total_amount)}</span>
                  <StatusBadge status={inv.status} isRTL={isRTL} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ZATCA compliance note */}
      <div className="rounded-lg bg-gradient-to-r from-najdi-50 to-sand border border-najdi-100 p-4 flex items-start gap-3">
        <Zap className="w-5 h-5 text-najdi-700 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-najdi-900 mb-1">{isRTL ? 'محرك ZATCA المرحلة 2' : 'ZATCA Phase 2 Engine'}</p>
          <p className="text-najdi-900 text-xs">
            {isRTL
              ? 'كل فاتورة تُولّد تلقائياً رمز QR، تجزئة SHA-256، وملف UBL/XML متوافق مع لوائح هيئة الزكاة والضريبة والجمارك.'
              : 'Every invoice auto-generates a TLV QR code, SHA-256 hash chain, and UBL 2.1 XML compliant with ZATCA Phase 2 Fatoorah requirements.'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── New Invoice dialog ────────────────────────────────────────────────────────

function NewInvoiceDialog({ open, onClose, token, isRTL, tenantId, onSuccess }) {
  const [form, setForm] = useState({ student_id: '', academic_year: '2025-2026', due_date: '', installment_count: '1', notes_en: '', notes_ar: '' });
  const [feeLines, setFeeLines] = useState([{ category_id: '', description_en: '', description_ar: '', amount: '' }]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [studentSearch, setStudentSearch] = useState('');

  const { data: students = [] } = useQuery({
    queryKey: ['billing-students', tenantId, studentSearch],
    queryFn: () => billingGet(`/students?search=${encodeURIComponent(studentSearch)}&limit=50`, token),
    enabled: !!token && open,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['fee-categories', tenantId],
    queryFn: () => billingGet('/fee-categories', token),
    enabled: !!token && open,
  });

  const selectedStudent = students.find((s) => s.id === form.student_id);

  const addLine = () => setFeeLines((l) => [...l, { category_id: '', description_en: '', description_ar: '', amount: '' }]);
  const removeLine = (i) => setFeeLines((l) => l.filter((_, j) => j !== i));
  const updateLine = (i, k, v) => setFeeLines((l) => l.map((line, j) => j === i ? { ...line, [k]: v } : line));

  const submit = async () => {
    setLoading(true); setError(null);
    try {
      const body = {
        student_id: form.student_id,
        academic_year: form.academic_year,
        installment_count: parseInt(form.installment_count),
        apply_discounts: true,
        ...(form.due_date ? { due_date: form.due_date } : {}),
        ...(form.notes_en ? { notes_en: form.notes_en } : {}),
        ...(form.notes_ar ? { notes_ar: form.notes_ar } : {}),
        fee_lines: feeLines.map((l) => ({
          ...(l.category_id ? { category_id: l.category_id } : {}),
          description_en: l.description_en || 'Tuition Fee',
          description_ar: l.description_ar || 'رسوم دراسية',
          amount: parseFloat(l.amount),
          quantity: 1,
        })),
      };
      const res = await billingPost('/invoices', body, token);
      setResult(res);
      onSuccess?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setResult(null); setError(null); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isRTL ? 'إنشاء فاتورة جديدة' : 'Create New Invoice'}</DialogTitle></DialogHeader>

        {result ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-center">
              <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <p className="font-semibold text-green-800">{isRTL ? 'تم إنشاء الفاتورة' : 'Invoice Created'}</p>
              <p className="text-sm text-green-700 font-mono mt-1">{result.invoice?.invoice_number}</p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center text-sm">
              <div><div className="text-muted-foreground text-xs">{isRTL ? 'المجموع قبل الضريبة' : 'Subtotal'}</div><div className="font-bold">{sarFmt(result.summary?.subtotal)}</div></div>
              <div><div className="text-muted-foreground text-xs">VAT</div><div className="font-bold text-orange-600">{sarFmt(result.summary?.vat_amount)}</div></div>
              <div><div className="text-muted-foreground text-xs">{isRTL ? 'الإجمالي' : 'Total'}</div><div className="font-bold text-najdi-900">{sarFmt(result.summary?.total_amount)}</div></div>
            </div>
            {result.zatca?.qr_code && (
              <div className="text-center">
                <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-3 py-1 rounded-full">
                  <CheckCircle className="w-3.5 h-3.5" /> ZATCA QR Generated
                </span>
              </div>
            )}
            <Button className="w-full" onClick={() => { onClose(); setResult(null); }}>{isRTL ? 'إغلاق' : 'Close'}</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Student selector */}
            <div>
              <label className="block text-xs font-medium text-ink mb-1">{isRTL ? 'الطالب' : 'Student'}</label>
              <input
                type="text"
                className="w-full h-9 rounded-md border border-border px-3 text-sm mb-1"
                placeholder={isRTL ? 'ابحث باسم الطالب أو الرقم...' : 'Search by student name or number...'}
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
              />
              {students.length > 0 && !form.student_id && (
                <div className="border border-border rounded-md max-h-40 overflow-y-auto bg-white shadow-sm">
                  {students.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="w-full text-start px-3 py-2 text-sm hover:bg-najdi-50 border-b border-border last:border-0"
                      onClick={() => { setForm((f) => ({ ...f, student_id: s.id })); setStudentSearch(isRTL ? s.name_ar : s.name_en); }}
                    >
                      <span className="font-medium">{isRTL ? s.name_ar : s.name_en}</span>
                      <span className="text-muted-foreground ms-2 text-xs">{s.grade} • {s.student_number || s.id.slice(0, 8)}</span>
                    </button>
                  ))}
                </div>
              )}
              {selectedStudent && (
                <div className="flex items-center gap-2 mt-1 px-2 py-1.5 bg-najdi-50 rounded-md text-xs text-najdi-900">
                  <span className="font-medium">{isRTL ? selectedStudent.name_ar : selectedStudent.name_en}</span>
                  <span className="text-najdi-500">({selectedStudent.grade})</span>
                  <button type="button" className="ms-auto text-najdi-500 hover:text-red-500" onClick={() => { setForm((f) => ({ ...f, student_id: '' })); setStudentSearch(''); }}>×</button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">{isRTL ? 'السنة الأكاديمية' : 'Academic Year'}</label>
                <input type="text" className="w-full h-9 rounded-md border border-border px-3 text-sm" placeholder="2025-2026" value={form.academic_year} onChange={(e) => setForm((f) => ({ ...f, academic_year: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">{isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}</label>
                <input type="date" className="w-full h-9 rounded-md border border-border px-3 text-sm" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">{isRTL ? 'عدد الأقساط' : 'Installments'}</label>
                <input type="number" min="1" max="12" className="w-full h-9 rounded-md border border-border px-3 text-sm" value={form.installment_count} onChange={(e) => setForm((f) => ({ ...f, installment_count: e.target.value }))} />
              </div>
            </div>

            {/* Fee lines */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-ink">{isRTL ? 'بنود الرسوم' : 'Fee Lines'}</label>
                <Button size="sm" variant="outline" onClick={addLine} className="h-7 text-xs">+ {isRTL ? 'بند' : 'Line'}</Button>
              </div>
              <div className="space-y-2">
                {feeLines.map((line, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-3">
                      <select className="w-full h-8 rounded-md border border-border px-2 text-xs bg-white" value={line.category_id} onChange={(e) => {
                        const cat = categories.find((c) => c.id === e.target.value);
                        updateLine(i, 'category_id', e.target.value);
                        if (cat) { updateLine(i, 'description_en', cat.name_en); updateLine(i, 'description_ar', cat.name_ar); }
                      }}>
                        <option value="">{isRTL ? 'يدوي' : 'Manual'}</option>
                        {categories.map((c) => <option key={c.id} value={c.id}>{isRTL ? c.name_ar : (c.name_en || c.code)}</option>)}
                      </select>
                    </div>
                    <div className="col-span-3">
                      <input type="text" className="w-full h-8 rounded-md border border-border px-2 text-xs" placeholder={isRTL ? 'الوصف EN' : 'Description EN'} value={line.description_en} onChange={(e) => updateLine(i, 'description_en', e.target.value)} />
                    </div>
                    <div className="col-span-3">
                      <input type="text" className="w-full h-8 rounded-md border border-border px-2 text-xs" placeholder={isRTL ? 'الوصف AR' : 'وصف بالعربي'} value={line.description_ar} onChange={(e) => updateLine(i, 'description_ar', e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <input type="number" className="w-full h-8 rounded-md border border-border px-2 text-xs" placeholder="SAR" value={line.amount} onChange={(e) => updateLine(i, 'amount', e.target.value)} />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      {feeLines.length > 1 && <button type="button" onClick={() => removeLine(i)} className="text-muted-foreground hover:text-red-500 text-lg leading-none">×</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
              <Button onClick={submit} disabled={loading || !form.student_id || !form.academic_year || feeLines.some((l) => !l.amount || (!l.category_id && !l.description_en))}>
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : (isRTL ? 'إنشاء الفاتورة' : 'Create Invoice')}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk invoice generation dialog (backend-driven, ZATCA + GL aware) ──────────

function BulkGenerateDialog({ open, onClose, token, isRTL, onSuccess }) {
  const [criteria, setCriteria] = useState({ academic_year: '', grade: '', campus_id: '', due_date: '' });
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const reset = () => { setPreview(null); setResult(null); setError(null); };

  const run = async (dry_run) => {
    setLoading(true); setError(null);
    try {
      const body = { academic_year: criteria.academic_year, dry_run };
      if (criteria.grade) body.grade = criteria.grade;
      if (criteria.campus_id) body.campus_id = criteria.campus_id;
      if (criteria.due_date) body.due_date = criteria.due_date;
      const res = await billingPost('/bulk-invoices', body, token);
      if (dry_run) { setPreview(res); setResult(null); }
      else { setResult(res); onSuccess?.(); }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); reset(); } }}>
      <DialogContent className="max-w-lg" dir={isRTL ? 'rtl' : 'ltr'}>
        <DialogHeader><DialogTitle>{isRTL ? 'إنشاء فواتير جماعية' : 'Bulk Invoice Generation'}</DialogTitle></DialogHeader>

        {result ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-center">
              <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <p className="font-semibold text-green-800">{isRTL ? 'اكتمل الإنشاء الجماعي' : 'Bulk run complete'}</p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center text-sm">
              <div><div className="text-muted-foreground text-xs">{isRTL ? 'تم الإنشاء' : 'Created'}</div><div className="font-bold text-green-700">{result.created}</div></div>
              <div><div className="text-muted-foreground text-xs">{isRTL ? 'تم التخطي' : 'Skipped'}</div><div className="font-bold text-amber-600">{result.skipped}</div></div>
              <div><div className="text-muted-foreground text-xs">{isRTL ? 'فشل' : 'Failed'}</div><div className="font-bold text-red-600">{result.errors?.length ?? 0}</div></div>
            </div>
            {result.errors?.length > 0 && (
              <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-xs text-red-700 max-h-32 overflow-auto">
                {result.errors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
            <Button className="w-full" onClick={() => { onClose(); reset(); }}>{isRTL ? 'إغلاق' : 'Close'}</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">{isRTL ? 'السنة الأكاديمية' : 'Academic Year'} *</label>
                <input type="text" className="w-full h-9 rounded-md border border-border px-3 text-sm" placeholder="2025-2026"
                  value={criteria.academic_year} onChange={(e) => { setCriteria((c) => ({ ...c, academic_year: e.target.value })); setPreview(null); }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">{isRTL ? 'الصف (اختياري)' : 'Grade (optional)'}</label>
                <input type="text" className="w-full h-9 rounded-md border border-border px-3 text-sm" placeholder={isRTL ? 'كل الصفوف' : 'All grades'}
                  value={criteria.grade} onChange={(e) => { setCriteria((c) => ({ ...c, grade: e.target.value })); setPreview(null); }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">{isRTL ? 'تاريخ الاستحقاق (اختياري)' : 'Due Date (optional)'}</label>
                <input type="date" className="w-full h-9 rounded-md border border-border px-3 text-sm"
                  value={criteria.due_date} onChange={(e) => setCriteria((c) => ({ ...c, due_date: e.target.value }))} />
              </div>
            </div>

            {preview && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">{isRTL ? 'سيتم الإنشاء' : 'Will generate'}</span><span className="font-bold text-najdi-900">{preview.estimated_invoices}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{isRTL ? 'القيمة المتوقعة' : 'Est. total'}</span><span className="font-bold text-emerald-700">{sarFmt(preview.estimated_total)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{isRTL ? 'مفوتر مسبقاً' : 'Already invoiced'}</span><span className="font-medium text-ink">{preview.already_invoiced}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{isRTL ? 'بدون رسوم' : 'No fees'}</span><span className="font-medium text-ink">{preview.skipped_no_fees}</span></div>
                </div>
                {preview.estimated_invoices === 0 && (
                  <p className="text-xs text-amber-600">{isRTL ? 'لا يوجد طلاب مؤهلون للإنشاء بهذه المعايير.' : 'No eligible students to invoice for these criteria.'}</p>
                )}
              </div>
            )}

            {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => run(true)} disabled={loading || !criteria.academic_year}>
                {loading && !preview ? <RefreshCw className="w-4 h-4 animate-spin" /> : (isRTL ? 'معاينة' : 'Preview')}
              </Button>
              <Button onClick={() => run(false)} disabled={loading || !criteria.academic_year || !preview || preview.estimated_invoices === 0}
                className="bg-najdi-700 hover:bg-najdi-900 text-white">
                {loading && preview ? <RefreshCw className="w-4 h-4 animate-spin" /> : (isRTL ? `إنشاء ${preview?.estimated_invoices ?? ''} فاتورة` : `Generate${preview ? ` ${preview.estimated_invoices}` : ''}`)}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Fees page ────────────────────────────────────────────────────────────

export default function Fees() {
  const { isRTL } = useLanguage();
  const { userRole } = useRole();
  const qc = useQueryClient();
  const { tenantId } = useTenantFilter();
  const token = useToken();

  const [tab, setTab] = useState('dashboard');
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  const canCreate = ['admin', 'finance', 'accountant', 'creator'].includes(userRole);

  const tabs = [
    { id: 'dashboard', ar: 'لوحة التحكم', en: 'Dashboard', icon: BarChart3 },
    { id: 'invoices', ar: 'الفواتير', en: 'Invoices', icon: List },
    { id: 'arrears', ar: 'المتأخرات', en: 'Arrears', icon: AlertTriangle },
    { id: 'vat', ar: 'تقرير الضريبة', en: 'VAT Report', icon: Receipt },
    { id: 'structures', ar: 'هياكل الرسوم', en: 'Fee Structures', icon: Settings },
    { id: 'discounts', ar: 'الخصومات', en: 'Discounts', icon: Percent },
    { id: 'plans', ar: 'خطط الدفع', en: 'Payment Plans', icon: CreditCard },
  ];

  const sharedProps = { token, isRTL, tenantId };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">{isRTL ? 'الرسوم والفوترة' : 'Fees & Billing'}</h1>
          <p className="text-sm text-muted-foreground">
            {isRTL
              ? 'محرك فوترة سعودي متكامل — ZATCA المرحلة 2، ضريبة القيمة المضافة، الأقساط، التحصيل الذكي'
              : 'Saudi billing engine — ZATCA Phase 2, VAT-aware, installment plans, AI collections'}
          </p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowBulk(true)} variant="outline" className="h-9 gap-1.5">
              <FileText className="w-4 h-4" />{isRTL ? 'فواتير جماعية' : 'Bulk Generate'}
            </Button>
            <Button onClick={() => setShowNewInvoice(true)} className="bg-najdi-700 hover:bg-najdi-900 text-white h-9 gap-1.5">
              <Plus className="w-4 h-4" />{isRTL ? 'فاتورة جديدة' : 'New Invoice'}
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === t.id
                ? 'bg-najdi-700 text-white shadow-sm'
                : 'bg-sand-alt text-muted-foreground hover:bg-sand-alt'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {isRTL ? t.ar : t.en}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'dashboard' && <DashboardTab {...sharedProps} />}
      {tab === 'invoices' && <InvoicesTab {...sharedProps} userRole={userRole} />}
      {tab === 'arrears' && <ArrearsTab {...sharedProps} />}
      {tab === 'vat' && <VATReportTab {...sharedProps} />}
      {tab === 'structures' && <FeeStructuresTab {...sharedProps} />}
      {tab === 'discounts' && <DiscountRulesTab {...sharedProps} />}
      {tab === 'plans' && <PaymentPlansTab {...sharedProps} />}

      {/* New invoice dialog */}
      <NewInvoiceDialog
        open={showNewInvoice}
        onClose={() => setShowNewInvoice(false)}
        onSuccess={() => { qc.invalidateQueries({ queryKey: ['billing-invoices'] }); qc.invalidateQueries({ queryKey: ['billing-vat-dash'] }); }}
        {...sharedProps}
      />

      {/* Bulk generation dialog */}
      <BulkGenerateDialog
        open={showBulk}
        onClose={() => setShowBulk(false)}
        onSuccess={() => { qc.invalidateQueries({ queryKey: ['billing-invoices'] }); qc.invalidateQueries({ queryKey: ['billing-arrears'] }); qc.invalidateQueries({ queryKey: ['billing-vat-dash'] }); }}
        {...sharedProps}
      />
    </div>
  );
}
