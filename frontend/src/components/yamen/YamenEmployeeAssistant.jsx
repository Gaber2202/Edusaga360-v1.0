import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { useTenantFilter } from '../../hooks/useTenantFilter';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { MessageSquare, Phone, Shield, Users, Clock, Search } from 'lucide-react';
import { format } from 'date-fns';
import DashboardKPICard from '../dashboard/DashboardKPICard';
import { YamenSection, YamenPanelEmpty } from './YamenShellParts';
import { yamenLayout } from '../../lib/yamenDesign';

export default function YamenEmployeeAssistant({ isRTL, isHRView = false }) {
  const [search, setSearch] = useState('');
  const { tenantId } = useTenantFilter();

  const { data: auditLogs = [] } = useQuery({
    queryKey: ['yamenLogs', tenantId],
    queryFn: () => fetchData(tenantQuery('audit_logs').select('*').match({ entity_type: 'YamenAI' })),
  });

  const filtered = useMemo(() => auditLogs.filter((l) =>
    !search
    || l.user_email?.toLowerCase().includes(search.toLowerCase())
    || l.notes?.toLowerCase().includes(search.toLowerCase()),
  ), [auditLogs, search]);

  const hrModeCount = auditLogs.filter((l) => l.user_role === 'hr').length;
  const empModeCount = auditLogs.filter((l) => l.user_role === 'employee').length;
  const today = new Date().toDateString();
  const todayLogs = auditLogs.filter((l) => l.timestamp && new Date(l.timestamp).toDateString() === today);

  return (
    <div className={yamenLayout.page}>
      <YamenSection
        title={isRTL ? 'بوابة واتساب المؤمّنة' : 'Secured WhatsApp Gateway'}
        subtitle={isRTL
          ? 'ربط الموظفين بيمن عبر واتساب Business مع عزل كامل للبيانات'
          : 'Link employees to YAMEN via WhatsApp Business with full data isolation'}
        icon={Phone}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {
              icon: Shield,
              color: 'emerald',
              title: isRTL ? 'ربط آمن بـ OTP' : 'OTP Secure Linking',
              desc: isRTL ? 'يربط الموظف واتساب بمعرف موظفه عبر رمز OTP' : 'Employee links WhatsApp to their ID via OTP verification',
            },
            {
              icon: MessageSquare,
              color: 'najdi',
              title: isRTL ? 'استفسارات الموظف فقط' : 'Employee-Only Queries',
              desc: isRTL ? 'رصيد الإجازة، الحضور، كشف الراتب، حالة الطلبات' : 'Leave balance, attendance, payslip, request status',
            },
            {
              icon: Users,
              color: 'amber',
              title: isRTL ? 'عزل البيانات' : 'Data Isolation',
              desc: isRTL ? 'لا يمكن لأي موظف رؤية بيانات زميله' : 'No cross-employee data access possible',
            },
          ].map((item) => {
            const Icon = item.icon;
            const iconWrap = {
              emerald: 'bg-emerald-50 text-emerald-700',
              najdi: 'bg-najdi-50 text-najdi-800',
              amber: 'bg-amber-50 text-amber-700',
            }[item.color];
            return (
              <div key={item.title} className="rounded-xl border border-border/60 bg-sand-alt/30 p-4 space-y-2">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconWrap}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <p className="text-sm font-semibold text-ink">{item.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed">
          {isRTL
            ? 'تكامل واتساب يتطلب تفعيل وكيل يامن عبر لوحة إدارة النظام وربط رقم واتساب Business. تواصل مع المسؤول لإتمام الإعداد.'
            : 'WhatsApp integration requires activating YAMEN agent via system admin panel and linking a WhatsApp Business number. Contact system admin to complete setup.'}
        </div>
      </YamenSection>

      {isHRView && (
        <YamenSection
          title={isRTL ? 'سجل التفاعلات مع يامن' : 'YAMEN Interaction Logs'}
          subtitle={isRTL ? 'مراقبة استخدام الموظفين وHR للوكيل' : 'Monitor employee and HR agent usage'}
          icon={Clock}
        >
          <div className={yamenLayout.kpiGrid}>
            <DashboardKPICard
              title={isRTL ? 'تفاعلات HR' : 'HR interactions'}
              value={hrModeCount}
              icon={Shield}
              color="emerald"
              sub={isRTL ? 'وضع الموارد البشرية' : 'HR mode'}
            />
            <DashboardKPICard
              title={isRTL ? 'تفاعلات الموظفين' : 'Employee interactions'}
              value={empModeCount}
              icon={Users}
              color="blue"
              sub={isRTL ? 'وضع الموظف' : 'Employee mode'}
            />
            <DashboardKPICard
              title={isRTL ? 'اليوم' : 'Today'}
              value={todayLogs.length}
              icon={Clock}
              color="amber"
              sub={isRTL ? 'خلال آخر 24 ساعة' : 'Last 24 hours'}
            />
            <DashboardKPICard
              title={isRTL ? 'الإجمالي' : 'Total'}
              value={auditLogs.length}
              icon={MessageSquare}
              color="purple"
              sub={isRTL ? 'كل السجلات' : 'All logged events'}
            />
          </div>

          <div className="mt-4 mb-3 relative">
            <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isRTL ? 'بحث بالبريد أو الملاحظات...' : 'Search by email or notes…'}
              className={`bg-white border-border ${isRTL ? 'pr-10' : 'pl-10'}`}
            />
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <YamenPanelEmpty
                icon={Clock}
                title={isRTL ? 'لا توجد سجلات بعد' : 'No logs yet'}
                description={isRTL ? 'ستظهر التفاعلات هنا بعد استخدام يامن' : 'Interactions will appear here after YAMEN is used'}
              />
            ) : (
              filtered.slice(0, 50).map((log) => (
                <div
                  key={log.id}
                  className="bg-white p-3 text-sm rounded-xl flex items-start gap-3 border border-border/60"
                >
                  <Badge
                    className={`text-xs flex-shrink-0 ${
                      log.user_role === 'hr'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-najdi-50 text-najdi-800 border-najdi-200'
                    }`}
                  >
                    {log.user_role === 'hr' ? 'HR' : isRTL ? 'موظف' : 'Emp'}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-ink truncate font-medium">{log.user_email}</p>
                    {log.notes && <p className="text-xs text-muted-foreground truncate mt-0.5">{log.notes}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {log.timestamp ? format(new Date(log.timestamp), 'dd/MM HH:mm') : '-'}
                  </span>
                </div>
              ))
            )}
          </div>
        </YamenSection>
      )}
    </div>
  );
}
