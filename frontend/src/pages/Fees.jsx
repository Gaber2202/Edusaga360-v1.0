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
  Clock, TrendingUp, FileText, Zap,
} from 'lucide-react';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { supabase } from '../api/supabaseClient';

// ─── API helpers ───────────────────────────────────────────────────────────────

async function billingGet(path, token) {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const r = await fetch(`${base}/api/billing${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error((await r.json()).error || r.statusText);
  return r.json();
}

async function billingPost(path, body, token) {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const r = await fetch(`${base}/api/billing${path}`, {
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

const sarFmt = (n) => `SAR ${(n ?? 0).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  issued: 'bg-blue-50 text-blue-700 border-blue-200',
  partial: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  paid: 'bg-green-50 text-green-700 border-green-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-50 text-slate-500 border-slate-200',
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
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[status] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
      {label}
    </span>
  );
}

// ─── VAT treatment badge ────────────────────────────────────────────────────────

function VatBadge({ treatment }) {
  if (treatment === 'exempt') return <span className="text-xs text-green-600 font-medium">VAT Exempt</span>;
  if (treatment === 'zero_rated') return <span className="text-xs text-blue-600 font-medium">0%</span>;
  return <span className="text-xs text-orange-600 font-medium">15% VAT</span>;
}

// ─── KPI cards ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
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
          <p className="text-xs text-slate-500 truncate">{label}</p>
          <p className="text-lg font-bold text-slate-800 truncate">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
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

  const { data, isLoading } = useQuery({
    queryKey: ['billing-invoices', tenantId, filters],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(filters.page), limit: '20' });
      if (filters.status) params.set('status', filters.status);
      return billingGet(`/invoices?${params}`, token);
    },
    enabled: !!token,
  });

  const invoices = data?.data ?? [];
  const pagination = data?.pagination ?? {};

  const triggerDunning = async (dry_run) => {
    setDunningLoading(true);
    try {
      const result = await billingPost('/dunning/trigger', { dry_run, channel: 'whatsapp' }, token);
      setDunningResult(result);
      if (!dry_run) qc.invalidateQueries({ queryKey: ['billing-invoices'] });
    } catch (e) {
      setDunningResult({ error: e.message });
    } finally {
      setDunningLoading(false);
    }
  };

  const canAction = ['admin', 'finance', 'accountant'].includes(userRole);

  return (
    <div className="space-y-4">
      {/* Filters row */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          className="h-9 rounded-md border border-slate-200 px-3 text-sm bg-white"
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
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase tracking-wide">{isRTL ? 'رقم الفاتورة' : 'Invoice #'}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase tracking-wide">{isRTL ? 'الطالب' : 'Student'}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase tracking-wide">{isRTL ? 'التاريخ' : 'Date'}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase tracking-wide">{isRTL ? 'تاريخ الاستحقاق' : 'Due'}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase tracking-wide">{isRTL ? 'المبلغ' : 'Total'}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase tracking-wide">{isRTL ? 'المتبقي' : 'Balance'}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase tracking-wide">{isRTL ? 'الحالة' : 'Status'}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase tracking-wide">ZATCA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={8} className="py-12 text-center text-slate-400">{isRTL ? 'جاري التحميل…' : 'Loading…'}</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={8} className="py-12 text-center text-slate-400">{isRTL ? 'لا توجد فواتير' : 'No invoices found'}</td></tr>
            ) : invoices.map((inv) => {
              const balance = (inv.total_amount ?? 0) - (inv.paid_amount ?? 0);
              const student = inv.students;
              return (
                <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-blue-700 font-semibold">{inv.invoice_number}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800 text-xs">{isRTL ? (student?.name_ar || student?.name_en) : (student?.name_en || student?.name_ar)}</div>
                    {student?.grade && <div className="text-xs text-slate-400">{isRTL ? 'الصف' : 'Grade'} {student.grade}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{inv.date}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{inv.due_date || '—'}</td>
                  <td className="px-4 py-3 text-end font-semibold text-slate-800 text-xs">{sarFmt(inv.total_amount)}</td>
                  <td className="px-4 py-3 text-end text-xs">
                    <span className={balance > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>{sarFmt(balance)}</span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={inv.status} isRTL={isRTL} /></td>
                  <td className="px-4 py-3">
                    {inv.qr_code
                      ? <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle className="w-3.5 h-3.5" />{isRTL ? 'معتمد' : 'QR OK'}</span>
                      : <span className="flex items-center gap-1 text-xs text-slate-400"><Clock className="w-3.5 h-3.5" />{isRTL ? 'معلق' : 'Pending'}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
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
          <div className="space-y-3 py-2 text-sm text-slate-600">
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
          className="h-9 rounded-md border border-slate-200 px-3 text-sm w-40"
          placeholder="2025-2026"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        />
        <span className="text-sm text-slate-500">{isRTL ? 'السنة الأكاديمية' : 'Academic Year'}</span>
      </div>

      {/* Aging buckets */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(BUCKET_LABELS).map(([k, labels]) => (
          <Card key={k} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-slate-500">{isRTL ? labels.ar : labels.en}</p>
              <p className="text-lg font-bold text-slate-800 mt-1">{sarFmt(buckets[k] ?? 0)}</p>
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
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{isRTL ? 'الطالب' : 'Student'}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{isRTL ? 'رقم الفاتورة' : 'Invoice'}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{isRTL ? 'الرصيد' : 'Balance'}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{isRTL ? 'أيام التأخر' : 'Days Late'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={5} className="py-8 text-center text-slate-400">{isRTL ? 'جاري التحميل…' : 'Loading…'}</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-green-600 font-medium">{isRTL ? 'لا توجد متأخرات' : 'No arrears — all clear!'}</td></tr>
            ) : items.map((inv) => (
              <tr key={inv.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-xs font-medium text-slate-800">
                  {isRTL ? inv.students?.name_ar || inv.students?.name_en : inv.students?.name_en || inv.students?.name_ar}
                  {inv.students?.grade && <span className="text-slate-400 ms-1">({inv.students.grade})</span>}
                </td>
                <td className="px-4 py-3 text-xs font-mono text-blue-700">{inv.invoice_number}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{inv.due_date}</td>
                <td className="px-4 py-3 text-end text-xs font-semibold text-red-600">{sarFmt(inv.outstanding_balance)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    inv.days_overdue > 90 ? 'bg-red-100 text-red-700' :
                    inv.days_overdue > 60 ? 'bg-orange-100 text-orange-700' :
                    inv.days_overdue > 30 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-blue-50 text-blue-700'
                  }`}>{inv.days_overdue}d</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
          <label className="text-sm text-slate-500">{isRTL ? 'من' : 'From'}</label>
          <input type="date" className="h-9 rounded-md border border-slate-200 px-3 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-500">{isRTL ? 'إلى' : 'To'}</label>
          <input type="date" className="h-9 rounded-md border border-slate-200 px-3 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button size="sm" variant="outline" className="h-9" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 me-1" />{isRTL ? 'تحديث' : 'Refresh'}
        </Button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-slate-400">{isRTL ? 'جاري التحميل…' : 'Loading…'}</div>
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
                  <p className="text-xs text-slate-500">{item.label}</p>
                  <p className="text-base font-bold text-slate-800 mt-1">{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 text-sm text-blue-800">
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
        <p className="text-sm text-slate-500">{isRTL ? 'هياكل الرسوم حسب السنة الأكاديمية والصف' : 'Fee structures per academic year and grade'}</p>
        <Button size="sm" onClick={() => setShowForm(true)} className="h-9 gap-1.5">
          <Plus className="w-4 h-4" />{isRTL ? 'إضافة هيكل' : 'Add Structure'}
        </Button>
      </div>

      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{isRTL ? 'الفئة' : 'Category'}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{isRTL ? 'السنة' : 'Year'}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{isRTL ? 'الصف' : 'Grade'}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{isRTL ? 'المبلغ' : 'Amount'}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">VAT</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{isRTL ? 'أقساط' : 'Installments'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={6} className="py-8 text-center text-slate-400">{isRTL ? 'جاري التحميل…' : 'Loading…'}</td></tr>
            ) : structures.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-slate-400">{isRTL ? 'لا توجد هياكل رسوم' : 'No fee structures yet'}</td></tr>
            ) : structures.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800 text-xs">{isRTL ? s.fee_categories?.name_ar : s.fee_categories?.name_en}</div>
                  <div className="text-xs text-slate-400 font-mono">{s.fee_categories?.code}</div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">{s.academic_year}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{s.grade || (isRTL ? 'كل الصفوف' : 'All Grades')}</td>
                <td className="px-4 py-3 text-end text-xs font-semibold text-slate-800">{sarFmt(s.amount)}</td>
                <td className="px-4 py-3"><VatBadge treatment={s.fee_categories?.vat_treatment} /></td>
                <td className="px-4 py-3 text-xs text-slate-600">{s.installment_count > 1 ? `${s.installment_count}×` : (isRTL ? 'دفعة واحدة' : 'Lump sum')}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
                <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
                <input
                  type={type || 'text'}
                  className="w-full h-9 rounded-md border border-slate-200 px-3 text-sm"
                  placeholder={placeholder}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{isRTL ? 'الفئة' : 'Category'}</label>
              <select className="w-full h-9 rounded-md border border-slate-200 px-3 text-sm bg-white" value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}>
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
        <p className="text-sm text-slate-500">{isRTL ? 'قواعد الخصم والمنح الدراسية' : 'Discount and scholarship rules with stacking logic'}</p>
        <Button size="sm" onClick={() => setShowForm(true)} className="h-9 gap-1.5">
          <Plus className="w-4 h-4" />{isRTL ? 'إضافة قاعدة' : 'Add Rule'}
        </Button>
      </div>

      <div className="grid gap-3">
        {isLoading ? (
          <div className="py-8 text-center text-slate-400">{isRTL ? 'جاري التحميل…' : 'Loading…'}</div>
        ) : rules.length === 0 ? (
          <div className="py-8 text-center text-slate-400">{isRTL ? 'لا توجد قواعد خصم' : 'No discount rules yet'}</div>
        ) : rules.map((r) => (
          <Card key={r.id} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-50">
                  <Percent className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <div className="font-semibold text-slate-800 text-sm">{isRTL ? r.name_ar : r.name_en}</div>
                  <div className="text-xs text-slate-400 font-mono">{r.code}</div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-600">
                <span className="px-2 py-0.5 rounded-full bg-slate-100">{TYPE_LABELS[r.discount_type]?.[isRTL ? 'ar' : 'en'] ?? r.discount_type}</span>
                <span className="font-semibold">{r.calculation === 'percentage' ? `${r.value}%` : sarFmt(r.value)}</span>
                {r.max_amount && <span className="text-slate-400">{isRTL ? 'حد' : 'cap'} {sarFmt(r.max_amount)}</span>}
                <span className={`px-2 py-0.5 rounded-full ${r.stacking === 'allowed' ? 'bg-green-50 text-green-700' : r.stacking === 'blocked' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                  {r.stacking}
                </span>
                <span className={`px-1.5 py-0.5 rounded-full ${r.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
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
                <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
                <input type={type || 'text'} className="w-full h-9 rounded-md border border-slate-200 px-3 text-sm" placeholder={placeholder} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
            {[
              { key: 'discount_type', label: isRTL ? 'النوع' : 'Type', options: [['sibling', 'Sibling'], ['scholarship', 'Scholarship'], ['staff', 'Staff'], ['early_bird', 'Early Bird'], ['bulk', 'Bulk'], ['custom', 'Custom']] },
              { key: 'calculation', label: isRTL ? 'الحساب' : 'Calculation', options: [['percentage', 'Percentage %'], ['fixed_amount', 'Fixed Amount SAR']] },
              { key: 'stacking', label: isRTL ? 'التراكم' : 'Stacking', options: [['allowed', 'Allowed'], ['blocked', 'Blocked'], ['override', 'Override']] },
            ].map(({ key, label, options }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
                <select className="w-full h-9 rounded-md border border-slate-200 px-3 text-sm bg-white" value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}>
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
        <div className="py-8 text-center text-slate-400">{isRTL ? 'جاري التحميل…' : 'Loading…'}</div>
      ) : plans.length === 0 ? (
        <div className="py-8 text-center text-slate-400">{isRTL ? 'لا توجد خطط دفع' : 'No payment plans yet'}</div>
      ) : plans.map((plan) => {
        const installments = plan.payment_plan_installments ?? [];
        const paidCount = installments.filter((i) => i.status === 'paid').length;
        return (
          <Card key={plan.id} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-semibold text-slate-800 text-sm">{plan.student_id?.slice(0, 8)}… — {plan.academic_year}</div>
                  <div className="text-xs text-slate-400">{plan.plan_type} · {paidCount}/{installments.length} {isRTL ? 'مدفوع' : 'paid'}</div>
                </div>
                <div className="text-end">
                  <div className="font-bold text-slate-800">{sarFmt(plan.total_amount)}</div>
                  <StatusBadge status={plan.status} isRTL={isRTL} />
                </div>
              </div>
              {installments.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {installments.map((inst) => (
                    <div key={inst.id} className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                      inst.status === 'paid' ? 'bg-green-50 text-green-700' :
                      inst.status === 'overdue' ? 'bg-red-50 text-red-700' :
                      inst.status === 'waived' ? 'bg-slate-100 text-slate-500' :
                      'bg-blue-50 text-blue-700'
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
                <div className="text-xs text-slate-500 mb-1">{label}</div>
                <div className="text-sm font-bold text-slate-800">{sarFmt(arrears.buckets[key] ?? 0)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent invoices */}
      {invoiceData?.data?.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm">{isRTL ? 'أحدث الفواتير' : 'Recent Invoices'}</CardTitle></CardHeader>
          <CardContent className="divide-y divide-slate-100">
            {invoiceData.data.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="text-xs font-mono text-blue-700">{inv.invoice_number}</div>
                  <div className="text-xs text-slate-500">{isRTL ? inv.students?.name_ar : inv.students?.name_en}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-800">{sarFmt(inv.total_amount)}</span>
                  <StatusBadge status={inv.status} isRTL={isRTL} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ZATCA compliance note */}
      <div className="rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 p-4 flex items-start gap-3">
        <Zap className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-blue-800 mb-1">{isRTL ? 'محرك ZATCA المرحلة 2' : 'ZATCA Phase 2 Engine'}</p>
          <p className="text-blue-700 text-xs">
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
  const [form, setForm] = useState({ student_id: '', academic_year: '', due_date: '', installment_count: '1', notes_en: '', notes_ar: '' });
  const [feeLines, setFeeLines] = useState([{ category_id: '', description_en: '', description_ar: '', amount: '' }]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['fee-categories', tenantId],
    queryFn: () => billingGet('/fee-categories', token),
    enabled: !!token && open,
  });

  const addLine = () => setFeeLines((l) => [...l, { category_id: '', description_en: '', description_ar: '', amount: '' }]);
  const removeLine = (i) => setFeeLines((l) => l.filter((_, j) => j !== i));
  const updateLine = (i, k, v) => setFeeLines((l) => l.map((line, j) => j === i ? { ...line, [k]: v } : line));

  const submit = async () => {
    setLoading(true); setError(null);
    try {
      const body = {
        ...form,
        installment_count: parseInt(form.installment_count),
        apply_discounts: true,
        fee_lines: feeLines.map((l) => ({ ...l, amount: parseFloat(l.amount), quantity: 1 })),
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
              <div><div className="text-slate-500 text-xs">{isRTL ? 'المجموع قبل الضريبة' : 'Subtotal'}</div><div className="font-bold">{sarFmt(result.summary?.subtotal)}</div></div>
              <div><div className="text-slate-500 text-xs">VAT</div><div className="font-bold text-orange-600">{sarFmt(result.summary?.vat_amount)}</div></div>
              <div><div className="text-slate-500 text-xs">{isRTL ? 'الإجمالي' : 'Total'}</div><div className="font-bold text-blue-700">{sarFmt(result.summary?.total_amount)}</div></div>
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
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'student_id', label: isRTL ? 'معرّف الطالب (UUID)' : 'Student ID (UUID)', placeholder: 'xxxxxxxx-xxxx-…' },
                { key: 'academic_year', label: isRTL ? 'السنة الأكاديمية' : 'Academic Year', placeholder: '2025-2026' },
                { key: 'due_date', label: isRTL ? 'تاريخ الاستحقاق' : 'Due Date', type: 'date' },
                { key: 'installment_count', label: isRTL ? 'عدد الأقساط' : 'Installments', type: 'number' },
              ].map(({ key, label, placeholder, type }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
                  <input type={type || 'text'} className="w-full h-9 rounded-md border border-slate-200 px-3 text-sm" placeholder={placeholder} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
                </div>
              ))}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-slate-700">{isRTL ? 'بنود الرسوم' : 'Fee Lines'}</label>
                <Button size="sm" variant="outline" onClick={addLine} className="h-7 text-xs">+ {isRTL ? 'بند' : 'Line'}</Button>
              </div>
              <div className="space-y-2">
                {feeLines.map((line, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-3">
                      <select className="w-full h-8 rounded-md border border-slate-200 px-2 text-xs bg-white" value={line.category_id} onChange={(e) => {
                        const cat = categories.find((c) => c.id === e.target.value);
                        updateLine(i, 'category_id', e.target.value);
                        if (cat) { updateLine(i, 'description_en', cat.name_en); updateLine(i, 'description_ar', cat.name_ar); }
                      }}>
                        <option value="">{isRTL ? 'الفئة' : 'Category'}</option>
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                      </select>
                    </div>
                    <div className="col-span-3">
                      <input type="text" className="w-full h-8 rounded-md border border-slate-200 px-2 text-xs" placeholder="Description EN" value={line.description_en} onChange={(e) => updateLine(i, 'description_en', e.target.value)} />
                    </div>
                    <div className="col-span-3">
                      <input type="text" className="w-full h-8 rounded-md border border-slate-200 px-2 text-xs" placeholder="وصف بالعربي" value={line.description_ar} onChange={(e) => updateLine(i, 'description_ar', e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <input type="number" className="w-full h-8 rounded-md border border-slate-200 px-2 text-xs" placeholder="SAR" value={line.amount} onChange={(e) => updateLine(i, 'amount', e.target.value)} />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      {feeLines.length > 1 && <button onClick={() => removeLine(i)} className="text-slate-400 hover:text-red-500 text-lg leading-none">×</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
              <Button onClick={submit} disabled={loading || !form.student_id || !form.academic_year || feeLines.some((l) => !l.category_id || !l.amount)}>
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : (isRTL ? 'إنشاء الفاتورة' : 'Create Invoice')}
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

  const canCreate = ['admin', 'finance', 'accountant'].includes(userRole);

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
          <h1 className="text-xl font-bold text-slate-800">{isRTL ? 'الرسوم والفوترة' : 'Fees & Billing'}</h1>
          <p className="text-sm text-slate-500">
            {isRTL
              ? 'محرك فوترة سعودي متكامل — ZATCA المرحلة 2، ضريبة القيمة المضافة، الأقساط، التحصيل الذكي'
              : 'Saudi billing engine — ZATCA Phase 2, VAT-aware, installment plans, AI collections'}
          </p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowNewInvoice(true)} className="bg-blue-600 hover:bg-blue-700 text-white h-9 gap-1.5">
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
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
    </div>
  );
}
