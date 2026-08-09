import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import Currency from '../components/Currency';
import { getCurrencySymbol } from '../lib/localization';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsContent, TabsTrigger } from '../components/ui/tabs';
import { Checkbox } from '../components/ui/checkbox';
import { toast } from 'sonner';
import PageHeader from '../components/ui/PageHeader';
import { Plus, Edit2, Loader2, DollarSign, Heart, Tag } from 'lucide-react';
import FeeTypeManager from '../components/fees/FeeTypeManager';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function TuitionFeesConfiguration() {
  const { t: _t, isRTL } = useLanguage();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();

  const [activeTab, setActiveTab] = useState('tuition');
  const [showTuitionForm, setShowTuitionForm] = useState(false);
  const [showSpecialCareForm, setShowSpecialCareForm] = useState(false);
  const [showFeeTypeManager, setShowFeeTypeManager] = useState(false);
  const [editingFee, setEditingFee] = useState(null);
  const [saving, setSaving] = useState(false);

  const [tuitionFormData, setTuitionFormData] = useState({
    academic_year_id: '',
    academic_year: '',
    grade_id: '',
    grade: '',
    branch_id: '',
    section_id: '',
    fee_type_id: '',
    fee_type_code: '',
    fee_type_name_ar: '',
    fee_type_name_en: '',
    amount: '',
    description_ar: '',
    description_en: '',
    is_mandatory: true,
    display_in_intake: true,
    is_active: true
  });

  const [specialCareFormData, setSpecialCareFormData] = useState({
    academic_year: '',
    grade: '',
    branch_id: '',
    fee_calculation_type: 'fixed',
    fixed_amount: '',
    percentage: '',
    description_ar: '',
    description_en: '',
    is_active: true
  });

  const { data: feeStructures = [], isLoading: loadingFees } = useQuery({
    queryKey: ['feeStructures', tenantId],
    queryFn: () => fetchData(tenantQuery('fee_structures').select('*').match(tenantFilter()).order('created_at', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const { data: specialCareFees = [], isLoading: loadingSpecialCare } = useQuery({
    queryKey: ['specialCareFees', tenantId],
    queryFn: () => fetchData(tenantQuery('special_care_fees').select('*').match(tenantFilter()).order('created_at', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchData(tenantQuery('branches').select('*').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const { data: academicYears = [] } = useQuery({
    queryKey: ['academicYears', tenantId],
    queryFn: () => fetchData(tenantQuery('academic_years').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const { data: feeTypes = [] } = useQuery({
    queryKey: ['feeTypes', tenantId],
    queryFn: () => fetchData(tenantQuery('fee_types').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const { data: grades = [] } = useQuery({
    queryKey: ['grades', tenantId],
    queryFn: async () => {
      const { data = [] } = await tenantQuery('grades').select('*').match(tenantFilter({ is_active: true }));
      return data.sort((a, b) => a.display_order - b.display_order);
    },
    enabled: hasTenantAccess,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ['sections', tuitionFormData.branch_id],
    queryFn: () => fetchData(tenantQuery('sections').select('*').match({ 
      branch_id: tuitionFormData.branch_id,
      is_active: true 
    })),
    enabled: !!tuitionFormData.branch_id,
  });

  const handleFeeTypeChange = (feeTypeId) => {
    const feeType = feeTypes.find(ft => ft.id === feeTypeId);
    if (feeType) {
      setTuitionFormData({
        ...tuitionFormData,
        fee_type_id: feeTypeId,
        fee_type_code: feeType.type_code,
        fee_type_name_ar: feeType.name_ar,
        fee_type_name_en: feeType.name_en
      });
    }
  };

  const handleSaveTuition = async () => {
    if (!tuitionFormData.academic_year_id || !tuitionFormData.grade_id || !tuitionFormData.branch_id || !tuitionFormData.amount || !tuitionFormData.fee_type_id) {
      toast.error(isRTL ? 'يرجى ملء الحقول المطلوبة' : 'Please fill required fields');
      return;
    }

    setSaving(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const data = {
        ...tuitionFormData,
        fee_code: editingFee?.fee_code || `FEE-${Date.now()}`,
        amount: parseFloat(tuitionFormData.amount),
        section_id: tuitionFormData.section_id || null,
        created_by: editingFee ? undefined : user.email,
        last_modified_by: user.email
      };

      if (editingFee) {
        await tenantQuery('fee_structures').update(data);
        toast.success(isRTL ? 'تم التحديث' : 'Fee updated');
      } else {
        await tenantQuery('fee_structures').insert(data);
        toast.success(isRTL ? 'تم الإنشاء' : 'Fee created');
      }

      queryClient.invalidateQueries({ queryKey: ['feeStructures'] });
      setShowTuitionForm(false);
      setEditingFee(null);
      setTuitionFormData({
        academic_year_id: '', academic_year: '', grade_id: '', grade: '', 
        branch_id: '', section_id: '',
        fee_type_id: '', fee_type_code: '', fee_type_name_ar: '', fee_type_name_en: '',
        amount: '', description_ar: '', description_en: '',
        is_mandatory: true, display_in_intake: true, is_active: true
      });
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSpecialCare = async () => {
    if (!specialCareFormData.academic_year || !specialCareFormData.grade || !specialCareFormData.branch_id) {
      toast.error(isRTL ? 'يرجى ملء الحقول المطلوبة' : 'Please fill required fields');
      return;
    }

    setSaving(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const data = {
        ...specialCareFormData,
        fee_code: editingFee?.fee_code || `SPCARE-${Date.now()}`,
        fixed_amount: specialCareFormData.fixed_amount ? parseFloat(specialCareFormData.fixed_amount) : undefined,
        percentage: specialCareFormData.percentage ? parseFloat(specialCareFormData.percentage) : undefined,
        created_by: editingFee ? undefined : user.email
      };

      if (editingFee) {
        await tenantQuery('special_care_fees').update(data);
        toast.success(isRTL ? 'تم التحديث' : 'Fee updated');
      } else {
        await tenantQuery('special_care_fees').insert(data);
        toast.success(isRTL ? 'تم الإنشاء' : 'Fee created');
      }

      queryClient.invalidateQueries({ queryKey: ['specialCareFees'] });
      setShowSpecialCareForm(false);
      setEditingFee(null);
      setSpecialCareFormData({
        academic_year: '', grade: '', branch_id: '',
        fee_calculation_type: 'fixed', fixed_amount: '', percentage: '',
        description_ar: '', description_en: '', is_active: true
      });
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'إعدادات الرسوم الدراسية' : 'Tuition Fees Configuration'}
        subtitle={isRTL ? 'إدارة الرسوم الدراسية ورسوم الرعاية الخاصة' : 'Manage tuition and special care fees'}
        action={null}
        actionLabel={isRTL ? 'إدارة أنواع الرسوم' : 'Manage Fee Types'}
        actionIcon={Tag}
        onAction={() => setShowFeeTypeManager(true)}
        variant="secondary"
      />

      {/* SSOT banner */}
      <div className="bg-najdi-50 border border-najdi-100 rounded-lg p-4 flex items-start gap-3">
        <DollarSign className="w-5 h-5 text-najdi-700 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-najdi-900">
            {isRTL ? 'المصدر الوحيد لإعداد الرسوم' : 'Single Source of Truth for Fees'}
          </p>
          <p className="text-sm text-najdi-900 mt-1">
            {isRTL
              ? 'هذه الصفحة هي المكان الوحيد لإعداد الرسوم الدراسية. بعد الإعداد، انتقل إلى بيانات الطالب → رسوم الطالب → تطبيق الرسوم.'
              : 'This page is the only place to configure fees. After configuration, go to Student → Fee Plan → Apply Fees.'}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="tuition">
            <DollarSign className="w-4 h-4 me-2" />
            {isRTL ? 'الرسوم الدراسية' : 'Tuition Fees'}
          </TabsTrigger>
          <TabsTrigger value="specialcare">
            <Heart className="w-4 h-4 me-2" />
            {isRTL ? 'رسوم الرعاية الخاصة' : 'Special Care Fees'}
          </TabsTrigger>
        </TabsList>

        {/* Tuition Fees Tab */}
        <TabsContent value="tuition" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowTuitionForm(true)}>
              <Plus className="w-4 h-4 me-2" />
              {isRTL ? 'رسوم جديدة' : 'New Fee'}
            </Button>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isRTL ? 'العام' : 'Year'}</TableHead>
                  <TableHead>{isRTL ? 'الصف' : 'Grade'}</TableHead>
                  <TableHead>{isRTL ? 'الفرع' : 'Branch'}</TableHead>
                  <TableHead>{isRTL ? 'الشعبة' : 'Section'}</TableHead>
                  <TableHead>{isRTL ? 'نوع الرسوم' : 'Fee Type'}</TableHead>
                  <TableHead>{isRTL ? 'المبلغ' : 'Amount'}</TableHead>
                  <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingFees ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : (
                  feeStructures.map(fee => (
                    <TableRow key={fee.id}>
                      <TableCell>{fee.academic_year}</TableCell>
                      <TableCell>{grades.find(g => g.id === fee.grade_id)?.[isRTL ? 'name_ar' : 'name_en'] || fee.grade}</TableCell>
                      <TableCell>{branches.find(b => b.id === fee.branch_id)?.[isRTL ? 'name_ar' : 'name_en']}</TableCell>
                      <TableCell>
                        {fee.section_id ? (
                          sections.find(s => s.id === fee.section_id)?.[isRTL ? 'name_ar' : 'name_en'] || '-'
                        ) : (
                          <span className="text-muted-foreground">{isRTL ? 'جميع الشعب' : 'All Sections'}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {isRTL ? fee.fee_type_name_ar : fee.fee_type_name_en}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-semibold"><Currency amount={fee.amount} /></TableCell>
                      <TableCell>
                        <Badge className={fee.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-sand-alt'}>
                          {fee.is_active ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'معطل' : 'Inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => {
                          setEditingFee(fee);
                          setTuitionFormData(fee);
                          setShowTuitionForm(true);
                        }}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Special Care Fees Tab */}
        <TabsContent value="specialcare" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowSpecialCareForm(true)}>
              <Plus className="w-4 h-4 me-2" />
              {isRTL ? 'رسوم جديدة' : 'New Fee'}
            </Button>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isRTL ? 'العام' : 'Year'}</TableHead>
                  <TableHead>{isRTL ? 'الصف' : 'Grade'}</TableHead>
                  <TableHead>{isRTL ? 'الفرع' : 'Branch'}</TableHead>
                  <TableHead>{isRTL ? 'نوع الحساب' : 'Type'}</TableHead>
                  <TableHead>{isRTL ? 'القيمة' : 'Value'}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingSpecialCare ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : (
                  specialCareFees.map(fee => (
                    <TableRow key={fee.id}>
                     <TableCell>{fee.academic_year}</TableCell>
                     <TableCell>{grades.find(g => g.grade_code === fee.grade)?.[isRTL ? 'name_ar' : 'name_en'] || fee.grade}</TableCell>
                     <TableCell>{branches.find(b => b.id === fee.branch_id)?.[isRTL ? 'name_ar' : 'name_en']}</TableCell>
                     <TableCell>
                       <Badge variant="outline">
                         {fee.fee_calculation_type === 'fixed' ? (isRTL ? 'مبلغ ثابت' : 'Fixed') : (isRTL ? 'نسبة مئوية' : 'Percentage')}
                       </Badge>
                     </TableCell>
                      <TableCell className="font-semibold">
                        {fee.fee_calculation_type === 'fixed' 
                          ? `${formatCurrency(fee.fixed_amount, tenant?.localization, isRTL)}`
                          : `${fee.percentage}%`}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => {
                          setEditingFee(fee);
                          setSpecialCareFormData(fee);
                          setShowSpecialCareForm(true);
                        }}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Tuition Fee Form */}
      <Dialog open={showTuitionForm} onOpenChange={setShowTuitionForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingFee ? (isRTL ? 'تعديل الرسوم' : 'Edit Fee') : (isRTL ? 'رسوم دراسية جديدة' : 'New Tuition Fee')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isRTL ? 'العام الدراسي' : 'Academic Year'} *</Label>
                <Select 
                  value={tuitionFormData.academic_year_id} 
                  onValueChange={(v) => {
                    const year = academicYears.find(y => y.id === v);
                    setTuitionFormData({
                      ...tuitionFormData, 
                      academic_year_id: v,
                      academic_year: year?.year_label || ''
                    });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر العام' : 'Select Year'} /></SelectTrigger>
                  <SelectContent>
                    {academicYears.map(y => (
                      <SelectItem key={y.id} value={y.id}>{y.year_label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{isRTL ? 'الصف' : 'Grade'} *</Label>
                <Select 
                  value={tuitionFormData.grade_id} 
                  onValueChange={(v) => {
                    const grade = grades.find(g => g.id === v);
                    setTuitionFormData({
                      ...tuitionFormData, 
                      grade_id: v,
                      grade: grade?.grade_code || ''
                    });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر الصف' : 'Select Grade'} /></SelectTrigger>
                  <SelectContent>
                    {grades.map(g => (
                      <SelectItem key={g.id} value={g.id}>
                        {isRTL ? g.name_ar : g.name_en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isRTL ? 'الفرع' : 'Branch'} *</Label>
                <Select 
                  value={tuitionFormData.branch_id} 
                  onValueChange={(v) => setTuitionFormData({...tuitionFormData, branch_id: v, section_id: ''})}
                >
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر الفرع' : 'Select Branch'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{isRTL ? 'جميع الفروع' : 'All Branches'}</SelectItem>
                    {branches.map(b => (
                      <SelectItem key={b.id} value={b.id}>{isRTL ? b.name_ar : b.name_en || b.name_ar}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {tuitionFormData.branch_id === 'ALL' && (
                  <p className="text-xs text-najdi-700 mt-1">
                    {isRTL ? 'سيتم تطبيق هذا الإعداد على جميع الفروع' : 'This configuration will apply to all branches'}
                  </p>
                )}
              </div>
              <div>
                <Label>{isRTL ? 'الشعبة' : 'Section'}</Label>
                <Select 
                  value={tuitionFormData.section_id || 'all'} 
                  onValueChange={(v) => setTuitionFormData({...tuitionFormData, section_id: v === 'all' ? '' : v})}
                  disabled={!tuitionFormData.branch_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isRTL ? 'جميع الشعب' : 'All Sections'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{isRTL ? 'جميع الشعب' : 'All Sections'}</SelectItem>
                    {sections.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {isRTL ? s.name_ar : s.name_en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>{isRTL ? 'نوع الرسوم' : 'Fee Type'} *</Label>
              <Select value={tuitionFormData.fee_type_id} onValueChange={handleFeeTypeChange}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر نوع الرسوم' : 'Select fee type'} /></SelectTrigger>
                <SelectContent>
                  {feeTypes.map(ft => (
                    <SelectItem key={ft.id} value={ft.id}>
                      {isRTL ? ft.name_ar : ft.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{isRTL ? `المبلغ (${getCurrencySymbol(tenant?.localization, isRTL)})` : `Amount (${getCurrencySymbol(tenant?.localization, isRTL)})`} *</Label>
              <Input type="number" value={tuitionFormData.amount} onChange={(e) => setTuitionFormData({...tuitionFormData, amount: e.target.value})} />
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox checked={tuitionFormData.is_mandatory} onCheckedChange={(v) => setTuitionFormData({...tuitionFormData, is_mandatory: v})} />
                <Label>{isRTL ? 'إلزامي' : 'Mandatory'}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={tuitionFormData.display_in_intake} onCheckedChange={(v) => setTuitionFormData({...tuitionFormData, display_in_intake: v})} />
                <Label>{isRTL ? 'عرض في نموذج التسجيل' : 'Display in Intake Form'}</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTuitionForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSaveTuition} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Special Care Fee Form */}
      <Dialog open={showSpecialCareForm} onOpenChange={setShowSpecialCareForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingFee ? (isRTL ? 'تعديل رسوم الرعاية' : 'Edit Special Care Fee') : (isRTL ? 'رسوم رعاية خاصة جديدة' : 'New Special Care Fee')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>{isRTL ? 'العام الدراسي' : 'Academic Year'} *</Label>
                <Select value={specialCareFormData.academic_year} onValueChange={(v) => setSpecialCareFormData({...specialCareFormData, academic_year: v})}>
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر العام' : 'Select Year'} /></SelectTrigger>
                  <SelectContent>
                    {academicYears.map(y => (
                      <SelectItem key={y.id} value={y.year_label}>{y.year_label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{isRTL ? 'الصف' : 'Grade'} *</Label>
                <Select value={specialCareFormData.grade} onValueChange={(v) => setSpecialCareFormData({...specialCareFormData, grade: v})}>
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر الصف' : 'Select Grade'} /></SelectTrigger>
                  <SelectContent>
                    {grades.map(g => (
                      <SelectItem key={g.grade_code} value={g.grade_code}>
                        {isRTL ? g.name_ar : g.name_en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{isRTL ? 'الفرع' : 'Branch'} *</Label>
                <Select value={specialCareFormData.branch_id} onValueChange={(v) => setSpecialCareFormData({...specialCareFormData, branch_id: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {branches.map(b => (
                      <SelectItem key={b.id} value={b.id}>{isRTL ? b.name_ar : b.name_en || b.name_ar}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>{isRTL ? 'نوع الحساب' : 'Calculation Type'}</Label>
              <Select value={specialCareFormData.fee_calculation_type} onValueChange={(v) => setSpecialCareFormData({...specialCareFormData, fee_calculation_type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">{isRTL ? 'مبلغ ثابت' : 'Fixed Amount'}</SelectItem>
                  <SelectItem value="percentage_of_tuition">{isRTL ? 'نسبة من الرسوم الدراسية' : 'Percentage of Tuition'}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {specialCareFormData.fee_calculation_type === 'fixed' ? (
              <div>
                <Label>{isRTL ? `المبلغ الثابت (${getCurrencySymbol(tenant?.localization, isRTL)})` : `Fixed Amount (${getCurrencySymbol(tenant?.localization, isRTL)})`}</Label>
                <Input type="number" value={specialCareFormData.fixed_amount} onChange={(e) => setSpecialCareFormData({...specialCareFormData, fixed_amount: e.target.value})} />
              </div>
            ) : (
              <div>
                <Label>{isRTL ? 'النسبة المئوية (%)' : 'Percentage (%)'}</Label>
                <Input type="number" value={specialCareFormData.percentage} onChange={(e) => setSpecialCareFormData({...specialCareFormData, percentage: e.target.value})} />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSpecialCareForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSaveSpecialCare} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FeeTypeManager open={showFeeTypeManager} onClose={() => setShowFeeTypeManager(false)} />
    </div>
  );
}