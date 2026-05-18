/**
 * TenantUsageBanner
 * Shows a warning strip at the top of a page when usage is ≥ 80%.
 * Drop it at the top of any page that manages a resource with limits.
 *
 * Usage:
 *   <TenantUsageBanner limitKey="employees" />
 */
import React from 'react';
import { useTenant } from '../TenantContext';
import { useLanguage } from '../LanguageContext';
import { AlertTriangle } from 'lucide-react';

const LIMIT_LABELS = {
  employees: { ar: 'الموظفين', en: 'employees' },
  students:  { ar: 'الطلاب',   en: 'students'  },
  branches:  { ar: 'الفروع',   en: 'branches'  },
  yamen_ai:  { ar: 'يامن AI',  en: 'Yamen AI'  },
};

export default function TenantUsageBanner({ limitKey }) {
  const { checkLimit } = useTenant();
  const { isRTL } = useLanguage();

  const { allowed, current, max } = checkLimit(limitKey);
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;

  if (pct < 80) return null;

  const resourceLabel = LIMIT_LABELS[limitKey]?.[isRTL ? 'ar' : 'en'] || limitKey;
  const isDanger = !allowed || pct >= 100;

  const msg = isDanger
    ? (isRTL ? `وصلت إلى الحد الأقصى لعدد ${resourceLabel} (${current}/${max})` : `You've reached the ${resourceLabel} limit (${current}/${max})`)
    : (isRTL ? `اقتربت من الحد الأقصى لعدد ${resourceLabel} (${current}/${max})` : `You're near the ${resourceLabel} limit (${current}/${max})`);

  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm mb-4 ${isDanger ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span>{msg}</span>
    </div>
  );
}