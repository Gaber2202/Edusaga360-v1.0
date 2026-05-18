/**
 * AbsenceManager — Tracks unauthorised absences, excuse submission/review,
 * MOE threshold warnings (10 days flag, 15 days warn, 20 days = fail risk)
 */
import React, { useState } from 'react';
import { useLanguage } from '../LanguageContext';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { AlertTriangle, CheckCircle, XCircle, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { tenantQuery } from '../../api/supabaseClient';

const MOE_FLAG = 10;
const MOE_WARN = 15;
const MOE_FAIL = 20;

const _ABSENCE_TYPES = [
  { value: 'sick',          ar: 'مرض',          en: 'Sick' },
  { value: 'personal',      ar: 'شخصي',         en: 'Personal' },
  { value: 'family_event',  ar: 'مناسبة عائلية', en: 'Family Event' },
  { value: 'unauthorized',  ar: 'بدون عذر',      en: 'Unauthorized' },
  { value: 'suspension',    ar: 'إيقاف',         en: 'Suspension' },
];

function getMOEStatus(unauthorizedCount) {
  if (unauthorizedCount >= MOE_FAIL) return { label: 'FAIL RISK', ar: 'خطر الرسوب', color: 'bg-red-100 text-red-800 border-red-300' };
  if (unauthorizedCount >= MOE_WARN) return { label: 'Warning', ar: 'تحذير', color: 'bg-orange-100 text-orange-800 border-orange-300' };
  if (unauthorizedCount >= MOE_FLAG) return { label: 'Flagged', ar: 'مُعلَّم', color: 'bg-amber-100 text-amber-800 border-amber-300' };
  return null;
}

export default function AbsenceManager({ attendanceRecords, students, onRefresh }) {
  const { isRTL } = useLanguage();
  const [saving, setSaving] = useState(false);

  // Aggregate absence stats per student
  const studentStats = students.map(s => {
    const records = attendanceRecords.filter(r => r.student_id === s.id);
    const totalAbsent = records.filter(r => r.status === 'absent').length;
    const excused = records.filter(r => r.status === 'excused').length;
    const unauthorized = records.filter(r => r.status === 'absent' && !r.excuse_approved).length;
    const late = records.filter(r => r.status === 'late').length;
    const total = records.length;
    const pct = total > 0 ? Math.round(((total - totalAbsent) / total) * 100) : 100;
    return { ...s, totalAbsent, excused, unauthorized, late, total, pct, records };
  }).filter(s => s.totalAbsent > 0 || s.late > 0);

  const chronicStudents = studentStats.filter(s => s.pct < 80);
  const flaggedStudents = studentStats.filter(s => s.unauthorized >= MOE_FLAG);

  const handleApproveExcuse = async (record) => {
    setSaving(true);
    try {
      await tenantQuery('student_attendances').update({
        status: 'excused',
        excuse_approved: true,
        excuse_approved_date: format(new Date(), 'yyyy-MM-dd'),
      });
      toast.success(isRTL ? 'تم قبول العذر' : 'Excuse approved');
      onRefresh?.();
    } finally { setSaving(false); }
  };

  const handleRejectExcuse = async (record) => {
    await tenantQuery('student_attendances').update({
      excuse_approved: false,
      excuse_reviewed: true,
    });
    toast.success(isRTL ? 'تم رفض العذر' : 'Excuse rejected');
    onRefresh?.();
  };

  // Pending excuses (parent submitted but not yet reviewed)
  const pendingExcuses = attendanceRecords.filter(r =>
    r.status === 'absent' && r.excuse_submitted && !r.excuse_reviewed
  );

  return (
    <div className="space-y-4">

      {/* MOE threshold alerts */}
      {flaggedStudents.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-2">
          <p className="font-semibold text-red-700 flex items-center gap-2 text-sm">
            <AlertTriangle className="w-4 h-4" />
            {isRTL ? 'تنبيهات لوائح وزارة التعليم (نظام نور)' : 'MOE Regulation Alerts (NOOR System)'}
          </p>
          {flaggedStudents.map(s => {
            const moe = getMOEStatus(s.unauthorized);
            return moe ? (
              <div key={s.id} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm ${moe.color}`}>
                <span className="font-medium">{s.name_ar}</span>
                <div className="flex items-center gap-3">
                  <span>{s.unauthorized} {isRTL ? 'غياب بدون عذر' : 'unauthorized absences'}</span>
                  <span className="font-bold">{isRTL ? moe.ar : moe.label}</span>
                </div>
              </div>
            ) : null;
          })}
        </div>
      )}

      {/* Chronic absenteeism */}
      {chronicStudents.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {isRTL ? 'طلاب بنسبة حضور أقل من 80%' : 'Chronic Absenteeism (below 80%)'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {chronicStudents.map(s => (
                <div key={s.id} className="flex items-center justify-between p-2 bg-amber-50 rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{s.name_ar}</p>
                    <p className="text-xs text-slate-500">{s.grade} · {s.totalAbsent} {isRTL ? 'يوم غياب' : 'absent days'}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${s.pct < 70 ? 'text-red-600' : 'text-amber-600'}`}>{s.pct}%</p>
                    <p className="text-xs text-slate-400">{isRTL ? 'نسبة الحضور' : 'attendance'}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending excuse reviews */}
      {pendingExcuses.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" />
              {isRTL ? 'أعذار بانتظار المراجعة' : 'Pending Excuse Reviews'}
              <span className="ms-auto bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{pendingExcuses.length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingExcuses.map(r => (
                <div key={r.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <div>
                    <p className="font-medium text-sm">{r.student_name}</p>
                    <p className="text-xs text-slate-500">{r.date} · {r.excuse_reason || (isRTL ? 'لا سبب محدد' : 'No reason given')}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleApproveExcuse(r)} disabled={saving}
                      className="h-7 bg-green-600 hover:bg-green-700 text-white text-xs">
                      <CheckCircle className="w-3 h-3 me-1" />{isRTL ? 'قبول' : 'Approve'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleRejectExcuse(r)} disabled={saving}
                      className="h-7 text-red-600 border-red-300 hover:bg-red-50 text-xs">
                      <XCircle className="w-3 h-3 me-1" />{isRTL ? 'رفض' : 'Reject'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Absence summary table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{isRTL ? 'ملخص الغياب' : 'Absence Summary'}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isRTL ? 'الطالب' : 'Student'}</TableHead>
                <TableHead className="text-center">{isRTL ? 'غياب' : 'Absent'}</TableHead>
                <TableHead className="text-center">{isRTL ? 'بعذر' : 'Excused'}</TableHead>
                <TableHead className="text-center">{isRTL ? 'بدون عذر' : 'Unexcused'}</TableHead>
                <TableHead className="text-center">{isRTL ? 'تأخر' : 'Late'}</TableHead>
                <TableHead className="text-center">{isRTL ? 'نسبة' : 'Rate'}</TableHead>
                <TableHead>{isRTL ? 'وزارة التعليم' : 'MOE'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {studentStats.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-400">
                  {isRTL ? 'لا بيانات غياب' : 'No absence data'}
                </TableCell></TableRow>
              ) : studentStats.map(s => {
                const moe = getMOEStatus(s.unauthorized);
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <p className="font-medium text-sm">{s.name_ar}</p>
                      <p className="text-xs text-slate-400">{s.grade}</p>
                    </TableCell>
                    <TableCell className="text-center font-semibold text-red-600">{s.totalAbsent}</TableCell>
                    <TableCell className="text-center text-blue-600">{s.excused}</TableCell>
                    <TableCell className="text-center font-semibold text-orange-600">{s.unauthorized}</TableCell>
                    <TableCell className="text-center text-amber-600">{s.late}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center gap-1.5 justify-center">
                        <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${s.pct >= 90 ? 'bg-green-500' : s.pct >= 80 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${s.pct}%` }} />
                        </div>
                        <span className={`text-xs font-bold ${s.pct < 80 ? 'text-red-600' : 'text-slate-600'}`}>{s.pct}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {moe ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${moe.color}`}>
                          {isRTL ? moe.ar : moe.label}
                        </span>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}