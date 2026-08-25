import React, { useMemo, useState } from 'react';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { useTenant } from '../components/TenantContext';
import { callApi } from '../api/supabaseClient';
import {
  Bot, AlertTriangle, FileText, BarChart3, MessageSquare, Users, Shield,
  TrendingDown, Zap, Target, AlertCircle, RefreshCw, CheckCircle2, XCircle,
  Info, Sparkles,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import DashboardKPICard from '../components/dashboard/DashboardKPICard';
import YamenDashboard from '../components/yamen/YamenDashboard';
import YamenRiskMonitor from '../components/yamen/YamenRiskMonitor';
import YamenExecutiveReport from '../components/yamen/YamenExecutiveReport';
import YamenHRChat from '../components/yamen/YamenHRChat';
import YamenEmployeeAssistant from '../components/yamen/YamenEmployeeAssistant';
import YamenInsightsDashboard from '../components/yamen/YamenInsightsDashboard';
import YamenDocumentGenerator from '../components/yamen/YamenDocumentGenerator';
import YamenDocumentProcessor from '../components/yamen/YamenDocumentProcessor';
import SaudizationDashboard from '../components/hr/NitaqatDashboard';
import { useJurisdictionFeatures } from '../components/JurisdictionFeatureContext';
import { NATIONALISATION_FEATURES } from '../lib/jurisdictionFeatures.js';
import DocumentExpiryTracker from '../components/hr/DocumentExpiryTracker';
import {
  YamenHero,
  YamenTabBar,
  YamenQuickActions,
  YamenPanelEmpty,
  YamenSection,
} from '../components/yamen/YamenShellParts';
import { yamenLayout } from '../lib/yamenDesign';
import { cn } from '../lib/utils';

const HR_ROLES = ['admin', 'hr_admin', 'hr_officer', 'creator'];

const SEVERITY_CONFIG = {
  critical: { color: 'bg-red-50 border-red-200 text-red-800', icon: XCircle, iconColor: 'text-red-600', kpi: 'red' },
  warning: { color: 'bg-amber-50 border-amber-200 text-amber-800', icon: AlertTriangle, iconColor: 'text-amber-600', kpi: 'amber' },
  info: { color: 'bg-sky-50 border-sky-200 text-sky-800', icon: Info, iconColor: 'text-sky-600', kpi: 'blue' },
  ok: { color: 'bg-emerald-50 border-emerald-200 text-emerald-800', icon: CheckCircle2, iconColor: 'text-emerald-600', kpi: 'emerald' },
};

function CompliancePanel({ isRTL }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [severityFilter, setSeverityFilter] = useState('all');

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await callApi('/api/ai/compliance-alerts', { days_ahead: 30 });
      setData(res);
    } catch (e) {
      setError(e.message ?? 'Failed to load compliance alerts');
    } finally {
      setLoading(false);
    }
  };

  const alerts = data?.alerts?.alerts ?? [];
  const filtered = severityFilter === 'all' ? alerts : alerts.filter((a) => a.severity === severityFilter);
  const counts = useMemo(() => {
    const c = { critical: 0, warning: 0, info: 0, ok: 0 };
    for (const a of alerts) {
      if (c[a.severity] != null) c[a.severity] += 1;
    }
    return c;
  }, [alerts]);

  return (
    <div className={yamenLayout.page}>
      <YamenSection
        title={isRTL ? 'الامتثال التلقائي' : 'Compliance Autopilot'}
        subtitle={isRTL
          ? 'مراجعة فورية لمخاطر الامتثال — الوثائق، التأمينات، الفواتير، الإجازات'
          : 'Instant compliance health check — documents, social insurance, fees, leave'}
        icon={Shield}
        action={(
          <Button size="sm" onClick={run} disabled={loading} className="gap-1.5 bg-najdi-900 hover:bg-ink">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            {loading ? (isRTL ? 'جاري الفحص...' : 'Checking…') : (isRTL ? 'فحص الآن' : 'Run Check')}
          </Button>
        )}
      >
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg">{error}</div>
        )}

        {data && (
          <div className="space-y-4">
            <div className={yamenLayout.kpiGrid}>
              {['critical', 'warning', 'info', 'ok'].map((sev) => {
                const cfg = SEVERITY_CONFIG[sev];
                const Icon = cfg.icon;
                return (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setSeverityFilter((f) => (f === sev ? 'all' : sev))}
                    className="text-start"
                  >
                    <DashboardKPICard
                      id={`comp-${sev}`}
                      title={sev}
                      value={counts[sev]}
                      icon={Icon}
                      color={cfg.kpi}
                      alert={sev === 'critical' && counts[sev] > 0}
                      sub={severityFilter === sev
                        ? (isRTL ? 'تصفية نشطة' : 'Filter active')
                        : (isRTL ? 'اضغط للتصفية' : 'Click to filter')}
                    />
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSeverityFilter('all')}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-full border transition-colors',
                  severityFilter === 'all' ? 'bg-najdi-900 text-white border-najdi-900' : 'bg-white text-muted-foreground border-border',
                )}
              >
                {isRTL ? 'الكل' : 'All'} ({alerts.length})
              </button>
              {['critical', 'warning', 'info', 'ok'].map((sev) => (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setSeverityFilter(sev)}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-full border capitalize transition-colors',
                    severityFilter === sev ? 'bg-najdi-900 text-white border-najdi-900' : 'bg-white text-muted-foreground border-border',
                  )}
                >
                  {sev} ({counts[sev]})
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {filtered.length === 0 ? (
                <YamenPanelEmpty
                  icon={CheckCircle2}
                  title={isRTL ? 'لا توجد تنبيهات في هذا المستوى' : 'No alerts at this severity'}
                />
              ) : (
                filtered.map((alert, i) => {
                  const cfg = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.info;
                  const Icon = cfg.icon;
                  return (
                    <div key={i} className={cn('border rounded-xl p-4', cfg.color)}>
                      <div className="flex items-start gap-2">
                        <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', cfg.iconColor)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{alert.message}</p>
                          {alert.items?.length > 0 && (
                            <ul className="mt-1 space-y-0.5">
                              {alert.items.slice(0, 5).map((item, j) => (
                                <li key={j} className="text-xs opacity-80">
                                  {typeof item === 'object'
                                    ? `${item.name ?? ''} — ${item.expiry ?? item.id ?? ''}`
                                    : String(item)}
                                </li>
                              ))}
                              {alert.items.length > 5 && (
                                <li className="text-xs opacity-60">+{alert.items.length - 5} more</li>
                              )}
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {data.summary && (
              <div className="rounded-xl border border-border/60 bg-sand-alt/50 p-4">
                <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-purple-500" />
                  {isRTL ? 'ملخص يامن' : 'YAMEN Summary'}
                </p>
                <p className="text-sm text-ink whitespace-pre-line leading-relaxed">{data.summary}</p>
              </div>
            )}

            <p className="text-xs text-muted-foreground text-center">
              {isRTL
                ? `آخر فحص: ${data.alerts?.checked_on ?? '—'}`
                : `Last checked: ${data.alerts?.checked_on ?? '—'}`}
            </p>
          </div>
        )}

        {!data && !loading && (
          <YamenPanelEmpty
            icon={Shield}
            title={isRTL ? 'لم يتم تشغيل الفحص بعد' : 'No compliance scan yet'}
            hint={isRTL ? 'اضغط "فحص الآن" لمراجعة حالة الامتثال عبر النظام' : 'Click "Run Check" to scan documents, insurance, fees, and leave'}
            action={(
              <Button size="sm" onClick={run} className="gap-1.5 bg-najdi-900 hover:bg-ink">
                <Shield className="w-3.5 h-3.5" />
                {isRTL ? 'فحص الآن' : 'Run Check'}
              </Button>
            )}
          />
        )}
      </YamenSection>
    </div>
  );
}

export default function YamenAI() {
  const { isRTL } = useLanguage();
  const { userRole } = useRole();
  const { tenant } = useTenant();
  const { isFeatureEnabled } = useJurisdictionFeatures();
  const nationalisationEnabled = isFeatureEnabled(NATIONALISATION_FEATURES[0]);
  const [activeTab, setActiveTab] = useState('dashboard');

  const isHRMode = HR_ROLES.includes(userRole);

  const allTabs = isHRMode
    ? [
        { id: 'dashboard', label: { ar: 'لوحة يامن', en: 'Dashboard' }, icon: Bot },
        { id: 'risk', label: { ar: 'مراقبة المخاطر', en: 'Risk Monitor' }, icon: AlertTriangle },
        { id: 'saudization', label: { ar: 'السعودة — نطاقات', en: 'Saudization' }, icon: Target },
        { id: 'docs_expiry', label: { ar: 'انتهاء الوثائق', en: 'Doc Expiry' }, icon: AlertCircle },
        { id: 'insights', label: { ar: 'الرؤى المتقدمة', en: 'Advanced Insights' }, icon: TrendingDown },
        { id: 'documents', label: { ar: 'المستندات', en: 'Documents' }, icon: FileText },
        { id: 'processor', label: { ar: 'معالج المستندات', en: 'Doc Processor' }, icon: Zap },
        { id: 'compliance', label: { ar: 'الامتثال التلقائي', en: 'Compliance' }, icon: Shield },
        { id: 'reports', label: { ar: 'التقارير', en: 'Reports' }, icon: BarChart3 },
        { id: 'chat', label: { ar: 'اسأل يامن', en: 'Ask YAMEN' }, icon: MessageSquare },
        { id: 'employee', label: { ar: 'مساعد الموظف', en: 'Employee View' }, icon: Users },
      ]
    : [{ id: 'chat', label: { ar: 'اسأل يامن', en: 'Ask YAMEN' }, icon: MessageSquare }];

  const tabs = isHRMode
    ? (nationalisationEnabled
        ? allTabs
        : allTabs.filter((t) => t.id !== 'saudization' && t.id !== 'compliance'))
    : allTabs;

  // Keep active tab valid when jurisdiction filters remove tabs
  React.useEffect(() => {
    if (!tabs.some((t) => t.id === activeTab)) {
      setActiveTab(tabs[0]?.id || 'chat');
    }
  }, [tabs, activeTab]);

  const used = tenant?.yamen_ai_used_this_month || 0;
  const limit = tenant?.yamen_ai_monthly_limit > 0 ? tenant.yamen_ai_monthly_limit : 100;
  const usagePct = Math.min(100, Math.round((used / limit) * 100));

  const quickActions = isHRMode
    ? [
        { id: 'chat', icon: MessageSquare, labelEn: 'Ask YAMEN', labelAr: 'اسأل يامن', onClick: () => setActiveTab('chat') },
        { id: 'risk', icon: AlertTriangle, labelEn: 'Risk scan', labelAr: 'فحص المخاطر', onClick: () => setActiveTab('risk') },
        { id: 'compliance', icon: Shield, labelEn: 'Compliance', labelAr: 'الامتثال', onClick: () => setActiveTab('compliance') },
        { id: 'reports', icon: BarChart3, labelEn: 'Exec report', labelAr: 'تقرير تنفيذي', onClick: () => setActiveTab('reports') },
        { id: 'docs', icon: FileText, labelEn: 'Draft letter', labelAr: 'صياغة خطاب', onClick: () => setActiveTab('documents') },
      ].filter((a) => tabs.some((t) => t.id === a.id || (a.id === 'docs' && t.id === 'documents')))
    : [];

  // Default employee mode to chat
  React.useEffect(() => {
    if (!isHRMode) setActiveTab('chat');
  }, [isHRMode]);

  return (
    <div className={yamenLayout.page}>
      <YamenHero
        isRTL={isRTL}
        isHRMode={isHRMode}
        usagePct={usagePct}
        used={used}
        limit={limit}
      >
        <YamenQuickActions actions={quickActions} isRTL={isRTL} />
      </YamenHero>

      <YamenTabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} isRTL={isRTL} />

      <div className="min-h-[320px]">
        {isHRMode && activeTab === 'dashboard' && <YamenDashboard isRTL={isRTL} onNavigateTab={setActiveTab} />}
        {isHRMode && activeTab === 'risk' && <YamenRiskMonitor isRTL={isRTL} />}
        {isHRMode && nationalisationEnabled && activeTab === 'saudization' && <SaudizationDashboard isRTL={isRTL} />}
        {isHRMode && activeTab === 'docs_expiry' && <DocumentExpiryTracker isRTL={isRTL} />}
        {isHRMode && activeTab === 'insights' && <YamenInsightsDashboard isRTL={isRTL} />}
        {isHRMode && activeTab === 'documents' && <YamenDocumentGenerator isRTL={isRTL} />}
        {isHRMode && activeTab === 'processor' && <YamenDocumentProcessor isRTL={isRTL} />}
        {isHRMode && nationalisationEnabled && activeTab === 'compliance' && <CompliancePanel isRTL={isRTL} />}
        {isHRMode && activeTab === 'reports' && <YamenExecutiveReport isRTL={isRTL} />}
        {isHRMode && activeTab === 'employee' && <YamenEmployeeAssistant isRTL={isRTL} isHRView={true} />}
        {activeTab === 'chat' && (
          <YamenHRChat
            isRTL={isRTL}
            isHRMode={isHRMode}
            nationalisationEnabled={nationalisationEnabled}
          />
        )}
      </div>
    </div>
  );
}
