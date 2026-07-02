import React from 'react';
import { Skeleton } from './skeleton';
import { Button } from './button';
import { useLanguage } from '../LanguageContext';
import { BarChart3, AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Wraps a chart so it always renders an explicit loading / error / empty state
 * instead of a blank canvas or a misleading all-zero chart when the underlying
 * query fails silently. Reserve the same height as the chart so surrounding
 * layout does not jump between states.
 *
 * Usage:
 *   <ChartState loading={loading} error={error} isEmpty={!data?.length} height={240}>
 *     <ResponsiveContainer width="100%" height={240}>...</ResponsiveContainer>
 *   </ChartState>
 */
export default function ChartState({
  loading,
  error,
  isEmpty,
  height = 240,
  onRetry,
  emptyMessage,
  errorMessage,
  children,
}) {
  const { isRTL } = useLanguage();
  const style = { height, minHeight: height };

  if (loading) {
    return (
      <div className="w-full space-y-3 p-2" style={style} aria-busy="true">
        <Skeleton className="h-full w-full rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="w-full flex flex-col items-center justify-center gap-2 text-center px-4"
        style={style}
        role="alert"
      >
        <AlertTriangle className="w-8 h-8 text-es-error" />
        <p className="text-sm font-medium text-ink">
          {errorMessage || (isRTL ? 'تعذّر تحميل البيانات' : 'Couldn’t load this data')}
        </p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
            <RefreshCw className={`w-4 h-4 ${isRTL ? 'ml-2' : 'mr-2'}`} />
            {isRTL ? 'إعادة المحاولة' : 'Retry'}
          </Button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div
        className="w-full flex flex-col items-center justify-center gap-2 text-center px-4"
        style={style}
      >
        <BarChart3 className="w-8 h-8 text-muted-foreground opacity-60" />
        <p className="text-sm text-muted-foreground">
          {emptyMessage || (isRTL ? 'لا توجد بيانات لعرضها' : 'No data to display yet')}
        </p>
      </div>
    );
  }

  return children;
}
