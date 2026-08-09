import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { format } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts';
import { DollarSign, TrendingUp, AlertCircle, CheckCircle, Percent, Banknote } from 'lucide-react';

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];

export default function FeesDashboard({ invoices, payments, isRTL }) {
  const active = invoices.filter(i => !['cancelled','draft'].includes(i.status));
  const total = active.reduce((s, i) => s + (i.total_amount || 0), 0);
  const collected = active.reduce((s, i) => s + (i.paid_amount || 0), 0);
  const outstanding = total - collected;
  const overdue = active.filter(i => i.status === 'overdue');
  const overdueAmt = overdue.reduce((s, i) => s + ((i.total_amount||0) - (i.paid_amount||0)), 0);
  const collectionRate = total > 0 ? (collected / total * 100).toFixed(1) : 0;
  const vatCollected = active.reduce((s, i) => s + (i.vat_amount || 0), 0);

  // Monthly trend
  const monthlyMap = {};
  payments.forEach(p => {
    if (!p.payment_date) return;
    const m = p.payment_date.slice(0, 7);
    monthlyMap[m] = (monthlyMap[m] || 0) + (p.amount || 0);
  });
  const monthlyData = Object.entries(monthlyMap).sort().slice(-6).map(([m, amt]) => ({
    month: m,
    amount: amt,
    label: format(new Date(m + '-01'), 'MMM yy')
  }));

  // By grade
  const gradeMap = {};
  active.forEach(i => {
    if (!i.grade) return;
    if (!gradeMap[i.grade]) gradeMap[i.grade] = { total: 0, paid: 0 };
    gradeMap[i.grade].total += (i.total_amount || 0);
    gradeMap[i.grade].paid += (i.paid_amount || 0);
  });
  const gradeData = Object.entries(gradeMap).map(([g, d]) => ({
    grade: g, total: d.total, paid: d.paid, outstanding: d.total - d.paid
  })).sort((a, b) => b.total - a.total).slice(0, 10);

  // By status
  const statusMap = {};
  active.forEach(i => { statusMap[i.status] = (statusMap[i.status] || 0) + 1; });
  const statusData = Object.entries(statusMap).map(([name, value]) => ({ name, value }));

  // Aging buckets
  const now = new Date();
  const aging = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  overdue.forEach(i => {
    const days = i.due_date ? Math.floor((now - new Date(i.due_date)) / 86400000) : 0;
    const bal = (i.total_amount||0) - (i.paid_amount||0);
    if (days <= 30) aging['0-30'] += bal;
    else if (days <= 60) aging['31-60'] += bal;
    else if (days <= 90) aging['61-90'] += bal;
    else aging['90+'] += bal;
  });
  const agingData = Object.entries(aging).map(([range, amount]) => ({ range, amount }));

  const KPI = ({ title, value, sub, icon: Icon, iconCls }) => (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-2">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconCls}`}>
            <Icon className="w-4.5 h-4.5" />
          </div>
        </div>
        <div className="text-2xl font-bold text-ink">{value}</div>
        <div className="text-sm text-muted-foreground mt-0.5">{title}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPI title={isRTL ? 'إجمالي الرسوم' : 'Total Fees'} value={`${(total/1000).toFixed(0)}K`} sub={getCurrencySymbol(tenant?.localization, isRTL)} icon={DollarSign} iconCls="bg-sand-alt text-muted-foreground" />
        <KPI title={isRTL ? 'المحصل' : 'Collected'} value={`${(collected/1000).toFixed(0)}K`} sub={getCurrencySymbol(tenant?.localization, isRTL)} icon={CheckCircle} iconCls="bg-green-100 text-green-600" />
        <KPI title={isRTL ? 'المتبقي' : 'Outstanding'} value={`${(outstanding/1000).toFixed(0)}K`} sub={getCurrencySymbol(tenant?.localization, isRTL)} icon={Banknote} iconCls="bg-amber-100 text-amber-600" />
        <KPI title={isRTL ? 'المتأخر' : 'Overdue'} value={`${(overdueAmt/1000).toFixed(0)}K`} sub={getCurrencySymbol(tenant?.localization, isRTL)} icon={AlertCircle} iconCls="bg-red-100 text-red-600" />
        <KPI title={isRTL ? 'نسبة التحصيل' : 'Collection Rate'} value={`${collectionRate}%`} icon={Percent} iconCls="bg-najdi-50 text-najdi-700" />
        <KPI title={isRTL ? 'ضريبة القيمة المضافة' : 'VAT Collected'} value={`${(vatCollected/1000).toFixed(1)}K`} sub={getCurrencySymbol(tenant?.localization, isRTL)} icon={TrendingUp} iconCls="bg-purple-100 text-purple-600" />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{isRTL ? 'اتجاه التحصيل الشهري' : 'Monthly Collection Trend'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                <Tooltip formatter={v => [formatCurrency(v, tenant?.localization, isRTL), isRTL ? 'المبلغ' : 'Amount']} />
                <Line type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* By status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{isRTL ? 'الفواتير حسب الحالة' : 'Invoices by Status'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                  {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By grade */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{isRTL ? 'الرسوم حسب الصف' : 'Fees by Grade'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={gradeData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                <YAxis type="category" dataKey="grade" tick={{ fontSize: 10 }} width={60} />
                <Tooltip formatter={v => formatCurrency(v, tenant?.localization, isRTL)} />
                <Legend />
                <Bar dataKey="paid" stackId="a" fill="#10b981" name={isRTL ? 'مدفوع' : 'Paid'} />
                <Bar dataKey="outstanding" stackId="a" fill="#ef4444" name={isRTL ? 'متبقي' : 'Outstanding'} radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Aging */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{isRTL ? 'تحليل عمر الذمم المتأخرة' : 'Overdue Aging Analysis'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={agingData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                <Tooltip formatter={v => [formatCurrency(v, tenant?.localization, isRTL), isRTL ? 'المبلغ' : 'Amount']} />
                <Bar dataKey="amount" fill="#ef4444" radius={[4,4,0,0]} name={isRTL ? 'المتأخر' : 'Overdue'} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Collection progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{isRTL ? 'تقدم التحصيل' : 'Collection Progress'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { label: isRTL ? 'نسبة التحصيل الإجمالية' : 'Overall Collection Rate', pct: total > 0 ? collected/total*100 : 0, color: 'bg-najdi-500' },
            { label: isRTL ? 'المدفوعة كاملاً' : 'Fully Paid', pct: active.length > 0 ? active.filter(i=>i.status==='paid').length/active.length*100 : 0, color: 'bg-emerald-500' },
            { label: isRTL ? 'نسبة التأخر' : 'Overdue Rate', pct: active.length > 0 ? overdue.length/active.length*100 : 0, color: 'bg-red-400' },
          ].map((row, i) => (
            <div key={i}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-semibold text-ink">{row.pct.toFixed(1)}%</span>
              </div>
              <div className="h-2.5 bg-sand-alt rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${row.color}`} style={{ width: `${Math.min(row.pct, 100)}%` }} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}