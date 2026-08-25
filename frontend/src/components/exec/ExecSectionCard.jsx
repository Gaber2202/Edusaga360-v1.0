import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { cn } from '../../lib/utils';
import { execCard } from '../../lib/execDashboardDesign';

const ICON_TONES = {
  najdi: 'bg-najdi-50 text-najdi-900',
  green: 'bg-emerald-50 text-emerald-700',
  gold: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-600',
  purple: 'bg-purple-50 text-purple-700',
  info: 'bg-sky-50 text-sky-700',
};

export default function ExecSectionCard({
  title,
  subtitle,
  icon: Icon,
  iconTone = 'najdi',
  action,
  children,
  className,
  contentClassName,
  noPadding = false,
}) {
  return (
    <Card className={cn(execCard.section, 'border-0', className)}>
      <CardHeader className={cn('flex flex-row items-start justify-between gap-3', execCard.sectionHeader)}>
        <div className="flex items-start gap-3 min-w-0">
          {Icon && (
            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', ICON_TONES[iconTone] || ICON_TONES.najdi)}>
              <Icon className="w-4 h-4" />
            </div>
          )}
          <div className="min-w-0">
            <CardTitle className={execCard.sectionTitle}>{title}</CardTitle>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action}
      </CardHeader>
      <CardContent className={cn(noPadding && 'p-0 pt-0', contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}
