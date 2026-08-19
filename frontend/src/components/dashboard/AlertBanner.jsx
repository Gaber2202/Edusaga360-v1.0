import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, AlertCircle, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

const VARIANTS = {
  red: { bg: 'bg-red-50 border-red-200 hover:bg-red-100/80', icon: 'text-red-500', value: 'text-red-700' },
  amber: { bg: 'bg-amber-50 border-amber-200 hover:bg-amber-100/80', icon: 'text-amber-500', value: 'text-amber-700' },
};

export default function AlertBanner({ items, isRTL }) {
  if (!items?.length) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {items.map(({ key, count, label, href, variant = 'red', icon: IconProp }) => {
        const Icon = IconProp || (variant === 'amber' ? Clock : AlertTriangle);
        const v = VARIANTS[variant] || VARIANTS.red;
        const content = (
          <div className={cn('flex items-center gap-3 p-4 rounded-xl border transition-colors', v.bg)}>
            <Icon className={cn('w-6 h-6 flex-shrink-0', v.icon)} />
            <div className="flex-1 min-w-0">
              <div className={cn('text-xl font-bold', v.value)}>{count}</div>
              <div className="text-xs text-muted-foreground truncate">{label}</div>
            </div>
            {href && <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
          </div>
        );
        return href ? <Link key={key} to={href}>{content}</Link> : <div key={key}>{content}</div>;
      })}
    </div>
  );
}
