import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData, callApi } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { getCurrencySymbol } from '../lib/localization';
import { useRole } from '../components/RoleContext';
import { useBranch } from '../components/BranchContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import StatusBadge from '../components/ui/StatusBadge';
import { toast } from 'sonner';
import { format, differenceInDays } from 'date-fns';
import { 
  User, Calendar, Clock, FileText, DollarSign, Send, 
  Plus, Loader2, 
  AlertTriangle, Eye, Download, Wallet, GraduationCap, Mail
} from 'lucide-react';
import PayslipViewer from '../components/payroll/PayslipViewer';
import ESSProfileTab from '../components/ess/ESSProfileTab';
import ESSOnboardingTab from '../components/ess/ESSOnboardingTab';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function ESSPortal() {
  const { t, isRTL } = useLanguage();
  const { tenant } = useTenant();
  const { user } = useRole();
  const { selectedBranchId } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();

  const [activeTab, setActiveTab] = useState('overview');
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [requestType, setRequestType] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPayslipViewer, setShowPayslipViewer] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkEmployeeId, setLinkEmployeeId] = useState('');
  const [requestForm, setRequestForm] = useState({
    start_date: '',
    end_date: '',
    amount: 0,
    reason: ''
  });

  // Get ESS settings for test mode
  const { data: essSettings } = useQuery({
    queryKey: ['essSettings'],
    queryFn: async () => {
      const { data: settings = [] } = await tenantQuery('ess_settings').select('*').order();
      return settings[0] || { test_mode_enabled: false };
    },
  });

  // Get employee record linked to current user
  const { data: employees = [] } = useQuery({
    queryKey: ['employees', tenantId],
    queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const currentEmployee = (() => {
    if (essSettings?.test_mode_enabled && essSettings?.test_employee_id) {
      return employees.find(e => e.id === essSettings.test_employee_id);
    }
    return employees.find(e => e.email === user?.email);
  })();

  const { data: myRequests = [] } = useQuery({
    queryKey: ['essRequests', currentEmployee?.id],
    queryFn: () => fetchData(tenantQuery('ess_requests').select('*').match({ employee_id: currentEmployee?.id })),
    enabled: !!currentEmployee?.id,
  });

  const { data: myLeaves = [] } = useQuery({
    queryKey: ['leaveRequests', currentEmployee?.id],
    queryFn: () => fetchData(tenantQuery('leave_requests').select('*').match({ employee_id: currentEmployee?.id })),
    enabled: !!currentEmployee?.id,
  });

  const { data: myAttendance = [] } = useQuery({
    queryKey: ['employeeAttendance', currentEmployee?.id],
    queryFn: () => fetchData(tenantQuery('employee_attendances').select('*').match({ employee_id: currentEmployee?.id })),
    enabled: !!currentEmployee?.id,
  });

  const { data: myViolations = [] } = useQuery({
    queryKey: ['violations', currentEmployee?.id],
    queryFn: () => fetchData(tenantQuery('attendance_violations').select('*').match({ employee_id: currentEmployee?.id })),
    enabled: !!currentEmployee?.id,
  });

  const { data: myLoans = [] } = useQuery({
    queryKey: ['employeeLoans', currentEmployee?.id],
    queryFn: () => fetchData(tenantQuery('employee_loans').select('*').match({ employee_id: currentEmployee?.id })),
    enabled: !!currentEmployee?.id,
  });

  const { data: myTuitionAdvances = [] } = useQuery({
    queryKey: ['tuitionAdvances', currentEmployee?.id],
    queryFn: () => fetchData(tenantQuery('tuition_advances').select('*').match({ employee_id: currentEmployee?.id })),
    enabled: !!currentEmployee?.id,
  });

  const { data: myPayslips = [] } = useQuery({
    queryKey: ['payrollInputs', currentEmployee?.id],
    queryFn: () => fetchData(tenantQuery('payroll_inputs').select('*').match({ employee_id: currentEmployee?.id })),
    enabled: !!currentEmployee?.id,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchData(tenantQuery('branches').select('*').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments', tenantId],
    queryFn: () => fetchData(tenantQuery('departments').select('*').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const { data: jobTitles = [] } = useQuery({
    queryKey: ['jobTitles', tenantId],
    queryFn: () => fetchData(tenantQuery('job_titles').select('*').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const handleViewPayslip = (payslip) => {
    setSelectedPayslip(payslip);
    setShowPayslipViewer(true);
  };

  const handleDownloadPayslip = (_payslip) => {
    toast.success(isRTL ? 'جاري تحميل كشف الراتب...' : 'Downloading payslip...');
  };

  const handleEmailPayslip = async (payslip) => {
    try {
      await callApi('/api/email/send', {
        to: currentEmployee.email,
        subject: isRTL ? `كشف الراتب - ${payslip.period}` : `Payslip - ${payslip.period}`,
        body: isRTL 
          ? `عزيزي ${currentEmployee.name_ar}،\n\nمرفق كشف راتبك لشهر ${payslip.period}.\n\nمع التحية`
          : `Dear ${currentEmployee.name_en || currentEmployee.name_ar},\n\nPlease find attached your payslip for ${payslip.period}.\n\nBest regards`
      });
      
      toast.success(isRTL ? 'تم الإرسال بنجاح' : 'Sent successfully');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  };

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ['leaveTypes', tenantId],
    queryFn: () => fetchData(tenantQuery('leave_types').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const handleSubmitRequest = async () => {
    if (!currentEmployee) {
      toast.error(isRTL ? 'لم يتم العثور على سجل الموظف' : 'Employee record not found');
      return;
    }

    setSaving(true);
    try {
      const requestNumber = `REQ-${Date.now().toString(36).toUpperCase()}`;
      
      const lineManagerId = currentEmployee.line_manager_id || currentEmployee.manager_id || null;
      const routingNote = lineManagerId ? null : 'Manager Missing - routed to HR';

      const tid = getTenantIdForCreate();
      if (requestType === 'leave') {
        const totalDays = differenceInDays(new Date(requestForm.end_date), new Date(requestForm.start_date)) + 1;
        await tenantQuery('leave_requests').insert({
          ...(tid && { tenant_id: tid }),
          request_number: requestNumber,
          employee_id: currentEmployee.id,
          employee_name: currentEmployee.name_ar,
          branch_id: currentEmployee.branch_id || selectedBranchId,
          department_id: currentEmployee.department_id,
          leave_type_id: requestForm.leave_type_id,
          leave_type_name: leaveTypes.find(lt => lt.id === requestForm.leave_type_id)?.name_ar,
          start_date: requestForm.start_date,
          end_date: requestForm.end_date,
          total_days: totalDays,
          reason: requestForm.reason,
          status: 'pending',
          workflow_stage: lineManagerId ? 'pending_manager' : 'pending_hr',
          line_manager_id: lineManagerId,
          routing_note: routingNote,
          submitted_date: new Date().toISOString(),
          submitted_by: currentEmployee.id
        });
      } else {
        await tenantQuery('ess_requests').insert({
          ...(tid && { tenant_id: tid }),
          request_number: requestNumber,
          employee_id: currentEmployee.id,
          employee_name: currentEmployee.name_ar,
          branch_id: currentEmployee.branch_id || selectedBranchId,
          request_type: requestType,
          amount: requestForm.amount || 0,
          reason: requestForm.reason,
          request_details: requestForm,
          status: 'pending',
          workflow_stage: lineManagerId ? 'pending_manager' : 'pending_hr',
          line_manager_id: lineManagerId,
          routing_note: routingNote,
          submitted_date: new Date().toISOString(),
          submitted_by: currentEmployee.id
        });
      }

      queryClient.invalidateQueries({ queryKey: ['essRequests'] });
      queryClient.invalidateQueries({ queryKey: ['leaveRequests'] });
      setShowRequestDialog(false);
      setRequestForm({ start_date: '', end_date: '', amount: 0, reason: '' });
      toast.success(isRTL ? 'تم إرسال الطلب بنجاح' : 'Request submitted successfully');
    } catch (error) {
      console.error(error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const openRequestDialog = (type) => {
    setRequestType(type);
    setRequestForm({ start_date: '', end_date: '', amount: 0, reason: '', leave_type_id: '' });
    setShowRequestDialog(true);
  };

  const requestTypeLabels = {
    leave: isRTL ? 'طلب إجازة' : 'Leave Request',
    salary_advance: isRTL ? 'سلفة راتب' : 'Salary Advance',
    permission: isRTL ? 'طلب استئذان' : 'Permission Request',
    salary_certificate: isRTL ? 'شهادة راتب' : 'Salary Certificate',
    experience_certificate: isRTL ? 'شهادة خبرة' : 'Experience Certificate',
    overtime: isRTL ? 'طلب عمل إضافي' : 'Overtime Request',
    profile_update: isRTL ? 'تحديث البيانات' : 'Profile Update',
    other: isRTL ? 'طلب آخر' : 'Other Request'
  };

  const handleLinkEmployee = async () => {
    if (!linkEmployeeId) {
      toast.error(isRTL ? 'يرجى اختيار موظف' : 'Please select an employee');
      return;
    }

    setSaving(true);
    try {
      await tenantQuery('employees').update({
        email: user.email,
        user_id: user.id,
      }).eq('id', linkEmployeeId);
      
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setShowLinkDialog(false);
      toast.success(isRTL ? 'تم ربط الحساب بنجاح' : 'Account linked successfully');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  if (!currentEmployee) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <AlertTriangle className="w-16 h-16 text-amber-500 mb-4" />
        <h2 className="text-xl font-semibold text-ink mb-2">
          {isRTL ? 'لم يتم ربط حسابك بسجل موظف' : 'Your account is not linked to an employee record'}
        </h2>
        <p className="text-muted-foreground mb-6">
          {isRTL ? 'يرجى اختيار سجل الموظف الخاص بك' : 'Please select your employee record'}
        </p>
        <Button onClick={() => setShowLinkDialog(true)} className="bg-najdi-700 hover:bg-najdi-900">
          <User className="w-4 h-4 me-2" />
          {isRTL ? 'ربط حساب الموظف' : 'Link Employee Account'}
        </Button>

        {/* Link Employee Dialog */}
        <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{isRTL ? 'ربط حساب الموظف' : 'Link Employee Account'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="bg-najdi-50 p-3 rounded-lg">
                <p className="text-sm text-muted-foreground">{isRTL ? 'البريد الإلكتروني:' : 'Email:'}</p>
                <p className="font-medium">{user?.email}</p>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'اختر سجل الموظف' : 'Select Employee Record'} *</Label>
                <Select value={linkEmployeeId} onValueChange={setLinkEmployeeId}>
                  <SelectTrigger>
                    <SelectValue placeholder={isRTL ? 'ابحث عن موظف...' : 'Search employee...'} />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.filter(e => e.status === 'active').map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.employee_id} - {emp.name_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                {isRTL 
                  ? 'سيتم ربط هذا الحساب بسجل الموظف المختار' 
                  : 'This account will be linked to the selected employee record'}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowLinkDialog(false)}>
                {t('cancel')}
              </Button>
              <Button onClick={handleLinkEmployee} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                {isRTL ? 'ربط الحساب' : 'Link Account'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            {isRTL ? 'بوابة الخدمة الذاتية' : 'Employee Self-Service Portal'}
          </h1>
          <p className="text-muted-foreground">
            {isRTL ? `مرحباً، ${currentEmployee.name_ar}` : `Welcome, ${currentEmployee.name_en || currentEmployee.name_ar}`}
          </p>
          {essSettings?.test_mode_enabled && (
            <Badge className="bg-amber-100 text-amber-700 mt-2">
              {isRTL ? 'وضع الاختبار مفعل' : 'Test Mode Active'}
            </Badge>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{isRTL ? 'إجراءات سريعة' : 'Quick Actions'}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => openRequestDialog('leave')}>
              <Calendar className="w-5 h-5 text-najdi-700" />
              <span className="text-sm">{isRTL ? 'طلب إجازة' : 'Request Leave'}</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => openRequestDialog('salary_advance')}>
              <DollarSign className="w-5 h-5 text-emerald-600" />
              <span className="text-sm">{isRTL ? 'سلفة راتب' : 'Salary Advance'}</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => openRequestDialog('permission')}>
              <Clock className="w-5 h-5 text-amber-600" />
              <span className="text-sm">{isRTL ? 'استئذان' : 'Permission'}</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => openRequestDialog('salary_certificate')}>
              <FileText className="w-5 h-5 text-purple-600" />
              <span className="text-sm">{isRTL ? 'شهادة راتب' : 'Salary Certificate'}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border">
          <TabsTrigger value="overview">{isRTL ? 'نظرة عامة' : 'Overview'}</TabsTrigger>
          <TabsTrigger value="payslips">{isRTL ? 'كشوف الراتب' : 'Payslips'}</TabsTrigger>
          <TabsTrigger value="loans">{isRTL ? 'القروض' : 'Loans'}</TabsTrigger>
          <TabsTrigger value="requests">{isRTL ? 'طلباتي' : 'My Requests'}</TabsTrigger>
          <TabsTrigger value="attendance">{isRTL ? 'الحضور' : 'Attendance'}</TabsTrigger>
          <TabsTrigger value="onboarding">{isRTL ? 'الإلحاق' : 'Onboarding'}</TabsTrigger>
          <TabsTrigger value="profile">{isRTL ? 'ملفي' : 'My Profile'}</TabsTrigger>
          <TabsTrigger value="full_profile">{isRTL ? 'الملف الكامل' : 'Full Profile'}</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-najdi-50 rounded-full flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-najdi-700" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{isRTL ? 'رصيد الإجازات' : 'Leave Balance'}</p>
                    <p className="text-2xl font-bold">{currentEmployee.leave_balance || 21} {isRTL ? 'يوم' : 'days'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                    <Clock className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{isRTL ? 'طلبات معلقة' : 'Pending Requests'}</p>
                    <p className="text-2xl font-bold">{myRequests.filter(r => r.status === 'pending').length + myLeaves.filter(l => l.status === 'pending').length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{isRTL ? 'المخالفات' : 'Violations'}</p>
                    <p className="text-2xl font-bold">{myViolations.filter(v => v.status === 'pending').length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Attendance */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{isRTL ? 'الحضور الأخير' : 'Recent Attendance'}</CardTitle>
            </CardHeader>
            <CardContent>
              {myAttendance.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">{isRTL ? 'لا توجد سجلات' : 'No records'}</p>
              ) : (
                <div className="space-y-2">
                  {myAttendance.slice(0, 5).map(att => (
                    <div key={att.id} className="flex items-center justify-between p-3 bg-sand rounded-lg">
                      <div>
                        <p className="font-medium">{format(new Date(att.date), 'dd/MM/yyyy')}</p>
                        <p className="text-sm text-muted-foreground">{att.check_in || '-'} - {att.check_out || '-'}</p>
                      </div>
                      <StatusBadge status={att.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payslips Tab */}
        <TabsContent value="payslips" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{isRTL ? 'كشوف الراتب' : 'My Payslips'}</CardTitle>
            </CardHeader>
            <CardContent>
              {myPayslips.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">{isRTL ? 'لا توجد كشوف رواتب' : 'No payslips available'}</p>
              ) : (
                <div className="space-y-3">
                  {myPayslips.sort((a, b) => b.period.localeCompare(a.period)).slice(0, 12).map(payslip => (
                    <div key={payslip.id} className="flex items-center justify-between p-4 bg-sand rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                          <DollarSign className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="font-medium">{payslip.period}</p>
                          <p className="text-sm text-muted-foreground">
                            {isRTL ? 'الإجمالي:' : 'Gross:'} {payslip.gross_salary?.toLocaleString()} | {isRTL ? 'الصافي:' : 'Net:'} {payslip.net_salary?.toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={payslip.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>
                          {payslip.status === 'paid' ? (isRTL ? 'مدفوع' : 'Paid') : (isRTL ? 'معلق' : 'Pending')}
                        </Badge>
                        <Button variant="ghost" size="sm" onClick={() => handleViewPayslip(payslip)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDownloadPayslip(payslip)}>
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleEmailPayslip(payslip)}>
                          <Mail className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Earnings Breakdown */}
          {myPayslips.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{isRTL ? 'تفاصيل آخر راتب' : 'Latest Payslip Details'}</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const latest = myPayslips.sort((a, b) => b.period.localeCompare(a.period))[0];
                  return (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <h4 className="font-medium text-emerald-600 border-b pb-2">{isRTL ? 'المكتسبات' : 'Earnings'}</h4>
                        <div className="flex justify-between text-sm">
                          <span>{isRTL ? 'الراتب الأساسي' : 'Basic Salary'}</span>
                          <span>{latest.basic_salary?.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>{isRTL ? 'بدل السكن' : 'Housing'}</span>
                          <span>{latest.housing_allowance?.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>{isRTL ? 'بدل النقل' : 'Transport'}</span>
                          <span>{latest.transport_allowance?.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>{isRTL ? 'بدلات أخرى' : 'Other'}</span>
                          <span>{latest.other_allowances?.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between font-medium border-t pt-2">
                          <span>{isRTL ? 'إجمالي المكتسبات' : 'Total Earnings'}</span>
                          <span className="text-emerald-600">{latest.gross_salary?.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <h4 className="font-medium text-red-600 border-b pb-2">{isRTL ? 'الاستقطاعات' : 'Deductions'}</h4>
                        <div className="flex justify-between text-sm">
                          <span>{isRTL ? 'التأمينات' : 'GOSI'}</span>
                          <span>{latest.gosi_employee?.toLocaleString()}</span>
                        </div>
                        {latest.loan_deduction > 0 && (
                          <div className="flex justify-between text-sm">
                            <span>{isRTL ? 'قرض' : 'Loan'}</span>
                            <span>{latest.loan_deduction?.toLocaleString()}</span>
                          </div>
                        )}
                        {latest.tuition_deduction > 0 && (
                          <div className="flex justify-between text-sm">
                            <span>{isRTL ? 'سلفة رسوم' : 'Tuition'}</span>
                            <span>{latest.tuition_deduction?.toLocaleString()}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-medium border-t pt-2">
                          <span>{isRTL ? 'إجمالي الاستقطاعات' : 'Total Deductions'}</span>
                          <span className="text-red-600">{latest.total_deductions?.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between font-bold text-lg border-t pt-2 mt-4">
                          <span>{isRTL ? 'صافي الراتب' : 'Net Salary'}</span>
                          <span className="text-emerald-600"><Currency amount={latest.net_salary} /></span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Loans Tab */}
        <TabsContent value="loans" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Loan Summary */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Wallet className="w-5 h-5" />
                    {isRTL ? 'القروض' : 'Loans'}
                  </CardTitle>
                  <Button size="sm" onClick={() => openRequestDialog('salary_advance')}>
                    <Plus className="w-4 h-4 me-1" />
                    {isRTL ? 'طلب قرض' : 'Request Loan'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {myLoans.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">{isRTL ? 'لا توجد قروض' : 'No loans'}</p>
                ) : (
                  <div className="space-y-3">
                    {myLoans.map(loan => (
                      <div key={loan.id} className="p-3 bg-sand rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{loan.loan_number}</span>
                          <Badge className={loan.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>
                            {loan.status === 'active' ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'معلق' : 'Pending')}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">{isRTL ? 'المبلغ:' : 'Amount:'}</span>
                            <span className="font-medium ms-1">{loan.loan_amount?.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{isRTL ? 'المتبقي:' : 'Balance:'}</span>
                            <span className="font-medium ms-1">{loan.remaining_balance?.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{isRTL ? 'القسط:' : 'Installment:'}</span>
                            <span className="font-medium ms-1">{loan.installment_amount?.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{isRTL ? 'الأقساط:' : 'Payments:'}</span>
                            <span className="font-medium ms-1">{loan.installments_paid || 0}/{loan.installment_count}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tuition Advances */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <GraduationCap className="w-5 h-5" />
                  {isRTL ? 'سلف الرسوم الدراسية' : 'Tuition Advances'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {myTuitionAdvances.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">{isRTL ? 'لا توجد سلف رسوم' : 'No tuition advances'}</p>
                ) : (
                  <div className="space-y-3">
                    {myTuitionAdvances.map(advance => (
                      <div key={advance.id} className="p-3 bg-sand rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <span className="font-medium">{advance.student_name}</span>
                            <span className="text-xs text-muted-foreground ms-2">({advance.academic_year})</span>
                          </div>
                          <Badge className={advance.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>
                            {advance.status === 'active' ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'معلق' : 'Pending')}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">{isRTL ? 'المبلغ:' : 'Amount:'}</span>
                            <span className="font-medium ms-1">{advance.advance_amount?.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{isRTL ? 'المتبقي:' : 'Balance:'}</span>
                            <span className="font-medium ms-1">{advance.remaining_balance?.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{isRTL ? 'القسط:' : 'Installment:'}</span>
                            <span className="font-medium ms-1">{advance.installment_amount?.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{isRTL ? 'الأقساط:' : 'Payments:'}</span>
                            <span className="font-medium ms-1">{advance.installments_paid || 0}/{advance.installment_count}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Requests Tab */}
        <TabsContent value="requests" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openRequestDialog('other')} className="gap-2">
              <Plus className="w-4 h-4" />
              {isRTL ? 'طلب جديد' : 'New Request'}
            </Button>
          </div>

          {/* Leave Requests */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{isRTL ? 'طلبات الإجازة' : 'Leave Requests'}</CardTitle>
            </CardHeader>
            <CardContent>
              {myLeaves.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">{isRTL ? 'لا توجد طلبات' : 'No requests'}</p>
              ) : (
                <div className="space-y-2">
                  {myLeaves.map(leave => (
                    <div key={leave.id} className="flex items-center justify-between p-3 bg-sand rounded-lg">
                      <div>
                        <p className="font-medium">{leave.leave_type_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(leave.start_date), 'dd/MM/yyyy')} - {format(new Date(leave.end_date), 'dd/MM/yyyy')}
                          <span className="mx-2">•</span>
                          {leave.total_days} {isRTL ? 'يوم' : 'days'}
                        </p>
                      </div>
                      <StatusBadge status={leave.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Other Requests */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{isRTL ? 'الطلبات الأخرى' : 'Other Requests'}</CardTitle>
            </CardHeader>
            <CardContent>
              {myRequests.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">{isRTL ? 'لا توجد طلبات' : 'No requests'}</p>
              ) : (
                <div className="space-y-2">
                  {myRequests.map(req => (
                    <div key={req.id} className="flex items-center justify-between p-3 bg-sand rounded-lg">
                      <div>
                        <p className="font-medium">{requestTypeLabels[req.request_type]}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(req.created_at), 'dd/MM/yyyy')}
                          {req.amount > 0 && <span className="mx-2">• {req.amount.toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}</span>}
                        </p>
                      </div>
                      <StatusBadge status={req.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attendance Tab */}
        <TabsContent value="attendance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{isRTL ? 'سجل الحضور' : 'Attendance Record'}</CardTitle>
            </CardHeader>
            <CardContent>
              {myAttendance.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">{isRTL ? 'لا توجد سجلات' : 'No records'}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-start py-2 px-3">{isRTL ? 'التاريخ' : 'Date'}</th>
                        <th className="text-start py-2 px-3">{isRTL ? 'الدخول' : 'Check In'}</th>
                        <th className="text-start py-2 px-3">{isRTL ? 'الخروج' : 'Check Out'}</th>
                        <th className="text-start py-2 px-3">{isRTL ? 'الحالة' : 'Status'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myAttendance.map(att => (
                        <tr key={att.id} className="border-b">
                          <td className="py-2 px-3">{format(new Date(att.date), 'dd/MM/yyyy')}</td>
                          <td className="py-2 px-3">{att.check_in || '-'}</td>
                          <td className="py-2 px-3">{att.check_out || '-'}</td>
                          <td className="py-2 px-3"><StatusBadge status={att.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Violations */}
          {myViolations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg text-red-600">{isRTL ? 'المخالفات' : 'Violations'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {myViolations.map(vio => (
                    <div key={vio.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                      <div>
                        <p className="font-medium">{vio.violation_type}</p>
                        <p className="text-sm text-muted-foreground">{format(new Date(vio.violation_date), 'dd/MM/yyyy')}</p>
                      </div>
                      <StatusBadge status={vio.status} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Onboarding Tab */}
        <TabsContent value="onboarding">
          <ESSOnboardingTab employee={currentEmployee} />
        </TabsContent>

        {/* Full Profile Tab */}
        <TabsContent value="full_profile">
          <ESSProfileTab 
            employee={currentEmployee} 
            departments={departments} 
            jobTitles={jobTitles} 
            branches={branches} 
          />
        </TabsContent>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{isRTL ? 'معلومات الموظف' : 'Employee Information'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label className="text-muted-foreground">{isRTL ? 'الرقم الوظيفي' : 'Employee ID'}</Label>
                    <p className="font-medium">{currentEmployee.employee_id}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">{isRTL ? 'الاسم' : 'Name'}</Label>
                    <p className="font-medium">{currentEmployee.name_ar}</p>
                    {currentEmployee.name_en && <p className="text-sm text-muted-foreground">{currentEmployee.name_en}</p>}
                  </div>
                  <div>
                    <Label className="text-muted-foreground">{t('email')}</Label>
                    <p>{currentEmployee.email || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">{t('phone')}</Label>
                    <p>{currentEmployee.phone || '-'}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <Label className="text-muted-foreground">{t('nationalId')}</Label>
                    <p>{currentEmployee.national_id || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">{isRTL ? 'تاريخ التعيين' : 'Hire Date'}</Label>
                    <p>{currentEmployee.hire_date ? format(new Date(currentEmployee.hire_date), 'dd/MM/yyyy') : '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">{isRTL ? 'نوع التوظيف' : 'Employment Type'}</Label>
                    <p>{currentEmployee.employment_type || '-'}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Request Dialog */}
      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{requestTypeLabels[requestType] || (isRTL ? 'طلب جديد' : 'New Request')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {requestType === 'leave' && (
              <>
                <div className="space-y-2">
                  <Label>{isRTL ? 'نوع الإجازة' : 'Leave Type'} *</Label>
                  <Select value={requestForm.leave_type_id} onValueChange={(v) => setRequestForm(p => ({...p, leave_type_id: v}))}>
                    <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                    <SelectContent>
                      {leaveTypes.map(lt => (
                        <SelectItem key={lt.id} value={lt.id}>{lt.name_ar}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{isRTL ? 'من تاريخ' : 'From Date'} *</Label>
                    <Input type="date" value={requestForm.start_date} onChange={(e) => setRequestForm(p => ({...p, start_date: e.target.value}))} />
                  </div>
                  <div className="space-y-2">
                    <Label>{isRTL ? 'إلى تاريخ' : 'To Date'} *</Label>
                    <Input type="date" value={requestForm.end_date} onChange={(e) => setRequestForm(p => ({...p, end_date: e.target.value}))} />
                  </div>
                </div>
              </>
            )}

            {requestType === 'salary_advance' && (
              <div className="space-y-2">
                <Label>{isRTL ? 'المبلغ' : 'Amount'} *</Label>
                <Input type="number" value={requestForm.amount} onChange={(e) => setRequestForm(p => ({...p, amount: parseFloat(e.target.value) || 0}))} />
              </div>
            )}

            {requestType === 'permission' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{isRTL ? 'التاريخ' : 'Date'} *</Label>
                  <Input type="date" value={requestForm.start_date} onChange={(e) => setRequestForm(p => ({...p, start_date: e.target.value}))} />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'المدة (ساعات)' : 'Duration (hours)'}</Label>
                  <Input type="number" value={requestForm.hours || ''} onChange={(e) => setRequestForm(p => ({...p, hours: e.target.value}))} />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>{isRTL ? 'السبب / التفاصيل' : 'Reason / Details'}</Label>
              <Textarea 
                value={requestForm.reason} 
                onChange={(e) => setRequestForm(p => ({...p, reason: e.target.value}))}
                placeholder={isRTL ? 'اكتب السبب هنا...' : 'Enter reason here...'}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRequestDialog(false)}>{t('cancel')}</Button>
            <Button onClick={handleSubmitRequest} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              <Send className="w-4 h-4 me-2" />
              {isRTL ? 'إرسال' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payslip Viewer */}
      {selectedPayslip && (
        <PayslipViewer
          payslip={selectedPayslip}
          employee={currentEmployee}
          branch={branches.find(b => b.id === currentEmployee?.branch_id)}
          open={showPayslipViewer}
          onClose={() => setShowPayslipViewer(false)}
        />
      )}
    </div>
  );
}