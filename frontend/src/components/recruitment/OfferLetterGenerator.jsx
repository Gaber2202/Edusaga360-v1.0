import React, { useState } from 'react';
import { tenantQuery, callApi } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { FileText, Bot, Loader2, Send, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';

const OFFER_STATUS_COLORS = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-blue-100 text-blue-700',
  viewed: 'bg-purple-100 text-purple-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  expired: 'bg-amber-100 text-amber-700',
};

const OFFER_STATUS_LABELS = {
  draft: { ar: 'مسودة', en: 'Draft' },
  sent: { ar: 'مرسل', en: 'Sent' },
  viewed: { ar: 'تمت المشاهدة', en: 'Viewed' },
  accepted: { ar: 'مقبول', en: 'Accepted' },
  rejected: { ar: 'مرفوض', en: 'Rejected' },
  expired: { ar: 'منتهي الصلاحية', en: 'Expired' },
};

export default function OfferLetterGenerator({ applicant, recruitment, departments, branches, companies, onOfferCreated }) {
  const { isRTL } = useLanguage();
  const [showForm, setShowForm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [offerStatus, setOfferStatus] = useState(applicant?.offer_status || 'draft');

  const dept = departments?.find(d => d.id === (applicant?.department_id || recruitment?.department_id));
  const branch = branches?.find(b => b.id === (applicant?.branch_id || recruitment?.branch_id));
  const company = companies?.find(c => c.id === recruitment?.company_id);

  const [form, setForm] = useState({
    job_title: applicant?.job_title || recruitment?.position_name || '',
    department: dept?.name_ar || '',
    company: company?.name_ar || '',
    branch: branch?.name_ar || '',
    employment_type: applicant?.employment_type || recruitment?.employment_type || 'full_time',
    contract_type: 'limited',
    start_date: format(addDays(new Date(), 14), 'yyyy-MM-dd'),
    probation_months: 3,
    contract_duration_months: 12,
    basic_salary: applicant?.expected_salary || 0,
    housing_allowance: 0,
    transport_allowance: 0,
    other_allowances: 0,
    offer_expiry_date: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
    offer_text_ar: '',
    offer_text_en: '',
  });

  const totalSalary = form.basic_salary + form.housing_allowance + form.transport_allowance + form.other_allowances;

  const generateOfferText = async () => {
    setGenerating(true);
    const prompt = `Generate a professional bilingual employment offer letter for a Saudi school group (EduSaga).

Candidate: ${applicant?.full_name_ar} / ${applicant?.full_name_en || ''}
Position: ${form.job_title}
Department: ${form.department}
Company: ${form.company}
Branch: ${form.branch}
Employment Type: ${form.employment_type}
Contract Type: ${form.contract_type === 'limited' ? 'Fixed Term' : 'Unlimited'}
Start Date: ${form.start_date}
Probation Period: ${form.probation_months} months
Contract Duration: ${form.contract_duration_months} months
Basic Salary: ${form.basic_salary.toLocaleString()} SAR
Housing Allowance: ${form.housing_allowance.toLocaleString()} SAR
Transport Allowance: ${form.transport_allowance.toLocaleString()} SAR
Total Package: ${totalSalary.toLocaleString()} SAR/month
Offer Expiry: ${form.offer_expiry_date}

Return JSON with keys: "offer_text_ar" (formal Arabic offer letter) and "offer_text_en" (formal English offer letter).
Both must be complete, professional, and include all the above details. Include acceptance instruction in each.`;

    const res = await callApi('/api/ai/invoke-llm', {
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          offer_text_ar: { type: 'string' },
          offer_text_en: { type: 'string' },
        }
      }
    });
    setForm(p => ({ ...p, offer_text_ar: res.offer_text_ar, offer_text_en: res.offer_text_en }));
    setGenerating(false);
    toast.success(isRTL ? 'تم توليد خطاب العرض' : 'Offer letter generated');
  };

  const handleSendOffer = async () => {
    setSaving(true);
    try {
      const offerData = {
        ...form,
        applicant_id: applicant.id,
        recruitment_id: recruitment?.id,
        candidate_name_ar: applicant.full_name_ar,
        candidate_name_en: applicant.full_name_en,
        candidate_email: applicant.email,
        total_salary: totalSalary,
        offer_status: 'sent',
        sent_date: new Date().toISOString(),
      };

      await tenantQuery('applicants').update({
        offer_status: 'sent',
        offer_data: offerData,
        status: 'offered',
      });

      if (applicant.email) {
        await callApi('/api/email/send', {
          to: applicant.email,
          subject: isRTL ? `عرض توظيف — ${form.job_title}` : `Job Offer — ${form.job_title}`,
          body: `${form.offer_text_en || ''}\n\n---\n\n${form.offer_text_ar || ''}`,
        });
      }

      setOfferStatus('sent');
      onOfferCreated?.();
      setShowForm(false);
      toast.success(isRTL ? 'تم إرسال خطاب العرض' : 'Offer letter sent');
    } catch (_e) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (newStatus) => {
    await tenantQuery('applicants').update({ offer_status: newStatus, status: newStatus === 'accepted' ? 'offered' : applicant.status });
    setOfferStatus(newStatus);
    onOfferCreated?.();
    toast.success(isRTL ? 'تم تحديث الحالة' : 'Status updated');
  };

  return (
    <>
      <Card className="border-emerald-200 bg-emerald-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-emerald-800">
            <FileText className="w-4 h-4" />
            {isRTL ? 'خطاب العرض الوظيفي' : 'Offer Letter Management'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Badge className={OFFER_STATUS_COLORS[offerStatus]}>
              {isRTL ? OFFER_STATUS_LABELS[offerStatus]?.ar : OFFER_STATUS_LABELS[offerStatus]?.en}
            </Badge>
            {offerStatus === 'draft' || !offerStatus ? (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-2" onClick={() => setShowForm(true)}>
                <FileText className="w-3 h-3" />
                {isRTL ? 'إنشاء خطاب عرض' : 'Generate Offer Letter'}
              </Button>
            ) : offerStatus === 'sent' ? (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1 text-emerald-700 border-emerald-300" onClick={() => handleUpdateStatus('accepted')}>
                  <CheckCircle className="w-3 h-3" /> {isRTL ? 'قبول' : 'Accept'}
                </Button>
                <Button size="sm" variant="outline" className="gap-1 text-red-600 border-red-200" onClick={() => handleUpdateStatus('rejected')}>
                  <XCircle className="w-3 h-3" /> {isRTL ? 'رفض' : 'Reject'}
                </Button>
              </div>
            ) : offerStatus === 'accepted' ? (
              <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
                <CheckCircle className="w-4 h-4" />
                {isRTL ? 'العرض مقبول — جاهز للتحويل إلى موظف' : 'Offer Accepted — Ready to Convert to Employee'}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              {isRTL ? 'إنشاء خطاب عرض وظيفي' : 'Generate Offer Letter'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="bg-slate-50 rounded-lg p-4 grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-500">{isRTL ? 'المتقدم' : 'Candidate'}:</span> <strong>{applicant?.full_name_ar}</strong></div>
              <div><span className="text-slate-500">{isRTL ? 'البريد' : 'Email'}:</span> {applicant?.email}</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'المسمى الوظيفي' : 'Job Title'} *</Label>
                <Input value={form.job_title} onChange={e => setForm(p => ({...p, job_title: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'نوع العقد' : 'Contract Type'}</Label>
                <Select value={form.contract_type} onValueChange={v => setForm(p => ({...p, contract_type: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="limited">{isRTL ? 'محدد المدة' : 'Fixed Term'}</SelectItem>
                    <SelectItem value="unlimited">{isRTL ? 'غير محدد' : 'Unlimited'}</SelectItem>
                    <SelectItem value="part_time">{isRTL ? 'دوام جزئي' : 'Part Time'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ الالتحاق' : 'Start Date'} *</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm(p => ({...p, start_date: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'انتهاء صلاحية العرض' : 'Offer Expiry'}</Label>
                <Input type="date" value={form.offer_expiry_date} onChange={e => setForm(p => ({...p, offer_expiry_date: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'فترة الاختبار (أشهر)' : 'Probation (months)'}</Label>
                <Input type="number" min="0" max="12" value={form.probation_months} onChange={e => setForm(p => ({...p, probation_months: parseInt(e.target.value)||0}))} />
              </div>
              {form.contract_type === 'limited' && (
                <div className="space-y-2">
                  <Label>{isRTL ? 'مدة العقد (أشهر)' : 'Duration (months)'}</Label>
                  <Input type="number" min="1" value={form.contract_duration_months} onChange={e => setForm(p => ({...p, contract_duration_months: parseInt(e.target.value)||12}))} />
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <h4 className="font-semibold text-slate-700 mb-3">{isRTL ? 'الراتب والمزايا' : 'Salary & Benefits'}</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{isRTL ? 'الراتب الأساسي (ر.س)' : 'Basic Salary (SAR)'}</Label>
                  <Input type="number" min="0" value={form.basic_salary} onChange={e => setForm(p => ({...p, basic_salary: parseFloat(e.target.value)||0}))} />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'بدل السكن (ر.س)' : 'Housing Allowance (SAR)'}</Label>
                  <Input type="number" min="0" value={form.housing_allowance} onChange={e => setForm(p => ({...p, housing_allowance: parseFloat(e.target.value)||0}))} />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'بدل النقل (ر.س)' : 'Transport Allowance (SAR)'}</Label>
                  <Input type="number" min="0" value={form.transport_allowance} onChange={e => setForm(p => ({...p, transport_allowance: parseFloat(e.target.value)||0}))} />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'بدلات أخرى (ر.س)' : 'Other Allowances (SAR)'}</Label>
                  <Input type="number" min="0" value={form.other_allowances} onChange={e => setForm(p => ({...p, other_allowances: parseFloat(e.target.value)||0}))} />
                </div>
              </div>
              <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex justify-between items-center">
                <span className="font-semibold text-emerald-800">{isRTL ? 'إجمالي الراتب الشهري' : 'Total Monthly Package'}</span>
                <span className="text-xl font-bold text-emerald-700">{totalSalary.toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</span>
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-slate-700">{isRTL ? 'نص خطاب العرض' : 'Offer Letter Text'}</h4>
                <Button variant="outline" size="sm" className="gap-2 text-purple-700 border-purple-200" onClick={generateOfferText} disabled={generating || !form.job_title || !form.basic_salary}>
                  {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
                  {isRTL ? 'توليد بالذكاء الاصطناعي' : 'AI Generate'}
                </Button>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'النص العربي' : 'Arabic Text'}</Label>
                <Textarea value={form.offer_text_ar} onChange={e => setForm(p => ({...p, offer_text_ar: e.target.value}))} rows={6} dir="rtl" placeholder={isRTL ? 'اضغط توليد بالذكاء الاصطناعي أو أدخل النص يدوياً...' : 'Click AI Generate or enter manually...'} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'النص الإنجليزي' : 'English Text'}</Label>
                <Textarea value={form.offer_text_en} onChange={e => setForm(p => ({...p, offer_text_en: e.target.value}))} rows={6} placeholder="Click AI Generate or enter manually..." />
              </div>
            </div>
          </div>

          <DialogFooter className="sticky bottom-0 bg-white pt-4 border-t">
            <Button variant="outline" onClick={() => setShowForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={() => { setForm(p => ({...p})); setShowForm(false); toast.info(isRTL ? 'تم الحفظ كمسودة' : 'Saved as draft'); }} variant="outline">
              {isRTL ? 'حفظ مسودة' : 'Save Draft'}
            </Button>
            <Button onClick={handleSendOffer} disabled={saving || !form.job_title} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {isRTL ? 'إرسال العرض' : 'Send Offer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}