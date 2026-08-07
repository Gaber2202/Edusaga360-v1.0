import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import { Plus, Search, Eye, Loader2, ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import CompensationForm from '../components/employees/CompensationForm';
import CompensationTab from '../components/employees/CompensationTab';
import CompanyTransferDialog from '../components/employees/CompanyTransferDialog';
import BankDetailsForm from '../components/employees/BankDetailsForm';
import { useTenantFilter } from '../hooks/useTenantFilter';
import HRDemoDataSeeder from '../components/hr/HRDemoDataSeeder';

export default function Employees() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  
  const [showForm, setShowForm] = useState(false);
  const [showDetails, setShowDetails] = useState(null);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferEmployee, setTransferEmployee] = useState(null);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    employee_id: '',
    name_ar: '',
    name_en: '',
    email: '',
    personal_email: '',
    phone: '',
    national_id: '',
    date_of_birth: '',
    gender: 'male',
    nationality: '',
    is_saudi: false,
    branch_id: '',
    employing_company_id: '',
    visa_company_id: '',
    visa_type: '',
    department_id: '',
    job_title_id: '',
    manager_id: '',
    hire_date: format(new Date(), 'yyyy-MM-dd'),
    contract_end_date: '',
    end_date: '',
    employment_type: 'full_time',
    contract_type: 'permanent',
    work_schedule: 'morning',
    salary: 0,
    bank_account: '',
    iban: '',
    bank_name: '',
    bank_details: {},
    emergency_contact_name: '',
    emergency_contact_phone: '',
    status: 'active',
    notes: '',
    license_expiry_date: '',
    compensation: {}
  });

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at').match(tenantFilter(branchFilter())).order('created_at', { ascending: false })),
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

  const { data: branchesData = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchData(tenantQuery('branches').select('*').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies', tenantId],
    queryFn: () => fetchData(tenantQuery('companys').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const filteredEmployees = filterByBranch(employees).filter(emp => {
    const matchesSearch = emp.name_ar?.includes(search) || emp.name_en?.toLowerCase().includes(search.toLowerCase()) || emp.employee_id?.includes(search);
    const matchesStatus = statusFilter === 'all' || emp.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleSave = async () => {
    if (!formData.name_ar) {
      toast.error(isRTL ? 'يرجى ملء الحقول المطلوبة' : 'Please fill in required fields');
      return;
    }
    if (!formData.branch_id) {
      toast.error(isRTL ? 'يرجى اختيار الفرع' : 'Please select a branch');
      return;
    }
    
    setSaving(true);
    try {
      const empId = formData.employee_id || `EMP-${Date.now().toString(36).toUpperCase()}`;
      
      // Sync top-level bank fields from bank_details for backward compat
      const bd = formData.bank_details || {};

      // Sync top-level salary fields from compensation.salary_structure so payroll can read them
      const salaryStructure = formData.compensation?.salary_structure || {};
      const compAllowances = salaryStructure.allowances || [];
      const housingAllowance = compAllowances.find(a => a.name?.toLowerCase().includes('housing') || a.name?.includes('سكن'))?.amount || formData.housing_allowance || 0;
      const transportAllowance = compAllowances.find(a => a.name?.toLowerCase().includes('transport') || a.name?.includes('نقل'))?.amount || formData.transport_allowance || 0;
      const otherAllowances = compAllowances.filter(a => {
        const n = (a.name || '').toLowerCase();
        return !n.includes('housing') && !n.includes('سكن') && !n.includes('transport') && !n.includes('نقل');
      }).reduce((sum, a) => sum + (a.amount || 0), 0);

      const basicSalary = salaryStructure.basic_salary || formData.basic_salary || formData.salary || 0;
      const totalSalary = basicSalary + housingAllowance + transportAllowance + otherAllowances;

      const data = { 
        ...formData, 
        employee_id: empId, 
        branch_id: formData.branch_id || selectedBranchId || null,
        tenant_id: tenantId,
        // Empty date strings must be NULL, never '' (invalid DATE input).
        contract_end_date: formData.contract_end_date || null,
        end_date: formData.end_date || null,
        is_saudi: formData.is_saudi,
        is_gosi_applicable: formData.is_saudi || !!formData.national_id,
        bank_name: bd.bank_name || formData.bank_name || '',
        iban: bd.iban || formData.iban || '',
        bank_account: bd.account_number || formData.bank_account || '',
        // Sync salary fields to top-level so payroll can use them
        basic_salary: basicSalary,
        housing_allowance: housingAllowance,
        transport_allowance: transportAllowance,
        other_allowances: otherAllowances,
        total_salary: totalSalary,
        salary: totalSalary,
      };

      if (editingEmployee?.id) {
        await tenantQuery('employees').update(data).eq('id', editingEmployee.id);
        await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'Employee', entityId: editingEmployee.id, oldValues: editingEmployee, newValues: data });
      } else {
        const { data: created, error } = await tenantQuery('employees').insert(data).select().single();
        if (error) throw error;
        await logAuditEvent({ action: AuditActions.CREATE, entityType: 'Employee', entityId: created?.id, newValues: data });
      }

      await queryClient.invalidateQueries({ queryKey: ['employees'] });
      setShowForm(false);
      resetForm();
      toast.success(isRTL ? 'تم الحفظ بنجاح' : 'Saved successfully');
    } catch (error) {
      toast.error(isRTL ? 'حدث خطأ: ' + (error.message || 'خطأ غير معروف') : 'Error: ' + (error.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (employee) => {
    setEditingEmployee(employee);
    // CRITICAL FIX: Properly load employee data for editing
    setFormData({
      employee_id: employee.employee_id || '',
      name_ar: employee.name_ar || '',
      name_en: employee.name_en || '',
      email: employee.email || '',
      personal_email: employee.personal_email || '',
      phone: employee.phone || '',
      national_id: employee.national_id || '',
      date_of_birth: employee.date_of_birth || '',
      gender: employee.gender || 'male',
      nationality: employee.nationality || '',
      is_saudi: employee.is_saudi ?? false,
      branch_id: employee.branch_id || '',
      employing_company_id: employee.employing_company_id || '',
      visa_company_id: employee.visa_company_id || '',
      visa_type: employee.visa_type || '',
      department_id: employee.department_id || '',
      job_title_id: employee.job_title_id || '',
      manager_id: employee.manager_id || '',
      hire_date: employee.hire_date || format(new Date(), 'yyyy-MM-dd'),
      contract_end_date: employee.contract_end_date || '',
      end_date: employee.end_date || '',
      contract_type: employee.contract_type || 'permanent',
      employment_type: employee.employment_type || 'full_time',
      work_schedule: employee.work_schedule || 'morning',
      salary: employee.salary || 0,
      bank_account: employee.bank_account || '',
      iban: employee.iban || '',
      bank_name: employee.bank_name || '',
      bank_details: employee.bank_details || {
        bank_name: employee.bank_name || '',
        iban: employee.iban || '',
        account_number: employee.bank_account || '',
        account_holder_name: employee.name_ar || '',
        status: 'active',
      },
      emergency_contact_name: employee.emergency_contact_name || '',
      emergency_contact_phone: employee.emergency_contact_phone || '',
      status: employee.status || 'active',
      notes: employee.notes || '',
      license_expiry_date: employee.license_expiry_date || '',
      compensation: employee.compensation || {}
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setEditingEmployee(null);
    setFormData({
      employee_id: '', name_ar: '', name_en: '', email: '', personal_email: '', phone: '', national_id: '',
      date_of_birth: '', gender: 'male', nationality: '', is_saudi: false, branch_id: '', 
      employing_company_id: '', visa_company_id: '', visa_type: '',
      department_id: '', job_title_id: '',
      manager_id: '', hire_date: format(new Date(), 'yyyy-MM-dd'), contract_end_date: '', end_date: '', contract_type: 'permanent', employment_type: 'full_time',
      work_schedule: 'morning', salary: 0, bank_account: '', iban: '', bank_name: '', bank_details: {}, emergency_contact_name: '',
      emergency_contact_phone: '', status: 'active', notes: '', license_expiry_date: '', compensation: {}
    });
  };

  const columns = [
    { header: isRTL ? 'الرقم الوظيفي' : 'Employee ID', cell: (row) => <span className="font-mono text-sm">{row.employee_id}</span> },
    { header: isRTL ? 'الاسم' : 'Name', cell: (row) => <div><p className="font-medium">{row.name_ar}</p><p className="text-sm text-muted-foreground">{row.name_en}</p></div> },
    { header: isRTL ? 'الجنسية' : 'Nationality', cell: (row) => (
      <div className="flex items-center gap-2">
        <span>{row.nationality}</span>
        {row.is_saudi && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">{isRTL ? 'سعودي' : 'Saudi'}</span>}
      </div>
    )},
    { header: isRTL ? 'القسم' : 'Department', cell: (row) => departments.find(d => d.id === row.department_id)?.name_ar || '-' },
    { header: t('phone'), accessorKey: 'phone' },
    { header: t('status'), cell: (row) => <StatusBadge status={row.status} /> },
    { header: t('actions'), cell: (row) => (
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => setShowDetails(row)}>
          <Eye className="w-4 h-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => handleEdit(row)}>
          {t('edit')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setTransferEmployee(row); setShowTransferDialog(true); }} title={isRTL ? 'نقل شركة' : 'Transfer'}>
          <ArrowRightLeft className="w-4 h-4" />
        </Button>
      </div>
    )}
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title={isRTL ? 'الموظفون' : 'Employees'}
          subtitle={isRTL ? 'إدارة بيانات الموظفين والعقود' : 'Manage employee data and contracts'}
          actionLabel={isRTL ? 'إضافة موظف' : 'Add Employee'}
          actionIcon={Plus}
          onAction={() => { resetForm(); setShowForm(true); }}
        />
        <HRDemoDataSeeder isRTL={isRTL} />
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="bg-white border">
          <TabsTrigger value="all">{t('all')}</TabsTrigger>
          <TabsTrigger value="active">{t('active')}</TabsTrigger>
          <TabsTrigger value="on_leave">{isRTL ? 'في إجازة' : 'On Leave'}</TabsTrigger>
          <TabsTrigger value="suspended">{isRTL ? 'موقوف' : 'Suspended'}</TabsTrigger>
          <TabsTrigger value="terminated">{isRTL ? 'منتهي الخدمة' : 'Terminated'}</TabsTrigger>
          <TabsTrigger value="retired">{isRTL ? 'متقاعد' : 'Retired'}</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="relative max-w-md">
        <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
        <Input placeholder={isRTL ? 'بحث...' : 'Search...'} value={search} onChange={(e) => setSearch(e.target.value)} className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`} />
      </div>

      <DataTable columns={columns} data={filteredEmployees} loading={isLoading} emptyMessage={t('noData')} />

      {/* Employee Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEmployee ? (isRTL ? 'تعديل الموظف' : 'Edit Employee') : (isRTL ? 'إضافة موظف' : 'Add Employee')}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="general">
            <TabsList className="bg-white border">
              <TabsTrigger value="general">{isRTL ? 'بيانات عامة' : 'General Info'}</TabsTrigger>
              <TabsTrigger value="bank">{isRTL ? 'البنك' : 'Bank Details'}</TabsTrigger>
              <TabsTrigger value="compensation">{isRTL ? 'التعويضات والمزايا' : 'Compensation'}</TabsTrigger>
            </TabsList>
            <TabsContent value="general" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'} *</Label>
                <Input value={formData.name_ar} onChange={(e) => setFormData(p => ({...p, name_ar: e.target.value}))} dir="rtl" />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'}</Label>
                <Input value={formData.name_en} onChange={(e) => setFormData(p => ({...p, name_en: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'البريد الإلكتروني الوظيفي' : 'Work Email'}</Label>
                <Input type="email" value={formData.email} onChange={(e) => setFormData(p => ({...p, email: e.target.value}))} placeholder="example@company.com" />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'البريد الإلكتروني الشخصي' : 'Personal Email'}</Label>
                <Input type="email" value={formData.personal_email} onChange={(e) => setFormData(p => ({...p, personal_email: e.target.value}))} placeholder="personal@email.com" />
              </div>
              <div className="space-y-2">
                <Label>{t('phone')}</Label>
                <Input value={formData.phone} onChange={(e) => setFormData(p => ({...p, phone: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{t('nationalId')}</Label>
                <Input value={formData.national_id} onChange={(e) => setFormData(p => ({...p, national_id: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{t('dateOfBirth')}</Label>
                <Input type="date" value={formData.date_of_birth} onChange={(e) => setFormData(p => ({...p, date_of_birth: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{t('gender')}</Label>
                <Select value={formData.gender} onValueChange={(v) => setFormData(p => ({...p, gender: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">{t('male')}</SelectItem>
                    <SelectItem value="female">{t('female')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                 <Label>{t('nationality')}</Label>
                 <Input value={formData.nationality} onChange={(e) => setFormData(p => ({...p, nationality: e.target.value}))} />
               </div>
               <div className="flex items-center gap-2">
                 <input id="is_saudi" type="checkbox" checked={formData.is_saudi} onChange={(e) => setFormData(p => ({...p, is_saudi: e.target.checked}))} />
                 <Label htmlFor="is_saudi">{isRTL ? 'موظف سعودي' : 'Saudi National'}</Label>
               </div>
               <div className="space-y-2">
                 <Label>{t('branch')} *</Label>
                 <Select value={formData.branch_id} onValueChange={(v) => setFormData(p => ({...p, branch_id: v}))}>
                   <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر الفرع' : 'Select Branch'} /></SelectTrigger>
                   <SelectContent>
                     {branchesData.map(b => <SelectItem key={b.id} value={b.id}>{isRTL ? b.name_ar : b.name_en || b.name_ar}</SelectItem>)}
                   </SelectContent>
                 </Select>
               </div>
               <div className="space-y-2">
                 <Label>{isRTL ? 'القسم' : 'Department'}</Label>
                <Select value={formData.department_id} onValueChange={(v) => setFormData(p => ({...p, department_id: v}))}>
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                  <SelectContent>
                    {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name_ar}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'المسمى الوظيفي' : 'Job Title'}</Label>
                <Select value={formData.job_title_id} onValueChange={(v) => setFormData(p => ({...p, job_title_id: v}))}>
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                  <SelectContent>
                    {jobTitles.map(j => <SelectItem key={j.id} value={j.id}>{isRTL ? j.name_ar : (j.name_en || j.name_ar)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'المدير المباشر' : 'Line Manager'}</Label>
                <Select value={formData.manager_id || ''} onValueChange={(v) => setFormData(p => ({...p, manager_id: v}))}>
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر المدير المباشر' : 'Select Line Manager'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>{isRTL ? 'بدون مدير' : 'No Manager'}</SelectItem>
                    {employees.filter(e => e.id !== editingEmployee?.id && e.status === 'active').map(e => (
                      <SelectItem key={e.id} value={e.id}>{isRTL ? (e.name_ar || e.name_en) : (e.name_en || e.name_ar)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ التعيين' : 'Hire Date'}</Label>
                <Input type="date" value={formData.hire_date} onChange={(e) => setFormData(p => ({...p, hire_date: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'نوع العقد' : 'Contract Type'}</Label>
                <Select value={formData.contract_type} onValueChange={(v) => setFormData(p => ({...p, contract_type: v, contract_end_date: v === 'permanent' ? '' : p.contract_end_date}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="permanent">{isRTL ? 'دائم (مفتوح)' : 'Permanent (Open-ended)'}</SelectItem>
                    <SelectItem value="fixed_term">{isRTL ? 'محدد المدة' : 'Fixed Term'}</SelectItem>
                    <SelectItem value="probation">{isRTL ? 'تجريبي' : 'Probation'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.contract_type === 'fixed_term' && (
                <div className="space-y-2">
                  <Label>{isRTL ? 'تاريخ انتهاء العقد' : 'Contract End Date'}</Label>
                  <Input type="date" value={formData.contract_end_date} onChange={(e) => setFormData(p => ({...p, contract_end_date: e.target.value}))} min={formData.hire_date} />
                </div>
              )}
              <div className="space-y-2">
                <Label>{isRTL ? 'نوع التوظيف' : 'Employment Type'}</Label>
                <Select value={formData.employment_type} onValueChange={(v) => setFormData(p => ({...p, employment_type: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">{isRTL ? 'دوام كامل' : 'Full Time'}</SelectItem>
                    <SelectItem value="part_time">{isRTL ? 'دوام جزئي' : 'Part Time'}</SelectItem>
                    <SelectItem value="contract">{isRTL ? 'عقد' : 'Contract'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'حالة الموظف' : 'Employment Status'}</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData(p => ({...p, status: v, end_date: (v === 'terminated' || v === 'retired') ? (p.end_date || format(new Date(), 'yyyy-MM-dd')) : ''}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{isRTL ? 'نشط' : 'Active'}</SelectItem>
                    <SelectItem value="on_leave">{isRTL ? 'في إجازة' : 'On Leave'}</SelectItem>
                    <SelectItem value="suspended">{isRTL ? 'موقوف' : 'Suspended'}</SelectItem>
                    <SelectItem value="terminated">{isRTL ? 'منتهي الخدمة' : 'Terminated'}</SelectItem>
                    <SelectItem value="retired">{isRTL ? 'متقاعد' : 'Retired'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(formData.status === 'terminated' || formData.status === 'retired') && (
                <div className="space-y-2">
                  <Label>{isRTL ? 'تاريخ انتهاء الخدمة' : 'End of Service Date'}</Label>
                  <Input type="date" value={formData.end_date || ''} onChange={(e) => setFormData(p => ({...p, end_date: e.target.value}))} min={formData.hire_date} />
                </div>
              )}
              </div>

              {/* Company & Visa Section */}
              <div className="border-t pt-4 mt-4">
                <h3 className="font-semibold text-ink mb-4">{isRTL ? 'شركة الإقامة / التأشيرة' : 'Residency / Visa Company'}</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{isRTL ? 'شركة الإقامة' : 'Visa Company'}</Label>
                    <Select value={formData.visa_company_id || ''} onValueChange={(v) => setFormData(p => ({...p, visa_company_id: v}))}>
                      <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                      <SelectContent>
                        {companies.map(c => <SelectItem key={c.id} value={c.id}>{isRTL ? c.name_ar : c.name_en}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{isRTL ? 'الشركة المشغلة' : 'Employing Company'}</Label>
                    <Select value={formData.employing_company_id || ''} onValueChange={(v) => setFormData(p => ({...p, employing_company_id: v}))}>
                      <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                      <SelectContent>
                        {companies.map(c => <SelectItem key={c.id} value={c.id}>{isRTL ? c.name_ar : c.name_en}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{isRTL ? 'نوع التأشيرة' : 'Visa Type'}</Label>
                    <Input value={formData.visa_type || ''} onChange={(e) => setFormData(p => ({...p, visa_type: e.target.value}))} />
                  </div>
                </div>
              </div>

              {/* MOE License Section */}
              <div className="border-t pt-4 mt-4">
                <h3 className="font-semibold text-ink mb-4">{isRTL ? 'ترخيص وزارة التعليم' : 'MOE License'}</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{isRTL ? 'تاريخ انتهاء الترخيص' : 'License Expiry Date'}</Label>
                    <Input type="date" value={formData.license_expiry_date || ''} onChange={(e) => setFormData(p => ({...p, license_expiry_date: e.target.value}))} />
                  </div>
                </div>
              </div>
              </TabsContent>
              <TabsContent value="bank" className="space-y-4 pt-2">
                <BankDetailsForm
                  value={formData.bank_details}
                  onChange={(bd) => setFormData(p => ({ ...p, bank_details: bd }))}
                  employeeNameAr={formData.name_ar}
                  nationalId={formData.national_id || formData.iqama_number}
                />
              </TabsContent>
              <TabsContent value="compensation" className="space-y-4">
              <CompensationForm value={formData.compensation} onChange={(comp) => setFormData(p => ({...p, compensation: comp}))} />
              </TabsContent>
              </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{t('cancel')}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Employee Details Dialog */}
      {showDetails && (
        <Dialog open={!!showDetails} onOpenChange={() => setShowDetails(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{isRTL ? 'تفاصيل الموظف' : 'Employee Details'}</DialogTitle>
            </DialogHeader>
            <Tabs defaultValue="general">
              <TabsList className="bg-white border">
                <TabsTrigger value="general">{isRTL ? 'عام' : 'General'}</TabsTrigger>
                <TabsTrigger value="bank">{isRTL ? 'البنك' : 'Bank Details'}</TabsTrigger>
                <TabsTrigger value="compensation">{isRTL ? 'التعويضات والمزايا' : 'Compensation'}</TabsTrigger>
              </TabsList>
              <TabsContent value="general" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-muted-foreground">{isRTL ? 'الرقم الوظيفي' : 'Employee ID'}</Label><p className="font-medium">{showDetails.employee_id}</p></div>
              <div><Label className="text-muted-foreground">{isRTL ? 'الاسم' : 'Name'}</Label><p className="font-medium">{showDetails.name_ar}</p></div>
              <div><Label className="text-muted-foreground">{isRTL ? 'البريد الإلكتروني الوظيفي' : 'Work Email'}</Label><p>{showDetails.email || '-'}</p></div>
              <div><Label className="text-muted-foreground">{isRTL ? 'البريد الإلكتروني الشخصي' : 'Personal Email'}</Label><p>{showDetails.personal_email || '-'}</p></div>
              <div><Label className="text-muted-foreground">{t('phone')}</Label><p>{showDetails.phone}</p></div>
              <div><Label className="text-muted-foreground">{t('nationalId')}</Label><p>{showDetails.national_id}</p></div>
                  <div><Label className="text-muted-foreground">{isRTL ? 'تاريخ التعيين' : 'Hire Date'}</Label><p>{showDetails.hire_date ? format(new Date(showDetails.hire_date), 'dd/MM/yyyy') : '-'}</p></div>
                  <div><Label className="text-muted-foreground">{isRTL ? 'الجنسية' : 'Nationality'}</Label><p>{showDetails.nationality || '-'}</p></div>
                  <div><Label className="text-muted-foreground">{isRTL ? 'القسم' : 'Department'}</Label><p>{departments.find(d => d.id === showDetails.department_id)?.name_ar || '-'}</p></div>
                  {showDetails.license_expiry_date && (
                    <div className="col-span-2">
                      <Label className="text-muted-foreground">{isRTL ? 'تاريخ انتهاء ترخيص MOE' : 'MOE License Expiry'}</Label>
                      <p className={`font-medium ${new Date(showDetails.license_expiry_date) < new Date(Date.now() + 60*24*60*60*1000) ? 'text-amber-600' : 'text-ink'}`}>
                        {format(new Date(showDetails.license_expiry_date), 'dd/MM/yyyy')}
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="bank" className="space-y-4 pt-2">
                <BankDetailsForm
                  value={showDetails.bank_details || {
                    bank_name: showDetails.bank_name || '',
                    iban: showDetails.iban || '',
                    account_number: showDetails.bank_account || '',
                  }}
                  readOnly
                  employeeNameAr={showDetails.name_ar}
                  nationalId={showDetails.national_id || showDetails.iqama_number}
                />
              </TabsContent>
              <TabsContent value="compensation" className="space-y-4">
                <CompensationTab employee={showDetails} />
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      )}

      {/* Company Transfer Dialog */}
      {transferEmployee && (
        <CompanyTransferDialog
          open={showTransferDialog}
          onClose={() => {
            setShowTransferDialog(false);
            setTransferEmployee(null);
          }}
          employee={transferEmployee}
          companies={companies}
        />
      )}
    </div>
  );
}