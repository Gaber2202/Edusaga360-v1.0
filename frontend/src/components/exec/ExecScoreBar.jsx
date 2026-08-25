import React from 'react';
import { Progress } from '../ui/progress';
import { EXEC_COLORS } from '../../lib/execDashboardDesign';

function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  return `${n}%`;
}

export default function ExecScoreBar({ label, value }) {
  const pct = value || 0;
  const tone = pct >= 85 ? EXEC_COLORS.green : pct < 60 ? EXEC_COLORS.red : EXEC_COLORS.info;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs gap-2">
        <span className="text-muted-foreground truncate">{label}</span>
        <span className="font-semibold text-ink tabular-nums flex-shrink-0">{fmtPct(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-sand overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: tone }}
        />
      </div>
    </div>
  );
}
