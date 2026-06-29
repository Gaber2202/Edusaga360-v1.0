import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import PageHeader from '../components/ui/PageHeader';
import { format } from 'date-fns';
import { 
  CalendarIcon, 
  Check, 
  X, 
  Clock, 
  AlertCircle,
  Save,
  Loader2,
  Search,
  Download
} from 'lucide-react';
import { toast } from 'sonner';
import { useTenantFilter } from '../hooks/useTenantFilter';

const GRADES = ['KG1', 'KG2', 'KG3', 'Grade1', 'Grade2', 'Grade3', 'Grade4', 'Grade5', 'Grade6', 'Grade7', 'Grade8', 'Grade9', 'Grade10', 'Grade11', 'Grade12'];

export default function Attendance() {
  const { t, isRTL } = useLanguage();
  const { userRole, user } = useRole();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedGrade, setSelectedGrade] = useState('all');
  const [selectedSection, setSelectedSection] = useState('all');
  const [search, setSearch] = useState('');
  const [attendanceData, setAttendanceData] = useState({});
  const [saving, setSaving] = useState(false);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  const { data: students = [], isLoading: loadingStudents } = useQuery({
    queryKey: ['students', tenantId],
    queryFn: () => fetchData(tenantQuery('students').select('*').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const { data: existingAttendance = [], isLoading: loadingAttendance } = useQuery({
    queryKey: ['attendance', dateStr, tenantId],
    queryFn: () => fetchData(tenantQuery('attendances').select('*').match(tenantFilter({ date: dateStr }))),
    enabled: hasTenantAccess,
  });

  // Initialize attendance data from existing records
  React.useEffect(() => {
    const data = {};
    existingAttendance.forEach(record => {
      data[record.student_id] = {
        status: record.status,
        notes: record.notes || '',
        id: record.id
      };
    });
    setAttendanceData(data);
  }, [existingAttendance]);

  // Filter students based on role and filters
  const filteredStudents = useMemo(() => {
    let filtered = students;
    
    // Role-based filtering
    if (userRole === 'teacher') {
      const teacherGrades = user?.assigned_grades || [];
      const teacherSections = user?.assigned_sections || [];
      filtered = filtered.filter(s => 
        teacherGrades.includes(s.grade) || 
        teacherSections.includes(s.section)
      );
    }
    
    // Grade filter
    if (selectedGrade !== 'all') {
      filtered = filtered.filter(s => s.grade === selectedGrade);
    }
    
    // Section filter
    if (selectedSection !== 'all') {
      filtered = filtered.filter(s => s.section === selectedSection);
    }
    
    // Search filter
    if (search) {
      filtered = filtered.filter(s => 
        s.name_ar?.toLowerCase().includes(search.toLowerCase()) ||
        s.name_en?.toLowerCase().includes(search.toLowerCase()) ||
        s.student_id?.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    return filtered;
  }, [students, selectedGrade, selectedSection, search, userRole, user]);

  // Get unique sections
  const sections = useMemo(() => {
    const secs = new Set(students.map(s => s.section).filter(Boolean));
    return Array.from(secs).sort();
  }, [students]);

  const handleStatusChange = (studentId, status) => {
    setAttendanceData(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], status }
    }));
  };

  const markAllAs = (status) => {
    const newData = {};
    filteredStudents.forEach(student => {
      newData[student.id] = { 
        ...attendanceData[student.id],
        status 
      };
    });
    setAttendanceData(prev => ({ ...prev, ...newData }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const records = [];
      
      for (const student of filteredStudents) {
        const data = attendanceData[student.id];
        if (!data?.status) continue;
        
        const record = {
          student_id: student.id,
          student_name: student.name_ar,
          date: dateStr,
          status: data.status,
          grade: student.grade,
          section: student.section,
          notes: data.notes || '',
          marked_by: user?.email
        };
        
        if (data.id) {
          // Update existing record
          await tenantQuery('attendances').update(record);
        } else {
          // Create new record
          records.push(record);
        }
      }
      
      if (records.length > 0) {
        await supabase.Attendance.bulkCreate(records);
      }
      
      queryClient.invalidateQueries({ queryKey: ['attendance', dateStr] });
      toast.success(isRTL ? 'تم حفظ الحضور بنجاح' : 'Attendance saved successfully');
    } catch (error) {
      console.error('Error saving attendance:', error);
      toast.error(isRTL ? 'حدث خطأ أثناء الحفظ' : 'Error saving attendance');
    } finally {
      setSaving(false);
    }
  };

  const exportAttendance = () => {
    const headers = ['Student ID', 'Name', 'Grade', 'Section', 'Status', 'Date'];
    const rows = filteredStudents.map(s => [
      s.student_id,
      s.name_ar,
      s.grade,
      s.section,
      attendanceData[s.id]?.status || 'Not marked',
      dateStr
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `attendance_${dateStr}.csv`;
    link.click();
  };

  // Stats
  const stats = useMemo(() => {
    const marked = filteredStudents.filter(s => attendanceData[s.id]?.status);
    return {
      total: filteredStudents.length,
      present: marked.filter(s => attendanceData[s.id]?.status === 'present').length,
      absent: marked.filter(s => attendanceData[s.id]?.status === 'absent').length,
      late: marked.filter(s => attendanceData[s.id]?.status === 'late').length,
      excused: marked.filter(s => attendanceData[s.id]?.status === 'excused').length,
      marked: marked.length
    };
  }, [filteredStudents, attendanceData]);

  const StatusButton = ({ studentId, status, icon: Icon, activeColor, label }) => {
    const isActive = attendanceData[studentId]?.status === status;
    return (
      <button
        type="button"
        onClick={() => handleStatusChange(studentId, status)}
        className={`
          p-2 rounded-lg transition-all duration-200 flex items-center gap-1
          ${isActive 
            ? `${activeColor} text-white shadow-sm` 
            : 'bg-sand-alt text-muted-foreground hover:bg-sand-alt'
          }
        `}
        title={label}
      >
        <Icon className="w-4 h-4" />
      </button>
    );
  };

  if (userRole === 'parent') {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t('attendance')}
          subtitle={isRTL ? 'سجل حضور أبنائك' : 'Your children\'s attendance record'}
        />
        <p className="text-muted-foreground">
          {isRTL ? 'يمكنك مشاهدة سجل الحضور من صفحة الطلاب' : 'You can view attendance records from the Students page'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('markAttendance')}
        subtitle={isRTL ? 'تسجيل الحضور اليومي للطلاب' : 'Mark daily student attendance'}
      >
        <Button variant="outline" onClick={exportAttendance} className="gap-2">
          <Download className="w-4 h-4" />
          {t('export')}
        </Button>
      </PageHeader>

      {/* Date & Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex flex-wrap gap-3 flex-1">
          {/* Date Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto gap-2 bg-white">
                <CalendarIcon className="w-4 h-4" />
                {format(selectedDate, 'dd/MM/yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {/* Grade Filter */}
          <Select value={selectedGrade} onValueChange={setSelectedGrade}>
            <SelectTrigger className="w-full sm:w-48 bg-white">
              <SelectValue placeholder={t('grade')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isRTL ? 'جميع الصفوف' : 'All Grades'}</SelectItem>
              {GRADES.map(grade => (
                <SelectItem key={grade} value={grade}>{t(grade)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Section Filter */}
          <Select value={selectedSection} onValueChange={setSelectedSection}>
            <SelectTrigger className="w-full sm:w-40 bg-white">
              <SelectValue placeholder={t('section')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isRTL ? 'جميع الشعب' : 'All Sections'}</SelectItem>
              {sections.map(section => (
                <SelectItem key={section} value={section}>{section}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
            <Input
              placeholder={isRTL ? 'بحث...' : 'Search...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`}
            />
          </div>
        </div>

        {/* Save Button */}
        <Button 
          onClick={handleSave} 
          disabled={saving} 
          className="bg-najdi-900 hover:bg-najdi-900 gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t('save')}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-ink">{stats.total}</p>
          <p className="text-sm text-muted-foreground">{isRTL ? 'إجمالي' : 'Total'}</p>
        </Card>
        <Card className="p-4 text-center bg-emerald-50">
          <p className="text-2xl font-bold text-emerald-600">{stats.present}</p>
          <p className="text-sm text-emerald-600">{t('present')}</p>
        </Card>
        <Card className="p-4 text-center bg-red-50">
          <p className="text-2xl font-bold text-red-600">{stats.absent}</p>
          <p className="text-sm text-red-600">{t('absent')}</p>
        </Card>
        <Card className="p-4 text-center bg-amber-50">
          <p className="text-2xl font-bold text-amber-600">{stats.late}</p>
          <p className="text-sm text-amber-600">{t('late')}</p>
        </Card>
        <Card className="p-4 text-center bg-najdi-50">
          <p className="text-2xl font-bold text-najdi-700">{stats.excused}</p>
          <p className="text-sm text-najdi-700">{t('excused')}</p>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => markAllAs('present')} className="gap-2">
          <Check className="w-4 h-4" />
          {isRTL ? 'تحضير الجميع' : 'Mark All Present'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => markAllAs('absent')} className="gap-2 text-red-600">
          <X className="w-4 h-4" />
          {isRTL ? 'تغييب الجميع' : 'Mark All Absent'}
        </Button>
      </div>

      {/* Student List */}
      {loadingStudents || loadingAttendance ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredStudents.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          {isRTL ? 'لا يوجد طلاب' : 'No students found'}
        </Card>
      ) : (
        <div className="bg-white rounded-xl border border-border divide-y divide-border">
          {filteredStudents.map(student => (
            <div key={student.id} className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-full bg-sand-alt flex items-center justify-center overflow-hidden flex-shrink-0">
                  {student.photo_url ? (
                    <img src={student.photo_url} alt={student.name_ar} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm text-muted-foreground">{student.name_ar?.[0]}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-ink truncate">{student.name_ar}</p>
                  <p className="text-sm text-muted-foreground">
                    {t(student.grade)} {student.section && `- ${student.section}`}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <StatusButton
                  studentId={student.id}
                  status="present"
                  icon={Check}
                  activeColor="bg-emerald-500"
                  label={t('present')}
                />
                <StatusButton
                  studentId={student.id}
                  status="absent"
                  icon={X}
                  activeColor="bg-red-500"
                  label={t('absent')}
                />
                <StatusButton
                  studentId={student.id}
                  status="late"
                  icon={Clock}
                  activeColor="bg-amber-500"
                  label={t('late')}
                />
                <StatusButton
                  studentId={student.id}
                  status="excused"
                  icon={AlertCircle}
                  activeColor="bg-najdi-500"
                  label={t('excused')}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}