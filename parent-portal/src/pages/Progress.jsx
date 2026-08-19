import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase, fetchData } from '../lib/supabase';
import { useLanguage } from '../lib/LanguageContext';
import { useLinkedStudents, useParentScope } from '../lib/useParentData';
import { Card, CardContent } from '../components/ui/card';
import ChildPills from '../components/ChildPills';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import LoadingCard from '../components/LoadingCard';
import StatusPill from '../components/StatusPill';
import { GraduationCap } from 'lucide-react';

const GRADE_TONE = (pct) => {
  if (pct >= 85) return 'success';
  if (pct >= 70) return 'gold';
  if (pct >= 50) return 'warn';
  return 'danger';
};

export default function Progress() {
  const { t, isRTL } = useLanguage();
  const { tenantId, linkedIds, enabled } = useParentScope();
  const { data: students = [] } = useLinkedStudents();
  const [childId, setChildId] = useState(null);
  const studentIds = childId ? [childId] : linkedIds;

  const { data: grades = [], isLoading } = useQuery({
    queryKey: ['parent-grades', tenantId, studentIds],
    queryFn: () => fetchData(
      supabase.from('student_grades')
        .select('*')
        .eq('tenant_id', tenantId)
        .in('student_id', studentIds)
        .order('created_at', { ascending: false })
    ),
    enabled,
  });

  const nameFor = (id) => {
    const s = students.find((st) => st.id === id);
    return isRTL ? (s?.name_ar || s?.name_en) : (s?.name_en || s?.name_ar) || '—';
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t('parentPortalEyebrow')} title={t('studentProgressTitle')} />
      <ChildPills students={students} selectedId={childId} onChange={setChildId} />

      {isLoading ? (
        <LoadingCard />
      ) : !enabled || grades.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={t('progressWillAppear')}
          description={t('progressDataNote')}
        />
      ) : (
        <div className="space-y-3">
          {grades.map((g) => {
            const max = g.max_score || 100;
            const pct = max ? Math.round((Number(g.score) / max) * 100) : 0;
            return (
              <Card key={g.id}>
                <CardContent className="flex items-start justify-between gap-4 p-5">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{isRTL ? (g.subject_ar || g.subject) : g.subject}</p>
                    <p className="mt-0.5 text-[13px] text-muted-foreground">
                      {nameFor(g.student_id)}
                      {g.assessment_name ? ` · ${isRTL ? (g.assessment_name_ar || g.assessment_name) : g.assessment_name}` : ''}
                      {g.term ? ` · ${g.term}` : ''}
                    </p>
                    {g.teacher_notes && <p className="mt-2 text-sm text-muted-foreground">{g.teacher_notes}</p>}
                    <div className="mt-3 h-1.5 w-40 overflow-hidden rounded-full bg-sand-alt">
                      <div
                        className="h-full rounded-full bg-forest-500"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="es-metric text-[28px] leading-none">
                      {g.score}
                      <span className="text-[15px] font-sans font-medium text-muted-foreground">/{max}</span>
                    </p>
                    {g.letter_grade && (
                      <div className="mt-2 flex justify-end">
                        <StatusPill tone={GRADE_TONE(pct)}>{g.letter_grade}</StatusPill>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
