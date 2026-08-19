import React from 'react';
import { cn } from '../lib/utils';

const TONES = {
  success: 'bg-forest-100 text-forest-700',
  warn: 'bg-[#F8EEDF] text-[#D08A24]',
  danger: 'bg-[#F8E8E6] text-[#A8443A]',
  muted: 'bg-sand-alt text-muted-foreground',
  gold: 'bg-[#F4EBD4] text-gold-600',
};

export default function StatusPill({ tone = 'muted', className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONES[tone] || TONES.muted,
        className,
      )}
    >
      {children}
    </span>
  );
}
