import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * SVG circular progress — adapted from 21st.dev Circular Progress
 * (shadcnui-blocks / progress-10).
 */
export default function CircularProgress({
  value = 0,
  renderLabel,
  className,
  progressClassName,
  labelClassName,
  showLabel = true,
  shape = 'round',
  size = 120,
  strokeWidth,
  circleStrokeWidth = 10,
  progressStrokeWidth = 10,
}) {
  const clamped = Math.min(100, Math.max(0, Number(value) || 0));
  const radius = size / 2 - 10;
  const circumference = Math.ceil(Math.PI * radius * 2);
  const offset = Math.ceil(circumference * ((100 - clamped) / 100));
  const viewBox = `-${size * 0.125} -${size * 0.125} ${size * 1.25} ${size * 1.25}`;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        className="relative"
        height={size}
        width={size}
        viewBox={viewBox}
        style={{ transform: 'rotate(-90deg)' }}
      >
        <circle
          className={cn('stroke-primary/25', className)}
          cx={size / 2}
          cy={size / 2}
          fill="transparent"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset="0"
          strokeWidth={strokeWidth ?? circleStrokeWidth}
        />
        <circle
          className={cn('stroke-primary transition-[stroke-dashoffset] duration-700 ease-out', progressClassName)}
          cx={size / 2}
          cy={size / 2}
          fill="transparent"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap={shape}
          strokeWidth={strokeWidth ?? progressStrokeWidth}
        />
      </svg>
      {showLabel && (
        <div className={cn('absolute inset-0 flex items-center justify-center text-xl font-bold tabular-nums', labelClassName)}>
          {renderLabel ? renderLabel(clamped) : `${Math.round(clamped)}%`}
        </div>
      )}
    </div>
  );
}
