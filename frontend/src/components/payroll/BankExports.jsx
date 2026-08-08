import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useTenant } from '../TenantContext';
import { useBranch } from '../BranchContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { buildCsv } from '../../lib/csv';
import {
  Download,
  Landmark,
  Check,
  Loader2,
  Settings
} from 'lucide-react';

const SAUDI_BANKS = [
  { code: 'SNB', name_ar: 'البنك الأهلي السعودي', name_en: 'Saudi National Bank' },
  { code: 'RAJHI', name_ar: 'مصرف الراجحي', name_en: 'Al Rajhi Bank' },
  { code: 'RIYAD', name_ar: 'بنك الرياض', name_en: 'Riyad Bank' },
  { code: 'SABB', name_ar: 'ساب', name_en: 'SABB' },
  { code: 'BSF', name_ar: 'البنك السعودي الفرنسي', name_en: 'Banque Saudi Fransi' },
  { code: 'ANB', name_ar: 'البنك العربي الوطني', name_en: 'Arab National Bank' },
  { code: 'ALINMA', name_ar: 'مصرف الإنماء', name_en: 'Alinma Bank' },
  { code: 'ALBILAD', name_ar: 'بنك البلاد', name_en: 'Bank Albilad' }
];

export default function BankExports() {
  const { isRTL } = useLanguage();
  const { tenant } = useTenant();
  const { selectedBranchId, filterByBranch, branchFilter, branches } = useBranch();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('exports');
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [generateForm, setGenerateForm] = useState({
    pay_run_id: '',
    bank_code: '',
    company_id: '',
    branch_id: '',
    export_type: 'salary_transfer'
  });

  const [profileForm, setProfileForm] = useState({
    profile_code: '',
    profile_name_ar: '',
    profile_name_en: '',
    bank_code: '',
    export_format: 'csv',
    wps_compatible: false,
    company_mol_id: '',
    company_bank_account: ''
  });

  const { data: exports = [], isLoading } = useQuery({
    queryKey: ['bankExports', selectedBranchId],
    queryFn: () => fetchData(tenantQuery('bank_exports').select('*').match(branchFilter()).order('created_at', { ascending: false })),
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['bankProfiles'],
    queryFn: () => fetchData(tenantQuery('bank_export_profiles').select('*').order()),
  });

  const { data: payRuns = [] } = useQuery({
    queryKey: ['payRuns', selectedBranchId],
    queryFn: () => fetchData(tenantQuery('pay_runs').select('*').match(branchFilter()).order('created_at', { ascending: false })),
  });

  const { data: payrollInputs = [] } = useQuery({
    queryKey: ['payrollInputs'],
    queryFn: () => fetchData(tenantQuery('payroll_inputs').select('*').order()),
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => fetchData(tenantQuery('companys').select('*').match({ is_active: true })),
  });

  const filteredExports = filterByBranch(exports);

  const handleGenerateExport = async () => {
    if (!generateForm.pay_run_id || !generateForm.bank_code) {
      toast.error(isRTL ? 'يرجى ملء جميع الحقول' : 'Please fill all fields');
      return;
    }

    setProcessing(true);
    try {
      const payRun = payRuns.find(p => p.id === generateForm.pay_run_id);
      const bank = SAUDI_BANKS.find(b => b.code === generateForm.bank_code);
      const inputs = payrollInputs.filter(p => p.pay_run_id === generateForm.pay_run_id);

      // Filter by bank if not "ALL"
      const bankInputs = generateForm.bank_code === 'ALL' 
        ? inputs 
        : inputs.filter(_p => {
            // Match IBAN to bank (simplified - real implementation would use IBAN bank codes)
            return true; // For now include all
          });

      // Generate CSV content using a CSV-safe writer (escapes commas, quotes, newlines,
      // and neutralizes leading =/+/-/@ to prevent CSV-injection formulas in Excel).
      let csvContent = '';

      if (generateForm.export_type === 'wps') {
        // WPS Format
        const headers = ['EmployeeID', 'EmployeeName', 'IBAN', 'BankCode', 'Amount', 'Currency', 'Reference'];
        const rows = [headers, ...bankInputs.map(input => [
          input.employee_number,
          input.employee_name,
          input.iban,
          generateForm.bank_code,
          input.net_salary,
          tenant?.currency_code || 'XXX',
          `SAL-${payRun.period}`,
        ])];
        csvContent = buildCsv(rows);
      } else {
        // Standard salary transfer
        const headers = ['Employee ID', 'Employee Name', 'IBAN', 'Net Salary', 'Reference'];
        const rows = [headers, ...bankInputs.map(input => [
          input.employee_number,
          input.employee_name,
          input.iban || '',
          input.net_salary,
          `SAL-${payRun.period}-${input.employee_number}`,
        ])];
        csvContent = buildCsv(rows);
      }

      // Create blob and download
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const fileName = `${generateForm.export_type}_${payRun.period}_${bank?.code || 'ALL'}_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;

      // Create export record
      const _exportRecord = await tenantQuery('bank_exports').insert({
        export_number: `EXP-${Date.now().toString().slice(-8)}`,
        pay_run_id: generateForm.pay_run_id,
        period: payRun.period,
        branch_id: payRun.branch_id,
        bank_code: generateForm.bank_code,
        bank_name: isRTL ? bank?.name_ar : bank?.name_en,
        export_type: generateForm.export_type,
        employee_count: bankInputs.length,
        total_amount: bankInputs.reduce((sum, i) => sum + (i.net_salary || 0), 0),
        file_name: fileName,
        status: 'generated'
      });

      // Download file
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();

      queryClient.invalidateQueries({ queryKey: ['bankExports'] });
      setShowGenerateDialog(false);
      toast.success(isRTL ? 'تم إنشاء ملف البنك بنجاح' : 'Bank file generated successfully');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateProfile = async () => {
    if (!profileForm.profile_code || !profileForm.profile_name_ar || !profileForm.bank_code) {
      toast.error(isRTL ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill required fields');
      return;
    }

    setProcessing(true);
    try {
      const bank = SAUDI_BANKS.find(b => b.code === profileForm.bank_code);
      await tenantQuery('bank_export_profiles').insert({
        ...profileForm,
        bank_name_ar: bank?.name_ar,
        bank_name_en: bank?.name_en,
        is_active: true
      });
      queryClient.invalidateQueries({ queryKey: ['bankProfiles'] });
      setShowProfileDialog(false);
      setProfileForm({
        profile_code: '',
        profile_name_ar: '',
        profile_name_en: '',
        bank_code: '',
        export_format: 'csv',
        wps_compatible: false,
        company_mol_id: '',
        company_bank_account: ''
      });
      toast.success(isRTL ? 'تم إنشاء ملف التعريف' : 'Profile created');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setProcessing(false);
    }
  };

  const statusColors = {
    generated: 'bg-najdi-50 text-najdi-900',
    submitted: 'bg-amber-100 text-amber-700',
    processed: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
    reconciled: 'bg-green-100 text-green-700'
  };

  const statusLabels = {
    generated: { ar: 'تم الإنشاء', en: 'Generated' },
    submitted: { ar: 'تم الإرسال', en: 'Submitted' },
    processed: { ar: 'تمت المعالجة', en: 'Processed' },
    failed: { ar: 'فشل', en: 'Failed' },
    reconciled: { ar: 'تمت التسوية', en: 'Reconciled' }
  };

  const exportTypeLabels = {
    salary_transfer: { ar: 'تحويل رواتب', en: 'Salary Transfer' },
    wps: { ar: 'ملف WPS', en: 'WPS File' },
    reconciliation: { ar: 'تسوية', en: 'Reconciliation' }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">{isRTL ? 'ملفات البنك' : 'Bank Exports'}</h2>
          <p className="text-sm text-muted-foreground">{isRTL ? 'إنشاء وإدارة ملفات تحويل الرواتب' : 'Generate and manage salary transfer files'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowProfileDialog(true)}>
            <Settings className="w-4 h-4 me-2" />
            {isRTL ? 'ملف تعريف جديد' : 'New Profile'}
          </Button>
          <Button onClick={() => setShowGenerateDialog(true)}>
            <Download className="w-4 h-4 me-2" />
            {isRTL ? 'إنشاء ملف بنك' : 'Generate Bank File'}
          </Button>
        </div>
      </div>

      {/* Supported Banks */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Landmark className="w-5 h-5" />
            {isRTL ? 'البنوك المدعومة' : 'Supported Banks'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {SAUDI_BANKS.map(bank => (
              <div key={bank.code} className="p-3 bg-sand rounded-lg text-center">
                <p className="font-semibold text-sm">{bank.code}</p>
                <p className="text-xs text-muted-foreground mt-1">{isRTL ? bank.name_ar : bank.name_en}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="exports">{isRTL ? 'الملفات' : 'Exports'}</TabsTrigger>
          <TabsTrigger value="profiles">{isRTL ? 'ملفات التعريف' : 'Profiles'}</TabsTrigger>
        </TabsList>

        <TabsContent value="exports" className="mt-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isRTL ? 'رقم التصدير' : 'Export #'}</TableHead>
                  <TableHead>{isRTL ? 'الفترة' : 'Period'}</TableHead>
                  <TableHead>{isRTL ? 'البنك' : 'Bank'}</TableHead>
                  <TableHead>{isRTL ? 'النوع' : 'Type'}</TableHead>
                  <TableHead>{isRTL ? 'الموظفين' : 'Employees'}</TableHead>
                  <TableHead>{isRTL ? 'المبلغ' : 'Amount'}</TableHead>
                  <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : filteredExports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {isRTL ? 'لا توجد ملفات' : 'No exports found'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredExports.map(exp => (
                    <TableRow key={exp.id}>
                      <TableCell className="font-medium">{exp.export_number}</TableCell>
                      <TableCell>{exp.period}</TableCell>
                      <TableCell>{exp.bank_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {isRTL ? exportTypeLabels[exp.export_type]?.ar : exportTypeLabels[exp.export_type]?.en}
                        </Badge>
                      </TableCell>
                      <TableCell>{exp.employee_count}</TableCell>
                      <TableCell>{exp.total_amount?.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge className={statusColors[exp.status]}>
                          {isRTL ? statusLabels[exp.status]?.ar : statusLabels[exp.status]?.en}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {exp.file_url && (
                          <Button size="sm" variant="ghost" asChild>
                            <a href={exp.file_url} download>
                              <Download className="w-4 h-4" />
                            </a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="profiles" className="mt-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isRTL ? 'الكود' : 'Code'}</TableHead>
                  <TableHead>{isRTL ? 'الاسم' : 'Name'}</TableHead>
                  <TableHead>{isRTL ? 'البنك' : 'Bank'}</TableHead>
                  <TableHead>{isRTL ? 'الصيغة' : 'Format'}</TableHead>
                  <TableHead>{isRTL ? 'WPS' : 'WPS'}</TableHead>
                  <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {isRTL ? 'لا توجد ملفات تعريف' : 'No profiles found'}
                    </TableCell>
                  </TableRow>
                ) : (
                  profiles.map(profile => (
                    <TableRow key={profile.id}>
                      <TableCell className="font-medium">{profile.profile_code}</TableCell>
                      <TableCell>{isRTL ? profile.profile_name_ar : profile.profile_name_en}</TableCell>
                      <TableCell>{isRTL ? profile.bank_name_ar : profile.bank_name_en}</TableCell>
                      <TableCell>{profile.export_format?.toUpperCase()}</TableCell>
                      <TableCell>
                        {profile.wps_compatible ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={profile.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-sand-alt text-ink'}>
                          {profile.is_active ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'غير نشط' : 'Inactive')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Generate Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'إنشاء ملف بنك' : 'Generate Bank File'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'كشف الرواتب' : 'Pay Run'}</Label>
              <Select value={generateForm.pay_run_id} onValueChange={(v) => setGenerateForm({...generateForm, pay_run_id: v})}>
                <SelectTrigger>
                  <SelectValue placeholder={isRTL ? 'اختر كشف الرواتب' : 'Select pay run'} />
                </SelectTrigger>
                <SelectContent>
                  {payRuns
                    .filter(run => ['approved', 'exported', 'completed'].includes(run.workflow_stage || run.status))
                    .map(run => (
                      <SelectItem key={run.id} value={run.id}>
                        {run.period} - {run.branch_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'البنك' : 'Bank'}</Label>
              <Select value={generateForm.bank_code} onValueChange={(v) => setGenerateForm({...generateForm, bank_code: v})}>
                <SelectTrigger>
                  <SelectValue placeholder={isRTL ? 'اختر البنك' : 'Select bank'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{isRTL ? 'جميع البنوك' : 'All Banks'}</SelectItem>
                  {SAUDI_BANKS.map(bank => (
                    <SelectItem key={bank.code} value={bank.code}>
                      {isRTL ? bank.name_ar : bank.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'الشركة' : 'Company'}</Label>
              <Select value={generateForm.company_id} onValueChange={(v) => setGenerateForm({...generateForm, company_id: v})}>
                <SelectTrigger>
                  <SelectValue placeholder={isRTL ? 'جميع الشركات' : 'All Companies'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>{isRTL ? 'الكل' : 'All'}</SelectItem>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {isRTL ? c.name_ar : c.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'الفرع' : 'Branch'}</Label>
              <Select value={generateForm.branch_id} onValueChange={(v) => setGenerateForm({...generateForm, branch_id: v})}>
                <SelectTrigger>
                  <SelectValue placeholder={isRTL ? 'جميع الفروع' : 'All Branches'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>{isRTL ? 'الكل' : 'All'}</SelectItem>
                  {branches.map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      {isRTL ? b.name_ar : b.name_en || b.name_ar}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'نوع الملف' : 'Export Type'}</Label>
              <Select value={generateForm.export_type} onValueChange={(v) => setGenerateForm({...generateForm, export_type: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="salary_transfer">{isRTL ? 'تحويل رواتب' : 'Salary Transfer'}</SelectItem>
                  <SelectItem value="wps">{isRTL ? 'ملف WPS' : 'WPS File'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>
              {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleGenerateExport} disabled={processing}>
              {processing && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              <Download className="w-4 h-4 me-2" />
              {isRTL ? 'إنشاء وتنزيل' : 'Generate & Download'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Profile Dialog */}
      <Dialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'ملف تعريف بنك جديد' : 'New Bank Profile'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'الكود' : 'Code'}</Label>
                <Input 
                  value={profileForm.profile_code}
                  onChange={(e) => setProfileForm({...profileForm, profile_code: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'البنك' : 'Bank'}</Label>
                <Select value={profileForm.bank_code} onValueChange={(v) => setProfileForm({...profileForm, bank_code: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SAUDI_BANKS.map(bank => (
                      <SelectItem key={bank.code} value={bank.code}>
                        {bank.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الاسم بالعربي' : 'Name (Arabic)'}</Label>
              <Input 
                value={profileForm.profile_name_ar}
                onChange={(e) => setProfileForm({...profileForm, profile_name_ar: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الاسم بالإنجليزي' : 'Name (English)'}</Label>
              <Input 
                value={profileForm.profile_name_en}
                onChange={(e) => setProfileForm({...profileForm, profile_name_en: e.target.value})}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProfileDialog(false)}>
              {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleCreateProfile} disabled={processing}>
              {processing && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'إنشاء' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}