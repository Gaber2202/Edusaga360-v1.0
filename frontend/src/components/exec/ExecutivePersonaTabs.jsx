import React from 'react';
import { cn } from '../../lib/utils';
import { Crown, DollarSign, Building2, Users, GraduationCap, ClipboardList } from 'lucide-react';

const PERSONAS = {
  ceo: { short: 'CEO', icon: Crown },
  cfo: { short: 'CFO', icon: DollarSign },
  coo: { short: 'COO', icon: Building2 },
  chro: { short: 'CHRO', icon: Users },
  principal: { short: 'Principal', icon: GraduationCap },
  administrator: { short: 'Registrar', icon: ClipboardList },
};

function personaKey(persona, suffix = '') {
  return `execPersona${persona.charAt(0).toUpperCase()}${persona.slice(1)}${suffix}`;
}

export default function ExecutivePersonaTabs({ value, onChange, available, isRTL, t }) {
  return (
    <div className="overflow-x-auto max-w-full pb-0.5">
      <div
        className="inline-flex p-1 rounded-xl bg-sand-alt border border-border/60 gap-1 min-w-max"
        role="tablist"
        aria-label={t?.('switchPersona') || 'Executive dashboards'}
      >
        {available.map((p) => {
          const cfg = PERSONAS[p];
          if (!cfg) return null;
          const active = value === p;
          const Icon = cfg.icon;
          const label = t?.(personaKey(p)) || cfg.short;
          const desc = t?.(personaKey(p, 'Desc')) || '';
          const shortBadge = p === 'principal' || p === 'administrator'
            ? (isRTL ? (p === 'principal' ? 'مدرسة' : 'مسجل') : cfg.short)
            : cfg.short;

          return (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(p)}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all duration-200 whitespace-nowrap text-start',
                active
                  ? 'bg-white text-najdi-900 shadow-sm ring-1 ring-border/40'
                  : 'text-muted-foreground hover:text-ink hover:bg-white/60',
              )}
              title={desc ? `${label} — ${desc}` : label}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
                  active ? 'bg-najdi-50 text-najdi-900' : 'bg-white/80 text-muted-foreground',
                )}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex flex-col items-start leading-tight min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className={cn('text-sm font-semibold truncate max-w-[140px] sm:max-w-none', active && 'text-najdi-900')}>
                    {label}
                  </span>
                  <span
                    className={cn(
                      'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md flex-shrink-0',
                      active ? 'bg-najdi-100 text-najdi-800' : 'bg-white text-muted-foreground border border-border/50',
                    )}
                  >
                    {shortBadge}
                  </span>
                </span>
                {desc && (
                  <span className={cn('text-[10px] mt-0.5 truncate max-w-[180px] sm:max-w-none', active ? 'text-najdi-700/70' : 'text-muted-foreground')}>
                    {desc}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
