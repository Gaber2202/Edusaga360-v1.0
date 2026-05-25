import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { format } from 'date-fns';
import { Zap, AlertTriangle, FileText, CheckCircle } from 'lucide-react';
import BulkAttendanceMarker from '../components/attendance/BulkAttendanceMarker';
import AbsenceManager from '../components/attendance/AbsenceManager';
import AttendanceReports from '../components/attendance/AttendanceReports';

const GRADES = ['KG1','KG2','KG3','Grade1','Grade2','Grade3','Grade4','Grade5',
  'Grade6','Grade7','Grade8','Grade9','Grade10','Grade11','Grade12'];

export default function StudentAttendancePage() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();

  const [tab, setTab] = useState('mark');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedGrade, setSelectedGrade] = useState('Grade1');
  const [selectedSection, setSelectedSection] = useState('all');

  const { data: students = [] } = useQuery({
    queryKey: ['students', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('students').select('*').match(tenantFilter(branchFilter({ status: 'active' })))),
    enabled: hasTenantAccess,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ['sections', tenantId],
    queryFn: () => fetchData(tenantQuery('sections').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  // Attendance for selected date (used by bulk marker)
  const { data: todayAttendance = [], refetch: refetchToday } = useQuery({
    queryKey: ['studentAttendance', selectedDate, tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('student_attendances').select('*').match(tenantFilter(branchFilter({ date: selectedDate })))),
    enabled: hasTenantAccess,
  });

  // All attendance (for absence manager + reports) — last 120 days
  const { data: allAttendance = [], refetch: refetchAll } = useQuery({
    queryKey: ['allStudentAttendance', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('student_attendances').select('*').match(tenantFilter(branchFilter()))),
    enabled: hasTenantAccess,
  });

  const classStudents = filterByBranch(students).filter(s => {
    const matchGrade = s.grade === selectedGrade;
    const matchSection = selectedSection === 'all' || s.section === selectedSection;
    return matchGrade && matchSection;
  });

  const classSections = sections.filter(s => s.grade === selectedGrade);

  // Quick stats for today
  const todayClassRecords = todayAttendance.filter(r =>
    classStudents.some(s => s.id === r.student_id)
  );
  const markedCount = todayClassRecords.length;
  const presentCount = todayClassRecords.filter(r => r.status === 'present').length;
  const absentCount = todayClassRecords.filter(r => r.status === 'absent').length;
  const lateCount = todayClassRecords.filter(r => r.status === 'late').length;
  const allPresent = markedCount > 0 && absentCount === 0 && lateCount === 0;

  // Pending excuses count
  const pendingExcuses = allAttendance.filter(r =>
    r.status === 'absent' && r.excuse_submitted && !r.excuse_reviewed
  ).length;

  const handleRefresh = () => {
    refetchToday();
    refetchAll();
    queryClient.invalidateQueries({ queryKey: ['studentAttendance'] });
    queryClient.invalidateQueries({ queryKey: ['allStudentAttendance'] });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{isRTL ? 'حضور الطلاب' : 'Student Attendance'}</h1>
          <p className="text-sm text-slate-500">{isRTL ? 'تسجيل سريع · إدارة الغياب · تقارير وزارة التعليم' : 'Fast marking · Absence management · MOE reports'}</p>
        </div>
        {/* Class selector */}
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">{isRTL ? 'التاريخ' : 'Date'}</Label>
            <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-36 h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{isRTL ? 'الصف' : 'Grade'}</Label>
            <Select value={selectedGrade} onValueChange={v => { setSelectedGrade(v); setSelectedSection('all'); }}>
              <SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{GRADES.map(g => <SelectItem key={g} value={g}>{t(g)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{isRTL ? 'الشعبة' : 'Section'}</Label>
            <Select value={selectedSection} onValueChange={setSelectedSection}>
              <SelectTrigger className="w-28 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isRTL ? 'الكل' : 'All'}</SelectItem>
                {classSections.map(s => <SelectItem key={s.id} value={s.code || s.id}>{s.name_ar}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Quick stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="col-span-1">
          <CardContent className="p-3">
            <p className="text-xs text-slate-500">{isRTL ? 'الطلاب' : 'Students'}</p>
            <p className="text-2xl font-bold text-slate-800">{classStudents.length}</p>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="p-3">
            <p className="text-xs text-slate-500">{isRTL ? 'تم التسجيل' : 'Marked'}</p>
            <p className="text-2xl font-bold text-blue-600">{markedCount}</p>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="p-3">
            <p className="text-xs text-slate-500">{isRTL ? 'حاضر' : 'Present'}</p>
            <p className="text-2xl font-bold text-green-600">{presentCount}</p>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="p-3">
            <p className="text-xs text-slate-500">{isRTL ? 'غائب' : 'Absent'}</p>
            <p className="text-2xl font-bold text-red-600">{absentCount}</p>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="p-3">
            <p className="text-xs text-slate-500">{isRTL ? 'متأخر' : 'Late'}</p>
            <p className="text-2xl font-bold text-amber-600">{lateCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* All-present banner */}
      {allPresent && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-medium">
          <CheckCircle className="w-4 h-4" />
          {isRTL ? '✓ الجميع حاضرون — لا إشعارات مطلوبة' : '✓ Full attendance — no parent notifications needed'}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white border">
          <TabsTrigger value="mark">
            <Zap className="w-4 h-4 me-1 text-slate-600" />
            {isRTL ? 'تسجيل سريع' : 'Quick Mark'}
          </TabsTrigger>
          <TabsTrigger value="absences">
            <AlertTriangle className="w-4 h-4 me-1" />
            {isRTL ? 'إدارة الغياب' : 'Absences'}
            {pendingExcuses > 0 && (
              <span className="ms-1.5 bg-blue-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{pendingExcuses}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="reports">
            <FileText className="w-4 h-4 me-1" />
            {isRTL ? 'التقارير' : 'Reports'}
          </TabsTrigger>
        </TabsList>

        {/* QUICK MARK TAB */}
        <TabsContent value="mark" className="mt-4">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 mb-4 p-3 bg-slate-50 rounded-xl border text-sm text-slate-600">
              <Zap className="w-4 h-4 text-slate-500" />
              <span>
                {isRTL
                  ? `${t(selectedGrade)}${selectedSection !== 'all' ? ` — ${selectedSection}` : ''} · ${selectedDate} · ${classStudents.length} طالب`
                  : `${t(selectedGrade)}${selectedSection !== 'all' ? ` — ${selectedSection}` : ''} · ${selectedDate} · ${classStudents.length} students`}
              </span>
              {absentCount > 0 && (
                <span className="ms-auto text-xs text-red-600 font-medium">
                  {isRTL ? `${absentCount} غائب — إشعار أولياء الأمور خلال 15 دقيقة` : `${absentCount} absent — parent notifications within 15 min`}
                </span>
              )}
            </div>
            <BulkAttendanceMarker
              students={classStudents}
              existingRecords={todayAttendance}
              selectedDate={selectedDate}
              selectedGrade={selectedGrade}
              selectedSection={selectedSection}
              selectedBranchId={selectedBranchId}
              getTenantIdForCreate={getTenantIdForCreate}
              onSaved={handleRefresh}
            />
          </div>
        </TabsContent>

        {/* ABSENCES TAB */}
        <TabsContent value="absences" className="mt-4">
          <AbsenceManager
            attendanceRecords={allAttendance}
            students={filterByBranch(students)}
            onRefresh={handleRefresh}
          />
        </TabsContent>

        {/* REPORTS TAB */}
        <TabsContent value="reports" className="mt-4">
          <AttendanceReports
            attendanceRecords={allAttendance}
            students={filterByBranch(students)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}