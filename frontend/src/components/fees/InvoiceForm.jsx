import React, { useState, useEffect } from 'react';
import { useTenantQuery } from '../../hooks/useTenantQuery';
import { useLanguage } from '../LanguageContext';
import { formatCurrency, getCurrencySymbol } from '../../lib/localization';
import { useBranch } from '../BranchContext';
import { tenantQuery, fetchData, callApi, supabase } from '../../api/supabaseClient';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Plus, Trash2, Loader2, Download } from 'lucide-react';
import { format } from 'date-fns';
import { logAuditEvent, AuditActions } from '../AuditService';
import { reportError } from '../../lib/errorReporter';
import { toast } from 'sonner';
import { createJournalEntry } from '../../api/journalEntry';
import { useTenant } from '../TenantContext';
import { useTenantFilter } from '../../hooks/useTenantFilter';
import { getVatRate } from '../../lib/vatRate';
import { resolveStudentFees } from '../../lib/resolveStudentFees';

// Fee types are now loaded from the database via FeeType entity

export default function InvoiceForm({ open, onClose, onSuccess, invoice }) {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId } = useBranch();
  const { tenant } = useTenant();
  const { tenantId } = useTenantFilter();
  const [loading, setLoading] = useState(false);
  const [zatcaData, setZatcaData] = useState(null);
  const [savedInvoiceId, setSavedInvoiceId] = useState(invoice?.id || null);
  const [formData, setFormData] = useState({
    student_id: '',
    student_name: '',
    grade: '',
    academic_year: '2024-2025',
    issue_date: format(new Date(), 'yyyy-MM-dd'),
    due_date: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    items: [{ description: '', description_ar: '', amount: 0, fee_type_id: '', fee_type_name_ar: '', fee_type_name_en: '' }],
    discount_amount: 0,
    discount_reason: '',
    preferred_payment_method: '',
    payment_methods: [],
    bank_account_id: '',
    notes: '',
    status: 'draft'
  });

  const { data: students = [] } = useTenantQuery(
    ['activeStudents', tenantId],
    () => fetchData(tenantQuery('students').select('*').match({ status: 'active' }))
  );

  const { data: feeStructures = [] } = useTenantQuery(
    ['feeStructures', tenantId],
    () => fetchData(tenantQuery('fee_structures').select('*').match({ is_active: true }))
  );

  const { data: bankAccounts = [] } = useTenantQuery(
    ['bankAccounts', tenantId],
    () => fetchData(tenantQuery('school_bank_accounts').select('*').match({ status: 'active' }))
  );

  const { data: feeTypes = [] } = useTenantQuery(
    ['feeTypes', tenantId],
    () => fetchData(tenantQuery('fee_types').select('*').match({ is_active: true }))
  );

  const { data: academicYears = [] } = useTenantQuery(
    ['academicYears', tenantId],
    () => fetchData(tenantQuery('academic_years').select('*').match({ is_active: true }))
  );

  // Default a NEW invoice to the active academic year (instead of a hardcoded
  // year) once the list loads — without clobbering an explicit user choice.
  useEffect(() => {
    if (invoice || academicYears.length === 0) return;
    const active = academicYears.find((y) => y.is_active) || academicYears[0];
    const label = active?.year_label || active?.year_code;
    if (!label) return;
    setFormData((prev) =>
      prev.academic_year && prev.academic_year !== '2024-2025'
        ? prev
        : { ...prev, academic_year: label }
    );
  }, [academicYears, invoice, open]);

  // CRITICAL FIX: Properly load invoice data when editing
  useEffect(() => {
    if (invoice) {
      console.log('Loading invoice for edit:', invoice);
      setFormData({
        student_id: invoice.student_id || '',
        student_name: invoice.student_name || '',
        grade: invoice.grade || '',
        academic_year: invoice.academic_year || '2024-2025',
        issue_date: invoice.issue_date || format(new Date(), 'yyyy-MM-dd'),
        due_date: invoice.due_date || format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
        items: invoice.items || [{ description: '', description_ar: '', amount: 0, fee_type_id: '', fee_type_name_ar: '', fee_type_name_en: '' }],
        discount_amount: invoice.discount_amount || 0,
        discount_reason: invoice.discount_reason || '',
        preferred_payment_method: invoice.preferred_payment_method || '',
        payment_methods: invoice.payment_methods || [],
        bank_account_id: invoice.bank_account_id || '',
        notes: invoice.notes || '',
        status: invoice.status || 'draft',
        invoice_number: invoice.invoice_number || '',
        paid_amount: invoice.paid_amount || 0
      });
    } else {
      // Reset form for new invoice
      setFormData({
        student_id: '',
        student_name: '',
        grade: '',
        academic_year: '2024-2025',
        issue_date: format(new Date(), 'yyyy-MM-dd'),
        due_date: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
        items: [{ description: '', description_ar: '', amount: 0, fee_type_id: '', fee_type_name_ar: '', fee_type_name_en: '' }],
        discount_amount: 0,
        discount_reason: '',
        preferred_payment_method: '',
        payment_methods: [],
        bank_account_id: '',
        notes: '',
        status: 'draft'
      });
    }
  }, [invoice, open]);

  const handleStudentChange = (studentId) => {
    const student = students.find(s => s.id === studentId);
    if (student) {
      setFormData(prev => ({
        ...prev,
        student_id: studentId,
        student_name: student.name_ar,
        grade: student.grade
      }));

      // Auto-populate fees based on grade + the selected academic year (P1.3).
      const items = resolveStudentFees({ feeStructures, student, academicYear: formData.academic_year });
      if (items.length > 0) {
        setFormData(prev => ({ ...prev, items }));
      }
    }
  };

  // The academic year drives which fee structure applies — re-resolve the line
  // items for the selected student whenever it changes (P1.3).
  const handleAcademicYearChange = (value) => {
    setFormData(prev => {
      const next = { ...prev, academic_year: value };
      const student = students.find(s => s.id === prev.student_id);
      if (student) {
        const items = resolveStudentFees({ feeStructures, student, academicYear: value });
        if (items.length > 0) next.items = items;
      }
      return next;
    });
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData(prev => ({ ...prev, items: newItems }));
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { description: '', description_ar: '', amount: 0, fee_type_id: '', fee_type_name_ar: '', fee_type_name_en: '' }]
    }));
  };

  const handleFeeTypeChange = (index, feeTypeId) => {
    const feeType = feeTypes.find(ft => ft.id === feeTypeId);
    if (feeType) {
      handleItemChange(index, 'fee_type_id', feeTypeId);
      handleItemChange(index, 'fee_type_name_ar', feeType.name_ar);
      handleItemChange(index, 'fee_type_name_en', feeType.name_en);
    }
  };

  const removeItem = (index) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const paymentMethodOptions = [
    { id: 'mada', label: isRTL ? 'مدى' : 'Mada' },
    { id: 'creditcard', label: isRTL ? 'بطاقة ائتمان / مدين' : 'Credit / Debit Card' },
    { id: 'applepay', label: 'Apple Pay' },
    { id: 'stcpay', label: 'STC Pay' },
    { id: 'samsungpay', label: 'Samsung Pay' },
    { id: 'bank_transfer', label: isRTL ? 'تحويل بنكي' : 'Bank Transfer' },
    { id: 'cash', label: isRTL ? 'نقداً' : 'Cash' },
  ];

  const togglePaymentMethod = (methodId) => {
    setFormData((prev) => {
      const current = prev.payment_methods || [];
      const next = current.includes(methodId)
        ? current.filter((m) => m !== methodId)
        : [...current, methodId];
      return { ...prev, payment_methods: next };
    });
  };

  const vatRate = getVatRate(tenant);
  const subtotal = formData.items.reduce((sum, item) => sum + Math.max(0, parseFloat(item.amount) || 0), 0);
  const vatAmount = Math.round(subtotal * vatRate * 100) / 100;
  const maxDiscount = subtotal + vatAmount;
  const discount = Math.min(Math.max(0, parseFloat(formData.discount_amount) || 0), maxDiscount);
  const total = subtotal + vatAmount - discount;

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.student_id) {
      alert(isRTL ? 'يرجى اختيار الطالب' : 'Please select a student');
      return;
    }
    if (subtotal <= 0) {
      alert(isRTL ? 'يجب أن يكون إجمالي بنود الفاتورة أكبر من صفر' : 'Invoice line items must total more than zero');
      return;
    }
    if (discount > maxDiscount) {
      alert(isRTL ? 'لا يمكن أن يتجاوز الخصم الإجمالي المستحق' : 'Discount cannot exceed the invoice total');
      return;
    }
    if (formData.issue_date && formData.due_date && formData.due_date < formData.issue_date) {
      alert(isRTL ? 'تاريخ الاستحقاق يجب أن يكون بعد تاريخ الإصدار' : 'Due date must be on or after the issue date');
      return;
    }

    setLoading(true);
    try {
      const invoiceNumber = formData.invoice_number || `INV-${Date.now().toString(36).toUpperCase()}`;
      
      // Store bank account details if bank transfer selected
      let bankAccountDetails = null;
      if (formData.preferred_payment_method === 'bank_transfer' && formData.bank_account_id) {
        const selectedAccount = bankAccounts.find(acc => acc.id === formData.bank_account_id);
        if (selectedAccount) {
          bankAccountDetails = {
            bank_name: selectedAccount.bank_name,
            account_name: selectedAccount.account_name,
            iban: selectedAccount.iban
          };
        }
      }

      const data = {
        ...formData,
        invoice_number: invoiceNumber,
        date: formData.issue_date,
        subtotal,
        vat_amount: vatAmount,
        discount_amount: discount,
        total_amount: total,
        paid_amount: formData.paid_amount || 0,
        balance: total - (formData.paid_amount || 0),
        bank_account_details: bankAccountDetails,
        branch_id: selectedBranchId || null
      };

      // Auto-create journal entry when invoice is issued
      if (data.status === 'issued') {
        try {
          const discount = parseFloat(formData.discount_amount) || 0;
          // Dr A/R = total (what the student owes after discount)
          // Dr Sales Discount = discount (contra-revenue, keeps entry balanced)
          // Cr Tuition Revenue = subtotal (gross)
          // Cr VAT Payable = vatAmount
          // Sum debits = total + discount = subtotal + vatAmount = Sum credits
          const jeLines = [
            { line_number: 1, account_code: '1200', account_name: 'Accounts Receivable', debit: total, credit: 0, description: data.student_name },
          ];
          if (discount > 0) {
            jeLines.push({ line_number: jeLines.length + 1, account_code: '4090', account_name: 'Sales Discount', debit: discount, credit: 0, description: 'Invoice discount' });
          }
          jeLines.push(
            { line_number: jeLines.length + 1, account_code: '4000', account_name: 'Tuition Revenue', debit: 0, credit: subtotal, description: 'Revenue' },
            { line_number: jeLines.length + 2, account_code: '2300', account_name: 'VAT Payable', debit: 0, credit: vatAmount, description: 'VAT 15%' },
          );

          const je = await createJournalEntry({
            journal_type: 'sales',
            branch_id: data.branch_id,
            date: data.issue_date,
            reference: invoiceNumber,
            description: `Invoice ${invoiceNumber} - ${data.student_name}`,
            lines: jeLines,
            source_document_type: 'Invoice',
            source_document_id: invoice?.id,
            requested_status: 'approved',
          });
          data.journal_entry_id = je.id;

          // Generate ZATCA-compliant QR, UBL XML, hash and store via backend
          const savedId = invoice?.id || invoiceNumber;
          try {
            const zatcaPayload = {
              invoice_id: savedId,
              invoice_number: invoiceNumber,
              issue_date: data.issue_date,
              subtotal,
              vat_amount: vatAmount,
              total_amount: total,
              student_name: data.student_name,
              items: data.items,
              discount_amount: discount,
              notes: data.notes,
            };
            const zatcaResult = await callApi('/invoices/generate-zatca', zatcaPayload);
            setZatcaData({ ...zatcaResult, invoiceId: savedId });
          } catch (zatcaErr) {
            // ZATCA generation failure is non-fatal — log and continue
            reportError({
              error: zatcaErr,
              module: 'fees',
              action: 'generate_zatca_invoice',
              severity: 'medium',
              context: { invoice_number: invoiceNumber },
            });
          }
        } catch (jeErr) {
          reportError({
            error: jeErr,
            module: 'fees',
            action: 'create_invoice_journal_entry',
            severity: 'high',
            context: { invoice_number: invoiceNumber, invoice_id: invoice?.id },
          });
        }
      }

      if (invoice?.id) {
        const { error: updateErr } = await tenantQuery('invoices').update(data).eq('id', invoice.id);
        if (updateErr) throw updateErr;
        setSavedInvoiceId(invoice.id);
        await logAuditEvent({
          action: AuditActions.UPDATE,
          entityType: 'Invoice',
          entityId: invoice.id,
          oldValues: invoice,
          newValues: data,
          page: 'Fees'
        });
        toast.success(isRTL ? 'تم تحديث الفاتورة' : 'Invoice updated');
      } else {
        const { data: rows, error: insertErr } = await tenantQuery('invoices').insert(data).select().single();
        if (insertErr) throw insertErr;
        const newId = rows?.id;
        setSavedInvoiceId(newId);
        await logAuditEvent({
          action: AuditActions.CREATE,
          entityType: 'Invoice',
          entityId: newId,
          newValues: data,
          page: 'Fees',
          notes: `Invoice ${invoiceNumber} created for ${formData.student_name}`
        });
        toast.success(isRTL ? 'تم إنشاء الفاتورة' : 'Invoice created');
      }
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving invoice:', error);
      toast.error(isRTL ? 'حدث خطأ أثناء الحفظ' : 'Error saving invoice');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadZATCAPDF = async () => {
    const invoiceId = savedInvoiceId || invoice?.id;
    if (!invoiceId) {
      toast.error(isRTL ? 'يرجى حفظ الفاتورة أولاً' : 'Please save the invoice first');
      return;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const apiBase = import.meta.env.VITE_API_BASE_URL || 'https://edusaga-360-production.up.railway.app/api';
      const response = await fetch(`${apiBase}/invoices/${invoiceId}/download-pdf`, {
        method: 'GET',
        headers: {
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zatca-invoice-${invoice?.invoice_number || invoiceId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading ZATCA PDF:', err);
      toast.error(isRTL ? 'خطأ في تحميل الفاتورة' : 'Error downloading invoice PDF');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {invoice ? (isRTL ? 'تعديل الفاتورة' : 'Edit Invoice') : (isRTL ? 'إنشاء فاتورة جديدة' : 'Create New Invoice')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Student Selection */}
          <div className="space-y-4">
            <h3 className="font-semibold text-ink border-b pb-2">
              {isRTL ? 'بيانات الطالب' : 'Student Information'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('studentName')} *</Label>
                <Select 
                  value={formData.student_id} 
                  onValueChange={handleStudentChange}
                  disabled={!!invoice}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isRTL ? 'اختر الطالب' : 'Select student'} />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map(student => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.name_ar} - {t(student.grade)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('grade')}</Label>
                <Input value={t(formData.grade)} disabled />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'العام الدراسي' : 'Academic Year'}</Label>
                <Select
                  value={formData.academic_year}
                  onValueChange={handleAcademicYearChange}
                  disabled={!!invoice}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isRTL ? 'اختر العام الدراسي' : 'Select academic year'} />
                  </SelectTrigger>
                  <SelectContent>
                    {academicYears.map((y) => (
                      <SelectItem key={y.id} value={y.year_label || y.year_code}>
                        {y.year_label || y.year_code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ الإصدار' : 'Issue Date'}</Label>
                <Input
                  type="date"
                  value={formData.issue_date}
                  onChange={(e) => handleChange('issue_date', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('dueDate')}</Label>
                <Input
                  type="date"
                  value={formData.due_date}
                  min={formData.issue_date}
                  onChange={(e) => handleChange('due_date', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Invoice Items */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-ink">{isRTL ? 'بنود الفاتورة' : 'Invoice Items'}</h3>
              <Button type="button" size="sm" variant="outline" onClick={addItem} className="gap-2">
                <Plus className="w-4 h-4" />
                {isRTL ? 'إضافة بند' : 'Add Item'}
              </Button>
            </div>
            
            <div className="space-y-3">
              {formData.items.map((item, index) => (
                <div key={index} className="flex gap-3 items-start p-3 bg-sand rounded-lg">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2">
                      <Input
                        placeholder={isRTL ? 'الوصف' : 'Description'}
                        value={item.description_ar || item.description}
                        onChange={(e) => handleItemChange(index, 'description_ar', e.target.value)}
                      />
                    </div>
                    <Select
                      value={item.fee_type_id}
                      onValueChange={(v) => handleFeeTypeChange(index, v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={isRTL ? 'نوع الرسوم' : 'Fee Type'} />
                      </SelectTrigger>
                      <SelectContent>
                        {feeTypes.map(type => (
                          <SelectItem key={type.id} value={type.id}>
                            {isRTL ? type.name_ar : type.name_en}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="relative">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={t('amount')}
                        value={item.amount}
                        onChange={(e) => handleItemChange(index, 'amount', e.target.value)}
                        className="pe-12"
                      />
                      <span className="absolute top-1/2 -translate-y-1/2 end-3 text-muted-foreground text-sm">
                        {getCurrencySymbol(tenant?.localization, isRTL)}
                      </span>
                    </div>
                  </div>
                  {formData.items.length > 1 && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => removeItem(index)}
                      className="text-red-500 hover:text-red-700 flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Discount & Total */}
          <div className="space-y-4 border-t pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('discount')}</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.discount_amount}
                    onChange={(e) => handleChange('discount_amount', e.target.value)}
                    className="pe-12"
                  />
                  <span className="absolute top-1/2 -translate-y-1/2 end-3 text-muted-foreground text-sm">
                    {getCurrencySymbol(tenant?.localization, isRTL)}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'سبب الخصم' : 'Discount Reason'}</Label>
                <Input
                  value={formData.discount_reason}
                  onChange={(e) => handleChange('discount_reason', e.target.value)}
                />
              </div>
            </div>

            {/* Summary */}
            <div className="bg-sand rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-muted-foreground">
                <span>{isRTL ? 'المجموع الفرعي' : 'Subtotal'}</span>
                <span>{formatCurrency(subtotal, tenant?.localization, isRTL)}</span>
              </div>
              <div className="flex justify-between text-amber-700 font-medium">
                <span>{isRTL ? 'ضريبة القيمة المضافة 15%' : 'VAT 15%'}</span>
                <span>+{formatCurrency(vatAmount, tenant?.localization, isRTL)}</span>
              </div>
              {parseFloat(formData.discount_amount) > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>{t('discount')}</span>
                  <span>-{parseFloat(formData.discount_amount).toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold text-ink border-t pt-2">
                <span>{t('total')}</span>
                <span>{formatCurrency(total, tenant?.localization, isRTL)}</span>
              </div>
              {formData.status === 'issued' && (
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                  {isRTL
                    ? '⚠ وضع الاختبار: بيانات اعتماد ZATCA للإنتاج تحتاج إلى تكوين.'
                    : '⚠ Sandbox mode: ZATCA live credentials need to be configured for production.'}
                </div>
              )}
            </div>
          </div>

          {/* Payment Method Preference */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold text-ink">{isRTL ? 'تفضيلات الدفع' : 'Payment Preferences'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'طريقة الدفع المفضلة' : 'Preferred Payment Method'}</Label>
                <Select value={formData.preferred_payment_method} onValueChange={(v) => handleChange('preferred_payment_method', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={isRTL ? 'اختر' : 'Select'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit_card">{isRTL ? 'بطاقة ائتمان' : 'Credit Card'}</SelectItem>
                    <SelectItem value="bank_transfer">{isRTL ? 'تحويل بنكي' : 'Bank Transfer'}</SelectItem>
                    <SelectItem value="cash">{isRTL ? 'نقداً' : 'Cash'}</SelectItem>
                    <SelectItem value="tamara">{t('tamara')} ({t('buyNowPayLater')})</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {formData.preferred_payment_method === 'bank_transfer' && (
                <div className="space-y-2">
                  <Label>{isRTL ? 'حساب التحويل البنكي' : 'Bank Account for Transfer'} *</Label>
                  <Select value={formData.bank_account_id} onValueChange={(v) => handleChange('bank_account_id', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder={isRTL ? 'اختر الحساب' : 'Select account'} />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.bank_name} - {acc.iban}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label>{isRTL ? 'طرق الدفع المتاحة للوالد' : 'Payment Methods Available to Parent'}</Label>
              <div className="flex flex-wrap gap-2">
                {paymentMethodOptions.map((method) => {
                  const selected = (formData.payment_methods || []).includes(method.id);
                  return (
                    <Button
                      key={method.id}
                      type="button"
                      variant={selected ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => togglePaymentMethod(method.id)}
                      className="rounded-full"
                    >
                      {method.label}
                    </Button>
                  );
                })}
              </div>
              {(formData.payment_methods || []).length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {isRTL ? 'اختر طريقة دفع واحدة على الأقل' : 'Select at least one payment method'}
                </p>
              )}
            </div>
          </div>

          {/* Status & Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('status')}</Label>
              <Select value={formData.status} onValueChange={(v) => handleChange('status', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">{isRTL ? 'مسودة' : 'Draft'}</SelectItem>
                  <SelectItem value="issued">{isRTL ? 'صادرة' : 'Issued'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('notes')}</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                rows={2}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between gap-3 pt-4 border-t">
            <div>
              {(savedInvoiceId || invoice?.id) && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDownloadZATCAPDF}
                  className="flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  {isRTL ? 'تحميل فاتورة ZATCA (PDF)' : 'Download ZATCA Invoice (PDF)'}
                </Button>
              )}
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={loading} className="bg-najdi-900 hover:bg-najdi-900">
                {loading && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                {t('save')}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}