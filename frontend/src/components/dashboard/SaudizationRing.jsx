import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import JurisdictionFeatureGate from '../JurisdictionFeatureGate';
import { PAGE_FEATURE_KEYS } from '../../lib/jurisdictionFeatures.js';
import { cn } from '../../lib/utils';
import { ShieldCheck } from 'lucide-react';

export default function SaudizationRing({ pct, isRTL, animDelay = 0 }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 50 ? '#16A077' : pct >= 30 ? '#E0A82E' : '#D1493F';
  const ringCls = pct >= 50 ? 'ring-emerald-500/10' : pct >= 30 ? 'ring-amber-500/10' : 'ring-red-500/10';
  const label = pct >= 50 ? (isRTL ? 'ممتاز' : 'Excellent') : pct >= 30 ? (isRTL ? 'مقبول' : 'Acceptable') : (isRTL ? 'دون الحد' : 'Below Min');

  return (
    <JurisdictionFeatureGate featureKeys={PAGE_FEATURE_KEYS.SaudizationTracker}>
    <Link to={createPageUrl('GovernmentRelations')} className="block h-full">
      <div
        className={cn(
          'group relative overflow-hidden rounded-xl border border-border/60 bg-white shadow-sm h-full',
          'ring-1 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 animate-fade-in-up',
          ringCls,
        )}
        style={{ animationDelay: `${animDelay}ms` }}
      >
        <div className={cn('absolute inset-0 bg-gradient-to-br pointer-events-none', pct >= 50 ? 'from-emerald-500/8' : pct >= 30 ? 'from-amber-500/8' : 'from-red-500/8', 'via-transparent to-transparent')} />
        <div className="relative p-4 flex flex-col gap-2 min-h-[118px]">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{isRTL ? 'نسبة السعودة' : 'Saudization'}</p>
            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', pct >= 50 ? 'bg-emerald-50 text-emerald-700' : pct >= 30 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600')}>
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-center justify-center py-1 flex-1">
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
          <p className={cn('text-[11px] font-semibold text-center', pct >= 50 ? 'text-emerald-600' : pct >= 30 ? 'text-amber-600' : 'text-red-600')}>{label}</p>
        </div>
      </div>
    </Link>
    </JurisdictionFeatureGate>
  );
}
