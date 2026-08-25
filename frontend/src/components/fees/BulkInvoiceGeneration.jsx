import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTenantQuery } from '../../hooks/useTenantQuery';
import { supabase, tenantQuery, fetchData, callApi } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { formatCurrency } from '../../lib/localization';
import { useTenant } from '../TenantContext';
import { useBranch } from '../BranchContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { toast } from 'sonner';
import { Loader2, Users, FileText, X } from 'lucide-react';
import { logAuditEvent } from '../AuditService';
import { useTenantFilter } from '../../hooks/useTenantFilter';
import { planBulkInvoices } from '../../lib/bulkInvoicePlan';

export default function BulkInvoiceGeneration({ open, onClose }) {
  const { t, isRTL } = useLanguage();
  const { tenant } = useTenant();
  const { branches } = useBranch();
  const queryClient = useQueryClient();
  const { tenantId } = useTenantFilter();

  const [step, setStep] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [criteria, setCriteria] = useState({
    academic_year: '',
    grade: '',
    section: '',
    branch_id: '',
    company_id: '',
    fee_plan: '',
    discount_group: ''
  });
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [excludedStudents, setExcludedStudents] = useState([]);
  const [postMode, setPostMode] = useState('draft');
  const [batchName, setBatchName] = useState('');
  const [apiPreview, setApiPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  // Reset state when dialog opens/closes to prevent stale data
  React.useEffect(() => {
    if (!open) {
      setStep(1);
      setCriteria({
        academic_year: '',
        grade: '', section: '', branch_id: '', company_id: '', fee_plan: '', discount_group: ''
      });
      setExcludedStudents([]);
      setSelectedStudents([]);
      setBatchName('');
      setPostMode('draft');
      setApiPreview(null);
    }
  }, [open]);

  const { data: students = [] } = useTenantQuery(
    ['students', 'active', tenantId],
    () => fetchData(tenantQuery('students').select('*').match({ status: 'active' }))
  );

  const { data: companies = [] } = useTenantQuery(
    ['companies', tenantId],
    () => fetchData(tenantQuery('companys').select('id, name_ar, name_en').match({ is_active: true }))
  );

  const { data: contracts = [] } = useTenantQuery(
    ['contracts', tenantId],
    () => fetchData(tenantQuery('student_contracts').select('*').order('created_at'))
  );

  const { data: academicYears = [] } = useTenantQuery(
    ['academicYears', tenantId],
    () => fetchData(tenantQuery('academic_years').select('*').match({ is_current: true }))
  );

  const { data: feePlans = [] } = useTenantQuery(
    ['feeStructures', 'plans', tenantId, criteria.academic_year],
    () => fetchData(
      tenantQuery('fee_structures').select('id, name, academic_year, amount').match(
        criteria.academic_year ? { academic_year: criteria.academic_year } : {}
      )
    ),
    { enabled: !!criteria.academic_year }
  );

  // Existing invoices for the chosen year — drives idempotency so a re-run never
  // silently duplicates an invoice a student already has.
  const { data: existingInvoices = [] } = useTenantQuery(
    ['invoices', 'byYear', tenantId, criteria.academic_year],
    () => fetchData(
      tenantQuery('invoices').select('student_id, academic_year, status').match({ academic_year: criteria.academic_year })
    ),
    { enabled: !!criteria.academic_year }
  );

  const alreadyInvoicedIds = existingInvoices
    .filter((inv) => inv.status !== 'cancelled')
    .map((inv) => inv.student_id);

  // Single source of truth for who gets invoiced and the run total — shared by
  // the preview and the actual generation so they can never disagree.
  const plan = planBulkInvoices({
    students: selectedStudents,
    contracts,
    excludedIds: excludedStudents,
    alreadyInvoicedIds,
  });

  const filteredStudents = students.filter(student => {
    if (criteria.branch_id && student.branch_id !== criteria.branch_id) return false;
    if (criteria.grade && student.grade !== criteria.grade) return false;
    if (criteria.section && student.section !== criteria.section) return false;
    if (criteria.academic_year && student.academic_year !== criteria.academic_year && student.academic_year_id !== criteria.academic_year) return false;
    return !excludedStudents.includes(student.id);
  });

  const buildBulkPayload = (extra = {}) => ({
    academic_year: criteria.academic_year,
    campus_id: criteria.branch_id || undefined,
    grade: criteria.grade || undefined,
    section_id: criteria.section || undefined,
    fee_plan_id: criteria.fee_plan || undefined,
    excluded_student_ids: excludedStudents.length ? excludedStudents : undefined,
    name: batchName || undefined,
    ...extra,
  });

  const handlePreview = async () => {
    if (!criteria.academic_year) {
      toast.error(isRTL ? 'يرجى اختيار العام الدراسي' : 'Please select academic year');
      return;
    }
    setPreviewing(true);
    try {
      const preview = await callApi('/api/billing/bulk-invoices', buildBulkPayload({ dry_run: true }));
      if (!preview.estimated_invoices && !preview.already_invoiced) {
        toast.error(isRTL ? 'لا يوجد طلاب مطابقين للمعايير' : 'No students match the criteria');
        return;
      }
      setApiPreview(preview);
      const matched = students.filter((student) => {
        if (criteria.branch_id && student.branch_id !== criteria.branch_id) return false;
        if (criteria.grade && student.grade !== criteria.grade && student.grade_id !== criteria.grade) return false;
        if (criteria.section && student.section_id !== criteria.section && student.section !== criteria.section) return false;
        return !excludedStudents.includes(student.id);
      });
      setSelectedStudents(matched.length ? matched : students);
      setStep(2);
    } catch (error) {
      console.error(error);
      toast.error(error?.message || (isRTL ? 'فشلت المعاينة' : 'Preview failed'));
    } finally {
      setPreviewing(false);
    }
  };

  const handleGenerate = async () => {
    if (!apiPreview?.estimated_invoices && plan.eligible === 0) {
      toast.error(isRTL ? 'لا يوجد طلاب مؤهلين' : 'No eligible students');
      return;
    }

    setGenerating(true);
    try {
      const result = await callApi(
        '/api/billing/bulk-invoices',
        buildBulkPayload({ dry_run: false, approved: true }),
      );
      await logAuditEvent({
        action: 'BULK_INVOICE_GENERATION',
        entityType: 'InvoiceBatch',
        entityId: result.batch?.id,
        newValues: {
          batch_number: result.batch?.batch_number,
          count: result.created,
          total: result.totals?.net_total,
        },
      });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      const failed = (result.errors || []).length;
      const skipped = result.skipped ?? 0;
      toast.success(
        isRTL
          ? `تم إنشاء ${result.created} فاتورة • تم تخطي ${skipped} • فشل ${failed}`
          : `${result.created} created • ${skipped} skipped • ${failed} failed`
      );
      onClose();
      setStep(1);
      setCriteria({
        academic_year: '',
        grade: '', section: '', branch_id: '', company_id: '', fee_plan: '', discount_group: ''
      });
      setExcludedStudents([]);
      setSelectedStudents([]);
      setApiPreview(null);
    } catch (error) {
      console.error('Error:', error);
      toast.error(error?.message || (isRTL ? 'حدث خطأ' : 'Error occurred'));
    } finally {
      setGenerating(false);
    }
  };

  const grades = ['KG1', 'KG2', 'KG3', 'Grade1', 'Grade2', 'Grade3', 'Grade4', 'Grade5', 'Grade6', 'Grade7', 'Grade8', 'Grade9', 'Grade10', 'Grade11', 'Grade12'];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isRTL ? 'إنشاء فواتير جماعية' : 'Bulk Invoice Generation'}</DialogTitle>
        </DialogHeader>

        <Tabs value={step.toString()} className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="1">{isRTL ? '1. معايير التصفية' : '1. Filter Criteria'}</TabsTrigger>
            <TabsTrigger value="2" disabled={step < 2}>{isRTL ? '2. المعاينة والتأكيد' : '2. Preview & Confirm'}</TabsTrigger>
          </TabsList>

          <TabsContent value="1" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{isRTL ? 'معايير التجميع' : 'Grouping Criteria'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{isRTL ? 'العام الدراسي' : 'Academic Year'} *</Label>
                    <Select value={criteria.academic_year} onValueChange={(v) => setCriteria({...criteria, academic_year: v})}>
                      <SelectTrigger className={!criteria.academic_year ? 'border-red-300' : ''}>
                        <SelectValue placeholder={isRTL ? 'اختر العام الدراسي' : 'Select Academic Year'} />
                      </SelectTrigger>
                      <SelectContent>
                        {academicYears.map(year => (
                          <SelectItem key={year.id} value={year.year_label || year.year_code}>
                            {year.year_label || year.year_code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{isRTL ? 'الفرع' : 'Branch'}</Label>
                    <Select value={criteria.branch_id} onValueChange={(v) => setCriteria({...criteria, branch_id: v})}>
                      <SelectTrigger>
                        <SelectValue placeholder={isRTL ? 'جميع الفروع' : 'All Branches'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={null}>{isRTL ? 'الكل' : 'All'}</SelectItem>
                        {branches.map(b => (
                          <SelectItem key={b.id} value={b.id}>{isRTL ? b.name_ar : b.name_en || b.name_ar}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{isRTL ? 'الصف' : 'Grade'}</Label>
                    <Select value={criteria.grade} onValueChange={(v) => setCriteria({...criteria, grade: v})}>
                      <SelectTrigger>
                        <SelectValue placeholder={isRTL ? 'جميع الصفوف' : 'All Grades'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={null}>{isRTL ? 'الكل' : 'All'}</SelectItem>
                        {grades.map(g => (
                          <SelectItem key={g} value={g}>{t(g)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{isRTL ? 'خطة الرسوم' : 'Fee Plan'}</Label>
                    <Select value={criteria.fee_plan} onValueChange={(v) => setCriteria({...criteria, fee_plan: v})}>
                      <SelectTrigger>
                        <SelectValue placeholder={isRTL ? 'جميع الخطط' : 'All fee plans'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={null}>{isRTL ? 'الكل' : 'All'}</SelectItem>
                        {feePlans.map((fp) => (
                          <SelectItem key={fp.id} value={fp.id}>
                            {fp.name || fp.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{isRTL ? 'الشركة' : 'Company'}</Label>
                    <Select value={criteria.company_id} onValueChange={(v) => setCriteria({...criteria, company_id: v})}>
                      <SelectTrigger>
                        <SelectValue placeholder={isRTL ? 'جميع الشركات' : 'All Companies'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={null}>{isRTL ? 'الكل' : 'All'}</SelectItem>
                        {companies.map(c => (
                          <SelectItem key={c.id} value={c.id}>{isRTL ? c.name_ar : c.name_en}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="pt-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{isRTL ? 'الطلاب المطابقين:' : 'Matching Students:'} <strong>{filteredStudents.length}</strong></span>
                  </div>
                  <Button onClick={handlePreview} disabled={!criteria.academic_year || previewing}>
                    {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {isRTL ? 'معاينة' : 'Preview'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="2" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{isRTL ? 'ملخص الدفعة' : 'Batch Summary'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
                  <div>
                    <p className="text-sm text-muted-foreground">{isRTL ? 'إجمالي المطابقين' : 'Matched'}</p>
                    <p className="text-2xl font-bold">{apiPreview?.student_count ?? selectedStudents.length}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{isRTL ? 'الفواتير المتوقعة' : 'Will Generate'}</p>
                    <p className="text-2xl font-bold text-najdi-700">{apiPreview?.estimated_invoices ?? plan.eligible}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{isRTL ? 'سيتم تخطيهم' : 'Skipped'}</p>
                    <p className="text-2xl font-bold text-amber-600">
                      {apiPreview
                        ? (apiPreview.already_invoiced || 0) + (apiPreview.skipped_no_fees || 0) + excludedStudents.length
                        : plan.excluded + plan.alreadyInvoiced + plan.skippedNoContract}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{isRTL ? 'القيمة المتوقعة (شاملة الضريبة)' : 'Est. Total (incl. VAT)'}</p>
                    <p className="text-2xl font-bold text-emerald-600">
                      {formatCurrency(apiPreview?.estimated_total ?? plan.estimatedTotal, tenant?.localization, isRTL)}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  {isRTL
                    ? `مفوتر مسبقاً: ${apiPreview?.already_invoiced ?? plan.alreadyInvoiced} • بدون رسوم: ${apiPreview?.skipped_no_fees ?? plan.skippedNoContract} • مستبعد: ${excludedStudents.length || plan.excluded}`
                    : `Already invoiced: ${apiPreview?.already_invoiced ?? plan.alreadyInvoiced} • No fees: ${apiPreview?.skipped_no_fees ?? plan.skippedNoContract} • Excluded: ${excludedStudents.length || plan.excluded}`}
                </p>
                <div className="space-y-3">
                  <div>
                    <Label>{isRTL ? 'اسم الدفعة' : 'Batch Name'}</Label>
                    <Input value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder={isRTL ? 'اختياري' : 'Optional'} />
                  </div>
                  <div>
                    <Label>{isRTL ? 'وضع الترحيل' : 'Post Mode'}</Label>
                    <Select value={postMode} onValueChange={setPostMode}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">{isRTL ? 'مسودة' : 'Draft'}</SelectItem>
                        <SelectItem value="final">{isRTL ? 'نهائي' : 'Final'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isRTL ? 'الطالب' : 'Student'}</TableHead>
                    <TableHead>{isRTL ? 'الصف' : 'Grade'}</TableHead>
                    <TableHead>{isRTL ? 'نوع الرسوم' : 'Fee Type'}</TableHead>
                    <TableHead>{isRTL ? 'المبلغ' : 'Amount'}</TableHead>
                    <TableHead>{isRTL ? 'المجموع' : 'Total'}</TableHead>
                    <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedStudents.map(student => {
                    const contract = contracts.find(c => c.student_id === student.id && c.status === 'active');
                    const isExcluded = excludedStudents.includes(student.id);
                    const alreadyInv = alreadyInvoicedIds.includes(student.id);
                    const tuitionFee = contract?.total_fees || 0;
                    const total = tuitionFee * 1.15 - (contract?.discount_amount || 0);
                    
                    return (
                      <TableRow key={student.id} className={isExcluded ? 'bg-red-50 opacity-60' : ''}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{student.name_ar || student.name_en}</p>
                            <p className="text-xs text-muted-foreground">{student.student_id}</p>
                          </div>
                        </TableCell>
                        <TableCell>{t(student.grade)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {contract?.services?.map((service, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {isRTL ? service.fee_type_name_ar : service.fee_type_name_en}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{formatCurrency(tuitionFee, tenant?.localization, isRTL)}</TableCell>
                        <TableCell className="font-semibold text-ink">{formatCurrency(total, tenant?.localization, isRTL)}</TableCell>
                        <TableCell>
                          {isExcluded ? (
                            <Badge className="bg-red-100 text-red-700">{isRTL ? 'مستبعد' : 'Excluded'}</Badge>
                          ) : alreadyInv ? (
                            <Badge className="bg-najdi-50 text-najdi-900">{isRTL ? 'مفوتر مسبقاً' : 'Already Invoiced'}</Badge>
                          ) : !contract ? (
                            <Badge className="bg-amber-100 text-amber-700">{isRTL ? 'لا يوجد عقد' : 'No Contract'}</Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-700">{isRTL ? 'مؤهل' : 'Eligible'}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {contract && (
                            <Button variant="ghost" size="sm" onClick={() => {
                              if (isExcluded) {
                                setExcludedStudents(excludedStudents.filter(id => id !== student.id));
                              } else {
                                setExcludedStudents([...excludedStudents, student.id]);
                              }
                            }}>
                              {isExcluded ? 
                                <><X className="w-4 h-4 me-1" />{isRTL ? 'إلغاء الاستبعاد' : 'Include'}</> :
                                <>{isRTL ? 'استبعاد' : 'Exclude'}</>
                              }
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          {step === 2 && (
            <Button variant="outline" onClick={() => setStep(1)}>
              {isRTL ? 'رجوع' : 'Back'}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            {isRTL ? 'إلغاء' : 'Cancel'}
          </Button>
          {step === 2 && (
            <Button onClick={handleGenerate} disabled={generating || plan.eligible === 0}>
              {generating && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              <FileText className="w-4 h-4 me-2" />
              {isRTL ? 'إنشاء الفواتير' : 'Generate Invoices'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}