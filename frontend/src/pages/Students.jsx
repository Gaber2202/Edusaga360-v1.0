import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import StudentForm from '../components/students/StudentForm';
import StudentDetails from '../components/students/StudentDetails';
import { Plus, Search, Filter, Download } from 'lucide-react';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';

const GRADES = ['KG1', 'KG2', 'KG3', 'Grade1', 'Grade2', 'Grade3', 'Grade4', 'Grade5', 'Grade6', 'Grade7', 'Grade8', 'Grade9', 'Grade10', 'Grade11', 'Grade12'];

export default function Students() {
  const { t, isRTL } = useLanguage();
  const { userRole, user } = useRole();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  
  const [showForm, setShowForm] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [viewingStudent, setViewingStudent] = useState(null);
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: students = [], isLoading } = useQuery({
    queryKey: ['students', tenantId],
    queryFn: () => fetchData(tenantQuery('students').select('*').match(tenantFilter(), '-created_date')),
    enabled: hasTenantAccess,
  });

  // Check URL params for direct student view
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const studentId = urlParams.get('id');
    if (studentId && students.length > 0) {
      const student = students.find(s => s.id === studentId);
      if (student) {
        setViewingStudent(student);
      }
    }
  }, [students]);

  // Filter students based on role
  const accessibleStudents = React.useMemo(() => {
    if (userRole === 'parent') {
      return students.filter(s => user?.linked_student_ids?.includes(s.id));
    }
    if (userRole === 'teacher') {
      const teacherGrades = user?.assigned_grades || [];
      const teacherSections = user?.assigned_sections || [];
      return students.filter(s => 
        teacherGrades.includes(s.grade) || 
        teacherSections.includes(s.section)
      );
    }
    return students;
  }, [students, userRole, user]);

  const filteredStudents = accessibleStudents.filter(student => {
    const matchesSearch = 
      student.name_ar?.toLowerCase().includes(search.toLowerCase()) ||
      student.name_en?.toLowerCase().includes(search.toLowerCase()) ||
      student.student_id?.toLowerCase().includes(search.toLowerCase()) ||
      student.national_id?.includes(search);
    
    const matchesGrade = gradeFilter === 'all' || student.grade === gradeFilter;
    const matchesStatus = statusFilter === 'all' || student.status === statusFilter;
    
    return matchesSearch && matchesGrade && matchesStatus;
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['students'] });
  };

  const exportToExcel = async () => {
    const headers = ['Student ID', 'Name (AR)', 'Name (EN)', 'Grade', 'Section', 'Status', 'National ID', 'Phone'];
    const rows = filteredStudents.map(s => [
      s.student_id,
      s.name_ar,
      s.name_en,
      s.grade,
      s.section,
      s.status,
      s.national_id,
      s.emergency_phone
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'students.csv';
    link.click();

    // Audit log
    await logAuditEvent({
      action: AuditActions.EXPORT,
      entityType: 'Student',
      entityId: 'bulk',
      page: 'Students',
      notes: `Exported ${filteredStudents.length} students to CSV`
    });
  };

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchData(tenantQuery('branches').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const columns = [
    {
      header: isRTL ? 'الطالب' : 'Student',
      cell: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
            {row.photo_url ? (
              <img src={row.photo_url} alt={row.name_ar} className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm text-slate-500">{row.name_ar?.[0]}</span>
            )}
          </div>
          <div>
            <p className="font-medium text-slate-900">{row.name_ar}</p>
            {row.student_id && (
              <p className="text-sm text-slate-500 font-mono">{row.student_id}</p>
            )}
          </div>
        </div>
      )
    },
    {
      header: t('grade'),
      cell: (row) => (
        <div>
          <p className="text-slate-900">{t(row.grade)}</p>
          {row.section && <p className="text-sm text-slate-500">{isRTL ? 'شعبة' : 'Section'} {row.section}</p>}
        </div>
      )
    },
    {
      header: t('branch'),
      cell: (row) => {
        const branch = branches.find(b => b.id === row.branch_id);
        return <span className="text-sm">{branch ? (isRTL ? branch.name_ar : branch.name_en || branch.name_ar) : '-'}</span>;
      }
    },
    {
      header: t('academicYear'),
      accessorKey: 'academic_year'
    },
    {
      header: t('nationalId'),
      accessorKey: 'national_id'
    },
    {
      header: t('status'),
      cell: (row) => <StatusBadge status={row.status} />
    },
    {
      header: t('actions'),
      cell: (row) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              setViewingStudent(row);
            }}
          >
            {isRTL ? 'عرض' : 'View'}
          </Button>
          {userRole === 'admin' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedStudent(row);
                setShowForm(true);
              }}
            >
              {t('edit')}
            </Button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('students')}
        subtitle={isRTL ? 'إدارة سجلات الطلاب' : 'Manage student records'}
        action={userRole === 'admin'}
        actionLabel={isRTL ? 'إضافة طالب' : 'Add Student'}
        actionIcon={Plus}
        onAction={() => {
          setSelectedStudent(null);
          setShowForm(true);
        }}
      >
        <Button variant="outline" onClick={exportToExcel} className="gap-2">
          <Download className="w-4 h-4" />
          {t('export')}
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
          <Input
            placeholder={isRTL ? 'بحث بالاسم أو رقم الطالب أو الهوية...' : 'Search by name, ID, or national ID...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`}
          />
        </div>
        <Select value={gradeFilter} onValueChange={setGradeFilter}>
          <SelectTrigger className="w-full sm:w-48 bg-white">
            <Filter className="w-4 h-4 me-2 text-slate-400" />
            <SelectValue placeholder={t('grade')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isRTL ? 'جميع الصفوف' : 'All Grades'}</SelectItem>
            {GRADES.map(grade => (
              <SelectItem key={grade} value={grade}>{t(grade)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40 bg-white">
            <SelectValue placeholder={t('status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isRTL ? 'جميع الحالات' : 'All Status'}</SelectItem>
            <SelectItem value="active">{t('active')}</SelectItem>
            <SelectItem value="inactive">{t('inactive')}</SelectItem>
            <SelectItem value="transferred">{t('transferred')}</SelectItem>
            <SelectItem value="graduated">{t('graduated')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-sm text-slate-500">
        <span>{isRTL ? 'إجمالي الطلاب:' : 'Total Students:'} <strong className="text-slate-900">{filteredStudents.length}</strong></span>
        <span>{t('active')}: <strong className="text-emerald-600">{filteredStudents.filter(s => s.status === 'active').length}</strong></span>
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={filteredStudents}
        loading={isLoading}
        onRowClick={(row) => setViewingStudent(row)}
        emptyMessage={isRTL ? 'لا يوجد طلاب' : 'No students found'}
      />

      {/* Student Form Dialog */}
      <StudentForm
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setSelectedStudent(null);
        }}
        onSuccess={handleRefresh}
        student={selectedStudent}
      />

      {/* Student Details Dialog */}
      <StudentDetails
        open={!!viewingStudent}
        onClose={() => setViewingStudent(null)}
        student={viewingStudent}
        onUpdate={handleRefresh}
      />
    </div>
  );
}