import React from 'react';
import { Sparkles, TrendingUp, Wallet, Receipt } from 'lucide-react';
import { cn } from '../../lib/utils';
import { execCard } from '../../lib/execDashboardDesign';
import ExecSectionCard from './ExecSectionCard';
import ExecScenarioSlider from './ExecScenarioSlider';

function OutcomeTile({ label, value, icon: Icon, tone = 'neutral' }) {
  const tones = {
    neutral: 'from-sand-alt/80 to-white border-border/60',
    positive: 'from-emerald-50/90 to-white border-emerald-100/80',
    negative: 'from-red-50/90 to-white border-red-100/80',
    highlight: 'from-najdi-50/90 to-white border-najdi-100/80',
  };
  return (
    <div className={cn(execCard.outcome, 'bg-gradient-to-br', tones[tone] || tones.neutral)}>
      {Icon && (
        <div className="mx-auto mb-2 w-8 h-8 rounded-lg bg-white/80 border border-border/40 flex items-center justify-center text-najdi-900">
          <Icon className="w-4 h-4" />
        </div>
      )}
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold text-ink tabular-nums leading-tight">{value}</p>
    </div>
  );
}

export default function ExecScenarioSimulator({
  title,
  subtitle,
  isRTL,
  disabled,
  disabledMessage,
  revenueGrowth,
  expenseChange,
  onRevenueGrowthChange,
  onExpenseChange,
  outcomes,
}) {
  return (
    <ExecSectionCard
      title={title}
      subtitle={subtitle}
      icon={Sparkles}
      iconTone="purple"
    >
      {disabled ? (
        <div className="rounded-xl border border-dashed border-border bg-sand-alt/50 px-4 py-8 text-center text-sm text-muted-foreground">
          {disabledMessage}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ExecScenarioSlider
              label={isRTL ? 'نمو الإيراد' : 'Revenue growth'}
              value={revenueGrowth}
              min={-20}
              max={20}
              onChange={onRevenueGrowthChange}
            />
            <ExecScenarioSlider
              label={isRTL ? 'تغير المصروفات' : 'Expense change'}
              value={expenseChange}
              min={-20}
              max={20}
              onChange={onExpenseChange}
            />
          </div>

          <div className="relative rounded-xl border border-border/60 bg-gradient-to-r from-najdi-900/[0.03] via-transparent to-emerald-500/[0.04] p-1">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3">
              <OutcomeTile
                label={outcomes.revenue.label}
                value={outcomes.revenue.value}
                icon={TrendingUp}
                tone={outcomes.revenue.tone}
              />
              <OutcomeTile
                label={outcomes.expenses.label}
                value={outcomes.expenses.value}
                icon={Receipt}
                tone={outcomes.expenses.tone}
              />
              <OutcomeTile
                label={outcomes.ebitda.label}
                value={outcomes.ebitda.value}
                icon={Wallet}
                tone={outcomes.ebitda.tone}
              />
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground text-center">
            {isRTL
              ? 'محاكاة فورية بناءً على الأرقام الأساسية للفترة الحالية'
              : 'Live projection from current-period baseline figures'}
          </p>
        </div>
      )}
    </ExecSectionCard>
  );
}
