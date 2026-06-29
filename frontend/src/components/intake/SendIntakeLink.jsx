import React, { useState } from 'react';
import { supabase, tenantQuery, callApi } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import { Send, Loader2 } from 'lucide-react';

export default function SendIntakeLink({ intakeLink, open, onOpenChange }) {
  const { t: _t, isRTL } = useLanguage();
  const [sending, setSending] = useState(false);

  const [formData, setFormData] = useState({
    parent_name: '',
    parent_phone: '',
    parent_email: '',
    referral_name: '',
    referral_phone: '',
    referral_email: '',
    referral_type: '',
    channel: 'both'
  });

  const handleSend = async () => {
    if (!formData.parent_phone && !formData.parent_email) {
      toast.error(isRTL ? 'يرجى إدخال رقم الهاتف أو البريد الإلكتروني' : 'Please enter phone or email');
      return;
    }

    setSending(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);

      // Log the communication
      await tenantQuery('intake_comm_logs').insert({
        intake_link_id: intakeLink.id,
        parent_name: formData.parent_name,
        parent_phone: formData.parent_phone,
        parent_email: formData.parent_email,
        referral_name: formData.referral_name,
        referral_phone: formData.referral_phone,
        referral_email: formData.referral_email,
        referral_type: formData.referral_type,
        channel: formData.channel,
        sent_by: user.email,
        sent_date: new Date().toISOString(),
        intake_link_url: intakeLink.link_url,
        status: 'sent'
      });

      // Send via selected channels
      if (formData.channel === 'email' || formData.channel === 'both') {
        if (formData.parent_email) {
          await callApi('/api/email/send', {
            to: formData.parent_email,
            subject: isRTL ? 'رابط تسجيل طالب جديد' : 'Student Registration Link',
            body: `
              ${isRTL ? 'عزيزي ولي الأمر' : 'Dear Parent'},
              
              ${isRTL 
                ? `يرجى استخدام الرابط التالي لتسجيل طالبك:\n\n${intakeLink.link_url}\n\nمع تحيات فريق القبول`
                : `Please use the following link to register your student:\n\n${intakeLink.link_url}\n\nBest regards,\nAdmissions Team`
              }
            `
          });
        }
      }

      toast.success(isRTL ? 'تم الإرسال بنجاح' : 'Link sent successfully');
      onOpenChange(false);
      setFormData({
        parent_name: '', parent_phone: '', parent_email: '',
        referral_name: '', referral_phone: '', referral_email: '',
        referral_type: '', channel: 'both'
      });
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ في الإرسال' : 'Error sending link');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isRTL ? 'إرسال رابط التسجيل' : 'Send Intake Link'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Parent Details */}
          <div className="border-b pb-4">
            <h3 className="font-semibold mb-3">{isRTL ? 'بيانات ولي الأمر' : 'Parent Details'}</h3>
            <div className="space-y-3">
              <div>
                <Label>{isRTL ? 'الاسم' : 'Name'}</Label>
                <Input value={formData.parent_name} onChange={(e) => setFormData({...formData, parent_name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{isRTL ? 'رقم الجوال (واتس أب)' : 'Phone (WhatsApp)'}</Label>
                  <Input value={formData.parent_phone} onChange={(e) => setFormData({...formData, parent_phone: e.target.value})} />
                </div>
                <div>
                  <Label>{isRTL ? 'البريد الإلكتروني' : 'Email'}</Label>
                  <Input type="email" value={formData.parent_email} onChange={(e) => setFormData({...formData, parent_email: e.target.value})} />
                </div>
              </div>
            </div>
          </div>

          {/* Referral Details */}
          <div className="border-b pb-4">
            <h3 className="font-semibold mb-3">{isRTL ? 'بيانات الإحالة (اختياري)' : 'Referral Details (Optional)'}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{isRTL ? 'اسم المُحيل' : 'Referral Name'}</Label>
                  <Input value={formData.referral_name} onChange={(e) => setFormData({...formData, referral_name: e.target.value})} />
                </div>
                <div>
                  <Label>{isRTL ? 'نوع الإحالة' : 'Referral Type'}</Label>
                  <Select value={formData.referral_type} onValueChange={(v) => setFormData({...formData, referral_type: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="partner">{isRTL ? 'شريك' : 'Partner'}</SelectItem>
                      <SelectItem value="agent">{isRTL ? 'وكيل' : 'Agent'}</SelectItem>
                      <SelectItem value="employee_referral">{isRTL ? 'إحالة موظف' : 'Employee Referral'}</SelectItem>
                      <SelectItem value="other">{isRTL ? 'أخرى' : 'Other'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{isRTL ? 'هاتف المُحيل' : 'Referral Phone'}</Label>
                  <Input value={formData.referral_phone} onChange={(e) => setFormData({...formData, referral_phone: e.target.value})} />
                </div>
                <div>
                  <Label>{isRTL ? 'بريد المُحيل' : 'Referral Email'}</Label>
                  <Input type="email" value={formData.referral_email} onChange={(e) => setFormData({...formData, referral_email: e.target.value})} />
                </div>
              </div>
            </div>
          </div>

          {/* Send Channel */}
          <div>
            <Label>{isRTL ? 'إرسال عبر' : 'Send Via'}</Label>
            <Select value={formData.channel} onValueChange={(v) => setFormData({...formData, channel: v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">{isRTL ? 'البريد الإلكتروني' : 'Email'}</SelectItem>
                <SelectItem value="whatsapp">{isRTL ? 'واتس أب' : 'WhatsApp'}</SelectItem>
                <SelectItem value="both">{isRTL ? 'كلاهما' : 'Both'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
          <Button onClick={handleSend} disabled={sending} className="bg-najdi-700 hover:bg-najdi-900">
            {sending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
            <Send className="w-4 h-4 me-2" />
            {isRTL ? 'إرسال' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}