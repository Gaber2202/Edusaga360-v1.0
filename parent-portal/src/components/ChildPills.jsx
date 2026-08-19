import React from 'react';
import { useLanguage } from '../lib/LanguageContext';
import { cn } from '../lib/utils';

export default function ChildPills({ students, selectedId, onChange }) {
  const { t, isRTL } = useLanguage();
  if (!students?.length) return null;

  const labelFor = (s) => (isRTL ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar));

  const pillClass = (active) =>
    cn(
      'h-10 rounded-full px-4 text-sm font-medium transition-colors duration-state ease-brand',
      active
        ? 'bg-primary text-primary-foreground'
        : 'border border-[color:var(--es-border)] bg-card text-ink hover:bg-sand-alt',
    );

  return (
    <div className="flex flex-wrap gap-2">
      {students.length > 1 && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className={pillClass(!selectedId)}
        >
          {t('allChildren')}
        </button>
      )}
      {students.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onChange(s.id)}
          className={pillClass(selectedId === s.id)}
        >
          {labelFor(s)}
          {s.grade ? ` · ${s.grade}` : ''}
        </button>
      ))}
    </div>
  );
}
