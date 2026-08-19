import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, FileDown } from 'lucide-react';
import { supabase, fetchData } from '../lib/supabase';
import { useLanguage } from '../lib/LanguageContext';
import { useLinkedStudents, useParentScope } from '../lib/useParentData';
import { attendanceBreakdown, attendanceRate, attendanceTrend } from '../lib/dashboardMetrics';
import { applyAttendanceFilters, presetRange } from '../lib/attendanceFilters';
import { buildAttendanceReportHtml, printAttendanceReport } from '../lib/attendanceReport';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import ChildPills from '../components/ChildPills';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import LoadingCard from '../components/LoadingCard';
import StatusPill from '../components/StatusPill';
import TrendChart from '../components/TrendChart';
import AttendanceFilters from '../components/AttendanceFilters';

const STATUS_TONE = {
  present: 'success',
  absent: 'danger',
  late: 'warn',
  excused: 'muted',
};

const KPI_TONE = {
  present: 'text-forest-700',
  late: 'text-[#D08A24]',
  absent: 'text-[#A8443A]',
  excused: 'text-muted-foreground',
};

export default function Attendance() {
  const { t, isRTL, lang } = useLanguage();
  const { tenantId, linkedIds, enabled } = useParentScope();
  const { data: students = [] } = useLinkedStudents();
  const [childId, setChildId] = useState(null);
  const [status, setStatus] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const studentIds = childId ? [childId] : linkedIds;
  const locale = lang === 'ar' ? 'ar-SA' : 'en-GB';

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['parent-attendance', tenantId, studentIds],
    queryFn: () => fetchData(
      supabase.from('attendances')
        .select('id, student_id, date, status, notes, grade, section')
        .eq('tenant_id', tenantId)
        .in('student_id', studentIds)
        .order('date', { ascending: false })
    ),
    enabled,
  });

  const filtered = useMemo(
    () => applyAttendanceFilters(records, { status, from, to }),
    [records, status, from, to],
  );
  const rate = attendanceRate(filtered);
  const breakdown = attendanceBreakdown(filtered);
  const trend = attendanceTrend(filtered, 14);

  const nameFor = (id) => {
    const student = students.find((row) => row.id === id);
    return isRTL ? (student?.name_ar || student?.name_en) : (student?.name_en || student?.name_ar) || '—';
  };

  const childLabel = childId ? nameFor(childId) : t('allChildren');

  const formatDate = (value) => (
    value ? new Date(value).toLocaleDateString(locale) : '—'
  );

  const clearFilters = () => {
    setStatus('all');
    setFrom('');
    setTo('');
  };

  const exportPdf = () => {
    const rangeLabel = from || to
      ? `${from ? formatDate(from) : '…'} – ${to ? formatDate(to) : '…'}`
      : t('allDates');

    printAttendanceReport(buildAttendanceReportHtml({
      title: t('attendanceReport'),
      subtitle: childLabel,
      generatedLabel: `${t('generatedOn')}: ${new Date().toLocaleString(locale)}`,
      rateLabel: t('attendanceRate'),
      rate: rate == null ? '—' : `${rate}%`,
      columns: [t('date'), t('student'), t('status'), t('notes')],
      rows: filtered.map((row) => [
        formatDate(row.date),
        nameFor(row.student_id),
        t(row.status) || row.status,
        row.notes || '—',
      ]),
      meta: [
        { label: t('childLabel'), value: childLabel },
        { label: t('filterStatus'), value: status === 'all' ? t('allStatuses') : t(status) },
        { label: t('date'), value: rangeLabel },
        { label: t('records'), value: String(filtered.length) },
        { label: t('present'), value: String(breakdown.present) },
        { label: t('late'), value: String(breakdown.late) },
        { label: t('absent'), value: String(breakdown.absent) },
        { label: t('excused'), value: String(breakdown.excused) },
      ],
      isRTL,
    }));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('parentPortalEyebrow')}
        title={t('attendanceRecords')}
        description={t('attendancePageHint')}
        action={(
          <div className="flex flex-wrap items-end gap-4">
            {rate != null ? (
              <div className="text-end">
                <p className="es-eyebrow">{t('attendanceRate')}</p>
                <p className="es-metric mt-1 text-[32px] leading-none">{rate}%</p>
              </div>
            ) : null}
            <Button type="button" onClick={exportPdf} disabled={filtered.length === 0}>
              <FileDown />
              {t('exportPdf')}
            </Button>
          </div>
        )}
      />
      <ChildPills students={students} selectedId={childId} onChange={setChildId} />

      {isLoading ? (
        <LoadingCard />
      ) : !enabled || records.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={t('attendanceWillAppear')}
          description={t('attendanceDataNote')}
        />
      ) : (
        <>
          <Card>
            <CardContent className="p-6">
              <AttendanceFilters
                status={status}
                from={from}
                to={to}
                onStatusChange={setStatus}
                onFromChange={setFrom}
                onToChange={setTo}
                onPreset={(preset) => {
                  const range = presetRange(preset);
                  setFrom(range.from);
                  setTo(range.to);
                }}
                onClear={clearFilters}
                resultCount={filtered.length}
              />
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {['present', 'late', 'absent', 'excused'].map((key) => (
              <Card key={key}>
                <CardContent className="p-4">
                  <p className={`es-metric text-2xl ${KPI_TONE[key]}`}>{breakdown[key]}</p>
                  <p className="mt-1 text-[13px] font-medium text-ink">{t(key)}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {trend.length > 1 ? (
            <Card>
              <CardContent className="p-6">
                <div className="mb-2 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-ink">{t('attendanceTrend')}</p>
                    <p className="text-[13px] text-muted-foreground">{t('attendanceTrendHint')}</p>
                  </div>
                  <p className="es-metric text-2xl">{rate}%</p>
                </div>
                <TrendChart data={trend} />
              </CardContent>
            </Card>
          ) : null}

          {filtered.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title={t('noMatchingAttendance')}
              description={t('noMatchingAttendanceHint')}
              action={(
                <Button type="button" variant="outline" onClick={clearFilters}>
                  {t('clearFilters')}
                </Button>
              )}
            />
          ) : (
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <table className="es-table w-full">
                  <thead>
                    <tr>
                      <th>{t('date')}</th>
                      <th>{t('student')}</th>
                      <th>{t('status')}</th>
                      <th>{t('notes')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr key={row.id}>
                        <td className="text-[13px]">{formatDate(row.date)}</td>
                        <td className="text-[13px]">{nameFor(row.student_id)}</td>
                        <td>
                          <StatusPill tone={STATUS_TONE[row.status] || 'muted'}>
                            {t(row.status) || row.status}
                          </StatusPill>
                        </td>
                        <td className="text-[13px] text-muted-foreground">{row.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
