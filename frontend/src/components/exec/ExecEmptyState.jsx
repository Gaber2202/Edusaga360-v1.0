import React from 'react';
import { BarChart3 } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function ExecEmptyState({ message, isRTL, compact = false, className }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center rounded-xl border-2 border-dashed border-border/70 bg-sand-alt/30 text-muted-foreground',
        compact ? 'py-8 px-4' : 'py-10 px-6',
        className,
      )}
    >
      <BarChart3 className={cn('text-border mb-2', compact ? 'w-7 h-7' : 'w-9 h-9')} />
      <p className="text-sm">{message || (isRTL ? 'لا توجد بيانات متاحة' : 'No data available')}</p>
    </div>
  );
}
