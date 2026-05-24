import React from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Building2, Users, GraduationCap, Bot, Calendar, MoreVertical } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from '../ui/dropdown-menu';
import { format } from 'date-fns';

const STATUS_STYLES = {
  trial:     'bg-blue-100 text-blue-700 border-blue-200',
  active:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  past_due:  'bg-amber-100 text-amber-700 border-amber-200',
  suspended: 'bg-red-100 text-red-700 border-red-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

const STATUS_LABELS = {
  trial: { ar: 'تجريبي', en: 'Trial' },
  active: { ar: 'نشط', en: 'Active' },
  past_due: { ar: 'متأخر', en: 'Past Due' },
  suspended: { ar: 'موقوف', en: 'Suspended' },
  cancelled: { ar: 'ملغى', en: 'Cancelled' },
};

const PLAN_STYLES = {
  starter:    'bg-slate-100 text-slate-600',
  pro:        'bg-purple-100 text-purple-700',
  enterprise: 'bg-amber-100 text-amber-700',
};

export default function TenantCard({ tenant, isRTL, onEdit, onSuspend, onActivate, onUpgrade }) {
  const lang = isRTL ? 'ar' : 'en';
  const name = isRTL ? tenant.name_ar : tenant.name_en;
  const statusLabel = STATUS_LABELS[tenant.status]?.[lang] || tenant.status;
  const isTrialExpired = tenant.status === 'trial' && tenant.trial_end_date && new Date(tenant.trial_end_date) < new Date();

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {tenant.logo_url
            ? <img src={tenant.logo_url} alt={name} className="w-10 h-10 rounded-lg object-cover border border-slate-200" />
            : <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center"><Building2 className="w-5 h-5 text-slate-400" /></div>
          }
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">{name}</h3>
            <p className="text-xs text-slate-400">{tenant.tenant_code}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={`text-xs border ${STATUS_STYLES[tenant.status] || ''}`}>
            {isTrialExpired ? (isRTL ? 'منتهي' : 'Expired') : statusLabel}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="w-4 h-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isRTL ? 'start' : 'end'}>
              <DropdownMenuItem onClick={() => onEdit(tenant)}>{isRTL ? 'تعديل' : 'Edit'}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onUpgrade(tenant)}>{isRTL ? 'تغيير الخطة' : 'Change Plan'}</DropdownMenuItem>
              <DropdownMenuSeparator />
              {tenant.status === 'suspended'
                ? <DropdownMenuItem onClick={() => onActivate(tenant)} className="text-emerald-600">{isRTL ? 'تفعيل' : 'Activate'}</DropdownMenuItem>
                : <DropdownMenuItem onClick={() => onSuspend(tenant)} className="text-red-600">{isRTL ? 'إيقاف' : 'Suspend'}</DropdownMenuItem>
              }
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Plan Badge */}
      <div className="mb-3">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PLAN_STYLES[tenant.plan_code] || PLAN_STYLES.starter}`}>
          {(tenant.plan_code || 'starter').toUpperCase()}
        </span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="text-center p-2 bg-slate-50 rounded-lg">
          <div className="flex items-center justify-center gap-1 mb-1"><Users className="w-3 h-3 text-slate-400" /></div>
          <div className="text-sm font-bold text-slate-800">{tenant.current_employees || 0}<span className="text-xs text-slate-400">/{tenant.max_employees || '∞'}</span></div>
          <div className="text-xs text-slate-400">{isRTL ? 'موظف' : 'Employees'}</div>
        </div>
        <div className="text-center p-2 bg-slate-50 rounded-lg">
          <div className="flex items-center justify-center gap-1 mb-1"><GraduationCap className="w-3 h-3 text-slate-400" /></div>
          <div className="text-sm font-bold text-slate-800">{tenant.current_students || 0}<span className="text-xs text-slate-400">/{tenant.max_students || '∞'}</span></div>
          <div className="text-xs text-slate-400">{isRTL ? 'طالب' : 'Students'}</div>
        </div>
        <div className="text-center p-2 bg-slate-50 rounded-lg">
          <div className="flex items-center justify-center gap-1 mb-1"><Bot className="w-3 h-3 text-slate-400" /></div>
          <div className="text-sm font-bold text-slate-800">{tenant.yamen_ai_used_this_month || 0}<span className="text-xs text-slate-400">/{tenant.yamen_ai_monthly_limit || '∞'}</span></div>
          <div className="text-xs text-slate-400">{isRTL ? 'يامن AI' : 'Yamen AI'}</div>
        </div>
      </div>

      {/* Trial info */}
      {tenant.status === 'trial' && tenant.trial_end_date && (
        <div className={`flex items-center gap-1.5 text-xs ${isTrialExpired ? 'text-red-500' : 'text-amber-600'}`}>
          <Calendar className="w-3 h-3" />
          {isTrialExpired
            ? (isRTL ? 'انتهت التجربة' : 'Trial expired')
            : `${isRTL ? 'التجربة تنتهي:' : 'Trial ends:'} ${format(new Date(tenant.trial_end_date), 'dd MMM yyyy')}`
          }
        </div>
      )}

      {/* Admin */}
      {tenant.admin_email && (
        <div className="mt-2 text-xs text-slate-400 truncate">{tenant.admin_email}</div>
      )}
    </div>
  );
}