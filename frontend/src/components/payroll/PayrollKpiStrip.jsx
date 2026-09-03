import React from 'react';

/**
 * Compact KPI score tiles inspired by 21st financial score cards.
 */
export default function PayrollKpiStrip({ items = [] }) {
  if (!items.length) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map(({ key, label, value, hint, icon: Icon, tone = 'najdi', onClick }) => {
        const toneMap = {
          najdi: 'bg-najdi-50 text-najdi-800',
          emerald: 'bg-emerald-50 text-emerald-700',
          amber: 'bg-amber-50 text-amber-700',
          sand: 'bg-sand-alt text-ink',
        };
        const Wrapper = onClick ? 'button' : 'div';
        return (
          <Wrapper
            key={key || label}
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            className={`text-start rounded-2xl border border-border/70 bg-white p-4 shadow-sm transition-shadow ${
              onClick ? 'hover:shadow-md cursor-pointer' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{label}</p>
                <p className="text-2xl font-bold tabular-nums mt-1 tracking-tight">{value}</p>
                {hint && <p className="text-[11px] text-muted-foreground mt-1 truncate">{hint}</p>}
              </div>
              {Icon && (
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${toneMap[tone] || toneMap.najdi}`}>
                  <Icon className="w-5 h-5" />
                </div>
              )}
            </div>
          </Wrapper>
        );
      })}
    </div>
  );
}
