import React from 'react';
import { Link } from 'react-router-dom';
import { Download, Users, Briefcase } from 'lucide-react';
import { Button } from '../ui/button';

/**
 * Hero strip inspired by 21st KPI layouts — brand gradient + live snapshot chips.
 */
export default function HRDashboardHero({
  isRTL,
  tenant,
  snapshot = [],
  onExport,
  exportDisabled,
}) {
  const schoolName = isRTL ? (tenant?.name_ar || tenant?.name_en) : (tenant?.name_en || tenant?.name_ar);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-najdi-900 via-[#0a5a42] to-najdi-900 text-white shadow-lg">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(200,164,81,0.18),transparent_55%)] pointer-events-none" />
      <div className="absolute -end-16 -bottom-20 w-56 h-56 rounded-full bg-white/5 blur-2xl pointer-events-none" />

      <div className="relative p-5 md:p-6 flex flex-col gap-5">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0">
              <Briefcase className="w-6 h-6 text-white/90" />
            </div>
            <div className="min-w-0">
              {schoolName && (
                <p className="text-[11px] font-semibold uppercase tracking-wider text-white/55 truncate">
                  {schoolName}
                </p>
              )}
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">
                {isRTL ? 'لوحة تحكم الموارد البشرية' : 'HR Manager Dashboard'}
              </h1>
              <p className="text-sm text-white/70 mt-1">
                {isRTL
                  ? 'مؤشرات الامتثال والقوى العاملة لحظياً — بدون طلب تقارير'
                  : 'Live workforce & compliance KPIs — no report requests needed'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onExport}
              disabled={exportDisabled}
              className="gap-1.5 bg-white/10 text-white border-white/20 hover:bg-white/20 hover:text-white"
            >
              <Download className="w-4 h-4" />
              {isRTL ? 'تقرير MHRSD' : 'MHRSD Report'}
            </Button>
            <Link to="/Employees">
              <Button size="sm" className="gap-1.5 bg-white text-najdi-900 hover:bg-white/90">
                <Users className="w-4 h-4" />
                {isRTL ? 'الموظفون' : 'Employees'}
              </Button>
            </Link>
          </div>
        </div>

        {snapshot.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3">
            {snapshot.map(({ label, value, hint }) => (
              <div
                key={label}
                className="rounded-xl bg-white/10 border border-white/10 px-3 py-2.5 backdrop-blur-sm"
              >
                <p className="text-lg md:text-xl font-bold tabular-nums leading-none">{value}</p>
                <p className="text-[10px] uppercase tracking-wide text-white/55 mt-1.5 truncate">{label}</p>
                {hint && <p className="text-[10px] text-white/40 mt-0.5 truncate">{hint}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
