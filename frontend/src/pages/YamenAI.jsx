import React, { useState } from 'react';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { callApi } from '../api/supabaseClient';
import { Bot, AlertTriangle, FileText, BarChart3, MessageSquare, Users, Shield, TrendingDown, Zap, Target, AlertCircle, RefreshCw, CheckCircle2, XCircle, Info, Sparkles } from 'lucide-react';
import YamenDashboard from '../components/yamen/YamenDashboard';
import YamenRiskMonitor from '../components/yamen/YamenRiskMonitor';
import YamenExecutiveReport from '../components/yamen/YamenExecutiveReport';
import YamenHRChat from '../components/yamen/YamenHRChat';
import YamenEmployeeAssistant from '../components/yamen/YamenEmployeeAssistant';
import YamenInsightsDashboard from '../components/yamen/YamenInsightsDashboard';
import YamenDocumentGenerator from '../components/yamen/YamenDocumentGenerator';
import YamenDocumentProcessor from '../components/yamen/YamenDocumentProcessor';
import NitaqatDashboard from '../components/hr/NitaqatDashboard';
import DocumentExpiryTracker from '../components/hr/DocumentExpiryTracker';

const HR_ROLES = ['admin', 'hr_admin', 'hr_officer', 'creator'];

const SEVERITY_CONFIG = {
  critical: { color: 'bg-red-50 border-red-300 text-red-800',   icon: XCircle,      iconColor: 'text-red-600' },
  warning:  { color: 'bg-amber-50 border-amber-300 text-amber-800', icon: AlertTriangle, iconColor: 'text-amber-600' },
  info:     { color: 'bg-najdi-50 border-najdi-100 text-najdi-900', icon: Info,         iconColor: 'text-najdi-700' },
  ok:       { color: 'bg-green-50 border-green-300 text-green-800', icon: CheckCircle2, iconColor: 'text-green-600' },
};

