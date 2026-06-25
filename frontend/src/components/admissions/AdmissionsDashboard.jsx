import React from 'react';
import { useLanguage } from '../LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { differenceInDays } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { Users, GraduationCap, CheckCircle, XCircle, Clock, TrendingUp, AlertTriangle } from 'lucide-react';

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16'];

const STAGE_ORDER = ['inquiry','submitted','under_review','assessment','interview','committee','accepted','enrolled'];
const STAGE_LABELS_AR = {
  inquiry:'استفسار', submitted:'مقدَّم', under_review:'مراجعة', assessment:'اختبار',
  interview:'مقابلة', committee:'اللجنة', accepted:'مقبول', enrolled:'ملتحق'
};

export default function AdmissionsDashboard({ applications, branches: _branches }) {
  const { isRTL } = useLanguage();

  const total = applications.length;
  const accepted = applications.filter(a => a.status === 'accepted').length;
  const enrolled = applications.filter(a => a.status === 'enrolled').length;
  const rejected = applications.filter(a => a.status === 'rejected').length;
  const pending = applications.filter(a => ['submitted','pending','under_review'].includes(a.status)).length;
  const acceptanceRate = total > 0 ? Math.round((accepted + enrolled) / total * 100) : 0;
  const avgDays = applications.length > 0
    ? Math.round(applications.reduce((s,a) => s + differenceInDays(new Date(), new Date(a.created_at)), 0) / applications.length)
    : 0;
  const overdueCount = applications.filter(a => differenceInDays(new Date(), new Date(a.updated_date || a.created_at)) > 7 && !['enrolled','rejected'].includes(a.status)).length;

  // By stage funnel data
  const funnelData = STAGE_ORDER.map(stage => {
    const count = applications.filter(a => {
      if (stage === 'submitted') return a.status === 'submitted' || a.status === 'pending';
      return a.status === stage || a.pipeline_stage === stage;
    }).length;
    return {
      name: isRTL ? STAGE_LABELS_AR[stage] : stage.charAt(0).toUpperCase() + stage.slice(1),
      value: count
    };
  }).filter(d => d.value > 0);

  // By grade
  const gradeMap = {};
  applications.forEach(a => {
    if (a.applying_for_grade) gradeMap[a.applying_for_grade] = (gradeMap[a.applying_for_grade] || 0) + 1;
  });
  const gradeData = Object.entries(gradeMap).map(([grade, count]) => ({ grade, count })).sort((a,b) => b.count - a.count);

  // By nationality
  const natMap = {};
  applications.forEach(a => {
    const nat = a.nationality || 'Unknown';
    natMap[nat] = (natMap[nat] || 0) + 1;
  });
  const natData = Object.entries(natMap).map(([name, value]) => ({ name, value }));

  const KPICard = ({ title, value, sub, icon: Icon, color }) => (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-800">{value}</div>
        <div className="text-sm text-slate-500 mt-1">{title}</div>
        {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KPICard title={isRTL ? 'إجمالي الطلبات' : 'Total Applications'} value={total} icon={Users} color="bg-blue-100 text-blue-600" />
        <KPICard title={isRTL ? 'قيد المعالجة' : 'In Progress'} value={pending} icon={Clock} color="bg-amber-100 text-amber-600" />
        <KPICard title={isRTL ? 'نسبة القبول' : 'Acceptance Rate'} value={`${acceptanceRate}%`} icon={TrendingUp} color="bg-green-100 text-green-600" />
        <KPICard title={isRTL ? 'متوسط المدة (أيام)' : 'Avg. Days'} value={avgDays} icon={Clock} color="bg-purple-100 text-purple-600" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KPICard title={isRTL ? 'مقبولون' : 'Accepted'} value={accepted} icon={CheckCircle} color="bg-green-100 text-green-600" />
        <KPICard title={isRTL ? 'ملتحقون' : 'Enrolled'} value={enrolled} icon={GraduationCap} color="bg-emerald-100 text-emerald-600" />
        <KPICard title={isRTL ? 'مرفوضون' : 'Rejected'} value={rejected} icon={XCircle} color="bg-red-100 text-red-600" />
        <KPICard title={isRTL ? 'متأخرة' : 'Overdue'} value={overdueCount} icon={AlertTriangle} color="bg-red-100 text-red-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stage funnel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{isRTL ? 'توزيع الطلبات على المراحل' : 'Pipeline Stage Distribution'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={funnelData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* By grade */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{isRTL ? 'الطلبات حسب الصف' : 'Applications by Grade'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={gradeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="grade" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* By nationality */}
        {natData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{isRTL ? 'الطلبات حسب الجنسية' : 'Applications by Nationality'}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={natData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                    {natData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Summary stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{isRTL ? 'ملخص سريع' : 'Quick Summary'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: isRTL ? 'إجمالي الطلبات' : 'Total Applications', value: total, bar: 100 },
              { label: isRTL ? 'قيد المعالجة' : 'In Progress', value: pending, bar: total > 0 ? Math.round(pending/total*100) : 0 },
              { label: isRTL ? 'مقبول / ملتحق' : 'Accepted / Enrolled', value: accepted + enrolled, bar: total > 0 ? Math.round((accepted+enrolled)/total*100) : 0, green: true },
              { label: isRTL ? 'مرفوض' : 'Rejected', value: rejected, bar: total > 0 ? Math.round(rejected/total*100) : 0, red: true },
            ].map((row, i) => (
              <div key={i}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600">{row.label}</span>
                  <span className="font-semibold text-slate-800">{row.value}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${row.green ? 'bg-emerald-500' : row.red ? 'bg-red-400' : 'bg-blue-500'}`}
                    style={{ width: `${row.bar}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}