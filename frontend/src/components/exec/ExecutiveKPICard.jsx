import React from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { cn } from '../../lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const GRADIENTS = {
  najdi: 'from-najdi-900/10 via-transparent to-transparent',
  green: 'from-emerald-500/10 via-transparent to-transparent',
  gold: 'from-amber-500/10 via-transparent to-transparent',
  red: 'from-red-500/10 via-transparent to-transparent',
  purple: 'from-purple-500/10 via-transparent to-transparent',
  info: 'from-sky-500/10 via-transparent to-transparent',
};

const ACCENTS = {
  najdi: { ring: 'ring-najdi-900/10', icon: 'bg-najdi-50 text-najdi-900', spark: '#0E6B4F' },
  green: { ring: 'ring-emerald-500/10', icon: 'bg-emerald-50 text-emerald-700', spark: '#16A077' },
  gold: { ring: 'ring-amber-500/10', icon: 'bg-amber-50 text-amber-700', spark: '#C8A451' },
  red: { ring: 'ring-red-500/10', icon: 'bg-red-50 text-red-600', spark: '#D1493F' },
  purple: { ring: 'ring-purple-500/10', icon: 'bg-purple-50 text-purple-700', spark: '#8B5CF6' },
  info: { ring: 'ring-sky-500/10', icon: 'bg-sky-50 text-sky-700', spark: '#2C7BB0' },
};

function Sparkline({ data, color, id }) {
  if (!data?.length) return <div className="h-10" />;
  const gradId = `exec-kpi-${id}`;
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="value" stroke={color} fill={`url(#${gradId})`} strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function DeltaBadge({ delta, suffix = '%', invert = false }) {
  if (delta === undefined || delta === null) return null;
  const positive = invert ? delta < 0 : delta > 0;
  const negative = invert ? delta > 0 : delta < 0;
  const Icon = positive ? TrendingUp : negative ? TrendingDown : Minus;
  const cls = positive
    ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
    : negative
      ? 'text-red-700 bg-red-50 border-red-100'
      : 'text-muted-foreground bg-sand border-border';

  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full border', cls)}>
      <Icon className="w-3 h-3" />
      {Math.abs(delta).toFixed(1)}{suffix}
    </span>
  );
}

export default function ExecutiveKPICard({
  title,
  value,
  delta,
  deltaSuffix,
  invertDelta = false,
  sparkData,
  color = 'najdi',
  icon: Icon,
  subtitle,
  className,
  id = 'kpi',
}) {
  const accent = ACCENTS[color] || ACCENTS.najdi;
  const gradient = GRADIENTS[color] || GRADIENTS.najdi;

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border/60 bg-white shadow-sm',
        'ring-1 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5',
        accent.ring,
        className,
      )}
    >
      <div className={cn('absolute inset-0 bg-gradient-to-br pointer-events-none', gradient)} />
      <div className="relative p-4 flex flex-col gap-3 min-h-[120px]">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate">{title}</p>
            <div className="mt-1 text-xl font-bold text-ink leading-tight">{value}</div>
            {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          {Icon && (
            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', accent.icon)}>
              <Icon className="w-4 h-4" />
            </div>
          )}
        </div>
        <div className="flex items-end justify-between gap-2 mt-auto">
          <DeltaBadge delta={delta} suffix={deltaSuffix} invert={invertDelta} />
          <div className="w-24 flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
            <Sparkline data={sparkData} color={accent.spark} id={id} />
          </div>
        </div>
      </div>
    </div>
  );
}
