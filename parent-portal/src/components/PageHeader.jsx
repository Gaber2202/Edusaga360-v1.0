import React from 'react';
import { useLanguage } from '../lib/LanguageContext';
import { cn } from '../lib/utils';

export default function PageHeader({ eyebrow, title, description, action, className }) {
  const { isRTL } = useLanguage();

  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="max-w-2xl space-y-2">
        {eyebrow ? <p className="es-eyebrow">{eyebrow}</p> : null}
        <h1
          className={cn(
            'text-balance text-[28px] leading-[1.15] text-ink sm:text-[32px]',
            isRTL ? 'font-arabic font-semibold leading-[1.4]' : 'font-sans font-semibold tracking-tight',
          )}
        >
          {title}
        </h1>
        {description ? (
          <p className="max-w-xl text-[15px] font-light leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
