import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';

export default function SaudizationRing({ pct, isRTL, animDelay = 0 }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 50 ? '#10b981' : pct >= 30 ? '#f59e0b' : '#ef4444';
  const gradClass = pct >= 50 ? 'from-emerald-500/10 to-emerald-600/5 border-emerald-200/50' : pct >= 30 ? 'from-amber-500/10 to-amber-600/5 border-amber-200/50' : 'from-red-500/10 to-red-600/5 border-red-200/50';
  const label = pct >= 50 ? (isRTL ? 'ممتاز' : 'Excellent') : pct >= 30 ? (isRTL ? 'مقبول' : 'Acceptable') : (isRTL ? 'دون الحد' : 'Below Min');

  return (
    <Link to={createPageUrl('GovernmentRelations')} className="block h-full">
      <div
        className={`bg-gradient-to-br ${gradClass} border rounded-xl p-4 flex flex-col gap-2 h-full hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 animate-fade-in-up`}
        style={{ animationDelay: `${animDelay}ms` }}
      >
        <div className="text-xs text-muted-foreground font-semibold">{isRTL ? 'نسبة السعودة' : 'Saudization'}</div>
        <div className="flex items-center justify-center py-1">
          <svg width="72" height="72" viewBox="0 0 72 72">
            <circle cx="36" cy="36" r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
            <circle
              cx="36" cy="36" r={r} fill="none"
              stroke={color} strokeWidth="6"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              strokeLinecap="round"
              transform="rotate(-90 36 36)"
              style={{ transition: 'stroke-dashoffset 1s ease' }}
            />
            <text x="36" y="40" textAnchor="middle" fontSize="14" fontWeight="bold" fill={color}>{pct}%</text>
          </svg>
        </div>
        <div className={`text-xs font-semibold text-center ${pct >= 50 ? 'text-emerald-600' : pct >= 30 ? 'text-amber-600' : 'text-red-600'}`}>{label}</div>
      </div>
    </Link>
  );
}