function CompliancePanel({ isRTL }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

  const run = async () => {
    setLoading(true); setError(null);
    try {
      const res = await callApi('/api/ai/compliance-alerts', { days_ahead: 30 });
      setData(res);
    } catch (e) {
      setError(e.message ?? 'Failed to load compliance alerts');
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{isRTL ? 'الامتثال التلقائي' : 'Compliance Autopilot'}</h2>
          <p className="text-sm text-muted-foreground">{isRTL ? 'مراجعة فورية لمخاطر الامتثال — إقامات، GOSI، فواتير، إجازات' : 'Instant compliance health check — iqama, GOSI, fees, leave'}</p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="flex items-center gap-2 bg-najdi-900 hover:bg-ink text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? (isRTL ? 'جاري الفحص...' : 'Checking…') : (isRTL ? 'فحص الآن' : 'Run Check')}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg">{error}</div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {['critical','warning','info','ok'].map(sev => {
              const count = (data.alerts?.alerts ?? []).filter(a => a.severity === sev).length;
              const cfg   = SEVERITY_CONFIG[sev];
              const Icon  = cfg.icon;
              return (
                <div key={sev} className={`border rounded-xl p-3 flex items-center gap-3 ${cfg.color}`}>
                  <Icon className={`w-5 h-5 flex-shrink-0 ${cfg.iconColor}`} />
                  <div>
                    <p className="text-xl font-bold leading-none">{count}</p>
                    <p className="text-xs capitalize mt-0.5">{sev}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            {(data.alerts?.alerts ?? []).map((alert, i) => {
              const cfg  = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.info;
              const Icon = cfg.icon;
              return (
                <div key={i} className={`border rounded-xl p-4 ${cfg.color}`}>
                  <div className="flex items-start gap-2">
                    <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${cfg.iconColor}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{alert.message}</p>
                      {alert.items && alert.items.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {alert.items.slice(0, 5).map((item, j) => (
                            <li key={j} className="text-xs opacity-80">
                              {typeof item === 'object' ? `${item.name ?? ''} — ${item.expiry ?? item.id ?? ''}` : String(item)}
                            </li>
                          ))}
                          {alert.items.length > 5 && <li className="text-xs opacity-60">+{alert.items.length - 5} more</li>}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {data.summary && (
            <div className="bg-sand border rounded-xl p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">{isRTL ? 'ملخص يامن' : 'YAMEN Summary'}</p>
              <p className="text-sm text-ink whitespace-pre-line">{data.summary}</p>
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            {isRTL ? `آخر فحص: ${data.alerts?.checked_on ?? '—'}` : `Last checked: ${data.alerts?.checked_on ?? '—'}`}
          </p>
        </>
      )}

      {!data && !loading && (
        <div className="border-2 border-dashed border-border rounded-xl p-10 text-center text-muted-foreground">
          <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{isRTL ? 'اضغط "فحص الآن" لمراجعة حالة الامتثال' : 'Click "Run Check" to scan for compliance issues'}</p>
        </div>
      )}
    </div>
  );
}

export default function YamenAI() {
  const { isRTL } = useLanguage();
  const { userRole } = useRole();
  const [activeTab, setActiveTab] = useState('dashboard');

  const isHRMode = HR_ROLES.includes(userRole);

  const tabs = isHRMode ? [
    { id: 'dashboard', label: { ar: 'لوحة يامن', en: 'Dashboard' }, icon: Bot },
    { id: 'risk', label: { ar: 'مراقبة المخاطر', en: 'Risk Monitor' }, icon: AlertTriangle },
    { id: 'nitaqat', label: { ar: 'السعودة — نطاقات', en: 'Saudization' }, icon: Target },
    { id: 'docs_expiry', label: { ar: 'انتهاء الوثائق', en: 'Doc Expiry' }, icon: AlertCircle },
    { id: 'insights', label: { ar: 'الرؤى المتقدمة', en: 'Advanced Insights' }, icon: TrendingDown },
    { id: 'documents', label: { ar: 'المستندات', en: 'Documents' }, icon: FileText },
    { id: 'processor', label: { ar: 'معالج المستندات', en: 'Doc Processor' }, icon: Zap },
    { id: 'compliance', label: { ar: 'الامتثال التلقائي', en: 'Compliance' }, icon: Shield },
    { id: 'reports', label: { ar: 'التقارير', en: 'Reports' }, icon: BarChart3 },
    { id: 'chat', label: { ar: 'اسأل يامن', en: 'Ask YAMEN' }, icon: MessageSquare },
    { id: 'employee', label: { ar: 'مساعد الموظف', en: 'Employee View' }, icon: Users },
  ] : [
    { id: 'chat', label: { ar: 'اسأل يامن', en: 'Ask YAMEN' }, icon: MessageSquare },
  ];

  const tabColors = {
    dashboard: 'emerald',
    risk: 'red',
    drafts: 'blue',
    reports: 'purple',
    chat: 'emerald',
    employee: 'amber',
  };

  const _activeColor = tabColors[activeTab] || 'emerald';

  return (
    <div className="space-y-0">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl mb-6 bg-gradient-to-r from-slate-800 to-najdi-900 border border-najdi-900 p-6">
        {/* Background glow */}
        <div className="absolute top-0 left-0 w-64 h-64 bg-emerald-500/8 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-48 h-48 bg-najdi-500/8 rounded-full blur-3xl pointer-events-none" />

        <div className={`relative flex items-center gap-5 ${isRTL ? 'flex-row-reverse' : ''}`}>
          {/* Icon */}
          <div className="relative flex-shrink-0">
            <div className="w-16 h-16 rounded-2xl bg-emerald-900/60 border border-emerald-600/40 flex items-center justify-center shadow-lg shadow-emerald-900/30">
              <Bot className="w-9 h-9 text-emerald-400" />
            </div>
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
          </div>

          {/* Text */}
          <div className={isRTL ? 'text-right' : ''}>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-white">
                {isRTL ? 'يامن' : 'YAMEN'}
              </h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-medium">
                AI
              </span>
            </div>
            <p className="text-muted-foreground text-sm font-medium">
              {isRTL ? 'المساعد الذكي للموارد البشرية' : 'AI HR Companion'}
            </p>
            <div className={`flex items-center gap-1.5 mt-2 ${isRTL ? 'flex-row-reverse justify-end' : ''}`}>
              {isHRMode ? (
                <>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs text-emerald-400">{isRTL ? 'وضع الموارد البشرية — صلاحيات كاملة' : 'HR Intelligence Mode — Full Access'}</span>
                </>
              ) : (
                <>
                  <Shield className="w-3 h-3 text-amber-400" />
                  <span className="text-xs text-amber-400">{isRTL ? 'وضع الموظف — مساعد آمن' : 'Employee Safe Mode'}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 flex-wrap p-1 bg-sand-alt border border-border rounded-xl mb-6">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-white text-ink shadow-sm border border-border'
                  : 'text-muted-foreground hover:text-ink hover:bg-white/60'
              }`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-emerald-600' : ''}`} />
              <span>{isRTL ? tab.label.ar : tab.label.en}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div>
        {isHRMode && activeTab === 'dashboard' && <YamenDashboard isRTL={isRTL} />}
        {isHRMode && activeTab === 'risk' && <YamenRiskMonitor isRTL={isRTL} />}
        {isHRMode && activeTab === 'nitaqat' && <NitaqatDashboard isRTL={isRTL} />}
        {isHRMode && activeTab === 'docs_expiry' && <DocumentExpiryTracker isRTL={isRTL} />}
        {isHRMode && activeTab === 'insights' && <YamenInsightsDashboard isRTL={isRTL} />}
        {isHRMode && activeTab === 'documents' && <YamenDocumentGenerator isRTL={isRTL} />}
        {isHRMode && activeTab === 'processor' && <YamenDocumentProcessor isRTL={isRTL} />}
        {isHRMode && activeTab === 'compliance' && <CompliancePanel isRTL={isRTL} />}
        {isHRMode && activeTab === 'reports' && <YamenExecutiveReport isRTL={isRTL} />}
        {isHRMode && activeTab === 'employee' && <YamenEmployeeAssistant isRTL={isRTL} isHRView={true} />}
        {activeTab === 'chat' && <YamenHRChat isRTL={isRTL} isHRMode={isHRMode} />}
      </div>
    </div>
  );
}