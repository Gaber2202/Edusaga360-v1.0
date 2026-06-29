/**
 * Document Expiry Tracker — AC#8: alerts at exactly 90/60/30 days
 * No expired documents slip through
 */
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { useTenantFilter } from '../../hooks/useTenantFilter';
import { Badge } from '../ui/badge';
import { differenceInDays, format } from 'date-fns';
import { AlertTriangle, Clock, CheckCircle, FileText } from 'lucide-react';

const DOC_FIELDS = [
  { key: 'iqama_expiry', label: { ar: 'الإقامة', en: 'Iqama' } },
  { key: 'passport_expiry', label: { ar: 'الجواز', en: 'Passport' } },
  { key: 'license_expiry_date', label: { ar: 'ترخيص MOE', en: 'MOE License' } },
  { key: 'driving_license_expiry', label: { ar: 'رخصة القيادة', en: 'Driving License' } },
];

export default function DocumentExpiryTracker({ isRTL }) {
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  const today = new Date();

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees-docs', tenantId],
    queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
    refetchInterval: 300000, // 5 min refresh
  });

  const expiryItems = useMemo(() => {
    const items = [];
    employees.forEach(emp => {
      DOC_FIELDS.forEach(doc => {
        const dateStr = emp[doc.key];
        if (!dateStr) return;
        const expDate = new Date(dateStr);
        const daysLeft = differenceInDays(expDate, today);
        if (daysLeft <= 90) {
          items.push({
            employeeId: emp.employee_id,
            employeeName: emp.name_ar,
            employeeNameEn: emp.name_en,
            doc: isRTL ? doc.label.ar : doc.label.en,
            expDate,
            daysLeft,
            severity: daysLeft < 0 ? 'expired' : daysLeft <= 30 ? 'critical' : daysLeft <= 60 ? 'warning' : 'notice',
          });
        }
      });
    });
    return items.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [employees, today, isRTL]);

  const groups = {
    expired: expiryItems.filter(i => i.severity === 'expired'),
    critical: expiryItems.filter(i => i.severity === 'critical'),
    warning: expiryItems.filter(i => i.severity === 'warning'),
    notice: expiryItems.filter(i => i.severity === 'notice'),
  };

  const severityConfig = {
    expired: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: AlertTriangle, iconColor: 'text-red-500', badgeBg: 'bg-red-100 text-red-700', label: { ar: 'منتهية الصلاحية', en: 'EXPIRED' } },
    critical: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', icon: AlertTriangle, iconColor: 'text-orange-500', badgeBg: 'bg-orange-100 text-orange-700', label: { ar: 'حرجة (30 يوم)', en: 'Critical (30d)' } },
    warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: Clock, iconColor: 'text-amber-500', badgeBg: 'bg-amber-100 text-amber-700', label: { ar: 'تحذير (60 يوم)', en: 'Warning (60d)' } },
    notice: { bg: 'bg-najdi-50', border: 'border-najdi-100', text: 'text-najdi-900', icon: FileText, iconColor: 'text-najdi-500', badgeBg: 'bg-najdi-50 text-najdi-900', label: { ar: 'تنبيه (90 يوم)', en: 'Notice (90d)' } },
  };

  if (isLoading) return <div className="py-8 text-center text-muted-foreground text-sm">{isRTL ? 'جاري التحميل...' : 'Loading...'}</div>;

  if (expiryItems.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 flex-col gap-2">
        <CheckCircle className="w-10 h-10 text-emerald-400" />
        <p className="text-muted-foreground text-sm">{isRTL ? 'جميع الوثائق سارية المفعول ✓' : 'All documents are valid ✓'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        {Object.entries(groups).map(([sev, items]) => {
          const cfg = severityConfig[sev];
          const Icon = cfg.icon;
          return (
            <div key={sev} className={`p-3 rounded-xl border ${cfg.bg} ${cfg.border}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className={`w-4 h-4 ${cfg.iconColor}`} />
                <span className={`text-xs font-medium ${cfg.text}`}>{isRTL ? cfg.label.ar : cfg.label.en}</span>
              </div>
              <p className={`text-2xl font-bold ${cfg.text}`}>{items.length}</p>
            </div>
          );
        })}
      </div>

      {/* Expiry list */}
      <div className="space-y-2">
        {Object.entries(groups).filter(([, items]) => items.length > 0).map(([sev, items]) => {
          const cfg = severityConfig[sev];
          const Icon = cfg.icon;
          return (
            <div key={sev}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-4 h-4 ${cfg.iconColor}`} />
                <h3 className={`text-xs font-bold uppercase tracking-wide ${cfg.text}`}>
                  {isRTL ? cfg.label.ar : cfg.label.en} ({items.length})
                </h3>
              </div>
              <div className="space-y-1.5">
                {items.map((item, i) => (
                  <div key={i} className={`flex items-center justify-between p-3 rounded-xl border ${cfg.bg} ${cfg.border}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{item.employeeName} <span className="text-muted-foreground text-xs">({item.employeeId})</span></p>
                      <p className={`text-xs ${cfg.text}`}>{item.doc} — {isRTL ? 'ينتهي:' : 'Expires:'} {format(item.expDate, 'dd/MM/yyyy')}</p>
                    </div>
                    <Badge className={`${cfg.badgeBg} flex-shrink-0 ms-2 text-xs`}>
                      {item.daysLeft < 0
                        ? (isRTL ? `منذ ${Math.abs(item.daysLeft)} يوم` : `${Math.abs(item.daysLeft)}d ago`)
                        : (isRTL ? `${item.daysLeft} يوم` : `${item.daysLeft}d left`)}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}