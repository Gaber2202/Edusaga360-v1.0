import React from 'react';
import { cn } from '../lib/utils';

export default function IconTile({ children, className, tone = 'mint' }) {
  const tones = {
    mint: 'bg-forest-100 text-forest-700',
    gold: 'bg-[#F4EBD4] text-gold-600',
    warn: 'bg-[#F8EEDF] text-[#D08A24]',
    danger: 'bg-[#F8E8E6] text-[#A8443A]',
    forest: 'bg-forest-900 text-gold-400',
  };

  return (
    <div
      className={cn(
        'flex h-12 w-12 shrink-0 items-center justify-center rounded-tile [&>svg]:h-5 [&>svg]:w-5 [&>svg]:stroke-[1.5]',
        tones[tone] || tones.mint,
        className,
      )}
    >
      {children}
    </div>
  );
}
