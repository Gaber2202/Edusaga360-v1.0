import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
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

export default function BulkInvoiceGeneration({ open, onClose }) {
  const { t, isRTL } = useLanguage();
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
    nationality_category: '',
    discount_group: ''
  });
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [excludedStudents, setExcludedStudents] = useState([]);
  const [postMode, setPostMode] = useState('draft');
  const [batchName, setBatchName] = useState('');

  // Reset state when dialog opens/closes to prevent stale data
  React.useEffect(() => {
    if (!open) {
      setStep(1);
      setCriteria({
        academic_year: '',
        grade: '', section: '', branch_id: '', company_id: '', fee_plan: '', nationality_category: '', discount_group: ''
      });
      setExcludedStudents([]);
      setSelectedStudents([]);
      setBatchName('');
      setPostMode('draft');
    }
  }, [open]);

  const { data: students = [] } = useQuery({
    queryKey: ['students', 'active', tenantId],
    queryFn: () => fetchData(tenantQuery('students').select('*').match({ status: 'active' })),
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies', tenantId],
    queryFn: () => fetchData(tenantQuery('companys').select('*').match({ is_active: true })),
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ['contracts', tenantId],
    queryFn: () => fetchData(tenantQuery('student_contracts').select('*').order()),
  });

  const { data: academicYears = [] } = useQuery({
    queryKey: ['academicYears', tenantId],
    queryFn: () => fetchData(tenantQuery('academic_years').select('*').match({ is_active: true })),
  });

  const filteredStudents = students.filter(student => {
    if (criteria.branch_id && student.branch_id !== criteria.branch_id) return false;
    if (criteria.grade && student.grade !== criteria.grade) return false;
    if (criteria.section && student.section !== criteria.section) return false;
    if (criteria.academic_year && student.academic_year !== criteria.academic_year && student.academic_year_id !== criteria.academic_year) return false;
    if (criteria.nationality_category) {
      if (criteria.nationality_category === 'saudi' && student.nationality !== 'Saudi' && student.nationality !== 'سعودي') return false;
      if (criteria.nationality_category === 'non_saudi' && (student.nationality === 'Saudi' || student.nationality === 'سعودي')) return false;
    }
    return !excludedStudents.includes(student.id);
  });

  const handlePreview = () => {
    if (!criteria.academic_year) {
      toast.error(isRTL ? 'يرجى اختيار العام الدراسي' : 'Please select academic year');
      return;
    }
    // Use full student list for preview (no academic_year filter if field is year_label)
    const allStudents = students.filter(student => {
      if (criteria.branch_id && student.branch_id !== criteria.branch_id) return false;
      if (criteria.grade && student.grade !== criteria.grade) return false;
      if (criteria.section && student.section !== criteria.section) return false;
      if (criteria.nationality_category) {
        if (criteria.nationality_category === 'saudi' && student.nationality !== 'Saudi' && student.nationality !== 'سعودي') return false;
        if (criteria.nationality_category === 'non_saudi' && (student.nationality === 'Saudi' || student.nationality === 'سعودي')) return false;
      }
      return !excludedStudents.includes(student.id);
    });
    if (allStudents.length === 0) {
      toast.error(isRTL ? 'لا يوجد طلاب مطابقين للمعايير' : 'No students match the criteria');
      return;
    }
    setSelectedStudents(allStudents);
    setStep(2);
  };

  const handleGenerate = async () => {
    if (selectedStudents.length === 0) {
      toast.error(isRTL ? 'لا يوجد طلاب محددين' : 'No students selected');
      return;
    }

    setGenerating(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const batchNumber = `BATCH-${Date.now()}`;
      
      let totalAmount = 0;
      let totalVat = 0;
      let totalDiscount = 0;
      const createdInvoices = [];

      // Create batch record
      const batch = await tenantQuery('invoice_batchs').insert({
        batch_number: batchNumber,
        batch_name: batchName || `Bulk Invoice - ${new Date().toLocaleDateString()}`,
        created_by: user.full_name,
        created_by_email: user.email,
        created_date: new Date().toISOString(),
        criteria: criteria,
        student_count: selectedStudents.length,
        excluded_students: excludedStudents,
        status: 'generated',
        posted_mode: postMode,
        branch_id: criteria.branch_id || 'all'
      });

      // Generate invoices for each student
      for (const student of selectedStudents) {
        const contract = contracts.find(c => c.student_id === student.id && c.status === 'active');
        if (!contract) continue;

        const invoiceData = {
          invoice_number: `INV-${Date.now()}-${student.id.slice(0, 6)}`,
          student_id: student.id,
          student_name: student.name_ar || student.name_en,
          guardian_id: student.guardian_id,
          branch_id: student.branch_id,
          grade: student.grade,
          academic_year: criteria.academic_year,
          issue_date: new Date().toISOString().split('T')[0],
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          items: contract.services || [],
          subtotal: contract.total_fees || 0,
          vat_amount: (contract.total_fees || 0) * 0.15,
          discount_amount: contract.discount_amount || 0,
          total_amount: (contract.total_fees || 0) * 1.15 - (contract.discount_amount || 0),
          balance: (contract.total_fees || 0) * 1.15 - (contract.discount_amount || 0),
          status: postMode === 'final' ? 'issued' : 'draft',
          batch_id: batch.id,
          batch_number: batchNumber
        };

        totalAmount += invoiceData.subtotal;
        totalVat += invoiceData.vat_amount;
        totalDiscount += invoiceData.discount_amount;

        const invoice = await tenantQuery('invoices').insert(invoiceData);
        createdInvoices.push(invoice);
      }

      // Update batch totals
      await tenantQuery('invoice_batchs').update({
        invoice_count: createdInvoices.length,
        total_amount: totalAmount,
        total_vat: totalVat,
        total_discount: totalDiscount,
        net_total: totalAmount + totalVat - totalDiscount
      });

      // Log audit event
      await logAuditEvent({
        action: 'BULK_INVOICE_GENERATION',
        entityType: 'InvoiceBatch',
        entityId: batch.id,
        newValues: { batch_number: batchNumber, count: createdInvoices.length, total: totalAmount + totalVat - totalDiscount }
      });

      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success(isRTL ? `تم إنشاء ${createdInvoices.length} فاتورة` : `${createdInvoices.length} invoices created`);
      onClose();
      setStep(1);
      setCriteria({
        academic_year: '',
        grade: '', section: '', branch_id: '', company_id: '', fee_plan: '', nationality_category: '', discount_group: ''
      });
      setExcludedStudents([]);
      setSelectedStudents([]);
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
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
                  <div>
                    <Label>{isRTL ? 'فئة الجنسية' : 'Nationality Category'}</Label>
                    <Select value={criteria.nationality_category} onValueChange={(v) => setCriteria({...criteria, nationality_category: v})}>
                      <SelectTrigger>
                        <SelectValue placeholder={isRTL ? 'الكل' : 'All'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={null}>{isRTL ? 'الكل' : 'All'}</SelectItem>
                        <SelectItem value="saudi">{isRTL ? 'سعودي' : 'Saudi'}</SelectItem>
                        <SelectItem value="non_saudi">{isRTL ? 'غير سعودي' : 'Non-Saudi'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="pt-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-slate-400" />
                    <span className="text-sm text-slate-600">{isRTL ? 'الطلاب المطابقين:' : 'Matching Students:'} <strong>{filteredStudents.length}</strong></span>
                  </div>
                  <Button onClick={handlePreview} disabled={!criteria.academic_year}>
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
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-slate-500">{isRTL ? 'عدد الطلاب' : 'Students'}</p>
                    <p className="text-2xl font-bold">{selectedStudents.length}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{isRTL ? 'المستبعدين' : 'Excluded'}</p>
                    <p className="text-2xl font-bold text-red-600">{excludedStudents.length}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{isRTL ? 'الفواتير المتوقعة' : 'Expected Invoices'}</p>
                    <p className="text-2xl font-bold text-blue-600">{selectedStudents.length - excludedStudents.length}</p>
                  </div>
                </div>
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
                    const tuitionFee = contract?.total_fees || 0;
                    const total = tuitionFee * 1.15 - (contract?.discount_amount || 0);
                    
                    return (
                      <TableRow key={student.id} className={isExcluded ? 'bg-red-50 opacity-60' : ''}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{student.name_ar || student.name_en}</p>
                            <p className="text-xs text-slate-500">{student.student_id}</p>
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
                        <TableCell className="font-medium">{tuitionFee.toLocaleString()} {t('sar')}</TableCell>
                        <TableCell className="font-semibold text-slate-900">{total.toLocaleString()} {t('sar')}</TableCell>
                        <TableCell>
                          {!contract ? (
                            <Badge className="bg-amber-100 text-amber-700">{isRTL ? 'لا يوجد عقد' : 'No Contract'}</Badge>
                          ) : isExcluded ? (
                            <Badge className="bg-red-100 text-red-700">{isRTL ? 'مستبعد' : 'Excluded'}</Badge>
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
            <Button onClick={handleGenerate} disabled={generating || selectedStudents.length - excludedStudents.length === 0}>
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