import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData, callApi } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Badge } from '../components/ui/badge';
import PageHeader from '../components/ui/PageHeader';
import { Plus, Edit2, FileText, Loader2, ArrowLeft, AlertCircle, Wand2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { useTenantFilter } from '../hooks/useTenantFilter';
import ContractPreviewModal from '../components/contracts/ContractPreviewModal';
import { useTenant } from '../components/TenantContext';

const TEMPLATE_TYPES = [
  { value: 'enrollment', label_ar: 'عقد التسجيل والرسوم الدراسية', label_en: 'Enrollment & Tuition Contract' },
  { value: 'fee_policy', label_ar: 'ملحق سياسة الرسوم والدفع', label_en: 'Fee Policy & Payment Terms' },
  { value: 'transportation', label_ar: 'اتفاقية النقل المدرسي', label_en: 'Transportation Agreement' },
  { value: 'special_care', label_ar: 'ملحق خدمات الرعاية الخاصة', label_en: 'Special Care Services' },
  { value: 'refund_policy', label_ar: 'سياسة الاسترداد والانسحاب', label_en: 'Refund & Withdrawal Policy' },
  { value: 'custom', label_ar: 'قالب مخصص', label_en: 'Custom Template' }
];

const DEFAULT_PLACEHOLDERS = [
  { key: '{{school_name}}', label_ar: 'اسم المدرسة', label_en: 'School Name' },
  { key: '{{school_address}}', label_ar: 'عنوان المدرسة', label_en: 'School Address' },
  { key: '{{cr_number}}', label_ar: 'رقم السجل التجاري', label_en: 'CR Number' },
  { key: '{{vat_number}}', label_ar: 'الرقم الضريبي', label_en: 'VAT Number' },
  { key: '{{student_name}}', label_ar: 'اسم الطالب', label_en: 'Student Name' },
  { key: '{{guardian_name}}', label_ar: 'اسم ولي الأمر', label_en: 'Guardian Name' },
  { key: '{{guardian_id}}', label_ar: 'هوية ولي الأمر', label_en: 'Guardian ID' },
  { key: '{{academic_year}}', label_ar: 'العام الدراسي', label_en: 'Academic Year' },
  { key: '{{grade}}', label_ar: 'الصف', label_en: 'Grade' },
  { key: '{{total_fees}}', label_ar: 'إجمالي الرسوم', label_en: 'Total Fees' },
  { key: '{{contract_date}}', label_ar: 'تاريخ العقد', label_en: 'Contract Date' },
  { key: '{{contract_number}}', label_ar: 'رقم العقد', label_en: 'Contract Number' }
];

const SAUDI_ENROLLMENT_TEMPLATE_EN = `
<h2 style="text-align: center;">Student Enrollment & Tuition Contract</h2>

<p style="margin-top: 20px;">Contract Date: <strong>{{contract_date}}</strong> &nbsp;&nbsp; Contract No: <strong>{{contract_number}}</strong></p>

<h3>Party One — The School:</h3>
<p>
  School Name: <strong>{{school_name}}</strong><br>
  Address: {{school_address}}<br>
  Commercial Registration No: {{cr_number}}<br>
  VAT Registration No: {{vat_number}}
</p>

<h3>Party Two — The Guardian:</h3>
<p>
  Full Name: <strong>{{guardian_name}}</strong><br>
  National ID / Iqama No: {{guardian_id}}<br>
  Mobile: {{guardian_phone}}
</p>

<h3>Student Information:</h3>
<p>
  Student Name: <strong>{{student_name}}</strong><br>
  Grade: {{grade}}<br>
  Academic Year: {{academic_year}}
</p>

<h3>Article 1 — Subject of Contract</h3>
<p>The Guardian agrees to enroll the above-named student at the School for the specified academic year and undertakes to pay the agreed tuition fees and abide by all school policies and regulations.</p>

<h3>Article 2 — Tuition Fees</h3>
<p>Total Annual Tuition Fees: <strong>{{total_fees}} {{currency_code}}</strong></p>
<p>Fees include:</p>
<ul>
  <li>Core tuition fees</li>
  <li>Books and educational materials (where selected)</li>
  <li>Extracurricular activities</li>
</ul>
<p><em>All fees are exclusive of VAT at {{vat_rate_pct}}% unless stated otherwise. Where e-invoicing applies in this jurisdiction, a compliant tax invoice will be issued upon payment.</em></p>

<h3>Article 3 — Payment Terms</h3>
<p>Fees may be paid as follows:</p>
<ol>
  <li>Full payment at the beginning of the academic year (eligible for early-payment discount if applicable)</li>
  <li>In three (3) installments per the payment schedule attached to this contract</li>
</ol>
<p>Payments must be made via bank transfer, SADAD, MADA, or Visa/Mastercard. Cash payments are only accepted at the finance office.</p>

<h3>Article 4 — Late Payment</h3>
<p>In the event of delayed payment, the School reserves the right to:</p>
<ul>
  <li>Withhold student reports and academic records</li>
  <li>Restrict participation in school activities</li>
  <li>Initiate the student suspension procedure after written notice</li>
</ul>

<h3>Article 5 — Refund & Withdrawal Policy</h3>
<p>Upon student withdrawal, the following refund schedule applies:</p>
<ul>
  <li>Before academic year commencement: full refund minus registration fee ({{registration_fee}} {{currency_code}})</li>
  <li>Within the first month of study: 50% refund of remaining term fees</li>
  <li>After the first month: no refund</li>
</ul>
<p>Refund requests must be submitted in writing. Processing takes up to 15 business days.</p>

<h3>Article 6 — Guardian Obligations</h3>
<ol>
  <li>Pay all fees on time as per the agreed schedule</li>
  <li>Ensure the student attends school regularly and on time</li>
  <li>Cooperate with the school on behavioral and academic matters</li>
  <li>Notify the school promptly of any changes to contact details</li>
  <li>Ensure the student follows the school's code of conduct and uniform policy</li>
</ol>

<h3>Article 7 — School Obligations</h3>
<ol>
  <li>Provide a safe, inclusive, and high-quality educational environment</li>
  <li>Deliver the approved Ministry of Education curriculum</li>
  <li>Monitor student academic progress and communicate with the guardian</li>
  <li>Maintain student safety and wellbeing during school hours</li>
  <li>Issue jurisdiction-compliant tax invoices for all fee collections where e-invoicing applies</li>
</ol>

<h3>Article 8 — Data Privacy</h3>
<p>The Guardian consents to the collection and processing of the student's personal data for educational, administrative, and communication purposes, in accordance with the Kingdom of Saudi Arabia's Personal Data Protection Law (PDPL). Data will not be shared with third parties without prior consent.</p>

<h3>Article 9 — Contract Termination</h3>
<p>The School may terminate this contract in the event of:</p>
<ul>
  <li>Non-payment of fees after written notice</li>
  <li>Repeated or serious breaches of school regulations</li>
  <li>Conduct harmful to the school community</li>
</ul>

<h3>Article 10 — Governing Law & Dispute Resolution</h3>
<p>This contract is governed by the laws of the Kingdom of Saudi Arabia. Any disputes shall first be resolved amicably. If unresolved, the matter shall be referred to the competent courts or the Ministry of Education's arbitration mechanism.</p>

<p style="margin-top: 40px;"><strong>This contract has been agreed upon and signed by both parties:</strong></p>

<div style="display: flex; justify-content: space-between; margin-top: 30px;">
  <div style="text-align: center; width: 45%;">
    <p>_________________________</p>
    <p><strong>Guardian Signature</strong></p>
    <p>Name: {{guardian_name}}</p>
    <p>Date: ___________</p>
  </div>
  <div style="text-align: center; width: 45%;">
    <p>_________________________</p>
    <p><strong>School Authorized Representative</strong></p>
    <p>{{school_name}}</p>
    <p>Date: ___________</p>
  </div>
</div>
`;

const SAUDI_ENROLLMENT_TEMPLATE_AR = `
<h2 style="text-align: center; direction: rtl;">عقد التسجيل والرسوم الدراسية</h2>

<p style="margin-top: 20px; direction: rtl; text-align: right;">تحريراً في تاريخ: <strong>{{contract_date}}</strong></p>

<h3 style="direction: rtl; text-align: right;">الطرف الأول (المدرسة):</h3>
<p style="direction: rtl; text-align: right;">اسم المدرسة: <strong>{{school_name}}</strong><br>
العنوان: {{school_address}}<br>
السجل التجاري: {{cr_number}}<br>
الرقم الضريبي: {{vat_number}}</p>

<h3 style="direction: rtl; text-align: right;">الطرف الثاني (ولي الأمر):</h3>
<p style="direction: rtl; text-align: right;">الاسم: <strong>{{guardian_name}}</strong><br>
رقم الهوية/الإقامة: {{guardian_id}}<br>
الهاتف: {{guardian_phone}}</p>

<h3 style="direction: rtl; text-align: right;">بيانات الطالب:</h3>
<p style="direction: rtl; text-align: right;">الاسم: <strong>{{student_name}}</strong><br>
الصف: {{grade}}<br>
العام الدراسي: {{academic_year}}</p>

<h3 style="direction: rtl; text-align: right;">المادة الأولى: موضوع العقد</h3>
<p style="direction: rtl; text-align: right;">يقر الطرف الثاني بموجب هذا العقد بتسجيل الطالب المذكور أعلاه في المدرسة، ويلتزم بدفع الرسوم الدراسية المحددة والالتزام بسياسات وأنظمة المدرسة.</p>

<h3 style="direction: rtl; text-align: right;">المادة الثانية: الرسوم الدراسية</h3>
<p style="direction: rtl; text-align: right;">إجمالي الرسوم الدراسية السنوية: <strong>{{total_fees}} {{currency_code}}</strong></p>
<p style="direction: rtl; text-align: right;">تشمل الرسوم:</p>
<ul style="direction: rtl; text-align: right; padding-right: 20px; padding-left: 0;">
  <li>الرسوم الدراسية الأساسية</li>
  <li>الكتب والمستلزمات الدراسية (حسب الاختيار)</li>
  <li>الأنشطة اللاصفية</li>
</ul>

<h3 style="direction: rtl; text-align: right;">المادة الثالثة: طريقة السداد</h3>
<p style="direction: rtl; text-align: right;">يمكن سداد الرسوم وفق إحدى الطرق التالية:</p>
<ol style="direction: rtl; text-align: right; padding-right: 20px; padding-left: 0;">
  <li>دفعة واحدة في بداية العام الدراسي</li>
  <li>على أقساط (3 أقساط) حسب الجدول الزمني المرفق</li>
</ol>

<h3 style="direction: rtl; text-align: right;">المادة الرابعة: الانسحاب واسترداد الرسوم</h3>
<p style="direction: rtl; text-align: right;">في حالة انسحاب الطالب، تطبق سياسة الاسترداد التالية:</p>
<ul style="direction: rtl; text-align: right; padding-right: 20px; padding-left: 0;">
  <li>قبل بداية العام الدراسي: استرداد كامل الرسوم بعد خصم رسوم التسجيل</li>
  <li>خلال الشهر الأول: استرداد 50% من الرسوم</li>
  <li>بعد الشهر الأول: لا يوجد استرداد</li>
</ul>

<h3 style="direction: rtl; text-align: right;">المادة الخامسة: التزامات ولي الأمر</h3>
<p style="direction: rtl; text-align: right;">يلتزم ولي الأمر بما يلي:</p>
<ol style="direction: rtl; text-align: right; padding-right: 20px; padding-left: 0;">
  <li>سداد الرسوم في المواعيد المحددة</li>
  <li>الالتزام بأنظمة وتعليمات المدرسة</li>
  <li>متابعة مستوى الطالب الدراسي والسلوكي</li>
  <li>إبلاغ المدرسة بأي تغيير في بيانات التواصل</li>
</ol>

<h3 style="direction: rtl; text-align: right;">المادة السادسة: التزامات المدرسة</h3>
<p style="direction: rtl; text-align: right;">تلتزم المدرسة بما يلي:</p>
<ol style="direction: rtl; text-align: right; padding-right: 20px; padding-left: 0;">
  <li>توفير بيئة تعليمية مناسبة</li>
  <li>تقديم الخدمات التعليمية حسب المنهج المعتمد</li>
  <li>متابعة مستوى الطالب وإشعار ولي الأمر</li>
  <li>الحفاظ على سلامة الطالب خلال اليوم الدراسي</li>
</ol>

<h3 style="direction: rtl; text-align: right;">المادة السابعة: الموافقة على معالجة البيانات</h3>
<p style="direction: rtl; text-align: right;">يوافق ولي الأمر على جمع واستخدام بيانات الطالب للأغراض التعليمية والإدارية، والتواصل عبر الوسائل المختلفة (البريد الإلكتروني، الرسائل النصية، واتساب).</p>

<h3 style="direction: rtl; text-align: right;">المادة الثامنة: فسخ العقد</h3>
<p style="direction: rtl; text-align: right;">يحق للمدرسة فسخ العقد في حال:</p>
<ul style="direction: rtl; text-align: right; padding-right: 20px; padding-left: 0;">
  <li>عدم الالتزام بسداد الرسوم</li>
  <li>مخالفة الأنظمة واللوائح</li>
  <li>تكرار المشاكل السلوكية للطالب</li>
</ul>

<h3 style="direction: rtl; text-align: right;">المادة التاسعة: النزاعات</h3>
<p style="direction: rtl; text-align: right;">في حال نشوء أي نزاع، يتم حله ودياً، وإلا يحال للجهات المختصة في المملكة العربية السعودية.</p>

<p style="margin-top: 40px; direction: rtl; text-align: right;"><strong>تم التوقيع والموافقة على هذا العقد:</strong></p>

<div style="display: flex; justify-content: space-between; margin-top: 30px; direction: rtl;">
  <div style="text-align: center;">
    <p>_____________________</p>
    <p>توقيع ولي الأمر</p>
    <p>التاريخ: ___________</p>
  </div>
  <div style="text-align: center;">
    <p>_____________________</p>
    <p>ختم وتوقيع المدرسة</p>
    <p>التاريخ: ___________</p>
  </div>
</div>
`;

export default function ContractTemplates() {
  const { t, isRTL } = useLanguage();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate: _getTenantIdForCreate } = useTenantFilter();
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [formData, setFormData] = useState({
    name_ar: '',
    name_en: '',
    template_type: 'enrollment',
    content_ar: '',
    content_en: '',
    version: '1.0',
    is_active: true,
    is_default: false
  });

  // Derive unsaved changes without useEffect to avoid extra render cycles
  const hasUnsavedChanges = !!(formData.name_ar || formData.content_ar || formData.name_en || formData.content_en);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['contractTemplates', tenantId, tenant?.jurisdiction_code],
    queryFn: async () => {
      try {
        const res = await callApi('/api/contracts/templates', null, { method: 'GET' });
        return res.data || [];
      } catch {
        const rows = await fetchData(tenantQuery('contract_templates').select('*').match(tenantFilter()).order('created_at', { ascending: false }));
        const code = tenant?.jurisdiction_code;
        if (!code) return rows;
        return rows.filter((t) => !t.jurisdiction_code || t.jurisdiction_code === code);
      }
    },
    enabled: hasTenantAccess,
  });

  const [activeEditorTab, setActiveEditorTab] = useState('arabic');
  const [previewTemplate, setPreviewTemplate] = useState(null);

  const handleEdit = (template) => {
    setEditingTemplate(template);
    setActiveEditorTab(isRTL ? 'arabic' : 'english');
    setFormData({
      name_ar: template.name_ar || '',
      name_en: template.name_en || '',
      template_type: template.template_type || 'enrollment',
      content_ar: template.content_ar || '',
      content_en: template.content_en || '',
      version: template.version || '1.0',
      is_active: template.is_active !== false,
      is_default: template.is_default || false
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.name_ar || !formData.content_ar) {
      toast.error(isRTL ? 'يرجى ملء الحقول المطلوبة' : 'Please fill required fields');
      return;
    }

    setSaving(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const templateCode = editingTemplate?.template_code || `TPL-${Date.now().toString(36).toUpperCase()}`;

      const tid = tenantId || user?.tenant_id;
      const data = {
        ...formData,
        ...((!editingTemplate && tid) ? { tenant_id: tid } : {}),
        template_code: templateCode,
        placeholders: DEFAULT_PLACEHOLDERS,
        created_by: editingTemplate ? undefined : user.email,
        last_modified_by: user.email,
        last_modified_date: new Date().toISOString()
      };

      if (editingTemplate) {
        const { error } = await tenantQuery('contract_templates').update({
          ...data,
          source: 'school',
          jurisdiction_code: editingTemplate.jurisdiction_code || tenant?.jurisdiction_code || null,
        }).eq('id', editingTemplate.id);
        if (error) throw error;
        toast.success(isRTL ? 'تم التحديث' : 'Template updated');
      } else {
        await createRecord({
          ...data,
          source: 'school',
          jurisdiction_code: tenant?.jurisdiction_code || null,
        });
        toast.success(isRTL ? 'تم الإنشاء' : 'Template created');
      }

      queryClient.invalidateQueries({ queryKey: ['contractTemplates'] });
      setShowForm(false);
      setEditingTemplate(null);
      setFormData({ name_ar: '', name_en: '', template_type: 'enrollment', content_ar: '', content_en: '', version: '1.0', is_active: true, is_default: false });
    } catch (error) {
      console.error('Error saving template:', error);
      
      // Log to system error log
      try {
        const user = await supabase.auth.getUser().then(r => r.data?.user);
        await tenantQuery('system_errors').insert({
          error_type: 'contract_template_save_failed',
          error_message: error.message,
          stack_trace: error.stack || '',
          context: JSON.stringify({ formData, user: user.email }),
          severity: 'medium'
        });
      } catch (logError) {
        console.error('Failed to log error:', logError);
      }
      
      toast.error(isRTL ? 'حدث خطأ أثناء حفظ القالب' : 'Error occurred while saving template');
    } finally {
      setSaving(false);
    }
  };

  const handleCloseForm = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedWarning(true);
    } else {
      setShowForm(false);
      setEditingTemplate(null);
      setFormData({ name_ar: '', name_en: '', template_type: 'enrollment', content_ar: '', content_en: '', version: '1.0', is_active: true, is_default: false });
    }
  };

  const confirmLeave = () => {
    setShowForm(false);
    setEditingTemplate(null);
    setFormData({ name_ar: '', name_en: '', template_type: 'enrollment', content_ar: '', content_en: '', version: '1.0', is_active: true, is_default: false });
    setShowUnsavedWarning(false);
  };

  const createRecord = async (templateData) => {
    // If we have a tenant context, create directly; otherwise use backend function (service role)
    if (tenantId) {
      return tenantQuery('contract_templates').insert({ ...templateData, tenant_id: tenantId });
    }
    const res = await callApi('/api/functions/createContractTemplate', { templateData });
    return res.data?.template;
  };

  const createDefaultTemplate = async () => {
    setSaving(true);
    try {
      const res = await callApi('/api/contracts/templates/seed-defaults', {});
      queryClient.invalidateQueries({ queryKey: ['contractTemplates'] });
      toast.success(
        isRTL
          ? `تم تهيئة القالب الافتراضي (${res.jurisdiction})`
          : `Default template seeded (${res.jurisdiction})`
      );
    } catch (error) {
      console.error('createDefaultTemplate error:', error);
      toast.error((isRTL ? 'حدث خطأ: ' : 'Error: ') + (error.message || String(error)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          {isRTL ? 'رجوع' : 'Back'}
        </Button>
        <div className="flex-1">
          <PageHeader
            title={isRTL ? 'قوالب عقود الطلاب' : 'Student Contract Templates'}
            subtitle={isRTL ? 'إدارة القوالب القياسية للعقود' : 'Manage standard contract templates'}
            action
            actionLabel={isRTL ? 'قالب جديد' : 'New Template'}
            actionIcon={Plus}
            onAction={() => { setFormData({ name_ar: '', name_en: '', template_type: 'enrollment', content_ar: '', content_en: '', version: '1.0', is_active: true, is_default: false }); setActiveEditorTab(isRTL ? 'arabic' : 'english'); setShowForm(true); }}
          />
        </div>
      </div>

      {templates.length === 0 && !isLoading && (
        <Card className="p-8 text-center">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">{isRTL ? 'لا توجد قوالب. أنشئ القالب الافتراضي حسب دولة المدرسة' : 'No templates. Seed the default for this school jurisdiction'}</p>
          <Button onClick={createDefaultTemplate} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
            {isRTL ? 'إنشاء القالب الافتراضي' : 'Create Default Template'}
          </Button>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {templates.map(template => (
          <Card key={template.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg">
                    {isRTL ? template.name_ar : (template.name_en || template.name_ar)}
                  </CardTitle>

                  <p className="text-sm text-muted-foreground mt-1">{TEMPLATE_TYPES.find(tp => tp.value === template.template_type)?.[isRTL ? 'label_ar' : 'label_en']}</p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${template.content_ar ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {template.content_ar ? '✓ عربي' : '✗ عربي'}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${template.content_en ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {template.content_en ? '✓ EN' : '○ EN missing'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {template.is_default && <Badge variant="outline">{isRTL ? 'قياسي' : 'Default'}</Badge>}
                  {template.is_active ? (
                    <Badge className="bg-green-100 text-green-700">{isRTL ? 'نشط' : 'Active'}</Badge>
                  ) : (
                    <Badge variant="outline">{isRTL ? 'غير نشط' : 'Inactive'}</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => handleEdit(template)}>
                  <Edit2 className="w-4 h-4 me-1" /> {t('edit')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPreviewTemplate(template)}>
                  <Eye className="w-4 h-4 me-1" /> {isRTL ? 'معاينة' : 'Preview'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showForm} onOpenChange={(open) => { if (!open) handleCloseForm(); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? (isRTL ? 'تعديل القالب' : 'Edit Template') : (isRTL ? 'قالب جديد' : 'New Template')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'} *</Label>
                <Input value={formData.name_ar} onChange={(e) => setFormData({...formData, name_ar: e.target.value})} />
              </div>
              <div>
                <Label>{isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'}</Label>
                <Input value={formData.name_en} onChange={(e) => setFormData({...formData, name_en: e.target.value})} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>{isRTL ? 'نوع القالب' : 'Template Type'}</Label>
                <Select value={formData.template_type} onValueChange={(v) => setFormData({...formData, template_type: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>{isRTL ? type.label_ar : type.label_en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{isRTL ? 'الإصدار' : 'Version'}</Label>
                <Input value={formData.version} onChange={(e) => setFormData({...formData, version: e.target.value})} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>{isRTL ? 'محتوى العقد' : 'Contract Content'} *</Label>
                {!editingTemplate && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setFormData(f => ({ ...f, content_ar: SAUDI_ENROLLMENT_TEMPLATE_AR.trim(), content_en: SAUDI_ENROLLMENT_TEMPLATE_EN.trim() }))}
                  >
                    <Wand2 className="w-3 h-3 me-1" />
                    {isRTL ? 'تحميل النموذج القياسي' : 'Load Default Content'}
                  </Button>
                )}
              </div>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setActiveEditorTab('arabic')}
                  className={`px-4 py-1.5 rounded text-sm font-medium border transition-colors ${activeEditorTab === 'arabic' ? 'bg-najdi-900 text-white border-najdi-900' : 'bg-white text-muted-foreground border-border hover:bg-sand'}`}
                >
                  {isRTL ? 'عربي' : 'Arabic'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveEditorTab('english')}
                  className={`px-4 py-1.5 rounded text-sm font-medium border transition-colors ${activeEditorTab === 'english' ? 'bg-najdi-900 text-white border-najdi-900' : 'bg-white text-muted-foreground border-border hover:bg-sand'}`}
                >
                  {isRTL ? 'إنجليزي' : 'English'}
                  {!formData.content_en && <span className="ms-1 text-amber-500">•</span>}
                </button>
              </div>
              {activeEditorTab === 'arabic' ? (
                <div dir="rtl" className="quill-rtl-wrapper">
                  <style>{`
                    .quill-rtl-wrapper .ql-editor {
                      direction: rtl;
                      text-align: right;
                      unicode-bidi: plaintext;
                      font-family: 'IBM Plex Sans Arabic', Arial, sans-serif;
                    }
                    .quill-rtl-wrapper .ql-editor p,
                    .quill-rtl-wrapper .ql-editor h1,
                    .quill-rtl-wrapper .ql-editor h2,
                    .quill-rtl-wrapper .ql-editor h3,
                    .quill-rtl-wrapper .ql-editor li {
                      direction: rtl;
                      text-align: right;
                    }
                    .quill-rtl-wrapper .ql-toolbar {
                      direction: ltr;
                    }
                  `}</style>
                  <ReactQuill theme="snow" value={formData.content_ar} onChange={(v) => setFormData({...formData, content_ar: v})} style={{ height: '300px', marginBottom: '50px' }} />
                </div>
              ) : (
                <>
                  {!formData.content_en && (
                    <div className="bg-amber-50 border border-amber-200 rounded p-2 mb-2 text-sm text-amber-700">
                      <AlertCircle className="w-4 h-4 inline me-1" />
                      {isRTL ? 'يُنصح بإضافة محتوى إنجليزي للقالب' : 'English content recommended for bilingual support'}
                    </div>
                  )}
                  <ReactQuill theme="snow" value={formData.content_en} onChange={(v) => setFormData({...formData, content_en: v})} style={{ height: '300px', marginBottom: '50px' }} />
                </>
              )}
            </div>

            <Card className="bg-sand">
              <CardContent className="p-4">
                <h4 className="font-semibold mb-2">{isRTL ? 'المتغيرات المتاحة:' : 'Available Placeholders:'}</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {DEFAULT_PLACEHOLDERS.map(ph => (
                    <div key={ph.key} className="font-mono text-xs">
                      <code className="bg-white px-2 py-1 rounded">{ph.key}</code> - {isRTL ? ph.label_ar : ph.label_en}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseForm} disabled={saving}>{t('cancel')}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contract Preview Modal */}
      {previewTemplate && (
        <ContractPreviewModal
          open={!!previewTemplate}
          onClose={() => setPreviewTemplate(null)}
          template={previewTemplate}
          previewData={{
            school_name: '[اسم المدرسة / School Name]',
            school_address: '[العنوان / Address]',
            cr_number: '[رقم السجل التجاري / CR No]',
            vat_number: '[الرقم الضريبي / VAT No]',
            student_name: '[اسم الطالب / Student Name]',
            guardian_name: '[ولي الأمر / Guardian Name]',
            guardian_id: '[رقم الهوية / ID No]',
            guardian_phone: '[الهاتف / Phone]',
            academic_year: '2025 – 2026',
            grade: '[الصف / Grade]',
            total_fees: '25,000',
            contract_date: new Date().toLocaleDateString(),
            contract_number: 'CNT-PREVIEW-001'
          }}
        />
      )}

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
    </div>
  );
}