/**
 * EduSaga 360 — Integration Hub
 * 
 * Live view of the cross-module integration event bus.
 * Shows real-time event log, module connectivity map, and health status.
 * Accessible to: admin, it_admin
 */

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  Activity, CheckCircle2, XCircle, Clock, Search, RefreshCw,
  Zap, ArrowRight, GitBranch, AlertTriangle, Database,
  BarChart3, Shield, Eye
} from 'lucide-react';
import { format } from 'date-fns';

// Module connectivity map — defines which modules send/receive which events
const MODULE_MAP = [
  { source: 'Admissions', event: 'enrollment_confirmed', targets: ['SIS', 'Fees', 'Contracts', 'Communications', 'CRM'] },
  { source: 'Admissions', event: 'application_stage_change', targets: ['Communications', 'CRM'] },
  { source: 'Fees', event: 'invoice_issued', targets: ['Communications', 'Finance'] },
  { source: 'Fees', event: 'payment_received', targets: ['Finance', 'Communications'] },
  { source: 'Fees', event: 'invoice_overdue', targets: ['Communications', 'SIS'] },
  { source: 'Clinic', event: 'clinic_visit_completed', targets: ['Communications', 'Attendance'] },
  { source: 'Attendance', event: 'student_absent', targets: ['Communications'] },
  { source: 'Attendance', event: 'monthly_timesheet_locked', targets: ['Payroll'] },
  { source: 'Transport', event: 'student_boarded', targets: ['Communications'] },
  { source: 'Transport', event: 'bus_delayed', targets: ['Attendance', 'Communications'] },
  { source: 'Transport', event: 'transport_subscription_change', targets: ['Fees'] },
  { source: 'Library', event: 'library_fine_incurred', targets: ['Fees', 'Finance'] },
  { source: 'Library', event: 'book_due_reminder', targets: ['Communications'] },
  { source: 'Canteen', event: 'canteen_low_balance', targets: ['Communications'] },
  { source: 'Payroll', event: 'payroll_approved', targets: ['Finance', 'Communications'] },
  { source: 'HR', event: 'leave_approved', targets: ['Communications'] },
  { source: 'HR', event: 'leave_rejected', targets: ['Communications'] },
  { source: 'HR', event: 'document_expiring', targets: ['Communications'] },
  { source: 'Expenses', event: 'expense_approved', targets: ['Finance', 'Communications'] },
  { source: 'Expenses', event: 'expense_rejected', targets: ['Communications'] },
  { source: 'Assets', event: 'asset_acquired', targets: ['Finance'] },
  { source: 'Assets', event: 'depreciation_run', targets: ['Finance'] },
  { source: 'CPD', event: 'training_completed', targets: ['Communications'] },
  { source: 'Procurement', event: 'books_received', targets: ['Library'] },
];

const MODULE_COLORS = {
  Admissions: 'bg-najdi-500', SIS: 'bg-indigo-500', Fees: 'bg-emerald-500',
  Finance: 'bg-green-700', Contracts: 'bg-violet-500', Communications: 'bg-orange-500',
  CRM: 'bg-pink-500', Clinic: 'bg-red-500', Attendance: 'bg-amber-500',
  Transport: 'bg-sky-500', Library: 'bg-teal-500', Canteen: 'bg-lime-600',
  Payroll: 'bg-cyan-600', HR: 'bg-ink', Expenses: 'bg-yellow-600',
  Assets: 'bg-stone-600', CPD: 'bg-purple-500', Procurement: 'bg-orange-700',
};

const STATUS_CONFIG = {
  success: { color: 'text-emerald-600', bg: 'bg-emerald-100', icon: CheckCircle2, label: { ar: 'نجح', en: 'Success' } },
  partial: { color: 'text-amber-600', bg: 'bg-amber-100', icon: AlertTriangle, label: { ar: 'جزئي', en: 'Partial' } },
  failed: { color: 'text-red-600', bg: 'bg-red-100', icon: XCircle, label: { ar: 'فشل', en: 'Failed' } },
  processing: { color: 'text-najdi-700', bg: 'bg-najdi-50', icon: Clock, label: { ar: 'جارٍ', en: 'Processing' } },
};

