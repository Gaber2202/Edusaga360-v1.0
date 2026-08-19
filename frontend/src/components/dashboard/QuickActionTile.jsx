import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

const accentMap = [
  { bg: 'bg-najdi-50', icon: 'text-najdi-900', hover: 'group-hover:bg-najdi-100', bar: 'from-najdi-900 to-najdi-600' },
  { bg: 'bg-emerald-50', icon: 'text-emerald-700', hover: 'group-hover:bg-emerald-100', bar: 'from-emerald-500 to-emerald-400' },
  { bg: 'bg-purple-50', icon: 'text-purple-700', hover: 'group-hover:bg-purple-100', bar: 'from-purple-500 to-purple-400' },
  { bg: 'bg-amber-50', icon: 'text-amber-700', hover: 'group-hover:bg-amber-100', bar: 'from-amber-500 to-amber-400' },
  { bg: 'bg-rose-50', icon: 'text-rose-700', hover: 'group-hover:bg-rose-100', bar: 'from-rose-500 to-rose-400' },
  { bg: 'bg-teal-50', icon: 'text-teal-700', hover: 'group-hover:bg-teal-100', bar: 'from-teal-500 to-teal-400' },
  { bg: 'bg-indigo-50', icon: 'text-indigo-700', hover: 'group-hover:bg-indigo-100', bar: 'from-indigo-500 to-indigo-400' },
  { bg: 'bg-orange-50', icon: 'text-orange-700', hover: 'group-hover:bg-orange-100', bar: 'from-orange-500 to-orange-400' },
];

export default function QuickActionTile({ label, icon: Icon, href, accentIndex = 0 }) {
  const accent = accentMap[accentIndex % accentMap.length];
  return (
    <Link to={href} className="block group">
      <div className="relative overflow-hidden bg-white rounded-xl border border-border/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer">
        <div className={cn('h-0.5 bg-gradient-to-r', accent.bar)} />
        <div className="p-4 flex flex-col items-center gap-2.5">
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center transition-colors', accent.bg, accent.hover)}>
            <Icon className={cn('w-5 h-5', accent.icon)} />
          </div>
          <span className="text-muted-foreground text-xs font-semibold text-center leading-tight group-hover:text-ink transition-colors">{label}</span>
        </div>
      </div>
    </Link>
  );
}
