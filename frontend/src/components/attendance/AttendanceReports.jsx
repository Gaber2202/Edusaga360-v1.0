/**
 * AttendanceReports — Printable daily register, student summaries,
 * class comparison, chronic absenteeism report, MOE NOOR format export
 */
import React, { useState, useMemo } from 'react';
import { useLanguage } from '../LanguageContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Printer, Download, FileText, BarChart3, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

const GRADES = ['KG1','KG2','KG3','Grade1','Grade2','Grade3','Grade4','Grade5','Grade6','Grade7','Grade8','Grade9','Grade10','Grade11','Grade12'];

export default function AttendanceReports({ attendanceRecords, students }) {
  const { isRTL, t } = useLanguage();
  const [reportType, setReportType] = useState('daily');
  const [fromDate, setFromDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [filterGrade, setFilterGrade] = useState('all');

  const reportStudents = useMemo(() =>
    students.filter(s => filterGrade === 'all' || s.grade === filterGrade),
    [students, filterGrade]
  );

  const rangeRecords = useMemo(() =>
    attendanceRecords.filter(r => r.date >= fromDate && r.date <= toDate &&
      (filterGrade === 'all' || r.grade === filterGrade)),
    [attendanceRecords, fromDate, toDate, filterGrade]
  );

  // Student summary stats
  const studentSummaries = useMemo(() => reportStudents.map(s => {
    const recs = rangeRecords.filter(r => r.student_id === s.id);
    const present = recs.filter(r => r.status === 'present').length;
    const absent = recs.filter(r => r.status === 'absent').length;
    const late = recs.filter(r => r.status === 'late').length;
    const excused = recs.filter(r => r.status === 'excused').length;
    const total = recs.length;
    const pct = total > 0 ? Math.round((present / total) * 100) : 100;
    return { ...s, present, absent, late, excused, total, pct };
  }), [reportStudents, rangeRecords]);

  // Grade-level summary
  const gradeSummaries = useMemo(() => {
    const gradeMap = {};
    rangeRecords.forEach(r => {
      if (!gradeMap[r.grade]) gradeMap[r.grade] = { present: 0, absent: 0, late: 0, total: 0 };
      gradeMap[r.grade].total++;
      if (r.status === 'present') gradeMap[r.grade].present++;
      else if (r.status === 'absent') gradeMap[r.grade].absent++;
      else if (r.status === 'late') gradeMap[r.grade].late++;
    });
    return Object.entries(gradeMap).map(([grade, stats]) => ({
      grade,
      ...stats,
      pct: stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 100,
    }));
  }, [rangeRecords]);

  const handlePrint = () => window.print();

  const exportCSV = () => {
    const rows = [
      ['Student Name', 'Grade', 'Section', 'Present', 'Absent', 'Late', 'Excused', 'Total Days', 'Attendance %'],
      ...studentSummaries.map(s => [s.name_ar, s.grade, s.section || '', s.present, s.absent, s.late, s.excused, s.total, `${s.pct}%`]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `attendance_report_${fromDate}_${toDate}.csv`; a.click();
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">{isRTL ? 'نوع التقرير' : 'Report Type'}</Label>
          <Select value={reportType} onValueChange={setReportType}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">{isRTL ? 'الحضور اليومي' : 'Daily Register'}</SelectItem>
              <SelectItem value="summary">{isRTL ? 'ملخص الطالب' : 'Student Summary'}</SelectItem>
              <SelectItem value="grade">{isRTL ? 'مقارنة الصفوف' : 'Grade Comparison'}</SelectItem>
              <SelectItem value="chronic">{isRTL ? 'الغياب المزمن' : 'Chronic Absenteeism'}</SelectItem>
              <SelectItem value="moe">{isRTL ? 'تقرير وزارة التعليم (نور)' : 'MOE NOOR Report'}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{isRTL ? 'من' : 'From'}</Label>
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-40 h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{isRTL ? 'إلى' : 'To'}</Label>
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-40 h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{isRTL ? 'الصف' : 'Grade'}</Label>
          <Select value={filterGrade} onValueChange={setFilterGrade}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isRTL ? 'جميع الصفوف' : 'All Grades'}</SelectItem>
              {GRADES.map(g => <SelectItem key={g} value={g}>{t(g)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 ms-auto">
          <Button variant="outline" size="sm" onClick={handlePrint} className="h-9">
            <Printer className="w-4 h-4 me-1" />{isRTL ? 'طباعة' : 'Print'}
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} className="h-9">
            <Download className="w-4 h-4 me-1" />{isRTL ? 'تصدير CSV' : 'Export CSV'}
          </Button>
        </div>
      </div>

      {/* DAILY REGISTER */}
      {reportType === 'daily' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4" />
              {isRTL ? `كشف الحضور اليومي — ${fromDate}` : `Daily Attendance Register — ${fromDate}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>{isRTL ? 'الطالب' : 'Student'}</TableHead>
                  <TableHead>{isRTL ? 'الصف' : 'Grade'}</TableHead>
                  <TableHead>{isRTL ? 'الشعبة' : 'Section'}</TableHead>
                  <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead>{isRTL ? 'وقت الحضور' : 'Check-in'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportStudents.map((s, i) => {
                  const rec = rangeRecords.find(r => r.student_id === s.id && r.date === fromDate);
                  const status = rec?.status || 'not_marked';
                  const statusColor = { present: 'text-green-600', absent: 'text-red-600', late: 'text-amber-600', excused: 'text-blue-600', not_marked: 'text-slate-300' }[status];
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="text-slate-400 text-xs">{i + 1}</TableCell>
                      <TableCell><p className="font-medium text-sm">{s.name_ar}</p></TableCell>
                      <TableCell className="text-sm">{t(s.grade)}</TableCell>
                      <TableCell className="text-sm text-slate-500">{s.section || '—'}</TableCell>
                      <TableCell><span className={`font-semibold text-sm ${statusColor}`}>{isRTL ? { present: 'حاضر', absent: 'غائب', late: 'متأخر', excused: 'بعذر', not_marked: 'لم يُسجَّل' }[status] : status}</span></TableCell>
                      <TableCell className="text-xs text-slate-400">{rec?.check_in_time || '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* STUDENT SUMMARY */}
      {reportType === 'summary' && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{isRTL ? 'ملخص حضور الطلاب' : 'Student Attendance Summary'}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isRTL ? 'الطالب' : 'Student'}</TableHead>
                  <TableHead className="text-center">{isRTL ? 'حاضر' : 'Present'}</TableHead>
                  <TableHead className="text-center">{isRTL ? 'غائب' : 'Absent'}</TableHead>
                  <TableHead className="text-center">{isRTL ? 'متأخر' : 'Late'}</TableHead>
                  <TableHead className="text-center">{isRTL ? 'بعذر' : 'Excused'}</TableHead>
                  <TableHead className="text-center">{isRTL ? 'نسبة الحضور' : 'Attendance %'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentSummaries.sort((a, b) => a.pct - b.pct).map(s => (
                  <TableRow key={s.id} className={s.pct < 80 ? 'bg-red-50/30' : ''}>
                    <TableCell><p className="font-medium text-sm">{s.name_ar}</p><p className="text-xs text-slate-400">{s.grade}</p></TableCell>
                    <TableCell className="text-center text-green-600 font-semibold">{s.present}</TableCell>
                    <TableCell className="text-center text-red-600 font-semibold">{s.absent}</TableCell>
                    <TableCell className="text-center text-amber-600">{s.late}</TableCell>
                    <TableCell className="text-center text-blue-600">{s.excused}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center gap-2 justify-center">
                        <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${s.pct >= 90 ? 'bg-green-500' : s.pct >= 80 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${s.pct}%` }} />
                        </div>
                        <span className={`font-bold text-sm ${s.pct < 80 ? 'text-red-600' : 'text-slate-700'}`}>{s.pct}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* GRADE COMPARISON */}
      {reportType === 'grade' && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4" />{isRTL ? 'مقارنة الصفوف' : 'Grade Comparison'}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {gradeSummaries.sort((a, b) => a.pct - b.pct).map(g => (
                <div key={g.grade} className="flex items-center gap-3">
                  <span className="w-20 text-sm font-medium text-slate-700 flex-shrink-0">{t(g.grade)}</span>
                  <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full flex items-center ps-2 transition-all ${g.pct >= 90 ? 'bg-green-400' : g.pct >= 80 ? 'bg-amber-400' : 'bg-red-400'}`}
                      style={{ width: `${g.pct}%` }}>
                      {g.pct > 30 && <span className="text-xs text-white font-bold">{g.pct}%</span>}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 flex-shrink-0 w-28 text-end">
                    {g.present}/{g.total} {isRTL ? 'حاضر' : 'present'}
                  </div>
                </div>
              ))}
              {gradeSummaries.length === 0 && <p className="text-slate-400 text-sm text-center py-6">{isRTL ? 'لا بيانات' : 'No data'}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* CHRONIC ABSENTEEISM */}
      {reportType === 'chronic' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              {isRTL ? 'تقرير الغياب المزمن (أقل من 80%)' : 'Chronic Absenteeism Report (below 80%)'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isRTL ? 'الطالب' : 'Student'}</TableHead>
                  <TableHead>{isRTL ? 'الصف' : 'Grade'}</TableHead>
                  <TableHead className="text-center">{isRTL ? 'أيام الغياب' : 'Absent Days'}</TableHead>
                  <TableHead className="text-center">{isRTL ? 'نسبة الحضور' : 'Attendance %'}</TableHead>
                  <TableHead>{isRTL ? 'مستوى التدخل' : 'Intervention'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentSummaries.filter(s => s.pct < 80).sort((a, b) => a.pct - b.pct).map(s => (
                  <TableRow key={s.id}>
                    <TableCell><p className="font-medium text-sm">{s.name_ar}</p></TableCell>
                    <TableCell className="text-sm">{t(s.grade)}</TableCell>
                    <TableCell className="text-center font-bold text-red-600">{s.absent}</TableCell>
                    <TableCell className="text-center font-bold text-red-600">{s.pct}%</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.pct < 70 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {s.pct < 70 ? (isRTL ? 'تدخل عاجل' : 'Urgent') : (isRTL ? 'متابعة' : 'Monitor')}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {studentSummaries.filter(s => s.pct < 80).length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-400">{isRTL ? 'لا طلاب بغياب مزمن في هذه الفترة' : 'No chronic absenteeism in this period'}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* MOE NOOR FORMAT */}
      {reportType === 'moe' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{isRTL ? 'تقرير الحضور — صيغة نظام نور' : 'Attendance Report — NOOR System Format'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-4 bg-slate-50 rounded-xl text-xs font-mono space-y-2 text-slate-700 border">
              <p className="font-bold">{isRTL ? '# تقرير الحضور - نظام نور - وزارة التعليم' : '# NOOR SYSTEM ATTENDANCE EXPORT'}</p>
              <p>SCHOOL_CODE: [SCHOOL_CODE]</p>
              <p>ACADEMIC_YEAR: {new Date().getFullYear()}</p>
              <p>PERIOD: {fromDate} to {toDate}</p>
              <p>GRADE_FILTER: {filterGrade}</p>
              <p>TOTAL_STUDENTS: {reportStudents.length}</p>
              <p>GENERATED: {format(new Date(), 'yyyy-MM-dd HH:mm')}</p>
              <p>---</p>
              {studentSummaries.slice(0, 5).map(s => (
                <p key={s.id}>STUDENT_ID={s.student_id} | NAME={s.name_ar} | GRADE={s.grade} | ABSENT={s.absent} | EXCUSED={s.excused} | PCT={s.pct}%</p>
              ))}
              {studentSummaries.length > 5 && <p>... and {studentSummaries.length - 5} more records</p>}
            </div>
            <Button onClick={exportCSV} className="mt-3 w-full" variant="outline">
              <Download className="w-4 h-4 me-2" />{isRTL ? 'تحميل ملف CSV للرفع على نظام نور' : 'Download CSV for NOOR Upload'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}