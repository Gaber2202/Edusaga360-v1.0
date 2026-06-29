import React from 'react';

export default function TenantUsageBar({ label, current, max, colorClass = 'bg-emerald-500' }) {
  const pct = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;
  const isWarning = pct >= 80;
  const isDanger  = pct >= 95;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-medium ${isDanger ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-muted-foreground'}`}>
          {current} / {max}
        </span>
      </div>
      <div className="h-1.5 bg-ink rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isDanger ? 'bg-red-500' : isWarning ? 'bg-amber-500' : colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}