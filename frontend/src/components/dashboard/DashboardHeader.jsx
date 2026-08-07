import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import JurisdictionFeatureGate from '../JurisdictionFeatureGate';
import { HIJRI_CALENDAR_FEATURES } from '../../lib/jurisdictionFeatures';

// Simple Hijri date conversion (Gregorian to Hijri approximation)
function toHijri(date) {
  // Using a reliable offset-based calculation
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

export default function DashboardHeader({ user, tenant, isRTL }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hijri = toHijri(now);
  const displayName = isRTL
    ? ([user?.first_name_ar, user?.last_name_ar].filter(Boolean).join(' ') || user?.display_name || user?.full_name || '')
    : ([user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.display_name || user?.full_name || '');

  const gregorianDate = format(now, 'EEEE, dd MMMM yyyy');
  const hijriDate = isRTL
    ? `${hijri.day} ${hijri.monthNameAr} ${hijri.year} هـ`
    : `${hijri.day} ${hijri.monthNameEn} ${hijri.year} AH`;
  const timeStr = format(now, 'HH:mm:ss');
  const schoolName = isRTL ? tenant?.name_ar : tenant?.name_en || tenant?.name_ar;

  return (
    <div className="flex items-start justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3">
        {tenant?.logo_url && (
          <img src={tenant.logo_url} alt={schoolName || 'School'} className="w-12 h-12 rounded-xl object-cover border border-border bg-white" />
        )}
        <div>
          {schoolName && <p className="text-sm font-bold text-emerald-600 mb-0.5">{schoolName}</p>}
          <h1 className="text-ink text-xl font-extrabold tracking-tight">
            {isRTL ? `مرحباً، ${displayName}` : `Welcome back, ${displayName}`}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
            <span className="text-muted-foreground text-sm">{gregorianDate}</span>
            <JurisdictionFeatureGate featureKeys={HIJRI_CALENDAR_FEATURES}>
              <span className="text-muted-foreground hidden sm:inline">|</span>
              <span className="text-muted-foreground text-xs font-medium">{hijriDate}</span>
            </JurisdictionFeatureGate>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Live clock */}
        <div className="hidden sm:flex flex-col items-end">
          <span className="text-ink text-lg font-mono font-bold tabular-nums">{timeStr}</span>
          <span className="text-muted-foreground text-xs">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
        </div>

        {/* System health */}
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
          </span>
          <span className="text-xs text-muted-foreground hidden sm:inline">{isRTL ? 'النظام يعمل' : 'All systems operational'}</span>
        </div>
      </div>
    </div>
  );
}