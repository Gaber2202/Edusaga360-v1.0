import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import StatusBadge from '../ui/StatusBadge';
import { createPageUrl } from '../../utils';

function InitialsAvatar({ name, color: _color = 'blue' }) {
  const colorMap = {
    blue: 'bg-najdi-50 text-najdi-900',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    purple: 'bg-purple-100 text-purple-700',
  };
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const colors = Object.values(colorMap);
  const cls = colors[initials.charCodeAt(0) % colors.length];
  return (
    <div className={`w-8 h-8 rounded-full ${cls} flex items-center justify-center text-xs font-bold flex-shrink-0`}>
      {initials}
    </div>
  );
}

const statusConfig = {
  pending:  { label: { ar: 'معلق', en: 'Pending' }, cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  approved: { label: { ar: 'موافق', en: 'Approved' }, cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rejected: { label: { ar: 'مرفوض', en: 'Rejected' }, cls: 'bg-red-100 text-red-700 border-red-200' },
  manager_approved: { label: { ar: 'موافقة مدير', en: 'Mgr Approved' }, cls: 'bg-najdi-50 text-najdi-900 border-najdi-100' },
};

export default function ActivityPanel({ leaveRequests, applications, invoices, isHR, isSchoolAdmin, isFinance, isRTL }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Pending Leave Requests */}
      {isHR && (
        <Card>
          <div className="flex items-center justify-between p-5 pb-3">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-ink text-sm">{isRTL ? 'إجازات معلقة' : 'Pending Leave Requests'}</h3>
              {leaveRequests.length > 0 && (
                <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-200">{leaveRequests.length}</span>
              )}
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to={createPageUrl('HRApprovalsInbox')} className="text-emerald-600 text-xs font-semibold">
                {isRTL ? 'عرض الكل' : 'View All'} <ArrowUpRight className="w-3 h-3 ms-1" />
              </Link>
            </Button>
          </div>
          <CardContent className="pt-0 space-y-2">
            {leaveRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{isRTL ? 'لا توجد طلبات معلقة' : 'No pending requests'}</p>
            ) : leaveRequests.slice(0, 5).map((r) => {
              const cfg = statusConfig[r.status] || statusConfig.pending;
              return (
                <div key={r.id} className="bg-sand p-3 rounded-lg flex items-center gap-3">
                  <InitialsAvatar name={r.employee_name} />
                  <div className="flex-1 min-w-0">
                    <p className="text-ink text-sm font-semibold truncate">{r.employee_name}</p>
                    <p className="text-xs text-muted-foreground">{r.leave_type_name} · {r.total_days} {isRTL ? 'أيام' : 'days'}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${cfg.cls}`}>
                    {isRTL ? cfg.label.ar : cfg.label.en}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Recent Applications */}
      {isSchoolAdmin && (
        <Card>
          <div className="flex items-center justify-between p-5 pb-3">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-ink text-sm">{isRTL ? 'أحدث الطلبات' : 'Recent Applications'}</h3>
              {applications.length > 0 && (
                <span className="bg-najdi-50 text-najdi-900 text-xs font-bold px-2 py-0.5 rounded-full border border-najdi-100">{applications.length}</span>
              )}
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to={createPageUrl('Admissions')} className="text-emerald-600 text-xs font-semibold">
                {isRTL ? 'عرض الكل' : 'View All'} <ArrowUpRight className="w-3 h-3 ms-1" />
              </Link>
            </Button>
          </div>
          <CardContent className="pt-0 space-y-2">
            {applications.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{isRTL ? 'لا توجد طلبات' : 'No applications'}</p>
            ) : applications.slice(0, 5).map((app) => (
              <div key={app.id} className="bg-sand p-3 rounded-lg flex items-center gap-3">
                <InitialsAvatar name={app.student_name_ar || app.student_name_en} />
                <div className="flex-1 min-w-0">
                  <p className="text-ink text-sm font-semibold truncate">{app.student_name_ar}</p>
                  <p className="text-xs text-muted-foreground">{app.applying_for_grade}</p>
                </div>
                <StatusBadge status={app.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent Invoices */}
      {isFinance && (
        <Card>
          <div className="flex items-center justify-between p-5 pb-3">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-ink text-sm">{isRTL ? 'أحدث الفواتير' : 'Recent Invoices'}</h3>
              {invoices.length > 0 && (
                <span className="bg-sand-alt text-muted-foreground text-xs font-bold px-2 py-0.5 rounded-full border border-border">{invoices.length}</span>
              )}
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to={createPageUrl('Fees')} className="text-emerald-600 text-xs font-semibold">
                {isRTL ? 'عرض الكل' : 'View All'} <ArrowUpRight className="w-3 h-3 ms-1" />
              </Link>
            </Button>
          </div>
          <CardContent className="pt-0 space-y-2">
            {invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{isRTL ? 'لا توجد فواتير' : 'No invoices'}</p>
            ) : invoices.slice(0, 5).map((inv) => (
              <div key={inv.id} className="bg-sand p-3 rounded-lg flex items-center gap-3">
                <InitialsAvatar name={inv.student_name} />
                <div className="flex-1 min-w-0">
                  <p className="text-ink text-sm font-semibold truncate">{inv.student_name}</p>
                  <p className="text-xs text-muted-foreground">{inv.total_amount?.toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</p>
                </div>
                <StatusBadge status={inv.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}