import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import { Loader2, CheckCircle, XCircle, Clock, Users } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function EmployeeAttendance() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();
  
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedDept, setSelectedDept] = useState('all');
  const [saving, setSaving] = useState({}); // { empId: true/false }
  const [bulkSaving, setBulkSaving] = useState(false);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', tenantId, selectedBranchId],
    queryFn: () => tenantQuery('employees').select('*').match(tenantFilter(branchFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments', tenantId],
    queryFn: () => tenantQuery('departments').select('*').match(tenantFilter({ is_active: true })),
    enabled: hasTenantAccess,
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ['employeeAttendance', selectedDate, tenantId, selectedBranchId],
    queryFn: () => tenantQuery('employee_attendances').select('*').match(tenantFilter(branchFilter({ date: selectedDate }))),
    enabled: hasTenantAccess,
  });

  const filteredEmployees = filterByBranch(employees).filter(emp => 
    selectedDept === 'all' || emp.department_id === selectedDept
  );

  const handleMarkAttendance = async (empId, empName, status) => {
    setSaving(prev => ({ ...prev, [empId]: true }));
    try {
      const existing = attendance.find(a => a.employee_id === empId);
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      if (existing) {
        await tenantQuery('employee_attendances').update({ status, recorded_by: user.email });
      } else {
        const tid = getTenantIdForCreate();
        await tenantQuery('employee_attendances').insert({
          ...(tid && { tenant_id: tid }),
          employee_id: empId,
          employee_name: empName,
          date: selectedDate,
          branch_id: selectedBranchId || '',
          status,
          recorded_by: user.email
        });
      }
      queryClient.invalidateQueries({ queryKey: ['employeeAttendance', selectedDate] });
      toast.success(isRTL ? 'تم تسجيل الحضور' : 'Attendance recorded');
    } catch (error) {
      console.error('Attendance error:', error);
      toast.error(isRTL ? `حدث خطأ: ${error.message}` : `Error: ${error.message}`);
    } finally {
      setSaving(prev => ({ ...prev, [empId]: false }));
    }
  };

  const handleMarkAll = async (status) => {
    setBulkSaving(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const unmarked = filteredEmployees.filter(e => !attendance.find(a => a.employee_id === e.id));
      const updates = filteredEmployees.filter(e => attendance.find(a => a.employee_id === e.id));
      await Promise.all([
        ...unmarked.map(e => {
          const tid = getTenantIdForCreate();
          return tenantQuery('employee_attendances').insert({
            ...(tid && { tenant_id: tid }),
            employee_id: e.id, employee_name: e.name_ar, date: selectedDate,
            branch_id: selectedBranchId || '', status, recorded_by: user.email
          });
        }),
        ...updates.map(e => {
          const rec = attendance.find(a => a.employee_id === e.id);
          return tenantQuery('employee_attendances').update({ status, recorded_by: user.email });
        })
      ]);
      queryClient.invalidateQueries({ queryKey: ['employeeAttendance', selectedDate] });
      toast.success(isRTL ? `تم تسجيل الكل كـ "${status}"` : `All marked as "${status}"`);
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setBulkSaving(false);
    }
  };

  const getAttendanceStatus = (empId) => {
    const record = attendance.find(a => a.employee_id === empId && a.date === selectedDate);
    return record?.status || null;
  };

  const columns = [
    { header: isRTL ? 'الموظف' : 'Employee', cell: (row) => <div><p className="font-medium">{row.name_ar}</p><p className="text-sm text-slate-500">{row.employee_id}</p></div> },
    { header: isRTL ? 'القسم' : 'Department', cell: (row) => departments.find(d => d.id === row.department_id)?.name_ar || '-' },
    { header: isRTL ? 'الحضور' : 'Attendance', cell: (row) => {
      const status = getAttendanceStatus(row.id);
      return status ? <StatusBadge status={status} /> : <span className="text-slate-400">{isRTL ? 'لم يتم التسجيل' : 'Not marked'}</span>;
    }},
    { header: t('actions'), cell: (row) => {
      const status = getAttendanceStatus(row.id);
      const isRowSaving = saving[row.id];
      return (
        <div className="flex gap-1 flex-wrap">
          {['present','absent','late','excused'].map((s) => {
            const labels = { present: isRTL ? 'حاضر' : 'Present', absent: isRTL ? 'غائب' : 'Absent', late: isRTL ? 'متأخر' : 'Late', excused: isRTL ? 'بعذر' : 'Excused' };
            const icons = { present: CheckCircle, absent: XCircle, late: Clock, excused: Clock };
            const IconComp = icons[s];
            const colors = { present: 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-500', absent: 'bg-red-500 hover:bg-red-600 text-white border-red-500', late: 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500', excused: 'bg-blue-500 hover:bg-blue-600 text-white border-blue-500' };
            return (
              <Button key={s} size="sm"
                className={status === s ? colors[s] : ''}
                variant={status === s ? 'default' : 'outline'}
                onClick={() => handleMarkAttendance(row.id, row.name_ar, s)}
                disabled={isRowSaving}
              >
                {isRowSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <IconComp className="w-3 h-3 me-1" />}
                {labels[s]}
              </Button>
            );
          })}
        </div>
      );
    }}
  ];

  const stats = {
    total: filteredEmployees.length,
    present: attendance.filter(a => a.status === 'present').length,
    absent: attendance.filter(a => a.status === 'absent').length,
    late: attendance.filter(a => a.status === 'late').length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'حضور الموظفين' : 'Employee Attendance'}
        subtitle={isRTL ? 'تسجيل وإدارة حضور الموظفين' : 'Track and manage employee attendance'}
      />

      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-sm text-slate-500">{isRTL ? 'إجمالي الموظفين' : 'Total'}</p><p className="text-2xl font-bold">{stats.total}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-slate-500">{isRTL ? 'حاضر' : 'Present'}</p><p className="text-2xl font-bold text-emerald-600">{stats.present}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-slate-500">{isRTL ? 'غائب' : 'Absent'}</p><p className="text-2xl font-bold text-red-600">{stats.absent}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-slate-500">{isRTL ? 'متأخر' : 'Late'}</p><p className="text-2xl font-bold text-amber-600">{stats.late}</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label>{t('date')}</Label>
          <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-48" />
        </div>
        <div className="space-y-2">
          <Label>{isRTL ? 'القسم' : 'Department'}</Label>
          <Select value={selectedDept} onValueChange={setSelectedDept}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('all')}</SelectItem>
              {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name_ar}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 ms-auto">
          <Button size="sm" variant="outline" onClick={() => handleMarkAll('present')} disabled={bulkSaving} className="text-emerald-600 border-emerald-300 hover:bg-emerald-50">
            {bulkSaving ? <Loader2 className="w-4 h-4 animate-spin me-1" /> : <Users className="w-4 h-4 me-1" />}
            {isRTL ? 'تسجيل الكل حاضر' : 'All Present'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleMarkAll('absent')} disabled={bulkSaving} className="text-red-600 border-red-300 hover:bg-red-50">
            {isRTL ? 'تسجيل الكل غائب' : 'All Absent'}
          </Button>
        </div>
      </div>

      <DataTable columns={columns} data={filteredEmployees} emptyMessage={t('noData')} />
    </div>
  );
}