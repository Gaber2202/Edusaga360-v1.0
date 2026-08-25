import React from 'react';
import { Bot, Sparkles, Shield, Zap } from 'lucide-react';
import { Progress } from '../ui/progress';
import { cn } from '../../lib/utils';
import { TAB_META } from '../../lib/yamenDesign';

export function YamenHero({ isRTL, isHRMode, usagePct, used, limit, children }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-najdi-900 via-[#0a5a42] to-slate-900 border border-najdi-800/60 shadow-lg">
      <div className="absolute -top-16 -start-10 w-56 h-56 rounded-full bg-emerald-400/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -end-8 w-64 h-64 rounded-full bg-sky-400/10 blur-3xl pointer-events-none" />
      <div className="relative p-5 md:p-6 flex flex-col gap-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 backdrop-blur flex items-center justify-center">
                <Bot className="w-8 h-8 text-emerald-300" />
              </div>
              <div className="absolute -top-1 -end-1 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shadow">
                <Sparkles className="w-3 h-3 text-white" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  {isRTL ? 'يامن' : 'YAMEN'}
                </h1>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-400/20 text-emerald-200 border border-emerald-400/30">
                  AI
                </span>
              </div>
              <p className="text-sm text-white/70 mt-0.5">
                {isRTL ? 'المساعد الذكي للموارد البشرية' : 'AI HR Companion for EduSaga'}
              </p>
              <div className="flex items-center gap-1.5 mt-2">
                {isHRMode ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs text-emerald-300">
                      {isRTL ? 'وضع الموارد البشرية — صلاحيات كاملة' : 'HR Intelligence Mode — Full Access'}
                    </span>
                  </>
                ) : (
                  <>
                    <Shield className="w-3.5 h-3.5 text-amber-300" />
                    <span className="text-xs text-amber-200">
                      {isRTL ? 'وضع الموظف — مساعد آمن' : 'Employee Safe Mode'}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {limit != null && (
            <div className="min-w-[200px] rounded-xl bg-white/10 border border-white/15 px-4 py-3 backdrop-blur">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[10px] uppercase tracking-wider text-white/60 font-semibold flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  {isRTL ? 'استخدام هذا الشهر' : 'Monthly usage'}
                </span>
                <span className="text-xs font-bold text-white tabular-nums">
                  {used}/{limit}
                </span>
              </div>
              <Progress value={usagePct} className="h-1.5 bg-white/20 [&>div]:bg-emerald-400" />
            </div>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export function YamenTabBar({ tabs, activeTab, onChange, isRTL }) {
  return (
    <div className="overflow-x-auto max-w-full pb-0.5 -mx-1 px-1">
      <div
        className="inline-flex p-1 rounded-xl bg-sand-alt border border-border/60 gap-1 min-w-max"
        role="tablist"
        aria-label={isRTL ? 'أقسام يامن' : 'YAMEN sections'}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          const meta = TAB_META[tab.id];
          const desc = isRTL ? meta?.descAr : meta?.descEn;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.id)}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all duration-200 whitespace-nowrap text-start',
                active
                  ? 'bg-white text-najdi-900 shadow-sm ring-1 ring-border/40'
                  : 'text-muted-foreground hover:text-ink hover:bg-white/60',
              )}
              title={desc}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                  active ? 'bg-najdi-50 text-najdi-900' : 'bg-white/80 text-muted-foreground',
                )}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex flex-col items-start leading-tight min-w-0">
                <span className={cn('text-sm font-semibold', active && 'text-najdi-900')}>
                  {isRTL ? tab.label.ar : tab.label.en}
                </span>
                {desc && (
                  <span className={cn('text-[10px] mt-0.5 max-w-[140px] truncate', active ? 'text-najdi-700/70' : 'text-muted-foreground')}>
                    {desc}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function YamenQuickActions({ actions, isRTL }) {
  if (!actions?.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <button
            key={a.id}
            type="button"
            onClick={a.onClick}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-white/90 border border-white/15 transition-colors"
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {isRTL ? a.labelAr : a.labelEn}
          </button>
        );
      })}
    </div>
  );
}

export function YamenSuggestedPrompts({ prompts, onPick, isRTL }) {
  if (!prompts?.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {prompts.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onPick(isRTL ? p.ar : p.en)}
          className="text-xs px-3 py-1.5 rounded-full border border-border/70 bg-white hover:bg-sand-alt hover:border-najdi-300 text-ink transition-colors shadow-sm"
        >
          {isRTL ? p.ar : p.en}
        </button>
      ))}
    </div>
  );
}

export function YamenPanelEmpty({ icon: Icon, title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center rounded-xl border-2 border-dashed border-border/70 bg-sand-alt/40 py-12 px-6">
      {Icon && <Icon className="w-10 h-10 text-border mb-3" />}
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1 max-w-sm">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function YamenSection({ title, subtitle, icon: Icon, action, children, className }) {
  return (
    <div className={cn('rounded-xl border border-border/60 bg-white shadow-sm overflow-hidden', className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
          <div className="flex items-start gap-3 min-w-0">
            {Icon && (
              <div className="w-9 h-9 rounded-lg bg-najdi-50 text-najdi-900 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4" />
              </div>
            )}
            <div className="min-w-0">
              {title && <h3 className="text-base font-semibold text-ink">{title}</h3>}
              {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      <div className="p-4 pt-2">{children}</div>
    </div>
  );
}
