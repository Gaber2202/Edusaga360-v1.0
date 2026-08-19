import React from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { cn } from '../../lib/utils';

const GRADIENTS = {
  blue: 'from-najdi-900/8 via-transparent to-transparent',
  emerald: 'from-emerald-500/10 via-transparent to-transparent',
  amber: 'from-amber-500/10 via-transparent to-transparent',
  red: 'from-red-500/10 via-transparent to-transparent',
  purple: 'from-purple-500/10 via-transparent to-transparent',
  teal: 'from-teal-500/10 via-transparent to-transparent',
  slate: 'from-slate-500/8 via-transparent to-transparent',
};

const ACCENTS = {
  blue: { ring: 'ring-najdi-900/10', icon: 'bg-najdi-50 text-najdi-900', spark: '#0E6B4F' },
  emerald: { ring: 'ring-emerald-500/10', icon: 'bg-emerald-50 text-emerald-700', spark: '#16A077' },
  amber: { ring: 'ring-amber-500/10', icon: 'bg-amber-50 text-amber-700', spark: '#C8A451' },
  red: { ring: 'ring-red-500/10', icon: 'bg-red-50 text-red-600', spark: '#D1493F' },
  purple: { ring: 'ring-purple-500/10', icon: 'bg-purple-50 text-purple-700', spark: '#8B5CF6' },
  teal: { ring: 'ring-teal-500/10', icon: 'bg-teal-50 text-teal-700', spark: '#14b8a6' },
  slate: { ring: 'ring-border/40', icon: 'bg-sand-alt text-muted-foreground', spark: '#64748b' },
};

function Sparkline({ data, color, id }) {
  if (!data?.length || data.length < 2) return <div className="h-9" />;
  const gradId = `dash-kpi-${id}`;
  return (
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} fill={`url(#${gradId})`} strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function DeltaBadge({ trend, alert }) {
  if (trend != null && trend !== 0) {
    const positive = trend > 0;
    const Icon = positive ? TrendingUp : TrendingDown;
    return (
      <span className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full border',
        positive ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-red-700 bg-red-50 border-red-100',
      )}>
        <Icon className="w-3 h-3" />
        {Math.abs(trend)}%
      </span>
    );
  }
  if (trend === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full border text-muted-foreground bg-sand border-border">
        <Minus className="w-3 h-3" /> 0%
      </span>
    );
  }
  if (alert) {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-600 text-xs font-bold">!</span>
    );
  }
  return null;
}

export default function DashboardKPICard({
  title,
  value,
  sub,
  icon: Icon,
  color = 'slate',
  alert = false,
  href,
  trend,
  series,
  animDelay = 0,
  id = 'card',
}) {
  const accent = ACCENTS[color] || ACCENTS.slate;
  const gradient = GRADIENTS[color] || GRADIENTS.slate;
  const spark = Array.isArray(series) ? series : null;
  const hasSpark = spark && spark.length > 1 && spark.some((p) => (p?.v ?? 0) !== 0);

  const inner = (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border/60 bg-white shadow-sm h-full',
        'ring-1 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 cursor-pointer animate-fade-in-up',
        accent.ring,
      )}
      style={{ animationDelay: `${animDelay}ms` }}
    >
      <div className={cn('absolute inset-0 bg-gradient-to-br pointer-events-none', gradient)} />
      <div className="relative p-4 flex flex-col gap-2 min-h-[118px]">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate">{title}</p>
            <div className="mt-1 text-xl font-bold text-ink leading-tight">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </div>
            {sub && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
          </div>
          {Icon && (
            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', accent.icon)}>
              <Icon className="w-4 h-4" />
            </div>
          )}
        </div>
        <div className="flex items-end justify-between gap-2 mt-auto">
          <DeltaBadge trend={trend} alert={alert && trend == null} />
          {hasSpark && (
            <div className="w-20 flex-shrink-0 opacity-75 group-hover:opacity-100 transition-opacity">
              <Sparkline data={spark} color={accent.spark} id={id} />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (href) return <Link to={href} className="block h-full">{inner}</Link>;
  return inner;
}
