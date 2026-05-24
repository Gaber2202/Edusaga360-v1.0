/**
 * UsageLimitGuard
 * Wraps an action trigger (e.g. "Add Employee" button) and blocks it when
 * the tenant has hit its limit for the given resource.
 *
 * Usage:
 *   <UsageLimitGuard limitKey="employees">
 *     <Button onClick={openForm}>Add Employee</Button>
 *   </UsageLimitGuard>
 */
import React from 'react';
import { useTenant } from '../TenantContext';
import { useLanguage } from '../LanguageContext';
import { AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

const LIMIT_LABELS = {
  employees: { ar: 'الموظفين', en: 'employees' },
  students:  { ar: 'الطلاب',   en: 'students'  },
  branches:  { ar: 'الفروع',   en: 'branches'  },
  yamen_ai:  { ar: 'يامن AI',  en: 'Yamen AI'  },
};

export default function UsageLimitGuard({ limitKey, children }) {
  const { checkLimit } = useTenant();
  const { isRTL } = useLanguage();

  const { allowed, current, max } = checkLimit(limitKey);
  const resourceLabel = LIMIT_LABELS[limitKey]?.[isRTL ? 'ar' : 'en'] || limitKey;

  if (allowed) return <>{children}</>;

  const msg = isRTL
    ? `لقد وصلت إلى الحد الأقصى لعدد ${resourceLabel} (${current}/${max}). يرجى الترقية لإضافة المزيد.`
    : `You've reached the maximum limit for ${resourceLabel} (${current}/${max}). Please upgrade your plan.`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1.5 cursor-not-allowed opacity-60">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            {React.cloneElement(React.Children.only(children), { disabled: true, onClick: undefined })}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[280px] text-center">
          {msg}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}