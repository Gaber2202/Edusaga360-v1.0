import React from 'react';

export default function SubjectBars({ items }) {
  if (!items?.length) return null;

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.subject}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-ink">{item.subject}</p>
            <p className="es-metric text-sm">
              {item.score}/{item.max}
            </p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-sand-alt">
            <div
              className="h-full rounded-full bg-[#2E7D5B]"
              style={{ width: `${Math.min(item.pct, 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
