import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Target, FileWarning, ClipboardList, ArrowRight } from 'lucide-react';

/**
 * Prioritized action queue — surfaces compliance gaps as clickable rows.
 */
export default function HRPriorityActions({ isRTL, items = [] }) {
  if (!items.length) return null;

  const iconFor = (tone) => {
    if (tone === 'danger') return AlertTriangle;
    if (tone === 'warn') return Target;
    if (tone === 'info') return ClipboardList;
    return FileWarning;
  };

  const toneCls = {
    danger: 'bg-red-50 border-red-200 text-red-800 hover:border-red-300',
    warn: 'bg-amber-50 border-amber-200 text-amber-900 hover:border-amber-300',
    info: 'bg-sky-50 border-sky-200 text-sky-900 hover:border-sky-300',
    muted: 'bg-sand border-border text-ink hover:border-najdi-900/20',
  };

  const iconCls = {
    danger: 'text-red-600 bg-red-100',
    warn: 'text-amber-700 bg-amber-100',
    info: 'text-sky-700 bg-sky-100',
    muted: 'text-najdi-900 bg-najdi-50',
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">
          {isRTL ? 'إجراءات ذات أولوية' : 'Priority actions'}
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {isRTL ? `${items.length} عنصر` : `${items.length} item${items.length === 1 ? '' : 's'}`}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {items.map((item) => {
          const Icon = item.icon || iconFor(item.tone);
          const row = (
            <div
              className={`group flex items-center gap-3 p-3 rounded-xl border transition-all ${toneCls[item.tone] || toneCls.muted}`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${iconCls[item.tone] || iconCls.muted}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{item.title}</p>
                {item.subtitle && (
                  <p className="text-xs opacity-75 truncate mt-0.5">{item.subtitle}</p>
                )}
              </div>
              {item.href && (
                <ArrowRight className="w-4 h-4 opacity-40 group-hover:opacity-80 flex-shrink-0 rtl:rotate-180" />
              )}
            </div>
          );
          return item.href ? (
            <Link key={item.id} to={item.href} className="block">
              {row}
            </Link>
          ) : (
            <div key={item.id}>{row}</div>
          );
        })}
      </div>
    </section>
  );
}
