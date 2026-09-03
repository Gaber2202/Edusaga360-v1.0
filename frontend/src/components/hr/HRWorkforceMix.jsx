import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

function MixBar({ label, value, pct, color }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground truncate">{label}</span>
        <span className="font-semibold text-ink tabular-nums whitespace-nowrap">
          {value} · {pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-sand-alt overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

/**
 * Gender + employment-type mix — inspired by 21st stats progress patterns.
 */
export default function HRWorkforceMix({ isRTL, gender, employmentTypes = [] }) {
  const typeLabels = {
    full_time: isRTL ? 'دوام كامل' : 'Full time',
    part_time: isRTL ? 'دوام جزئي' : 'Part time',
    contract: isRTL ? 'عقد' : 'Contract',
    probation: isRTL ? 'تجربة' : 'Probation',
    unspecified: isRTL ? 'غير محدد' : 'Unspecified',
  };

  const typeColors = ['#0E6B4F', '#16A077', '#C8A451', '#3b82f6', '#8b5cf6', '#64748b'];

  return (
    <Card className="border-border/60 shadow-sm h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          {isRTL ? 'تركيبة القوى العاملة' : 'Workforce mix'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {isRTL ? 'الجنس' : 'Gender'}
          </p>
          <MixBar
            label={isRTL ? 'ذكور' : 'Male'}
            value={gender.male}
            pct={gender.malePct}
            color="#0E6B4F"
          />
          <MixBar
            label={isRTL ? 'إناث' : 'Female'}
            value={gender.female}
            pct={gender.femalePct}
            color="#C8A451"
          />
          {gender.unknown > 0 && (
            <MixBar
              label={isRTL ? 'غير محدد' : 'Unspecified'}
              value={gender.unknown}
              pct={(gender.unknown / Math.max(1, gender.male + gender.female + gender.unknown)) * 100}
              color="#94a3b8"
            />
          )}
        </div>

        <div className="space-y-2.5 pt-1 border-t border-border/60">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {isRTL ? 'نوع التوظيف' : 'Employment type'}
          </p>
          {employmentTypes.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              {isRTL ? 'لا توجد بيانات نوع توظيف' : 'No employment type data yet'}
            </p>
          ) : (
            employmentTypes.slice(0, 5).map((row, i) => (
              <MixBar
                key={row.name}
                label={typeLabels[row.name] || row.name}
                value={row.value}
                pct={row.pct}
                color={typeColors[i % typeColors.length]}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
