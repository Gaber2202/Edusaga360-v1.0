import * as React from 'react';
import { cn } from '../../lib/utils';

const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[120px] w-full rounded-[10px] border border-[color:var(--es-border)] bg-[#FDFBF6] px-3 py-2 text-[15px] text-ink shadow-none transition-colors duration-state ease-brand placeholder:text-muted-foreground focus-visible:border-forest-700 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-forest-700/10 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-forest-100',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export { Textarea };
