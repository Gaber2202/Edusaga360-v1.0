import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase, fetchData } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { useLanguage } from '../lib/LanguageContext';
import { parentDisplayName } from '../lib/displayName';
import { useLinkedStudents, useParentScope } from '../lib/useParentData';
import {
  attendanceBreakdown,
  attendanceRate,
  attendanceTrend,
  averageScore,
  feesOutstanding,
  forStudent,
  homeworkCounts,
  latestSubjectScores,
} from '../lib/dashboardMetrics';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';
import IconTile from '../components/IconTile';
import ChildPills from '../components/ChildPills';
import TrendChart from '../components/TrendChart';
import SubjectBars from '../components/SubjectBars';
import StatusPill from '../components/StatusPill';
import {
  GraduationCap, ClipboardCheck, CreditCard, Bell, ChevronRight,
  FileText, MessageSquare, AlertTriangle,
} from 'lucide-react';

const sar = (n) => `SAR ${(Number(n) || 0).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function childName(student, isRTL) {
  return isRTL ? (student.name_ar || student.name_en) : (student.name_en || student.name_ar);
}

export default function Dashboard() {
  const { user } = useAuth();
  const { t, isRTL } = useLanguage();
  const { tenantId, linkedIds, enabled } = useParentScope();
  const { data: students = [] } = useLinkedStudents();
  const [childId, setChildId] = useState(null);
  const displayName = parentDisplayName(user);

  const { data: attendances = [] } = useQuery({
    queryKey: ['parent-attendance-summary', tenantId, linkedIds],
    queryFn: () => fetchData(
      supabase.from('attendances').select('id, status, student_id, date').eq('tenant_id', tenantId).in('student_id', linkedIds)
    ),
    enabled,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['parent-invoices-summary', tenantId, linkedIds],
    queryFn: () => fetchData(
      supabase.from('invoices').select('id, total_amount, paid_amount, status, due_date, student_id, document_type').eq('tenant_id', tenantId).in('student_id', linkedIds)
    ),
    enabled,
  });

  const { data: grades = [] } = useQuery({
    queryKey: ['parent-grades-summary', tenantId, linkedIds],
    queryFn: () => fetchData(
      supabase.from('student_grades').select('id, student_id, subject, subject_ar, score, max_score, created_at').eq('tenant_id', tenantId).in('student_id', linkedIds)
    ),
    enabled,
  });

  const { data: homework = [] } = useQuery({
    queryKey: ['parent-homework-summary', tenantId, linkedIds],
    queryFn: () => fetchData(
      supabase.from('homework_assignments').select('id, student_id, status, due_date').eq('tenant_id', tenantId).in('student_id', linkedIds)
    ),
    enabled,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ['parent-notifications', tenantId, user?.id],
    queryFn: () => fetchData(
      supabase.from('notifications').select('id, is_read').eq('tenant_id', tenantId).eq('user_id', user.id)
    ),
    enabled: !!tenantId && !!user?.id,
  });

  const scopedAttendances = childId ? forStudent(attendances, childId) : attendances;
  const scopedInvoices = childId ? forStudent(invoices, childId) : invoices;
  const scopedGrades = childId ? forStudent(grades, childId) : grades;
  const scopedHomework = childId ? forStudent(homework, childId) : homework;

  const rate = attendanceRate(scopedAttendances);
  const breakdown = attendanceBreakdown(scopedAttendances);
  const trend = useMemo(() => attendanceTrend(scopedAttendances), [scopedAttendances]);
  const avg = averageScore(scopedGrades);
  const subjects = useMemo(() => latestSubjectScores(scopedGrades, isRTL), [scopedGrades, isRTL]);
  const hw = homeworkCounts(scopedHomework);
  const outstanding = feesOutstanding(scopedInvoices);
  const unread = notifications.filter((n) => !n.is_read).length;

  if (!enabled || students.length === 0) {
    return (
      <div className="space-y-6">
        <section className="rounded-card bg-[#0B3A29] px-6 py-8 text-[#F5F0E4] shadow-card sm:px-8">
          <h1 className="text-balance text-[28px] font-semibold leading-[1.2] sm:text-[32px]">
            {t('welcome')}{isRTL ? '، ' : ', '}{displayName}
          </h1>
          <p className="mt-2 max-w-xl text-[15px] font-normal leading-relaxed text-[#C9D6CE]">
            {t('linkChildLead')}
          </p>
        </section>
        <EmptyState
          icon={GraduationCap}
          title={t('noStudentsLinked')}
          description={t('contactAdmin')}
          action={(
            <Button asChild>
              <Link to="/messages">
                {t('messageSchool')}
                <ChevronRight className="h-4 w-4 rtl:rotate-180" />
              </Link>
            </Button>
          )}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-card bg-[#0B3A29] px-6 py-7 text-[#F5F0E4] shadow-card sm:px-8">
        <h1 className="text-balance text-[28px] font-semibold leading-[1.2] sm:text-[32px]">
          {t('welcome')}{isRTL ? '، ' : ', '}{displayName}
        </h1>
        <p className="mt-2 max-w-xl text-[15px] font-normal leading-relaxed text-[#C9D6CE]">
          {t('parentPortalDashboard')}
        </p>
      </section>

      <ChildPills students={students} selectedId={childId} onChange={setChildId} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={ClipboardCheck} label={t('attendanceRate')} value={rate == null ? t('noDataYet') : `${rate}%`} />
        <StatCard icon={GraduationCap} label={t('averageGrade')} value={avg == null ? t('noDataYet') : `${avg}%`} />
        <StatCard
          icon={CreditCard}
          label={t('outstandingFees')}
          value={sar(outstanding)}
          highlight={outstanding > 0}
          tone={outstanding > 0 ? 'warn' : 'mint'}
        />
        <StatCard
          icon={FileText}
          label={t('homeworkOverdue')}
          value={hw.overdue}
          tone={hw.overdue > 0 ? 'danger' : 'mint'}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { key: 'present', value: breakdown.present, tone: 'success' },
          { key: 'late', value: breakdown.late, tone: 'warn' },
          { key: 'absent', value: breakdown.absent, tone: 'danger' },
          { key: 'excused', value: breakdown.excused, tone: 'muted' },
        ].map((item) => (
          <div key={item.key} className="rounded-card border border-[color:var(--es-border)] bg-card px-4 py-3 shadow-card">
            <p className="es-metric text-2xl">{item.value}</p>
            <div className="mt-1">
              <StatusPill tone={item.tone}>{t(item.key)}</StatusPill>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-ink">{t('attendanceTrend')}</p>
                <p className="text-[13px] text-muted-foreground">{t('attendanceTrendHint')}</p>
              </div>
              <p className="es-metric text-2xl">{rate == null ? '—' : `${rate}%`}</p>
            </div>
            {trend.length > 1 ? (
              <TrendChart data={trend} />
            ) : (
              <p className="py-8 text-sm text-muted-foreground">{t('attendanceWillAppear')}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-ink">{t('subjectScores')}</p>
                <p className="text-[13px] text-muted-foreground">{t('subjectScoresHint')}</p>
              </div>
              <p className="es-metric text-2xl">{avg == null ? '—' : `${avg}%`}</p>
            </div>
            {subjects.length > 0 ? (
              <SubjectBars items={subjects.slice(0, 6)} />
            ) : (
              <p className="py-8 text-sm text-muted-foreground">{t('progressWillAppear')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <p className="text-lg font-semibold text-ink">{t('homeworkSnapshot')}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-[12px] bg-sand p-4">
                <p className="es-metric text-2xl">{hw.assigned}</p>
                <p className="mt-1 text-[13px] font-medium text-ink">{t('assigned')}</p>
              </div>
              <div className="rounded-[12px] bg-sand p-4">
                <p className="es-metric text-2xl">{hw.submitted + hw.graded}</p>
                <p className="mt-1 text-[13px] font-medium text-ink">{t('submitted')}</p>
              </div>
              <div className="rounded-[12px] bg-sand p-4">
                <p className={`es-metric text-2xl ${hw.overdue > 0 ? 'text-gold-600' : ''}`}>{hw.overdue}</p>
                <p className="mt-1 text-[13px] font-medium text-ink">{t('overdue')}</p>
              </div>
              <div className="rounded-[12px] bg-sand p-4">
                <p className="es-metric text-2xl">{unread}</p>
                <p className="mt-1 text-[13px] font-medium text-ink">{t('notifications')}</p>
              </div>
            </div>
            <Link to="/homework" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
              {t('homework')}
              <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <p className="text-lg font-semibold text-ink">{t('myChildren')}</p>
            <div className="mt-4 space-y-3">
              {students.map((student) => {
                const childAtt = forStudent(attendances, student.id);
                const childGrades = forStudent(grades, student.id);
                const childFees = feesOutstanding(forStudent(invoices, student.id));
                const childHw = homeworkCounts(forStudent(homework, student.id));
                const childRate = attendanceRate(childAtt);
                const childAvg = averageScore(childGrades);
                return (
                  <div key={student.id} className="rounded-card bg-sand p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <IconTile>
                          <GraduationCap />
                        </IconTile>
                        <div>
                          <p className="font-semibold text-ink">{childName(student, isRTL)}</p>
                          <p className="text-[13px] text-muted-foreground">
                            {[student.grade, student.section].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </div>
                      {childHw.overdue > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[#A8443A]">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {childHw.overdue} {t('overdue')}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="es-metric text-lg">{childRate == null ? '—' : `${childRate}%`}</p>
                        <p className="text-[11px] text-muted-foreground">{t('attendance')}</p>
                      </div>
                      <div>
                        <p className="es-metric text-lg">{childAvg == null ? '—' : `${childAvg}%`}</p>
                        <p className="text-[11px] text-muted-foreground">{t('averageGrade')}</p>
                      </div>
                      <div>
                        <p className={`es-metric text-lg ${childFees > 0 ? 'text-gold-600' : ''}`}>{sar(childFees)}</p>
                        <p className="text-[11px] text-muted-foreground">{t('feesBilling')}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-primary">
                      <Link to="/progress" className="inline-flex items-center gap-1 hover:underline">
                        {t('viewProgress')}
                        <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
                      </Link>
                      <Link to="/attendance" className="inline-flex items-center gap-1 hover:underline">
                        {t('viewAttendance')}
                        <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
                      </Link>
                      <Link to="/fees" className="inline-flex items-center gap-1 hover:underline">
                        {t('viewFees')}
                        <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {unread > 0 ? (
        <Link
          to="/messages"
          className="flex items-center justify-between gap-3 rounded-card border border-[color:var(--es-border)] bg-card px-5 py-4 shadow-card"
        >
          <span className="flex items-center gap-3 text-sm font-medium text-ink">
            <Bell className="h-4 w-4 text-gold-600" />
            {unread} {t('notifications')}
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
            {t('messages')}
            <MessageSquare className="h-4 w-4" />
          </span>
        </Link>
      ) : null}
    </div>
  );
}
