import React from 'react';
import { Card, CardContent } from '../ui/card';
import { cn } from '../../lib/utils';
import { EXEC_HERO } from '../../lib/execDashboardDesign';

export default function ExecHeroBanner({
  persona = 'ceo',
  eyebrow,
  title,
  subtitle,
  stats = [],
  children,
  className,
}) {
  const gradient = EXEC_HERO[persona] || EXEC_HERO.ceo;

  return (
    <Card className={cn('border-0 shadow-lg text-white overflow-hidden bg-gradient-to-br', gradient, className)}>
      <CardContent className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex-1 min-w-0">
            {eyebrow && (
              <p className="text-[11px] uppercase tracking-widest text-white/55 font-semibold mb-1">{eyebrow}</p>
            )}
            <h2 className="text-xl md:text-2xl font-bold tracking-tight">{title}</h2>
            {subtitle && <p className="text-sm text-white/70 mt-1.5 max-w-xl">{subtitle}</p>}
          </div>

          {stats.length > 0 && (
            <div className={cn('flex flex-wrap gap-4 lg:gap-6', children && 'lg:border-s lg:border-white/10 lg:ps-6')}>
              {stats.map((s) => (
                <div key={s.label} className="text-center min-w-[72px]">
                  <p className="text-2xl md:text-3xl font-bold tabular-nums leading-none">{s.value}</p>
                  <p className="text-[10px] uppercase tracking-wider text-white/55 mt-1.5 font-medium">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {children}
        </div>
      </CardContent>
    </Card>
  );
}
