import React from 'react';
import { Label } from '../ui/label';
import { Slider } from '../ui/slider';
import { cn } from '../../lib/utils';

/**
 * 21st-style scenario control — visible track, value badge, min/max hints.
 */
export default function ExecScenarioSlider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '%',
  onChange,
  className,
}) {
  const numeric = Number(value) || 0;
  const positive = numeric > 0;
  const negative = numeric < 0;

  return (
    <div className={cn('rounded-xl border border-border/60 bg-white p-4 shadow-sm space-y-3', className)}>
      <div className="flex items-start justify-between gap-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-snug">
          {label}
        </Label>
        <span
          className={cn(
            'text-sm font-bold tabular-nums px-2 py-0.5 rounded-md',
            positive && 'text-emerald-700 bg-emerald-50',
            negative && 'text-red-700 bg-red-50',
            !positive && !negative && 'text-ink bg-sand',
          )}
        >
          {numeric > 0 ? '+' : ''}{numeric}{suffix}
        </span>
      </div>
      <Slider
        value={[numeric]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_[role=slider]]:border-najdi-900/30 [&_[role=slider]]:bg-white [&_.bg-primary]:bg-najdi-900 [&_.bg-primary\\/20]:bg-najdi-900/15"
      />
      <div className="flex justify-between text-[10px] font-medium text-muted-foreground tabular-nums">
        <span>{min}{suffix}</span>
        <span>0{suffix}</span>
        <span>{max > 0 ? '+' : ''}{max}{suffix}</span>
      </div>
    </div>
  );
}
