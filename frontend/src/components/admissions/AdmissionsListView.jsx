import React, { useState } from 'react';
import { useLanguage } from '../LanguageContext';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Card } from '../ui/card';
import { format, differenceInDays } from 'date-fns';
import { Search, AlertTriangle, Eye, Edit } from 'lucide-react';

const GRADES = ['KG1','KG2','KG3','Grade1','Grade2','Grade3','Grade4','Grade5','Grade6','Grade7','Grade8','Grade9','Grade10','Grade11','Grade12'];

const STATUS_COLORS = {
  inquiry: 'bg-sand-alt text-ink',
  submitted: 'bg-najdi-50 text-najdi-900',
  pending: 'bg-najdi-50 text-najdi-900',
  under_review: 'bg-yellow-100 text-yellow-700',
  assessment: 'bg-purple-100 text-purple-700',
  interview: 'bg-indigo-100 text-indigo-700',
  committee: 'bg-orange-100 text-orange-700',
  accepted: 'bg-green-100 text-green-700',
  waitlist: 'bg-teal-100 text-teal-700',
  enrolled: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
};

const STATUS_LABELS_AR = {
  inquiry: 'استفسار', submitted: 'مقدَّم', pending: 'معلق',
  under_review: 'مراجعة', assessment: 'اختبار', interview: 'مقابلة',
  committee: 'اللجنة', accepted: 'مقبول', waitlist: 'انتظار',
  enrolled: 'ملتحق', rejected: 'مرفوض',
};

export default function AdmissionsListView({ applications, loading, branches: _branches, onView, onEdit, userRole }) {
  const { isRTL } = useLanguage();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');

  const filtered = applications.filter(app => {
    const q = search.toLowerCase();
    const matchSearch = !q || app.student_name_ar?.toLowerCase().includes(q) ||
      app.student_name_en?.toLowerCase().includes(q) ||
      app.application_number?.toLowerCase().includes(q) ||
      app.guardian_phone?.includes(q);
    const matchStatus = statusFilter === 'all' || app.status === statusFilter ||
      (statusFilter === 'submitted' && app.status === 'pending');
    const matchGrade = gradeFilter === 'all' || app.applying_for_grade === gradeFilter;
    return matchSearch && matchStatus && matchGrade;
  });

  const statusCounts = {};
  applications.forEach(a => {
    statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
          <Input
            placeholder={isRTL ? 'بحث بالاسم أو رقم الطلب أو الهاتف...' : 'Search by name, number, or phone...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${isRTL ? 'pr-9' : 'pl-9'} bg-white h-9`}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 bg-white h-9">
            <SelectValue placeholder={isRTL ? 'الحالة' : 'Status'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isRTL ? 'جميع الحالات' : 'All Status'}</SelectItem>
            {Object.entries(STATUS_LABELS_AR).map(([k,v]) => (
              <SelectItem key={k} value={k}>{isRTL ? v : k.charAt(0).toUpperCase() + k.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={gradeFilter} onValueChange={setGradeFilter}>
          <SelectTrigger className="w-36 bg-white h-9">
            <SelectValue placeholder={isRTL ? 'الصف' : 'Grade'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isRTL ? 'جميع الصفوف' : 'All Grades'}</SelectItem>
            {GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{isRTL ? `${filtered.length} طلب` : `${filtered.length} records`}</span>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">{isRTL ? 'رقم الطلب' : 'App #'}</TableHead>
                <TableHead>{isRTL ? 'الطالب' : 'Student'}</TableHead>
                <TableHead className="w-20">{isRTL ? 'الصف' : 'Grade'}</TableHead>
                <TableHead>{isRTL ? 'ولي الأمر' : 'Guardian'}</TableHead>
                <TableHead className="w-24">{isRTL ? 'تاريخ التقديم' : 'Date'}</TableHead>
                <TableHead className="w-20">{isRTL ? 'الأيام' : 'Days'}</TableHead>
                <TableHead className="w-28">{isRTL ? 'الحالة' : 'Status'}</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <div className="w-8 h-8 border-4 border-najdi-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    {isRTL ? 'لا توجد طلبات' : 'No applications found'}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(app => {
                  const days = differenceInDays(new Date(), new Date(app.created_at));
                  const isOverdue = days > 30;
                  return (
                    <TableRow key={app.id} className="cursor-pointer hover:bg-sand" onClick={() => onView(app)}>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">{app.application_number || '-'}</span>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-ink">{app.student_name_ar}</p>
                        {app.student_name_en && <p className="text-xs text-muted-foreground">{app.student_name_en}</p>}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{app.applying_for_grade}</span>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-ink">{app.guardian_name_ar}</p>
                        <p className="text-xs text-muted-foreground">{app.guardian_phone}</p>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {app.created_at ? format(new Date(app.created_at), 'dd/MM/yy') : '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className={`flex items-center gap-1 ${isOverdue ? 'text-red-500' : 'text-muted-foreground'}`}>
                          {isOverdue && <AlertTriangle className="w-3 h-3" />}
                          <span className="text-sm font-medium">{days}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[app.status] || 'bg-sand-alt text-muted-foreground'}`}>
                          {isRTL ? (STATUS_LABELS_AR[app.status] || app.status) : (app.status?.charAt(0).toUpperCase() + app.status?.slice(1))}
                        </span>
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onView(app)}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          {['admin', 'admissions'].includes(userRole) && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onEdit(app)}>
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}