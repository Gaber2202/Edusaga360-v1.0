import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { formatDate } from '../../lib/localization';
import JurisdictionFeatureGate from '../JurisdictionFeatureGate';
import { HIJRI_CALENDAR_FEATURES } from '../../lib/jurisdictionFeatures';
import { LayoutDashboard } from 'lucide-react';

function toHijri(date) {
  const jd = Math.floor((date.getTime() / 86400000) + 2440587.5);
  let l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  const j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) + Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const month = Math.floor((24 * l) / 709);
  const day = l - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  const hijriMonthsAr = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
  const hijriMonthsEn = ['Muharram', 'Safar', 'Rabi I', 'Rabi II', 'Jumada I', 'Jumada II', 'Rajab', 'Sha\'ban', 'Ramadan', 'Shawwal', 'Dhu al-Qi\'dah', 'Dhu al-Hijjah'];
  return { day, month, year, monthNameAr: hijriMonthsAr[month - 1], monthNameEn: hijriMonthsEn[month - 1] };
}

export default function DashboardHeader({ user, tenant, isRTL, snapshot }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hijri = toHijri(now);
  const displayName = isRTL
    ? ([user?.first_name_ar, user?.last_name_ar].filter(Boolean).join(' ') || user?.display_name || user?.full_name || '')
    : ([user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.display_name || user?.full_name || '');

  const gregorianDate = formatDate(now, tenant?.localization, isRTL);
  const hijriDate = isRTL
    ? `${hijri.day} ${hijri.monthNameAr} ${hijri.year} هـ`
    : `${hijri.day} ${hijri.monthNameEn} ${hijri.year} AH`;
  const timeStr = format(now, 'HH:mm:ss');
  const schoolName = isRTL ? tenant?.name_ar : tenant?.name_en || tenant?.name_ar;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-najdi-900 via-[#0a5a42] to-najdi-900 text-white shadow-lg">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(200,164,81,0.15),transparent_55%)] pointer-events-none" />
      <div className="relative p-5 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          {tenant?.logo_url ? (
            <img src={tenant.logo_url} alt={schoolName || 'School'} className="w-14 h-14 rounded-xl object-cover border-2 border-white/20 bg-white/10" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
              <LayoutDashboard className="w-7 h-7 text-white/90" />
            </div>
          )}
          <div>
            {schoolName && <p className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-0.5">{schoolName}</p>}
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">
              {isRTL ? `مرحباً، ${displayName}` : `Welcome back, ${displayName}`}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-sm text-white/70">
              <span>{gregorianDate}</span>
              <JurisdictionFeatureGate featureKeys={HIJRI_CALENDAR_FEATURES}>
                <span className="hidden sm:inline text-white/40">|</span>
                <span className="text-xs">{hijriDate}</span>
              </JurisdictionFeatureGate>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 md:gap-6">
          {snapshot?.length > 0 && (
            <div className="hidden lg:flex items-center gap-4 pe-4 border-e border-white/15">
              {snapshot.map(({ label, value }) => (
                <div key={label} className="text-center">
                  <p className="text-lg font-bold tabular-nums">{value}</p>
                  <p className="text-[10px] uppercase tracking-wide text-white/55">{label}</p>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-col items-start md:items-end gap-1">
            <span className="text-2xl font-mono font-bold tabular-nums">{timeStr}</span>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span className="text-[11px] text-white/60">{isRTL ? 'النظام يعمل' : 'All systems operational'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
