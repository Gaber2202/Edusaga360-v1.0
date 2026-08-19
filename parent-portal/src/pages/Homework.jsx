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
import { FileText } from 'lucide-react';

const STATUS_TONE = {
  assigned: 'muted',
  submitted: 'success',
  graded: 'gold',
  overdue: 'danger',
};

export default function Homework() {
  const { t, isRTL, lang } = useLanguage();
  const { tenantId, linkedIds, enabled } = useParentScope();
  const { data: students = [] } = useLinkedStudents();
  const [childId, setChildId] = useState(null);
  const studentIds = childId ? [childId] : linkedIds;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['parent-homework', tenantId, studentIds],
    queryFn: () => fetchData(
      supabase.from('homework_assignments')
        .select('*')
        .eq('tenant_id', tenantId)
        .in('student_id', studentIds)
        .order('due_date', { ascending: false })
    ),
    enabled,
  });

  const nameFor = (id) => {
    const s = students.find((st) => st.id === id);
    return isRTL ? (s?.name_ar || s?.name_en) : (s?.name_en || s?.name_ar) || '—';
  };

  const statusOf = (hw) => {
    if (hw.status === 'submitted' || hw.status === 'graded') return hw.status;
    if (hw.due_date && new Date(hw.due_date) < new Date() && hw.status === 'assigned') return 'overdue';
    return hw.status || 'assigned';
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t('parentPortalEyebrow')} title={t('homeworkAssignments')} />
      <ChildPills students={students} selectedId={childId} onChange={setChildId} />

      {isLoading ? (
        <LoadingCard />
      ) : !enabled || rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t('homeworkWillAppear')}
          description={t('homeworkNote')}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((hw) => {
            const st = statusOf(hw);
            return (
              <Card key={hw.id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-ink">{isRTL ? (hw.title_ar || hw.title_en) : hw.title_en}</p>
                      <p className="mt-0.5 text-[13px] text-muted-foreground">
                        {nameFor(hw.student_id)}
                        {' · '}
                        {isRTL ? (hw.subject_ar || hw.subject) : hw.subject}
                        {hw.teacher_name ? ` · ${hw.teacher_name}` : ''}
                      </p>
                    </div>
                    <StatusPill tone={STATUS_TONE[st] || 'muted'}>
                      {t(st) || st}
                    </StatusPill>
                  </div>
                  {(hw.description_en || hw.description_ar) && (
                    <p className="mt-2 text-[15px] font-light leading-relaxed text-muted-foreground">
                      {isRTL ? (hw.description_ar || hw.description_en) : hw.description_en}
                    </p>
                  )}
                  {hw.due_date && (
                    <p className="mt-3 text-[13px] text-muted-foreground">
                      {t('due')}: {new Date(hw.due_date).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB')}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
