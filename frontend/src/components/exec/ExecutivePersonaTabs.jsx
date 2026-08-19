import React from 'react';
import { cn } from '../../lib/utils';
import { Crown, DollarSign, Building2, Users } from 'lucide-react';

const PERSONAS = {
  ceo: { label: 'CEO', icon: Crown, desc: 'Strategy & Vitality' },
  cfo: { label: 'CFO', icon: DollarSign, desc: 'Finance & Compliance' },
  coo: { label: 'COO', icon: Building2, desc: 'Operations' },
  chro: { label: 'CHRO', icon: Users, desc: 'Workforce' },
};

export default function ExecutivePersonaTabs({ value, onChange, available, isRTL }) {
  return (
    <div className="inline-flex p-1 rounded-xl bg-sand-alt border border-border/60 gap-0.5">
      {available.map((p) => {
        const cfg = PERSONAS[p];
        if (!cfg) return null;
        const active = value === p;
        const Icon = cfg.icon;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
              active
                ? 'bg-white text-najdi-900 shadow-sm ring-1 ring-border/40'
                : 'text-muted-foreground hover:text-ink hover:bg-white/60',
            )}
            title={cfg.desc}
          >
            <Icon className={cn('w-4 h-4', active ? 'text-najdi-900' : 'text-muted-foreground')} />
            <span>{cfg.label}</span>
          </button>
        );
      })}
    </div>
  );
}