export default function IntegrationHub() {
  const { isRTL } = useLanguage();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('log');
  const [expandedRow, setExpandedRow] = useState(null);

  const { data: logs = [], isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['integrationLogs', tenantId],
    queryFn: () => fetchData(tenantQuery('integration_logs').select('*').match(tenantFilter()).order('created_at', { ascending: false }).limit(200)),
    enabled: hasTenantAccess,
    refetchInterval: 15000, // auto-refresh every 15s
  });

  const allModules = [...new Set(MODULE_MAP.map(m => m.source))].sort();

  const filteredLogs = logs.filter(log => {
    const matchSearch = !search ||
      log.event_type?.toLowerCase().includes(search.toLowerCase()) ||
      log.source_module?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || log.status === statusFilter;
    const matchModule = moduleFilter === 'all' || log.source_module === moduleFilter;
    return matchSearch && matchStatus && matchModule;
  });

  const stats = {
    total: logs.length,
    success: logs.filter(l => l.status === 'success').length,
    partial: logs.filter(l => l.status === 'partial').length,
    failed: logs.filter(l => l.status === 'failed').length,
    today: logs.filter(l => l.timestamp?.startsWith(new Date().toISOString().split('T')[0])).length,
  };

  const moduleStats = allModules.map(mod => ({
    name: mod,
    fired: logs.filter(l => l.source_module === mod).length,
    success: logs.filter(l => l.source_module === mod && l.status === 'success').length,
    failed: logs.filter(l => l.source_module === mod && l.status === 'failed').length,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
            <Zap className="w-7 h-7 text-emerald-500" />
            {isRTL ? 'مركز التكامل' : 'Integration Hub'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isRTL ? 'حافلة الأحداث الداخلية — تتدفق البيانات تلقائياً بين جميع الوحدات' : 'Internal event bus — data flows automatically across all modules'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['integrationLogs'] })} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          {isRTL ? 'تحديث' : 'Refresh'}
        </Button>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: isRTL ? 'إجمالي الأحداث' : 'Total Events', value: stats.total, color: 'text-ink', icon: Activity },
          { label: isRTL ? 'نجحت اليوم' : 'Today', value: stats.today, color: 'text-najdi-700', icon: BarChart3 },
          { label: isRTL ? 'ناجحة' : 'Success', value: stats.success, color: 'text-emerald-600', icon: CheckCircle2 },
          { label: isRTL ? 'جزئية' : 'Partial', value: stats.partial, color: 'text-amber-600', icon: AlertTriangle },
          { label: isRTL ? 'فشلت' : 'Failed', value: stats.failed, color: 'text-red-600', icon: XCircle },
        ].map(s => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
            </div>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border">
          <TabsTrigger value="log">
            <Activity className="w-4 h-4 me-1.5" />
            {isRTL ? 'سجل الأحداث' : 'Event Log'}
          </TabsTrigger>
          <TabsTrigger value="map">
            <GitBranch className="w-4 h-4 me-1.5" />
            {isRTL ? 'خريطة التكامل' : 'Integration Map'}
          </TabsTrigger>
          <TabsTrigger value="modules">
            <Database className="w-4 h-4 me-1.5" />
            {isRTL ? 'إحصائيات الوحدات' : 'Module Stats'}
          </TabsTrigger>
          <TabsTrigger value="rules">
            <Shield className="w-4 h-4 me-1.5" />
            {isRTL ? 'قواعد التكامل' : 'Integration Rules'}
          </TabsTrigger>
        </TabsList>

        {/* ── EVENT LOG ── */}
        <TabsContent value="log" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
              <Input
                placeholder={isRTL ? 'بحث بالحدث أو الوحدة...' : 'Search event or module...'}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className={isRTL ? 'pr-9' : 'pl-9'}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder={isRTL ? 'الحالة' : 'Status'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isRTL ? 'الكل' : 'All'}</SelectItem>
                <SelectItem value="success">{isRTL ? 'ناجح' : 'Success'}</SelectItem>
                <SelectItem value="partial">{isRTL ? 'جزئي' : 'Partial'}</SelectItem>
                <SelectItem value="failed">{isRTL ? 'فشل' : 'Failed'}</SelectItem>
                <SelectItem value="processing">{isRTL ? 'جارٍ' : 'Processing'}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={isRTL ? 'الوحدة' : 'Module'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isRTL ? 'كل الوحدات' : 'All Modules'}</SelectItem>
                {allModules.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            {isRTL ? `آخر تحديث: ${dataUpdatedAt ? format(new Date(dataUpdatedAt), 'HH:mm:ss') : '-'}` : `Last updated: ${dataUpdatedAt ? format(new Date(dataUpdatedAt), 'HH:mm:ss') : '-'}`}
            {' · '}
            {filteredLogs.length} {isRTL ? 'حدث' : 'events'}
          </p>

          {/* Log Table */}
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-sand border-b">
                <tr>
                  <th className="text-start py-2.5 px-3 font-medium text-muted-foreground">{isRTL ? 'الوقت' : 'Time'}</th>
                  <th className="text-start py-2.5 px-3 font-medium text-muted-foreground">{isRTL ? 'الحدث' : 'Event'}</th>
                  <th className="text-start py-2.5 px-3 font-medium text-muted-foreground">{isRTL ? 'المصدر' : 'Source'}</th>
                  <th className="text-start py-2.5 px-3 font-medium text-muted-foreground">{isRTL ? 'الأهداف' : 'Targets'}</th>
                  <th className="text-start py-2.5 px-3 font-medium text-muted-foreground">{isRTL ? 'الحالة' : 'Status'}</th>
                  <th className="py-2.5 px-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">{isRTL ? 'جارٍ التحميل...' : 'Loading...'}</td></tr>
                ) : filteredLogs.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">
                    <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    {isRTL ? 'لا توجد أحداث مسجلة بعد' : 'No events logged yet — fire your first integration!'}
                  </td></tr>
                ) : filteredLogs.map(log => {
                  const cfg = STATUS_CONFIG[log.status] || STATUS_CONFIG.processing;
                  const Icon = cfg.icon;
                  const isExpanded = expandedRow === log.id;

                  return (
                    <React.Fragment key={log.id}>
                      <tr className="hover:bg-sand cursor-pointer" onClick={() => setExpandedRow(isExpanded ? null : log.id)}>
                        <td className="py-2.5 px-3 font-mono text-xs text-muted-foreground">
                          {log.timestamp ? format(new Date(log.timestamp), 'MM-dd HH:mm:ss') : '-'}
                        </td>
                        <td className="py-2.5 px-3">
                          <code className="text-xs bg-sand-alt px-1.5 py-0.5 rounded font-mono">{log.event_type}</code>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium text-white ${MODULE_COLORS[log.source_module] || 'bg-sand0'}`}>
                            {log.source_module}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap gap-1">
                            {(log.target_modules || []).slice(0, 3).map(t => (
                              <span key={t} className={`text-xs px-1.5 py-0.5 rounded text-white ${MODULE_COLORS[t] || 'bg-sand-alt'}`}>{t}</span>
                            ))}
                            {(log.target_modules || []).length > 3 && (
                              <span className="text-xs text-muted-foreground">+{log.target_modules.length - 3}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                            <Icon className="w-3 h-3" />
                            {cfg.label[isRTL ? 'ar' : 'en']}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <Eye className="w-4 h-4 text-muted-foreground" />
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-sand">
                          <td colSpan={6} className="px-6 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                              <div>
                                <p className="font-semibold text-ink mb-1">{isRTL ? 'البيانات المرسلة' : 'Payload'}</p>
                                <pre className="bg-najdi-900 text-emerald-300 rounded p-3 overflow-auto max-h-40 text-xs">
                                  {log.payload ? JSON.stringify(JSON.parse(log.payload), null, 2) : '{}'}
                                </pre>
                              </div>
                              <div>
                                <p className="font-semibold text-ink mb-1">{isRTL ? 'نتائج المعالجة' : 'Handler Results'}</p>
                                <pre className="bg-najdi-900 text-sky-300 rounded p-3 overflow-auto max-h-40 text-xs">
                                  {log.result_summary ? JSON.stringify(JSON.parse(log.result_summary), null, 2) : 'pending...'}
                                </pre>
                                {log.retry_count > 0 && (
                                  <p className="mt-2 text-amber-600">⚠ {log.retry_count} {isRTL ? 'إعادة محاولة' : 'retries'}</p>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ── INTEGRATION MAP ── */}
        <TabsContent value="map" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {isRTL ? 'خريطة تدفق الأحداث بين الوحدات — كل حدث يُطلق تحديثات تلقائية في الوحدات المرتبطة' : 'Event flow map — each event triggers automatic updates across linked modules'}
          </p>
          <div className="space-y-2">
            {MODULE_MAP.map((entry, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-lg border hover:border-border transition-colors">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold text-white w-28 text-center ${MODULE_COLORS[entry.source] || 'bg-sand0'}`}>
                  {entry.source}
                </span>
                <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <code className="text-xs bg-sand-alt px-2 py-1 rounded font-mono w-52 text-ink">{entry.event}</code>
                <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex flex-wrap gap-1.5">
                  {entry.targets.map(t => (
                    <span key={t} className={`px-2 py-0.5 rounded text-xs font-medium text-white ${MODULE_COLORS[t] || 'bg-sand-alt'}`}>{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── MODULE STATS ── */}
        <TabsContent value="modules" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {moduleStats.filter(m => m.fired > 0 || true).map(mod => {
              const successRate = mod.fired > 0 ? Math.round((mod.success / mod.fired) * 100) : 100;
              return (
                <Card key={mod.name} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold text-white ${MODULE_COLORS[mod.name] || 'bg-sand0'}`}>
                      {mod.name}
                    </span>
                    <span className={`text-sm font-bold ${successRate === 100 ? 'text-emerald-600' : successRate >= 80 ? 'text-amber-600' : 'text-red-600'}`}>
                      {mod.fired > 0 ? `${successRate}%` : '–'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <p className="text-lg font-bold text-ink">{mod.fired}</p>
                      <p className="text-muted-foreground">{isRTL ? 'أُطلق' : 'Fired'}</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-emerald-600">{mod.success}</p>
                      <p className="text-muted-foreground">{isRTL ? 'نجح' : 'OK'}</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-red-600">{mod.failed}</p>
                      <p className="text-muted-foreground">{isRTL ? 'فشل' : 'Failed'}</p>
                    </div>
                  </div>
                  {mod.fired > 0 && (
                    <div className="mt-3 h-1.5 bg-sand-alt rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${successRate}%` }} />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ── RULES ── */}
        <TabsContent value="rules" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { num: 1, title: isRTL ? 'مصدر واحد للطالب' : 'Single Student Master', desc: isRTL ? 'SIS هو المصدر الوحيد لبيانات الطالب. جميع الوحدات تقرأ منه فقط.' : 'SIS is the only source of student truth. All modules reference by student_id.', icon: Database, color: 'text-indigo-600' },
              { num: 2, title: isRTL ? 'مصدر واحد للموظف' : 'Single Employee Master', desc: isRTL ? 'نظام الموارد البشرية هو المصدر الوحيد لبيانات الموظف.' : 'HR & Payroll is the only source of staff truth.', icon: Database, color: 'text-muted-foreground' },
              { num: 3, title: isRTL ? 'دفتر أستاذ مركزي' : 'Single Financial Ledger', desc: isRTL ? 'Finance/GL يستقبل جميع الحركات المالية. لا وحدة تحتفظ بسجلاتها المالية.' : 'Finance/GL receives ALL money movements. No module maintains its own financial records.', icon: BarChart3, color: 'text-green-700' },
              { num: 4, title: isRTL ? 'محرك إشعارات واحد' : 'Single Notification Engine', desc: isRTL ? 'Communications تتولى جميع الرسائل الصادرة. لا وحدة ترسل مباشرة.' : 'Communications handles all outbound messages. No module sends WhatsApp/email directly.', icon: Activity, color: 'text-orange-600' },
              { num: 5, title: isRTL ? 'بوابة أولياء واحدة' : 'Single Parent Interface', desc: isRTL ? 'Parent Portal يجمع جميع بيانات أولياء الأمور. لا دخول للوحدات الفردية.' : 'Parent Portal aggregates all parent-facing data. Parents never access individual modules.', icon: Shield, color: 'text-najdi-700' },
              { num: 6, title: isRTL ? 'مسار التدقيق' : 'Audit Trail', desc: isRTL ? 'كل حدث عبر الوحدات مُسجَّل مع: المصدر، النوع، البيانات، الوقت، النجاح/الفشل.' : 'Every cross-module event is logged with: source module, event type, payload, timestamp, success/failure.', icon: Shield, color: 'text-amber-600' },
              { num: 7, title: isRTL ? 'معالجة الأخطاء' : 'Failure Handling', desc: isRTL ? '3 محاولات متصاعدة → تنبيه IT → قائمة انتظار → لا يُسقط أي حدث مالي.' : '3 retries with backoff → IT Admin alert after 3 failures → Event queued for replay → NEVER drop financial events.', icon: AlertTriangle, color: 'text-red-600' },
              { num: 8, title: isRTL ? 'الأداء' : 'Performance', desc: isRTL ? 'جميع الأحداث تتسع خلال 5 ثواني. Parent Portal يعكس أي تغيير خلال 30 ثانية.' : 'All cross-module events propagate within 5 seconds. Parent Portal reflects any action within 30 seconds.', icon: Zap, color: 'text-emerald-600' },
            ].map(rule => (
              <div key={rule.num} className="flex gap-4 p-4 bg-white rounded-lg border">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-sand-alt flex items-center justify-center text-sm font-bold text-muted-foreground">
                    {rule.num}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <rule.icon className={`w-4 h-4 ${rule.color}`} />
                    <p className="font-semibold text-ink text-sm">{rule.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{rule.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}