import React, { useState, useEffect } from 'react';
import { tenantQuery } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useTenant } from '../TenantContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Loader2, TrendingUp } from 'lucide-react';

export default function AcademicRecords({ student }) {
  const { isRTL } = useLanguage();
  const { tenant } = useTenant();
  const [attendance, setAttendance] = useState([]);
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!student?.id) return;

    const fetchAcademicData = async () => {
      try {
        setLoading(true);

        // Fetch attendance records
        const { data: attendanceData = [] } = await tenantQuery('attendances').select('*').match({
          student_id: student.id,
          tenant_id: tenant?.id
        }).order('date', { ascending: false }).limit(50);
        setAttendance(attendanceData || []);

        // Fetch student grades if entity exists
        try {
          const { data: gradeData = [] } = await tenantQuery('student_grades').select('*').match({
            student_id: student.id,
            tenant_id: tenant?.id
          }).order('created_date', { ascending: false }).limit(20);
          setGrades(gradeData || []);
        } catch {
          // StudentGrade entity might not exist
          setGrades([]);
        }
      } catch (error) {
        console.error('Error fetching academic data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAcademicData();
  }, [student?.id, tenant?.id]);

  if (!student) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-slate-600">
          {isRTL ? 'يرجى اختيار طالب' : 'Please select a student'}
        </CardContent>
      </Card>
    );
  }

  // Calculate attendance statistics
  const totalDays = attendance.length;
  const presentDays = attendance.filter(a => a.status === 'present').length;
  const attendanceRate = totalDays > 0 ? ((presentDays / totalDays) * 100).toFixed(1) : 0;

  const statusBadgeColor = (status) => {
    const colors = {
      present: 'bg-green-100 text-green-800',
      absent: 'bg-red-100 text-red-800',
      late: 'bg-yellow-100 text-yellow-800',
      excused: 'bg-blue-100 text-blue-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-4">
      {/* Student Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {isRTL ? 'معلومات الطالب' : 'Student Information'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-slate-600">{isRTL ? 'الاسم' : 'Name'}</p>
              <p className="font-medium">{isRTL ? student.name_ar : student.name_en || student.name_ar}</p>
            </div>
            <div>
              <p className="text-sm text-slate-600">{isRTL ? 'الصف' : 'Grade'}</p>
              <p className="font-medium">{student.grade}</p>
            </div>
            <div>
              <p className="text-sm text-slate-600">{isRTL ? 'الشعبة' : 'Section'}</p>
              <p className="font-medium">{student.section}</p>
            </div>
            <div>
              <p className="text-sm text-slate-600">{isRTL ? 'الحالة' : 'Status'}</p>
              <Badge className="mt-1">
                {isRTL 
                  ? student.status === 'active' ? 'نشط' : 'غير نشط'
                  : student.status === 'active' ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendance Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            {isRTL ? 'ملخص الحضور' : 'Attendance Summary'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900">{attendanceRate}%</p>
              <p className="text-xs text-slate-600">{isRTL ? 'معدل الحضور' : 'Attendance Rate'}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{presentDays}</p>
              <p className="text-xs text-slate-600">{isRTL ? 'أيام حاضر' : 'Days Present'}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">
                {attendance.filter(a => a.status === 'absent').length}
              </p>
              <p className="text-xs text-slate-600">{isRTL ? 'أيام غائب' : 'Days Absent'}</p>
            </div>
          </div>

          {/* Recent Attendance */}
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-slate-900" />
            </div>
          ) : attendance.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">
                {isRTL ? 'السجل الحديث (آخر 10 أيام)' : 'Recent Records (Last 10 Days)'}
              </p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {attendance.slice(0, 10).map((record) => (
                  <div key={record.id} className="flex items-center justify-between py-1 px-2 bg-slate-50 rounded">
                    <span className="text-sm text-slate-600">
                      {new Date(record.date).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US')}
                    </span>
                    <Badge className={statusBadgeColor(record.status)}>
                      {record.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center py-4 text-slate-500 text-sm">
              {isRTL ? 'لا توجد بيانات حضور' : 'No attendance records'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Academic Performance / Grades */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {isRTL ? 'الدرجات والتقييمات' : 'Grades & Assessments'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-slate-900" />
            </div>
          ) : grades.length > 0 ? (
            <div className="space-y-3">
              {grades.map((grade) => (
                <div key={grade.id} className="border border-slate-200 rounded p-3">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium text-slate-900">{grade.subject || grade.assessment_name}</span>
                    <span className="text-lg font-bold text-blue-600">{grade.score || grade.grade}/100</span>
                  </div>
                  {grade.teacher_notes && (
                    <p className="text-sm text-slate-600 mt-2">{grade.teacher_notes}</p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(grade.created_date).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US')}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-8 text-slate-500">
              {isRTL ? 'لم يتم تسجيل أي درجات حتى الآن' : 'No grades recorded yet'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}