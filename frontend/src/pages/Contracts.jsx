import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import ContractActions from '../components/contracts/ContractActions';
import ContractPreviewModal from '../components/contracts/ContractPreviewModal';
import { Plus, Search, Loader2, Eye, Settings, AlertCircle, XCircle, CheckCircle, Send, Download } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';

const _SERVICE_TYPES = ['tuition', 'transport', 'activities', 'uniform', 'books', 'devices', 'meals', 'registration'];
const DISCOUNT_TYPES = ['none', 'sibling', 'staff', 'scholarship', 'early_payment', 'special'];

export default function Contracts() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter, branches } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();
  
  const [showForm, setShowForm] = useState(false);
  const [showDetails, setShowDetails] = useState(null);
  const [previewContract, setPreviewContract] = useState(null);
  const [sendingId, setSendingId] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [formData, setFormData] = useState({
    student_id: '',
    academic_year: '2025-2026',
    template_id: '',
    services: [],
    discount_type: 'none',
    discount_percentage: 0,
    discount_reason: '',
    payment_schedule: [],
    status: 'draft'
  });

  useEffect(() => {
    const hasChanges = formData.student_id || formData.services.length > 0;
    setHasUnsavedChanges(hasChanges);
  }, [formData]);

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['contracts', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('student_contracts').select('*').match(tenantFilter(branchFilter()), '-created_date')),
    enabled: hasTenantAccess,
  });

  const { data: students = [] } = useQuery({
    queryKey: ['students', tenantId],
    queryFn: () => fetchData(tenantQuery('students').select('*').match(tenantFilter({ status: 'active' }))),
    staleTime: 0,
    enabled: hasTenantAccess,
  });

  const { data: _feeServices = [] } = useQuery({
    queryKey: ['feeServices', tenantId],
    queryFn: () => fetchData(tenantQuery('fee_services').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['contractTemplates', tenantId],
    queryFn: () => fetchData(tenantQuery('contract_templates').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const { data: guardians = [] } = useQuery({
    queryKey: ['guardians', tenantId],
    queryFn: () => fetchData(tenantQuery('guardians').select('*').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const filteredContracts = filterByBranch(contracts).filter(c => {
    const matchesSearch = c.student_name?.includes(search) || c.contract_number?.includes(search);
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const { data: grades = [] } = useQuery({
    queryKey: ['grades', tenantId],
    queryFn: async () => {
      const data = await tenantQuery('grades').select('*').match(tenantFilter({ is_active: true }));
      return data.sort((a, b) => a.display_order - b.display_order);
    },
    enabled: hasTenantAccess,
  });

  const { data: academicYears = [] } = useQuery({
    queryKey: ['academicYears', tenantId],
    queryFn: () => fetchData(tenantQuery('academic_years').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const { data: feeStructures = [] } = useQuery({
    queryKey: ['feeStructures', tenantId],
    queryFn: () => fetchData(tenantQuery('fee_structures').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const [feeResolutionStatus, setFeeResolutionStatus] = useState({ status: 'idle', message: '', source: '' });
  const [applyingFees, setApplyingFees] = useState(false);

  const resolveFees = async (student) => {
    // ── Priority A: Student has a saved fee snapshot (SSOT) ─────────────────
    if (student.applied_fee_breakdown && student.applied_fee_breakdown.length > 0) {
      setFeeResolutionStatus({
        status: 'success',
        message: isRTL ? '✓ رسوم مطبقة على الطالب' : '✓ Fees applied to student',
        source: 'student_snapshot'
      });
      return student.applied_fee_breakdown.map(f => ({
        service_type: f.fee_type_code || 'tuition',
        service_name: isRTL ? f.fee_type_name_ar : (f.fee_type_name_en || f.fee_type_name_ar),
        amount: f.amount,
        discount_amount: 0,
        net_amount: f.amount
      }));
    }

    // ── Priority B: Live lookup in FeeStructure by IDs ───────────────────────
    if (student.academic_year_id && student.grade_id && student.branch_id) {
      try {
        const liveConfigs = await tenantQuery('fee_structures').select('*').match({
          academic_year_id: student.academic_year_id,
          grade_id: student.grade_id,
          branch_id: student.branch_id,
          is_active: true
        });
        // Section priority: exact > no-section
        let matched = student.section_id
          ? liveConfigs.filter(f => f.section_id === student.section_id)
          : [];
        if (matched.length === 0) matched = liveConfigs.filter(f => !f.section_id);
        if (matched.length === 0) matched = liveConfigs;

        if (matched.length > 0) {
          setFeeResolutionStatus({
            status: 'warning',
            message: isRTL ? 'من إعدادات الرسوم (يُنصح بالتطبيق من صفحة الطالب)' : 'From Configurator (recommend applying from Student page)',
            source: 'configurator'
          });
          return matched.map(f => ({
            service_type: f.fee_type_code || 'tuition',
            service_name: isRTL ? f.fee_type_name_ar : (f.fee_type_name_en || f.fee_type_name_ar),
            amount: f.amount,
            discount_amount: 0,
            net_amount: f.amount
          }));
        }
      } catch (_) { /* silent */ }
    }

    // ── Priority C: Fallback string-match in already-loaded feeStructures ───
    const fallback = feeStructures.filter(f => {
      const yearOk = f.academic_year_id === student.academic_year_id
        || f.academic_year === student.academic_year;
      const gradeOk = f.grade_id === student.grade_id
        || f.grade === student.grade;
      const branchOk = !f.branch_id || f.branch_id === student.branch_id;
      const sectionOk = !f.section_id || f.section_id === student.section_id;
      return yearOk && gradeOk && branchOk && sectionOk;
    });

    if (fallback.length > 0) {
      setFeeResolutionStatus({
        status: 'warning',
        message: isRTL ? 'من الإعدادات (غير مطبق على الطالب بعد)' : 'From Configurator (not yet applied to student)',
        source: 'configurator_fallback'
      });
      return fallback.map(f => ({
        service_type: f.fee_type_code || 'tuition',
        service_name: isRTL ? f.fee_type_name_ar : (f.fee_type_name_en || f.fee_type_name_ar),
        amount: f.amount,
        discount_amount: 0,
        net_amount: f.amount
      }));
    }

    setFeeResolutionStatus({
      status: 'error',
      message: isRTL
        ? 'لم يتم تطبيق رسوم على هذا الطالب. يرجى تطبيق خطة الرسوم أولاً من صفحة الطالب.'
        : 'No fees applied to this student. Please apply a fee plan from the Student page first.',
      source: 'none'
    });
    return [];
  };

  const handleStudentChange = async (studentId) => {
    // Always fetch a live copy to get the latest applied_fee_breakdown
    let freshStudents;
    try {
      freshStudents = await tenantQuery('students').select('*').match({ status: 'active' });
      if (freshStudents?.length) {
        queryClient.setQueryData(['students'], freshStudents);
      }
    } catch (_) { /* silent */ }
    const student = (freshStudents || students).find(s => s.id === studentId);
    if (student) {
      // Auto-populate missing IDs from display values
      let updatedStudent = { ...student };
      
      if (!student.academic_year_id && student.academic_year) {
        const year = academicYears.find(y => y.year_label === student.academic_year);
        if (year) updatedStudent.academic_year_id = year.id;
      }
      
      if (!student.grade_id && student.grade) {
        const grade = grades.find(g => g.grade_code === student.grade);
        if (grade) updatedStudent.grade_id = grade.id;
      }

      const services = await resolveFees(updatedStudent);

      // Get guardian info
      const guardian = guardians.find(g => g.id === student.financial_guardian_id || g.student_id === studentId);
      
      setFormData(prev => ({
        ...prev,
        student_id: studentId,
        student_name: student.name_ar,
        grade: student.grade,
        branch_id: student.branch_id,
        guardian_id: guardian?.id || '',
        guardian_name: guardian?.name_ar || student.mother_name_ar || '',
        guardian_phone: guardian?.phone || student.mother_phone || '',
        guardian_email: guardian?.email || student.mother_email || '',
        guardian_national_id: guardian?.national_id || student.mother_national_id || '',
        academic_year: student.academic_year || formData.academic_year,
        services
      }));
    }
  };

  const handleApplyFeesNow = async () => {
    if (!formData.student_id) return;

    setApplyingFees(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const student = students.find(s => s.id === formData.student_id);
      
      // Match by IDs (not text labels)
      const matchingConfigs = feeStructures.filter(f => {
        const yearMatch = student.academic_year_id 
          ? f.academic_year_id === student.academic_year_id
          : f.academic_year === formData.academic_year;
        
        const gradeMatch = student.grade_id
          ? f.grade_id === student.grade_id
          : f.grade === formData.grade;
        
        const branchMatch = f.branch_id === formData.branch_id;
        
        const sectionMatch = !f.section_id || f.section_id === student.section_id;
        
        return yearMatch && gradeMatch && branchMatch && sectionMatch;
      });



      if (matchingConfigs.length === 0) {
        toast.error(isRTL ? 'لا توجد إعدادات رسوم لهذا العام الدراسي والصف والفرع' : 'No fee configuration found for this Year/Grade/Branch');
        setApplyingFees(false);
        return;
      }

      const totalFees = matchingConfigs.reduce((sum, f) => sum + (f.amount || 0), 0);
      const feeBreakdown = matchingConfigs.map(f => ({
        fee_structure_id: f.id,
        fee_type_id: f.fee_type_id,
        fee_type_code: f.fee_type_code,
        fee_type_name_ar: f.fee_type_name_ar,
        fee_type_name_en: f.fee_type_name_en,
        amount: f.amount,
        is_mandatory: f.is_mandatory
      }));



      const updateData = {
        applied_fee_breakdown: feeBreakdown,
        total_applied_fees: totalFees,
        fee_config_applied_date: new Date().toISOString(),
        fee_config_applied_by: user.email
      };

      // Only update academic_year if it's different
      if (student.academic_year !== formData.academic_year) {
        updateData.academic_year = formData.academic_year;
      }

      await tenantQuery('students').update(updateData);


      // Audit log
      try {
        await logAuditEvent({
          action: AuditActions.UPDATE,
          entityType: 'Student',
          entityId: student.id,
          page: 'Contracts',
          newValues: {
            applied_fees: true,
            total: totalFees,
            fee_count: feeBreakdown.length,
            applied_by: user.email,
            applied_date: new Date().toISOString()
          }
        });
      } catch (_) { /* audit log failure is non-critical */ }

      // Refetch students to get fresh data
      await queryClient.invalidateQueries({ queryKey: ['students'] });
      const updatedStudents = await tenantQuery('students').select('*').match({ status: 'active' });
      const updatedStudent = updatedStudents.find(s => s.id === student.id);

      toast.success(isRTL ? 'تم تطبيق الرسوم بنجاح ✓' : 'Fees applied successfully ✓');

      // Reload fees with updated student data
      const services = await resolveFees(updatedStudent);
      setFormData(prev => ({ ...prev, services }));
    } catch (error) {

      toast.error(isRTL ? 'حدث خطأ: ' + error.message : 'Error: ' + error.message);

      // Log error
      try {
        await tenantQuery('system_errors').insert({
          error_type: 'fee_application_failed',
          error_message: error.message || 'Unknown error',
          stack_trace: error.stack || JSON.stringify(error),
          context: JSON.stringify({
            student_id: formData.student_id,
            academic_year: formData.academic_year,
            grade: formData.grade,
            branch_id: formData.branch_id,
            timestamp: new Date().toISOString()
          }),
          severity: 'high',
          resolved: false
        });
      } catch (_) { /* silent */ }
    } finally {
      setApplyingFees(false);
    }
  };

  const calculateTotals = () => {
    const totalFees = formData.services.reduce((sum, s) => sum + (s.amount || 0), 0);
    const discountAmount = formData.discount_type !== 'none' ? (totalFees * (formData.discount_percentage || 0) / 100) : 0;
    const netAmount = totalFees - discountAmount;
    return { totalFees, discountAmount, netAmount };
  };

  const generatePaymentSchedule = (netAmount, installments = 3) => {
    const schedule = [];
    const installmentAmount = Math.floor(netAmount / installments);
    const today = new Date();
    
    for (let i = 0; i < installments; i++) {
      const dueDate = new Date(today);
      dueDate.setMonth(dueDate.getMonth() + i * 3);
      schedule.push({
        installment_number: i + 1,
        due_date: format(dueDate, 'yyyy-MM-dd'),
        amount: i === installments - 1 ? netAmount - (installmentAmount * (installments - 1)) : installmentAmount,
        status: 'pending'
      });
    }
    return schedule;
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    e?.stopPropagation();

    // Validation

    if (!formData.student_id) {
      toast.error(isRTL ? 'يرجى اختيار الطالب' : 'Please select a student');
      return;
    }

    if (!formData.branch_id) {
      toast.error(isRTL ? 'يرجى التأكد من بيانات الطالب والفرع' : 'Please ensure student and branch data is correct');
      return;
    }

    if (!formData.services || formData.services.length === 0) {
      toast.error(isRTL ? 'لا توجد خدمات/رسوم لهذا الطالب. تأكد من إعداد الرسوم الدراسية.' : 'No services/fees found for this student. Ensure tuition fees are configured.');
      return;
    }

    setSaving(true);


    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const { totalFees, discountAmount, netAmount } = calculateTotals();
      
      if (netAmount <= 0) {
        toast.error(isRTL ? 'المبلغ الصافي يجب أن يكون أكبر من صفر' : 'Net amount must be greater than zero');
        setSaving(false);
        return;
      }

      const contractNumber = `CNT-${Date.now().toString(36).toUpperCase()}`;
      const paymentSchedule = generatePaymentSchedule(netAmount);

      // Generate contract content with placeholders filled
      const template = templates.find(t => t.id === formData.template_id) || templates.find(t => t.is_default) || templates[0];
      let generatedContentAr = template?.content_ar || '<p>Default contract content</p>';
      let generatedContentEn = template?.content_en || '<p>Default contract content</p>';

      // Replace placeholders in both languages
      const placeholders = {
        '{{contract_number}}': contractNumber,
        '{{student_name}}': formData.student_name || '',
        '{{guardian_name}}': formData.guardian_name || '',
        '{{guardian_id}}': formData.guardian_national_id || '',
        '{{guardian_phone}}': formData.guardian_phone || '',
        '{{academic_year}}': formData.academic_year || '',
        '{{grade}}': t(formData.grade) || formData.grade || '',
        '{{total_fees}}': totalFees.toLocaleString(),
        '{{contract_date}}': format(new Date(), 'dd/MM/yyyy'),
        '{{school_name}}': 'EduSaga School',
        '{{school_address}}': 'Riyadh, Saudi Arabia',
        '{{cr_number}}': '1234567890',
        '{{vat_number}}': '300000000000003'
      };

      Object.keys(placeholders).forEach(key => {
        const regex = new RegExp(key.replace(/[{}]/g, '\\$&'), 'g');
        generatedContentAr = generatedContentAr.replace(regex, placeholders[key]);
        if (generatedContentEn) {
          generatedContentEn = generatedContentEn.replace(regex, placeholders[key]);
        }
      });
      
      // Fallback if no English template content
      if (!generatedContentEn || generatedContentEn.trim() === '') {
        generatedContentEn = generatedContentAr;
      }
      
      const tid = getTenantIdForCreate();
      const contractData = {
        ...(tid && { tenant_id: tid }),
        contract_number: contractNumber,
        student_id: formData.student_id,
        student_name: formData.student_name,
        guardian_id: formData.guardian_id,
        guardian_name: formData.guardian_name,
        guardian_phone: formData.guardian_phone,
        guardian_email: formData.guardian_email,
        guardian_national_id: formData.guardian_national_id,
        branch_id: formData.branch_id,
        company_id: user.company_id,
        academic_year: formData.academic_year,
        grade: formData.grade,
        template_id: formData.template_id || template?.id,
        services: formData.services,
        total_fees: totalFees,
        total_discount: discountAmount,
        net_amount: netAmount,
        payment_schedule: paymentSchedule,
        discount_type: formData.discount_type,
        discount_percentage: formData.discount_percentage,
        discount_reason: formData.discount_reason,
        contract_date: format(new Date(), 'yyyy-MM-dd'),
        start_date: format(new Date(), 'yyyy-MM-dd'),
        status: 'draft',
        generated_content_ar: generatedContentAr,
        generated_content_en: generatedContentEn
      };



      const created = await tenantQuery('student_contracts').insert(contractData);
      


      // Generate first invoice
      const firstInstallment = paymentSchedule[0];
      const invoiceData = {
        ...(tid && { tenant_id: tid }),
        invoice_number: `INV-${Date.now().toString(36).toUpperCase()}`,
        student_id: formData.student_id,
        student_name: formData.student_name,
        contract_id: created.id,
        branch_id: formData.branch_id,
        grade: formData.grade,
        academic_year: formData.academic_year,
        installment_number: 1,
        issue_date: format(new Date(), 'yyyy-MM-dd'),
        due_date: firstInstallment.due_date,
        items: formData.services.map(s => ({
          description: s.service_name,
          description_ar: s.service_name,
          amount: s.net_amount / paymentSchedule.length,
          fee_type: s.service_type
        })),
        subtotal: firstInstallment.amount,
        total_amount: firstInstallment.amount,
        status: 'issued'
      };



      await tenantQuery('invoices').insert(invoiceData);

      await logAuditEvent({ action: AuditActions.CREATE, entityType: 'StudentContract', entityId: created.id, newValues: contractData });
      
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      
      setShowForm(false);
      setFormData({ student_id: '', academic_year: '2025-2026', template_id: '', services: [], discount_type: 'none', discount_percentage: 0, discount_reason: '', payment_schedule: [], status: 'draft' });
      setHasUnsavedChanges(false);
      
      toast.success(isRTL ? 'تم إنشاء العقد والفاتورة الأولى بنجاح ✓' : 'Contract and first invoice created successfully ✓');
    } catch (error) {

      
      // Log to system error log
      try {
        const user = await supabase.auth.getUser().then(r => r.data?.user);
        await tenantQuery('system_errors').insert({
          error_type: 'contract_creation_failed',
          error_message: error.message || 'Unknown error',
          stack_trace: error.stack || JSON.stringify(error),
          context: JSON.stringify({ 
            student_id: formData.student_id,
            branch_id: formData.branch_id,
            services_count: formData.services?.length || 0,
            user: user.email,
            page: 'Contracts',
            timestamp: new Date().toISOString()
          }),
          severity: 'high',
          resolved: false
        });
      } catch (_) { /* silent */ }
      
      toast.error(isRTL ? 'حدث خطأ: ' + (error.message || 'خطأ غير معروف') : 'Error: ' + (error.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleCloseForm = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedWarning(true);
    } else {
      setShowForm(false);
      setFormData({ student_id: '', academic_year: '2025-2026', template_id: '', services: [], discount_type: 'none', discount_percentage: 0, discount_reason: '', payment_schedule: [], status: 'draft' });
    }
  };

  const confirmLeave = () => {
    setShowForm(false);
    setFormData({ student_id: '', academic_year: '2025-2026', template_id: '', services: [], discount_type: 'none', discount_percentage: 0, discount_reason: '', payment_schedule: [], status: 'draft' });
    setHasUnsavedChanges(false);
    setShowUnsavedWarning(false);
  };

  const handleSendForSigning = async (contract) => {
    setSendingId(contract.id);
    try {
      const signingUrl = `${window.location.origin}/ParentSignContract?id=${contract.id}`;
      await tenantQuery('student_contracts').update({
        status: 'sent',
        sent_date: new Date().toISOString(),
        delivery_status: 'sent'
      });
      // Notify admin in system
      await tenantQuery('notifications').insert({
        tenant_id: contract.tenant_id,
        type: 'contract_sent',
        title_ar: `تم إرسال العقد - ${contract.student_name}`,
        title_en: `Contract Sent - ${contract.student_name}`,
        body_ar: `تم إرسال العقد رقم ${contract.contract_number} لولي الأمر للتوقيع`,
        body_en: `Contract ${contract.contract_number} sent to guardian for signing`,
        reference_type: 'StudentContract',
        reference_id: contract.id,
        is_read: false,
        recipient_role: 'admin',
        created_at: new Date().toISOString()
      });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      // Copy signing link to clipboard
      await navigator.clipboard.writeText(signingUrl).catch(() => {});
      toast.success(
        isRTL
          ? `تم الإرسال! رابط التوقيع نُسخ. أرسله لولي الأمر عبر واتساب أو البريد.`
          : `Sent! Signing link copied. Share with guardian via WhatsApp or email.`,
        { duration: 6000 }
      );
    } catch {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSendingId(null);
    }
  };

  const { totalFees, discountAmount, netAmount } = calculateTotals();

  const columns = [
    { 
      header: isRTL ? 'رقم العقد' : 'Contract #', 
      width: '15%',
      cell: (row) => <span className="font-mono text-sm">{row.contract_number}</span> 
    },
    { 
      header: t('studentName'), 
      width: '20%',
      cell: (row) => <div><p className="font-medium">{row.student_name}</p><p className="text-sm text-slate-500">{t(row.grade)}</p></div> 
    },
    { 
      header: t('academicYear'), 
      width: '12%',
      accessorKey: 'academic_year' 
    },
    { 
      header: isRTL ? 'صافي المبلغ' : 'Net Amount', 
      width: '13%',
      align: 'center',
      cell: (row) => <span className="font-semibold">{row.net_amount?.toLocaleString()} {t('sar')}</span> 
    },
    { 
      header: t('status'), 
      width: '12%',
      align: 'center',
      cell: (row) => <StatusBadge status={row.status} /> 
    },
    { 
      header: t('actions'), 
      width: '28%',
      align: 'center',
      cell: (row) => (
        <div className="flex gap-1 justify-center flex-wrap">
          <Button size="sm" variant="ghost" onClick={() => setShowDetails(row)}>
            <Eye className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPreviewContract(row)} title={isRTL ? 'معاينة' : 'Preview'}>
            <Download className="w-4 h-4" />
          </Button>
          {row.status === 'draft' && (
            <Button
              size="sm"
              variant="outline"
              className="text-blue-600 border-blue-300 hover:bg-blue-50"
              onClick={() => handleSendForSigning(row)}
              disabled={sendingId === row.id}
              title={isRTL ? 'إرسال للتوقيع' : 'Send for Signing'}
            >
              {sendingId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          )}
          <ContractActions contract={row} />
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title={t('contracts')}
          subtitle={isRTL ? 'عقود الطلاب والخدمات' : 'Student contracts and services'}
          action
          actionLabel={isRTL ? 'عقد جديد' : 'New Contract'}
          actionIcon={Plus}
          onAction={() => { setFormData({ student_id: '', academic_year: '2025-2026', template_id: '', services: [], discount_type: 'none', discount_percentage: 0, discount_reason: '', payment_schedule: [], status: 'draft' }); setShowForm(true); }}
        />
        <Link to={createPageUrl('ContractTemplates')}>
          <Button variant="outline">
            <Settings className="w-4 h-4 me-1" /> {isRTL ? 'القوالب' : 'Templates'}
          </Button>
        </Link>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="bg-white border">
          <TabsTrigger value="all">{t('all')}</TabsTrigger>
          <TabsTrigger value="draft">{t('draft')}</TabsTrigger>
          <TabsTrigger value="sent">{isRTL ? 'مرسل' : 'Sent'}</TabsTrigger>
          <TabsTrigger value="signed">{isRTL ? 'موقع' : 'Signed'}</TabsTrigger>
          <TabsTrigger value="active">{t('active')}</TabsTrigger>
          <TabsTrigger value="rejected">{isRTL ? 'مرفوض' : 'Rejected'}</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="relative max-w-md">
        <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
        <Input placeholder={isRTL ? 'بحث...' : 'Search...'} value={search} onChange={(e) => setSearch(e.target.value)} className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`} />
      </div>

      <DataTable columns={columns} data={filteredContracts} loading={isLoading} emptyMessage={t('noData')} />

      {/* Create Contract Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) handleCloseForm(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'إنشاء عقد جديد' : 'Create New Contract'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('studentName')} *</Label>
                <Select value={formData.student_id} onValueChange={handleStudentChange}>
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر الطالب' : 'Select student'} /></SelectTrigger>
                  <SelectContent>
                    {students.map(s => <SelectItem key={s.id} value={s.id}>{s.name_ar} - {t(s.grade)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('academicYear')}</Label>
                <Select value={formData.academic_year} onValueChange={async (v) => {
                  setFormData(p => ({...p, academic_year: v}));
                  // Re-resolve fees when year changes
                  if (formData.student_id) {
                    const student = students.find(s => s.id === formData.student_id);
                    if (student) {
                      const services = await resolveFees({ ...student, academic_year: v });
                      setFormData(p => ({ ...p, academic_year: v, services }));
                    }
                  }
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {academicYears.map(y => (
                      <SelectItem key={y.id} value={y.year_label}>{y.year_label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.student_id && (
              <>
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded">
                  <div><Label className="text-slate-500">{isRTL ? 'ولي الأمر' : 'Guardian'}</Label><p>{formData.guardian_name || (isRTL ? 'غير متوفر' : 'Not available')}</p></div>
                  <div><Label className="text-slate-500">{isRTL ? 'الهاتف' : 'Phone'}</Label><p>{formData.guardian_phone || (isRTL ? 'غير متوفر' : 'Not available')}</p></div>
                  <div><Label className="text-slate-500">{isRTL ? 'الفرع' : 'Branch'}</Label><p>{branches.find(b => b.id === formData.branch_id)?.[isRTL ? 'name_ar' : 'name_en']}</p></div>
                  <div><Label className="text-slate-500">{isRTL ? 'الصف' : 'Grade'}</Label><p>{grades.find(g => g.grade_code === formData.grade)?.[isRTL ? 'name_ar' : 'name_en'] || formData.grade}</p></div>
                </div>

                {/* Fee Resolution Status */}
                {feeResolutionStatus.status === 'error' && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium text-red-900">
                          {isRTL ? 'لم يتم تطبيق رسوم على هذا الطالب' : 'No fees applied to this student'}
                        </p>
                        <p className="text-sm text-red-700 mt-1">
                          {isRTL
                            ? 'لم يتم تطبيق رسوم على هذا الطالب. يرجى تطبيق خطة الرسوم أولاً من صفحة الطالب.'
                            : 'No fees applied to this student. Please apply a fee plan from the Student page first.'}
                        </p>
                        <div className="flex gap-2 mt-3 flex-wrap">
                          <Link to={createPageUrl('Students')}>
                            <Button size="sm" variant="outline">
                              {isRTL ? 'الانتقال إلى صفحة الطلاب' : 'Go to Students Page'}
                            </Button>
                          </Link>
                          <Link to={createPageUrl('TuitionFeesConfiguration')}>
                            <Button size="sm" variant="outline">
                              {isRTL ? 'إعدادات الرسوم' : 'Fee Configuration'}
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {feeResolutionStatus.status === 'warning' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium text-amber-900">
                          {isRTL ? 'الرسوم من إعدادات الرسوم (غير محفوظة على الطالب)' : 'Fees from Configurator (not saved on student yet)'}
                        </p>
                        <p className="text-sm text-amber-700 mt-1">
                          {isRTL
                            ? 'يُنصح بتطبيق الرسوم على الطالب أولاً لضمان الحفظ الدائم.'
                            : 'It is recommended to apply fees to the student first for permanent saving.'}
                        </p>
                        <Button size="sm" onClick={handleApplyFeesNow} disabled={applyingFees} className="mt-3">
                          {applyingFees && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                          {isRTL ? 'تطبيق وحفظ الرسوم على الطالب الآن' : 'Apply & Save Fees to Student Now'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {feeResolutionStatus.status === 'success' && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-medium text-emerald-800">
                        {feeResolutionStatus.message}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="space-y-2">
              <Label>{isRTL ? 'قالب العقد' : 'Contract Template'}</Label>
              <Select value={formData.template_id} onValueChange={(v) => setFormData(p => ({...p, template_id: v}))}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر قالب (افتراضي)' : 'Select template (default)'} /></SelectTrigger>
                <SelectContent>
                  {templates.map(t => <SelectItem key={t.id} value={t.id}>{isRTL ? t.name_ar : (t.name_en || t.name_ar)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {formData.services.length > 0 && (
              <>
                <div>
                  <h4 className="font-semibold mb-3">{t('services')}</h4>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="p-2 text-start">{isRTL ? 'الخدمة' : 'Service'}</th>
                          <th className="p-2 text-start">{t('amount')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formData.services.map((s, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-2">{s.service_name}</td>
                            <td className="p-2">{s.amount?.toLocaleString()} {t('sar')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{t('discount')}</Label>
                    <Select value={formData.discount_type} onValueChange={(v) => setFormData(p => ({...p, discount_type: v}))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DISCOUNT_TYPES.map(type => <SelectItem key={type} value={type}>{t(type) || type}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.discount_type !== 'none' && (
                    <div className="space-y-2">
                      <Label>{isRTL ? 'نسبة الخصم %' : 'Discount %'}</Label>
                      <Input type="number" value={formData.discount_percentage} onChange={(e) => setFormData(p => ({...p, discount_percentage: parseFloat(e.target.value) || 0}))} />
                    </div>
                  )}
                </div>

                <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between"><span>{isRTL ? 'إجمالي الرسوم' : 'Total Fees'}</span><span>{totalFees.toLocaleString()} {t('sar')}</span></div>
                  {discountAmount > 0 && <div className="flex justify-between text-red-600"><span>{t('discount')}</span><span>-{discountAmount.toLocaleString()} {t('sar')}</span></div>}
                  <div className="flex justify-between text-lg font-bold border-t pt-2"><span>{isRTL ? 'صافي المبلغ' : 'Net Amount'}</span><span>{netAmount.toLocaleString()} {t('sar')}</span></div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseForm} disabled={saving}>{t('cancel')}</Button>
            <Button 
              onClick={handleSave} 
              disabled={saving || !formData.student_id || formData.services.length === 0}
              type="button"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'إنشاء العقد' : 'Create Contract'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unsaved Changes Warning */}
      <AlertDialog open={showUnsavedWarning} onOpenChange={setShowUnsavedWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isRTL ? 'تغييرات غير محفوظة' : 'Unsaved Changes'}</AlertDialogTitle>
            <AlertDialogDescription>
              {isRTL ? 'لديك تغييرات غير محفوظة. هل تريد المغادرة بدون حفظ؟' : 'You have unsaved changes. Leave without saving?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowUnsavedWarning(false)}>{isRTL ? 'البقاء' : 'Stay'}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLeave}>{isRTL ? 'المغادرة' : 'Leave'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Contract Preview & PDF Modal */}
      {previewContract && (
        <ContractPreviewModal
          open={!!previewContract}
          onClose={() => setPreviewContract(null)}
          contract={previewContract}
          template={templates.find(t => t.id === previewContract.template_id)}
          previewData={{
            contract_number: previewContract.contract_number,
            student_name: previewContract.student_name,
            guardian_name: previewContract.guardian_name,
            guardian_id: previewContract.guardian_national_id,
            guardian_phone: previewContract.guardian_phone,
            academic_year: previewContract.academic_year,
            grade: previewContract.grade,
            total_fees: previewContract.total_fees?.toLocaleString(),
            contract_date: previewContract.contract_date,
            school_name: 'EduSaga School',
            school_address: 'Riyadh, Saudi Arabia',
            cr_number: '1234567890',
            vat_number: '300000000000003'
          }}
        />
      )}

      {/* Contract Details Dialog */}
      {showDetails && (
        <Dialog open={!!showDetails} onOpenChange={() => setShowDetails(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{isRTL ? 'تفاصيل العقد' : 'Contract Details'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-slate-500">{isRTL ? 'رقم العقد' : 'Contract #'}</Label><p className="font-medium">{showDetails.contract_number}</p></div>
                <div><Label className="text-slate-500">{t('studentName')}</Label><p className="font-medium">{showDetails.student_name}</p></div>
                <div><Label className="text-slate-500">{t('grade')}</Label><p>{t(showDetails.grade)}</p></div>
                <div><Label className="text-slate-500">{t('academicYear')}</Label><p>{showDetails.academic_year}</p></div>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="flex justify-between"><span>{isRTL ? 'إجمالي الرسوم' : 'Total Fees'}</span><span>{showDetails.total_fees?.toLocaleString()} {t('sar')}</span></div>
                <div className="flex justify-between text-red-600"><span>{t('discount')}</span><span>-{showDetails.total_discount?.toLocaleString()} {t('sar')}</span></div>
                <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2"><span>{isRTL ? 'صافي المبلغ' : 'Net Amount'}</span><span>{showDetails.net_amount?.toLocaleString()} {t('sar')}</span></div>
              </div>
              {showDetails.payment_schedule?.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">{t('paymentSchedule')}</h4>
                  <div className="space-y-2">
                    {showDetails.payment_schedule.map((p, i) => (
                      <div key={i} className="flex justify-between items-center p-2 bg-white border rounded">
                        <span>{isRTL ? `القسط ${p.installment_number}` : `Installment ${p.installment_number}`}</span>
                        <span>{p.amount?.toLocaleString()} {t('sar')}</span>
                        <span className="text-sm text-slate-500">{p.due_date}</span>
                        <StatusBadge status={p.status} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}