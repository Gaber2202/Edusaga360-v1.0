import React from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

const gradients = {
  blue:    'from-najdi-500/10 to-najdi-700/5 border-najdi-100/50',
  emerald: 'from-emerald-500/10 to-emerald-600/5 border-emerald-200/50',
  amber:   'from-amber-500/10 to-amber-600/5 border-amber-200/50',
  red:     'from-red-500/10 to-red-600/5 border-red-200/50',
  purple:  'from-purple-500/10 to-purple-600/5 border-purple-200/50',
  teal:    'from-teal-500/10 to-teal-600/5 border-teal-200/50',
  slate:   'from-sand0/10 to-slate-600/5 border-border/50',
};
const iconColors = {
  blue:    'bg-najdi-50 text-najdi-700',
  emerald: 'bg-emerald-100 text-emerald-600',
  amber:   'bg-amber-100 text-amber-600',
  red:     'bg-red-100 text-red-600',
  purple:  'bg-purple-100 text-purple-600',
  teal:    'bg-teal-100 text-teal-600',
  slate:   'bg-sand-alt text-muted-foreground',
};
const sparkColors = {
  blue: '#3b82f6', emerald: '#10b981', amber: '#f59e0b',
  red: '#ef4444', purple: '#a855f7', teal: '#14b8a6', slate: '#64748b',
};

export default function DashboardKPICard({ title, value, sub, icon: Icon, color = 'slate', alert = false, href, trend, series, trendLabel: _trendLabel, animDelay = 0 }) {
  // Real sparkline data passed in from computed tenant metrics. No fabricated data.
  const spark = Array.isArray(series) ? series : null;
  const hasSpark = spark && spark.length > 1 && spark.some((p) => (p?.v ?? 0) !== 0);
  const trendPositive = trend > 0;
  const trendNeutral = trend === 0 || trend == null;

  const inner = (
    <div
      className={`bg-gradient-to-br ${gradients[color] || gradients.slate} border rounded-xl p-4 flex flex-col gap-2 h-full hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer animate-fade-in-up`}
      style={{ animationDelay: `${animDelay}ms` }}
    >
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-lg ${iconColors[color] || iconColors.slate} flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-5 h-5" />
        </div>
        {/* Trend badge */}
        {!trendNeutral && (
          <div className={`flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${trendPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
            {trendPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend)}%
          </div>
        )}
        {trendNeutral && trend !== undefined && (
          <div className="flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full bg-sand-alt text-muted-foreground">
            <Minus className="w-3 h-3" /> 0%
          </div>
        )}
        {alert && trend == null && (
          <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 text-xs flex items-center justify-center font-bold">!</span>
        )}
      </div>

      <div className="text-2xl font-extrabold text-ink leading-tight">{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <div className="text-xs text-muted-foreground font-semibold leading-tight">{title}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}

      {/* Sparkline — only rendered when real trend data exists */}
      {hasSpark && (
        <div className="h-10 w-full mt-auto">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={spark}>
              <Line type="monotone" dataKey="v" stroke={sparkColors[color] || '#64748b'} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );

  if (href) return <Link to={href} className="block h-full">{inner}</Link>;
  return inner;
}