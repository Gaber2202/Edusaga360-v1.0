import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTenantQuery } from '../../hooks/useTenantQuery';
import { supabase, tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import Currency from '../Currency';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { AlertCircle, CheckCircle, DollarSign, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useTenantFilter } from '../../hooks/useTenantFilter';
import { useTenant } from '../TenantContext';

export default function StudentFeesSection({ student, onStudentUpdated }) {
  const { t: _t, isRTL } = useLanguage();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const { tenantId } = useTenantFilter();

  // Use live student data from cache so UI auto-refreshes after save
  const { data: liveStudents = [] } = useTenantQuery(
    ['students', tenantId],
    () => fetchData(tenantQuery('students').select('*').order('created_at', { ascending: false })),
    { staleTime: 0 }
  );
  const liveStudent = liveStudents.find(s => s.id === student?.id) || student;
  
  const [selectedYearId, setSelectedYearId] = useState('');
  const [selectedGradeId, setSelectedGradeId] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [applying, setApplying] = useState(false);

  // Initialise from live student whenever it loads/changes
  React.useEffect(() => {
    if (liveStudent) {
      setSelectedYearId(liveStudent.academic_year_id || '');
      setSelectedGradeId(liveStudent.grade_id || '');
      setSelectedSectionId(liveStudent.section_id || '');
    }
  }, [liveStudent?.id, liveStudent?.academic_year_id, liveStudent?.grade_id, liveStudent?.section_id]);

  const { data: academicYears = [] } = useTenantQuery(
    ['academicYears', tenantId],
    () => fetchData(tenantQuery('academic_years').select('*').match({ is_current: true }))
  );

  const { data: grades = [] } = useTenantQuery(
    ['grades', tenantId],
    async () => {
      const { data = [] } = await tenantQuery('grades').select('*');
      return data.sort((a, b) => a.display_order - b.display_order);
    }
  );

  const { data: sections = [] } = useTenantQuery(
    ['sections', student?.branch_id],
    () => fetchData(tenantQuery('sections').select('*').match({
      branch_id: student?.branch_id
    })),
    { enabled: !!student?.branch_id }
  );

  const { data: feeConfigs = [] } = useTenantQuery(
    ['feeStructuresByKeys', selectedYearId, selectedGradeId, liveStudent?.branch_id, selectedSectionId],
    async () => {
      if (!selectedYearId || !selectedGradeId) return [];

      // Fetch all active fee structures for this year+grade (any branch)
      const { data: allByYearGrade = [] } = await tenantQuery('fee_structures').select('*').match({
        academic_year_id: selectedYearId,
        grade_id: selectedGradeId,
        is_active: true
      });

      if (allByYearGrade.length === 0) return [];

      // Match: exact branch OR 'ALL' branches
      const branchMatched = allByYearGrade.filter(f =>
        f.branch_id === liveStudent?.branch_id || f.branch_id === 'ALL'
      );

      const pool = branchMatched.length > 0 ? branchMatched : allByYearGrade;

      // Priority 1: Exact section match
      if (selectedSectionId) {
        const sectionExact = pool.filter(f => f.section_id === selectedSectionId);
        if (sectionExact.length > 0) return sectionExact;
      }
      // Priority 2: No section restriction
      const noSection = pool.filter(f => !f.section_id);
      if (noSection.length > 0) return noSection;
      // Priority 3: Return all matches
      return pool;
    },
    { enabled: !!(selectedYearId && selectedGradeId) }
  );

  const handleApplyFees = async () => {
    if (!selectedYearId || !selectedGradeId) {
      toast.error(isRTL ? 'يرجى اختيار العام والصف' : 'Please select year and grade');
      return;
    }
    if (feeConfigs.length === 0) {
      toast.error(isRTL ? 'لا توجد إعدادات رسوم متاحة لهذا العام والصف' : 'No fee configuration available for this Year/Grade');
      return;
    }

    setApplying(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const totalFees = feeConfigs.reduce((sum, f) => sum + (f.amount || 0), 0);
      if (totalFees <= 0) {
        toast.error(isRTL ? 'المبلغ الإجمالي يجب أن يكون أكبر من صفر' : 'Total amount must be greater than zero');
        setApplying(false);
        return;
      }

      const feeBreakdown = feeConfigs.map(f => ({
        fee_structure_id: f.id,
        fee_type_id: f.fee_type_id,
        fee_type_code: f.fee_type_code,
        fee_type_name_ar: f.fee_type_name_ar,
        fee_type_name_en: f.fee_type_name_en,
        amount: f.amount,
        is_mandatory: f.is_mandatory,
        applied_at: new Date().toISOString()
      }));

      const year = academicYears.find(y => y.id === selectedYearId);
      const grade = grades.find(g => g.id === selectedGradeId);
      const section = sections.find(s => s.id === selectedSectionId);

      const updatePayload = {
        applied_fee_breakdown: feeBreakdown,
        total_applied_fees: totalFees,
        fee_config_applied_date: new Date().toISOString(),
        fee_config_applied_by: user.email,
        academic_year_id: selectedYearId,
        academic_year: year?.year_label || liveStudent.academic_year,
        grade_id: selectedGradeId,
        grade: grade?.grade_code || liveStudent.grade,
        section_id: selectedSectionId || null,
        section: section?.name_ar || liveStudent.section || null
      };

      await tenantQuery('students').update(updatePayload);

      // Invalidate ALL student-related queries so every consumer gets fresh data
      await queryClient.invalidateQueries({ queryKey: ['students'] });

      // Notify parent component if callback provided
      if (onStudentUpdated) {
        onStudentUpdated({ ...liveStudent, ...updatePayload });
      }

      toast.success(isRTL ? '✓ تم تطبيق وحفظ الرسوم بنجاح' : '✓ Fees applied and saved successfully');
    } catch (error) {
      console.error('❌ Error applying fees:', error);
      toast.error(isRTL ? 'تعذر حفظ رسوم الطالب. يرجى المحاولة مرة أخرى.' : "Couldn't save student fees. Please try again.");
    } finally {
      setApplying(false);
    }
  };

  const totalNewFees = feeConfigs.reduce((sum, f) => sum + (f.amount || 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          {isRTL ? 'رسوم الطالب' : 'Student Fees'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Branch warning */}
        {!liveStudent?.branch_id && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-800">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm">{isRTL ? 'الطالب غير مرتبط بفرع. يرجى تحديث بيانات الطالب أولاً.' : 'Student has no branch. Please update student data first.'}</span>
          </div>
        )}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>{isRTL ? 'العام الدراسي' : 'Academic Year'}</Label>
            <Select value={selectedYearId} onValueChange={setSelectedYearId}>
              <SelectTrigger>
                <SelectValue placeholder={isRTL ? 'اختر العام' : 'Select year'} />
              </SelectTrigger>
              <SelectContent>
                {academicYears.map(y => (
                  <SelectItem key={y.id} value={y.id}>{y.year_label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{isRTL ? 'الصف' : 'Grade'}</Label>
            <Select value={selectedGradeId} onValueChange={setSelectedGradeId}>
              <SelectTrigger>
                <SelectValue placeholder={isRTL ? 'اختر الصف' : 'Select grade'} />
              </SelectTrigger>
              <SelectContent>
                {grades.map(g => (
                  <SelectItem key={g.id} value={g.id}>
                    {isRTL ? g.name_ar : g.name_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{isRTL ? 'الشعبة' : 'Section'}</Label>
            <Select value={selectedSectionId || 'all'} onValueChange={(v) => setSelectedSectionId(v === 'all' ? '' : v)}>
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

        {/* Always show currently saved fees if they exist */}
        {liveStudent?.applied_fee_breakdown && liveStudent.applied_fee_breakdown.length > 0 && (
          <div className="space-y-2">
            <Label className="text-emerald-700 font-semibold flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              {isRTL ? 'الرسوم المطبقة حالياً' : 'Currently Applied Fees'}
            </Label>
            <div className="border rounded-lg overflow-hidden bg-emerald-50/50">
              <Table>
                <TableHeader>
                  <TableRow className="bg-emerald-100">
                    <TableHead>{isRTL ? 'نوع الرسوم' : 'Fee Type'}</TableHead>
                    <TableHead className="text-right">{isRTL ? 'المبلغ' : 'Amount'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {liveStudent.applied_fee_breakdown.map((f, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{isRTL ? f.fee_type_name_ar : (f.fee_type_name_en || f.fee_type_name_ar)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        <Currency amount={f.amount} />
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-emerald-50 font-bold">
                    <TableCell>{isRTL ? 'الإجمالي' : 'Total'}</TableCell>
                    <TableCell className="text-right">
                      <Currency amount={liveStudent.total_applied_fees} />
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            {liveStudent.fee_config_applied_date && (
              <p className="text-xs text-muted-foreground">
                {isRTL ? 'آخر تطبيق:' : 'Last applied:'}{' '}
                {format(new Date(liveStudent.fee_config_applied_date), 'dd/MM/yyyy HH:mm')}
                {liveStudent.fee_config_applied_by ? ` — ${liveStudent.fee_config_applied_by}` : ''}
              </p>
            )}
          </div>
        )}

        {selectedYearId && selectedGradeId && (
          <>
            {feeConfigs.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-900">
                    {isRTL ? 'لا توجد إعدادات رسوم' : 'No Fee Configuration Found'}
                  </p>
                  <p className="text-sm text-amber-700 mt-1">
                    {isRTL 
                      ? 'لا توجد إعدادات رسوم مطابقة. تحقق من العام/الصف/الفرع.'
                      : 'No matching fee configuration. Check year/grade/branch.'}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="text-najdi-900 font-semibold">
                    {isRTL ? '📋 الرسوم المتاحة (سيتم تطبيقها)' : '📋 Available Fees (Will Be Applied)'}
                  </Label>
                  <div className="border rounded-lg overflow-hidden bg-najdi-50/30">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-najdi-50">
                          <TableHead>{isRTL ? 'نوع الرسوم' : 'Fee Type'}</TableHead>
                          <TableHead className="text-right">{isRTL ? 'المبلغ' : 'Amount'}</TableHead>
                          <TableHead className="text-center">{isRTL ? 'إلزامي' : 'Mandatory'}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {feeConfigs.map(f => (
                          <TableRow key={f.id}>
                            <TableCell>{isRTL ? f.fee_type_name_ar : (f.fee_type_name_en || f.fee_type_name_ar)}</TableCell>
                            <TableCell className="text-right font-semibold">
                              <Currency amount={f.amount} />
                            </TableCell>
                            <TableCell className="text-center">
                              {f.is_mandatory ? (
                                <CheckCircle className="w-4 h-4 text-emerald-600 mx-auto" />
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-najdi-50 font-bold">
                          <TableCell>{isRTL ? 'الإجمالي' : 'Total'}</TableCell>
                          <TableCell className="text-right">
                            <Currency amount={totalNewFees} />
                          </TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <Button
                  onClick={handleApplyFees}
                  disabled={applying || !selectedYearId || !selectedGradeId || feeConfigs.length === 0}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {applying && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                  {applying
                    ? (isRTL ? 'جاري الحفظ...' : 'Saving...')
                    : (isRTL ? 'تطبيق وحفظ الرسوم' : 'Apply & Save Fees')}
                </Button>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}