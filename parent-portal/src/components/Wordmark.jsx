import React from 'react';
import { cn } from '../lib/utils';

export default function Wordmark({ variant = 'ink', className }) {
  return (
    <span
      dir="ltr"
      className={cn(
        'inline-flex items-baseline font-sans font-semibold tracking-tight leading-none',
        variant === 'cream' ? 'text-[#F5F0E4]' : 'text-ink',
        className,
      )}
    >
      EduSaga
      <span className="text-gold-400">.</span>
      360
    </span>
  );
}
