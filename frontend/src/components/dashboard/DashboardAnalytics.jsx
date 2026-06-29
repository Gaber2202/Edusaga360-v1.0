import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar,
} from 'recharts';
import { format, subMonths } from 'date-fns';
import { BarChart3 } from 'lucide-react';

function monthLabel(offset) {
  return format(subMonths(new Date(), offset), 'MMM');
}

function AttendanceGauge({ pct, isRTL }) {
  const r = 52;
  const circ = Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 90 ? '#10b981' : pct >= 75 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex flex-col items-center justify-center py-2">
      <svg width="140" height="80" viewBox="0 0 140 80">
        <path d={`M 14 70 A ${r} ${r} 0 0 1 126 70`} fill="none" stroke="#e2e8f0" strokeWidth="12" strokeLinecap="round" />
        <path
          d={`M 14 70 A ${r} ${r} 0 0 1 126 70`}
          fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
        <text x="70" y="72" textAnchor="middle" fontSize="22" fontWeight="800" fill={color}>{pct}%</text>
        <text x="70" y="80" textAnchor="middle" fontSize="9" fill="#94a3b8">{isRTL ? 'معدل الحضور' : 'Attendance Rate'}</text>
      </svg>
      <div className={`text-xs font-semibold mt-1 ${pct >= 90 ? 'text-emerald-600' : pct >= 75 ? 'text-amber-600' : 'text-red-600'}`}>
        {pct >= 90 ? (isRTL ? 'ممتاز' : 'Excellent') : pct >= 75 ? (isRTL ? 'جيد' : 'Good') : (isRTL ? 'يحتاج متابعة' : 'Needs Attention')}
      </div>
    </div>
  );
}

function EmptyChartState({ isRTL }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
      <BarChart3 className="w-8 h-8 mb-2 text-muted-foreground" />
      <p className="text-xs">{isRTL ? 'لا توجد بيانات بعد' : 'No data yet'}</p>
    </div>
  );
}

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444'];

export default function DashboardAnalytics({ students, invoices, employees: _employees, payRuns, attendanceRecords, isRTL }) {
  const enrollmentData = React.useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const label = monthLabel(5 - i);
      const monthKey = format(subMonths(new Date(), 5 - i), 'yyyy-MM');
      const count = students.filter(s => s.enrollment_date?.startsWith(monthKey)).length;
      return { month: label, students: count };
    });
  }, [students]);

  const hasEnrollmentData = enrollmentData.some(d => d.students > 0);

  const feeData = React.useMemo(() => {
    if (invoices.length === 0) return [];
    const collected = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.paid_amount || i.total_amount || 0), 0);
    const pending = invoices.filter(i => i.status === 'issued').reduce((s, i) => s + (i.total_amount - (i.paid_amount || 0)), 0);
    const overdue = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + (i.total_amount - (i.paid_amount || 0)), 0);
    return [
      { name: isRTL ? 'محصّل' : 'Collected', value: Math.round(collected / 1000) || 0 },
      { name: isRTL ? 'معلق' : 'Pending', value: Math.round(pending / 1000) || 0 },
      { name: isRTL ? 'متأخر' : 'Overdue', value: Math.round(overdue / 1000) || 0 },
    ];
  }, [invoices, isRTL]);

  const attendancePct = React.useMemo(() => {
    if (!attendanceRecords || attendanceRecords.length === 0) return 0;
    const today = format(new Date(), 'yyyy-MM-dd');
    const todayRecords = attendanceRecords.filter(r => r.date === today);
    if (todayRecords.length === 0) return 0;
    const present = todayRecords.filter(r => r.status === 'present' || r.status === 'late').length;
    return Math.round((present / todayRecords.length) * 100);
  }, [attendanceRecords]);

  const payrollData = React.useMemo(() => {
    if (!payRuns || payRuns.length === 0) return [];
    return payRuns.slice(0, 3).reverse().map(pr => ({
      month: pr.period || `${pr.period_month}/${pr.period_year}`,
      cost: Math.round((pr.total_amount || 0) / 1000),
      budget: Math.round((pr.budget_amount || pr.total_amount || 0) / 1000),
    }));
  }, [payRuns]);

  return (
    <div>
      <h2 className="text-ink mb-3 text-sm font-bold uppercase tracking-wide">{isRTL ? 'التحليلات والإحصاءات' : 'Analytics & Insights'}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

        <Card className="col-span-1">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{isRTL ? 'تطور التسجيل (6 أشهر)' : 'Enrollment Trend (6 Mo)'}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            {hasEnrollmentData ? (
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={enrollmentData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={24} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Line type="monotone" dataKey="students" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: '#3b82f6' }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChartState isRTL={isRTL} />
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{isRTL ? 'حالة التحصيل (ألف ر.س)' : 'Fee Collection (K SAR)'}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3 flex items-center justify-center">
            {feeData.length > 0 && feeData.some(d => d.value > 0) ? (
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie data={feeData} cx="50%" cy="50%" innerRadius={30} outerRadius={52} paddingAngle={3} dataKey="value">
                    {feeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                  </Pie>
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => [`${v}K SAR`]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChartState isRTL={isRTL} />
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader className="pb-0 px-4 pt-4">
            <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{isRTL ? 'الحضور اليوم' : 'Attendance Today'}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            {attendancePct > 0 ? (
              <AttendanceGauge pct={attendancePct} isRTL={isRTL} />
            ) : (
              <EmptyChartState isRTL={isRTL} />
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{isRTL ? 'الرواتب vs الميزانية (ألف)' : 'Payroll vs Budget (K)'}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            {payrollData.length > 0 ? (
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={payrollData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={28} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Bar dataKey="cost" fill="#6366f1" radius={[4, 4, 0, 0]} name={isRTL ? 'الفعلي' : 'Actual'} />
                  <Bar dataKey="budget" fill="#e2e8f0" radius={[4, 4, 0, 0]} name={isRTL ? 'الميزانية' : 'Budget'} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChartState isRTL={isRTL} />
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
