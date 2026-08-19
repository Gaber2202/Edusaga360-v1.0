import React from 'react';
import { useLanguage } from '../lib/LanguageContext';
import { filtersAreActive, presetRange } from '../lib/attendanceFilters';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from './ui/field';
import { cn } from '../lib/utils';

const STATUSES = ['all', 'present', 'late', 'absent', 'excused'];
const PRESETS = [
  { id: '7d', labelKey: 'last7Days' },
  { id: '30d', labelKey: 'last30Days' },
  { id: 'month', labelKey: 'thisMonth' },
];

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-9 rounded-full px-3.5 text-sm font-medium transition-colors duration-state ease-brand',
        active
          ? 'bg-primary text-primary-foreground'
          : 'border border-[color:var(--es-border)] bg-card text-ink hover:bg-sand-alt',
      )}
    >
      {children}
    </button>
  );
}

export default function AttendanceFilters({
  status,
  from,
  to,
  onStatusChange,
  onFromChange,
  onToChange,
  onPreset,
  onClear,
  resultCount,
}) {
  const { t } = useLanguage();
  const active = filtersAreActive({ status, from, to });
  const activePreset = PRESETS.find((preset) => {
    const range = presetRange(preset.id);
    return range.from === from && range.to === to;
  })?.id;

  return (
    <div className="space-y-5">
      <FieldSet>
        <FieldLegend>{t('filterStatus')}</FieldLegend>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((value) => (
            <Chip
              key={value}
              active={status === value}
              onClick={() => onStatusChange(value)}
            >
              {value === 'all' ? t('allStatuses') : t(value)}
            </Chip>
          ))}
        </div>
      </FieldSet>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="attendance-from">{t('dateFrom')}</FieldLabel>
          <Input
            id="attendance-from"
            type="date"
            value={from}
            onChange={(event) => onFromChange(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="attendance-to">{t('dateTo')}</FieldLabel>
          <Input
            id="attendance-to"
            type="date"
            value={to}
            onChange={(event) => onToChange(event.target.value)}
          />
        </Field>
        <Field className="sm:col-span-2 xl:col-span-2">
          <FieldLabel>{t('date')}</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Chip
                key={preset.id}
                active={activePreset === preset.id}
                onClick={() => onPreset(preset.id)}
              >
                {t(preset.labelKey)}
              </Chip>
            ))}
          </div>
        </Field>
      </FieldGroup>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          {t('showing')} {resultCount} {t('records')}
        </p>
        {active ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            {t('clearFilters')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
