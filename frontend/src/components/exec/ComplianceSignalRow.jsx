import React from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion } from 'lucide-react';
import { cn } from '../../lib/utils';

const SIGNAL_CFG = {
  green: { Icon: ShieldCheck, cls: 'bg-emerald-50 border-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  yellow: { Icon: ShieldAlert, cls: 'bg-amber-50 border-amber-100 text-amber-700', dot: 'bg-amber-500' },
  red: { Icon: ShieldX, cls: 'bg-red-50 border-red-100 text-red-700', dot: 'bg-red-500' },
  unknown: { Icon: ShieldQuestion, cls: 'bg-sand border-border text-muted-foreground', dot: 'bg-muted-foreground' },
};

export default function ComplianceSignalRow({ signals, isRTL }) {
  if (!signals?.length) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {signals.map(({ key, label, signal }) => {
        const color = signal?.color || 'unknown';
        const cfg = SIGNAL_CFG[color] || SIGNAL_CFG.unknown;
        const { Icon, cls, dot } = cfg;
        return (
          <div key={key} className={cn('flex items-center gap-3 p-3 rounded-xl border', cls)} title={signal?.message || undefined}>
            <div className="relative">
              <Icon className="w-5 h-5" />
              <span className={cn('absolute -top-0.5 -end-0.5 w-2 h-2 rounded-full ring-2 ring-white', dot)} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate">{label}</p>
              <p className="text-[10px] opacity-75 capitalize truncate">{signal?.status?.replace(/_/g, ' ') || '—'}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
