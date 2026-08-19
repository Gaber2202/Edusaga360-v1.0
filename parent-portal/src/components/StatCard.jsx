import React from 'react';
import { cn } from '../lib/utils';
import { Card, CardContent } from './ui/card';
import IconTile from './IconTile';

export default function StatCard({
  icon: Icon,
  label,
  value,
  highlight = false,
  tone = 'mint',
  className,
}) {
  return (
    <Card className={cn('es-reveal', className)}>
      <CardContent className="p-6">
        {Icon ? (
          <IconTile tone={tone}>
            <Icon />
          </IconTile>
        ) : null}
        <p
          className={cn(
            'es-metric mt-5 text-[28px] leading-none sm:text-[32px]',
            highlight && 'text-gold-600',
          )}
        >
          {value}
        </p>
        <p className="mt-2 text-[13px] font-medium text-ink">{label}</p>
      </CardContent>
    </Card>
  );
}
