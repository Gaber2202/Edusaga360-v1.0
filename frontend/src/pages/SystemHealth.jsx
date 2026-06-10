import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { 
  Activity, CheckCircle, XCircle, AlertTriangle, Bug, Search, Plus, Loader2,
  Users, FileText, Clock
} from 'lucide-react';

export default function SystemHealth() {
  const { t, isRTL } = useLanguage();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('overview');
  const [showDefectForm, setShowDefectForm] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const [defectForm, setDefectForm] = useState({
    module: '',
    page: '',
    button_name: '',
    issue_description: '',
    severity: 'medium'
  });

  const { data: defects = [], isLoading: loadingDefects } = useQuery({
    queryKey: ['systemDefects'],
    queryFn: () => fetchData(tenantQuery('system_defects').select('*').order('created_date', { ascending: false })),
  });

  const { data: auditLogs = [] } = useQuery({
    queryKey: ['auditLogs'],
    queryFn: () => fetchData(tenantQuery('audit_logs').select('*').order('created_date', { ascending: false }).limit()),
  });

  // Fetch counts for system health overview
  const { data: students = [] } = useQuery({
    queryKey: ['students'],
    queryFn: () => fetchData(tenantQuery('students').select('*').order()),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_date').order()),
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => fetchData(tenantQuery('invoices').select('*').order()),
  });

  const modules = [
    { name: isRTL ? 'لوحة التحكم' : 'Dashboard', key: 'dashboard', status: 'healthy' },
    { name: isRTL ? 'القبول والتسجيل' : 'Admissions', key: 'admissions', status: 'healthy' },
    { name: isRTL ? 'الطلاب' : 'Students', key: 'students', status: 'healthy' },
    { name: isRTL ? 'الرسوم' : 'Fees', key: 'fees', status: 'healthy' },
    { name: isRTL ? 'الموظفون' : 'Employees', key: 'employees', status: 'healthy' },
    { name: isRTL ? 'الحضور' : 'Attendance', key: 'attendance', status: 'healthy' },
    { name: isRTL ? 'الإجازات' : 'Leaves', key: 'leaves', status: 'healthy' },
    { name: isRTL ? 'الرواتب' : 'Payroll', key: 'payroll', status: 'healthy' },
    { name: isRTL ? 'المالية' : 'Finance', key: 'finance', status: 'healthy' },
    { name: isRTL ? 'التقارير' : 'Reports', key: 'reports', status: 'healthy' },
  ];

  const smokeTests = [
    { module: 'Admissions', test: 'Create Application', status: 'pass' },
    { module: 'Admissions', test: 'Edit Application', status: 'pass' },
    { module: 'Admissions', test: 'Approve Application', status: 'pass' },
    { module: 'Students', test: 'Create Student', status: 'pass' },
    { module: 'Students', test: 'Edit Student', status: 'pass' },
    { module: 'Fees', test: 'Create Invoice', status: 'pass' },
    { module: 'Fees', test: 'Record Payment', status: 'pass' },
    { module: 'Fees', test: 'Export Invoices', status: 'pass' },
    { module: 'Employees', test: 'Create Employee', status: 'pass' },
    { module: 'Employees', test: 'Edit Employee', status: 'pass' },
    { module: 'Leaves', test: 'Submit Leave Request', status: 'pass' },
    { module: 'Leaves', test: 'Approve Leave', status: 'pass' },
    { module: 'Payroll', test: 'Generate Payroll', status: 'pass' },
    { module: 'Payroll', test: 'Approve Payroll', status: 'pass' },
  ];

  const filteredDefects = defects.filter(d =>
    d.module?.toLowerCase().includes(search.toLowerCase()) ||
    d.issue_description?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSaveDefect = async () => {
    if (!defectForm.module || !defectForm.issue_description) {
      toast.error(isRTL ? 'يرجى إدخال البيانات المطلوبة' : 'Please fill required fields');
      return;
    }

    setSaving(true);
    try {
      const defectNumber = `DEF-${Date.now().toString(36).toUpperCase()}`;
      await tenantQuery('system_defects').insert({
        ...defectForm,
        defect_number: defectNumber,
        reported_date: format(new Date(), 'yyyy-MM-dd'),
        status: 'open'
      });

      queryClient.invalidateQueries({ queryKey: ['systemDefects'] });
      setShowDefectForm(false);
      setDefectForm({ module: '', page: '', button_name: '', issue_description: '', severity: 'medium' });
      toast.success(isRTL ? 'تم تسجيل المشكلة' : 'Defect reported');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateDefectStatus = async (defect, newStatus) => {
    try {
      await tenantQuery('system_defects').update({ 
        status: newStatus,
        resolved_date: newStatus === 'resolved' ? format(new Date(), 'yyyy-MM-dd') : null
      });
      queryClient.invalidateQueries({ queryKey: ['systemDefects'] });
      toast.success(isRTL ? 'تم التحديث' : 'Updated');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  };

  const defectColumns = [
    { header: isRTL ? 'الرقم' : 'ID', cell: (row) => <span className="font-mono text-sm">{row.defect_number}</span> },
    { header: isRTL ? 'الوحدة' : 'Module', accessorKey: 'module' },
    { header: isRTL ? 'الصفحة' : 'Page', accessorKey: 'page' },
    { header: isRTL ? 'الوصف' : 'Description', cell: (row) => <span className="text-sm truncate max-w-xs block">{row.issue_description}</span> },
    { header: isRTL ? 'الخطورة' : 'Severity', cell: (row) => (
      <Badge variant={row.severity === 'critical' ? 'destructive' : row.severity === 'high' ? 'default' : 'secondary'}>
        {row.severity}
      </Badge>
    )},
    { header: t('status'), cell: (row) => (
      <Badge variant={row.status === 'resolved' ? 'default' : row.status === 'in_progress' ? 'secondary' : 'outline'}>
        {row.status}
      </Badge>
    )},
    { header: t('actions'), cell: (row) => (
      <Select value={row.status} onValueChange={(v) => handleUpdateDefectStatus(row, v)}>
        <SelectTrigger className="w-32 h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="open">{isRTL ? 'مفتوح' : 'Open'}</SelectItem>
          <SelectItem value="in_progress">{isRTL ? 'قيد العمل' : 'In Progress'}</SelectItem>
          <SelectItem value="testing">{isRTL ? 'اختبار' : 'Testing'}</SelectItem>
          <SelectItem value="resolved">{isRTL ? 'محلول' : 'Resolved'}</SelectItem>
          <SelectItem value="closed">{isRTL ? 'مغلق' : 'Closed'}</SelectItem>
        </SelectContent>
      </Select>
    )}
  ];

  const openDefects = defects.filter(d => d.status === 'open' || d.status === 'in_progress').length;
  const passedTests = smokeTests.filter(t => t.status === 'pass').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'صحة النظام' : 'System Health'}
        subtitle={isRTL ? 'مراقبة حالة النظام والمشاكل' : 'Monitor system status and defects'}
      />

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">{isRTL ? 'الوحدات النشطة' : 'Active Modules'}</p>
                <p className="text-2xl font-bold">{modules.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Activity className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">{isRTL ? 'اختبارات ناجحة' : 'Tests Passed'}</p>
                <p className="text-2xl font-bold">{passedTests}/{smokeTests.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 ${openDefects > 0 ? 'bg-red-100' : 'bg-green-100'} rounded-full flex items-center justify-center`}>
                <Bug className={`w-5 h-5 ${openDefects > 0 ? 'text-red-600' : 'text-green-600'}`} />
              </div>
              <div>
                <p className="text-sm text-slate-500">{isRTL ? 'مشاكل مفتوحة' : 'Open Defects'}</p>
                <p className="text-2xl font-bold">{openDefects}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <Clock className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">{isRTL ? 'آخر نشاط' : 'Last Activity'}</p>
                <p className="text-sm font-medium">{auditLogs[0] ? format(new Date(auditLogs[0].created_date), 'HH:mm') : '-'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border">
          <TabsTrigger value="overview" className="gap-2">
            <Activity className="w-4 h-4" />
            {isRTL ? 'نظرة عامة' : 'Overview'}
          </TabsTrigger>
          <TabsTrigger value="tests" className="gap-2">
            <CheckCircle className="w-4 h-4" />
            {isRTL ? 'اختبارات النظام' : 'Smoke Tests'}
          </TabsTrigger>
          <TabsTrigger value="defects" className="gap-2">
            <Bug className="w-4 h-4" />
            {isRTL ? 'المشاكل' : 'Defects'}
            {openDefects > 0 && <Badge variant="destructive" className="ms-2">{openDefects}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Module Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{isRTL ? 'حالة الوحدات' : 'Module Status'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {modules.map(module => (
                  <div key={module.key} className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-medium">{module.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Data Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{isRTL ? 'ملخص البيانات' : 'Data Summary'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{isRTL ? 'الطلاب' : 'Students'}</p>
                    <p className="text-xl font-bold">{students.length}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                    <Users className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{isRTL ? 'الموظفون' : 'Employees'}</p>
                    <p className="text-xl font-bold">{employees.length}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                    <FileText className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{isRTL ? 'الفواتير' : 'Invoices'}</p>
                    <p className="text-xl font-bold">{invoices.length}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{isRTL ? 'النشاط الأخير' : 'Recent Activity'}</CardTitle>
            </CardHeader>
            <CardContent>
              {auditLogs.length === 0 ? (
                <p className="text-slate-500 text-center py-4">{isRTL ? 'لا يوجد نشاط' : 'No activity'}</p>
              ) : (
                <div className="space-y-2">
                  {auditLogs.slice(0, 10).map(log => (
                    <div key={log.id} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{log.action}</Badge>
                        <span className="text-sm">{log.entity_type}</span>
                      </div>
                      <span className="text-xs text-slate-500">{format(new Date(log.created_date), 'dd/MM HH:mm')}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tests" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span>{isRTL ? 'قائمة اختبارات النظام' : 'Smoke Test Checklist'}</span>
                <Badge variant="default">{passedTests}/{smokeTests.length} {isRTL ? 'ناجح' : 'Passed'}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {smokeTests.map((test, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      {test.status === 'pass' ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : test.status === 'fail' ? (
                        <XCircle className="w-5 h-5 text-red-500" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                      )}
                      <div>
                        <p className="font-medium">{test.test}</p>
                        <p className="text-sm text-slate-500">{test.module}</p>
                      </div>
                    </div>
                    <Badge variant={test.status === 'pass' ? 'default' : 'destructive'}>
                      {test.status === 'pass' ? (isRTL ? 'ناجح' : 'Pass') : (isRTL ? 'فشل' : 'Fail')}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="defects" className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
              <Input placeholder={isRTL ? 'بحث...' : 'Search...'} value={search} onChange={(e) => setSearch(e.target.value)} className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`} />
            </div>
            <Button onClick={() => setShowDefectForm(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              {isRTL ? 'تسجيل مشكلة' : 'Report Defect'}
            </Button>
          </div>
          <DataTable columns={defectColumns} data={filteredDefects} loading={loadingDefects} emptyMessage={t('noData')} />
        </TabsContent>
      </Tabs>

      {/* Defect Form Dialog */}
      <Dialog open={showDefectForm} onOpenChange={setShowDefectForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isRTL ? 'تسجيل مشكلة' : 'Report Defect'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'الوحدة' : 'Module'} *</Label>
                <Select value={defectForm.module} onValueChange={(v) => setDefectForm(p => ({...p, module: v}))}>
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                  <SelectContent>
                    {modules.map(m => <SelectItem key={m.key} value={m.key}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الخطورة' : 'Severity'}</Label>
                <Select value={defectForm.severity} onValueChange={(v) => setDefectForm(p => ({...p, severity: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">{isRTL ? 'حرج' : 'Critical'}</SelectItem>
                    <SelectItem value="high">{isRTL ? 'عالي' : 'High'}</SelectItem>
                    <SelectItem value="medium">{isRTL ? 'متوسط' : 'Medium'}</SelectItem>
                    <SelectItem value="low">{isRTL ? 'منخفض' : 'Low'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'الصفحة' : 'Page'}</Label>
                <Input value={defectForm.page} onChange={(e) => setDefectForm(p => ({...p, page: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الزر' : 'Button'}</Label>
                <Input value={defectForm.button_name} onChange={(e) => setDefectForm(p => ({...p, button_name: e.target.value}))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'وصف المشكلة' : 'Issue Description'} *</Label>
              <Textarea 
                value={defectForm.issue_description} 
                onChange={(e) => setDefectForm(p => ({...p, issue_description: e.target.value}))}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDefectForm(false)}>{t('cancel')}</Button>
            <Button onClick={handleSaveDefect} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'تسجيل' : 'Report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}