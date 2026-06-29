import React from 'react';
import { Building2, Users, GraduationCap, TrendingUp, Bot, AlertTriangle } from 'lucide-react';

function StatBox({ icon: Icon, value, label, color = 'slate' }) {
  const colorMap = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue:    'bg-najdi-50 text-najdi-700',
    amber:   'bg-amber-50 text-amber-600',
    red:     'bg-red-50 text-red-600',
    slate:   'bg-sand-alt text-muted-foreground',
    purple:  'bg-purple-50 text-purple-600',
  };
  return (
    <div className="bg-white rounded-xl border border-border p-4 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-2xl font-bold text-ink">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export default function PlatformStats({ tenants, isRTL }) {
  const label = (ar, en) => isRTL ? ar : en;

  const total = tenants.length;
  const active = tenants.filter(t => t.status === 'active').length;
  const trial = tenants.filter(t => t.status === 'trial').length;
  const suspended = tenants.filter(t => t.status === 'suspended').length;
  const totalEmployees = tenants.reduce((s, t) => s + (t.current_employees || 0), 0);
  const totalStudents = tenants.reduce((s, t) => s + (t.current_students || 0), 0);
  const totalAI = tenants.reduce((s, t) => s + (t.yamen_ai_used_this_month || 0), 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      <StatBox icon={Building2} value={total}          label={label('إجمالي المستأجرين', 'Total Tenants')} color="blue" />
      <StatBox icon={TrendingUp} value={active}         label={label('نشط', 'Active')} color="emerald" />
      <StatBox icon={Building2} value={trial}          label={label('تجريبي', 'Trial')} color="amber" />
      <StatBox icon={AlertTriangle} value={suspended}  label={label('موقوف', 'Suspended')} color="red" />
      <StatBox icon={Users}     value={totalEmployees} label={label('إجمالي الموظفين', 'Total Employees')} color="slate" />
      <StatBox icon={GraduationCap} value={totalStudents} label={label('إجمالي الطلاب', 'Total Students')} color="purple" />
      <StatBox icon={Bot}       value={totalAI}        label={label('يامن AI (هذا الشهر)', 'Yamen AI (Month)')} color="slate" />
    </div>
  );
}