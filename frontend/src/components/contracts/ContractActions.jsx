import React, { useState } from 'react';
import { supabase, tenantQuery } from '../../api/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '../LanguageContext';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Checkbox } from '../ui/checkbox';
import { Send, Download, CheckCircle, XCircle, Loader2, Mail, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { logAuditEvent, AuditActions } from '../AuditService';
import { NotificationHelper } from '../notifications/NotificationHelper';

export default function ContractActions({ contract }) {
  const { t, isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const [showSend, setShowSend] = useState(false);
  const [showSign, setShowSign] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendChannels, setSendChannels] = useState({ email: true, whatsapp: false });
  const [rejectReason, setRejectReason] = useState('');

  const handleSend = async () => {
    if (!sendChannels.email && !sendChannels.whatsapp) {
      toast.error(isRTL ? 'اختر قناة إرسال واحدة على الأقل' : 'Select at least one delivery channel');
      return;
    }

    setLoading(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const channels = [];
      if (sendChannels.email) channels.push('email');
      if (sendChannels.whatsapp) channels.push('whatsapp');

      await tenantQuery('student_contracts').update({
        status: 'sent',
        sent_date: new Date().toISOString(),
        sent_via: channels,
        delivery_status: 'sent'
      }).eq('id', contract.id);

      // Log delivery
      await tenantQuery('contract_delivery_logs').insert({
        contract_id: contract.id,
        contract_number: contract.contract_number,
        student_id: contract.student_id,
        student_name: contract.student_name,
        guardian_email: contract.guardian_email,
        guardian_phone: contract.guardian_phone,
        channel: channels.length > 1 ? 'both' : channels[0],
        status: 'sent',
        sent_by: user.email,
        sent_date: new Date().toISOString()
      });

      await logAuditEvent({
        action: AuditActions.SEND,
        entityType: 'StudentContract',
        entityId: contract.id,
        page: 'Contracts',
        notes: `Contract ${contract.contract_number} sent via ${channels.join(', ')} to ${contract.guardian_name}`
      });

      // Notify relevant users
      NotificationHelper.notifyContractSent(contract);

      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast.success(isRTL ? 'تم إرسال العقد بنجاح' : 'Contract sent successfully');
      setShowSend(false);
    } catch (error) {
      console.error('Error sending contract:', error);
      toast.error(isRTL ? 'فشل الإرسال: ' + error.message : 'Failed to send: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkSigned = async () => {
    setLoading(true);
    try {
      await tenantQuery('student_contracts').update({
        status: 'signed',
        signed_by_guardian: true,
        signed_date: new Date().toISOString(),
        delivery_status: 'delivered'
      }).eq('id', contract.id);

      await logAuditEvent({
        action: AuditActions.APPROVE,
        entityType: 'StudentContract',
        entityId: contract.id,
        page: 'Contracts',
        notes: `Contract ${contract.contract_number} marked as signed`
      });

      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast.success(isRTL ? 'تم تحديث حالة العقد' : 'Contract marked as signed');
      setShowSign(false);
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error(isRTL ? 'يرجى إدخال سبب الرفض' : 'Please enter rejection reason');
      return;
    }

    setLoading(true);
    try {
      await tenantQuery('student_contracts').update({
        status: 'rejected',
        rejection_reason: rejectReason,
        rejected_date: new Date().toISOString()
      }).eq('id', contract.id);

      await logAuditEvent({
        action: AuditActions.REJECT,
        entityType: 'StudentContract',
        entityId: contract.id,
        page: 'Contracts',
        notes: `Contract ${contract.contract_number} rejected. Reason: ${rejectReason}`
      });

      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast.success(isRTL ? 'تم رفض العقد' : 'Contract rejected');
      setShowReject(false);
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = () => {
    const content = isRTL
      ? (contract.generated_content_ar || contract.generated_content_en || '')
      : (contract.generated_content_en || contract.generated_content_ar || '');

    if (!content) {
      toast.error(isRTL ? 'لا يوجد محتوى للعقد' : 'No contract content available');
      return;
    }

    const html = `<!DOCTYPE html>
<html dir="${isRTL ? 'rtl' : 'ltr'}" lang="${isRTL ? 'ar' : 'en'}">
<head>
<meta charset="UTF-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=Inter:wght@400;600;700&display=swap');
  body { font-family: ${isRTL ? "'IBM Plex Sans Arabic'" : "'Inter'"}, sans-serif; direction: ${isRTL ? 'rtl' : 'ltr'}; padding: 40px; color: #1e293b; font-size: 14px; line-height: 1.7; }
  h2, h3 { color: #0f172a; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
  .contract-number { font-size: 12px; color: #64748b; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
<div class="header">
  <div><strong>EduSaga 360</strong></div>
  <div class="contract-number">${contract.contract_number || ''}</div>
</div>
${content}
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      win.onload = () => {
        win.print();
        URL.revokeObjectURL(url);
      };
    } else {
      // Fallback: download as HTML file
      const a = document.createElement('a');
      a.href = url;
      a.download = `contract-${contract.contract_number || 'download'}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => setShowSend(true)} disabled={contract.status === 'signed'}>
        <Send className="w-4 h-4 me-1" /> {isRTL ? 'إرسال' : 'Send'}
      </Button>
      <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
        <Download className="w-4 h-4 me-1" /> {isRTL ? 'PDF' : 'PDF'}
      </Button>
      {contract.status !== 'signed' && (
        <Button variant="outline" size="sm" onClick={() => setShowSign(true)}>
          <CheckCircle className="w-4 h-4 me-1" /> {isRTL ? 'تحديد كموقع' : 'Mark Signed'}
        </Button>
      )}
      {contract.status === 'draft' && (
        <Button variant="outline" size="sm" onClick={() => setShowReject(true)} className="text-red-600">
          <XCircle className="w-4 h-4 me-1" /> {isRTL ? 'رفض' : 'Reject'}
        </Button>
      )}

      {/* Send Dialog */}
      <Dialog open={showSend} onOpenChange={setShowSend}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isRTL ? 'إرسال العقد لولي الأمر' : 'Send Contract to Guardian'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">{isRTL ? 'قنوات الإرسال:' : 'Delivery Channels:'}</Label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox checked={sendChannels.email} onCheckedChange={(v) => setSendChannels({...sendChannels, email: v})} />
                  <Mail className="w-4 h-4" />
                  <span>{isRTL ? 'البريد الإلكتروني' : 'Email'}</span>
                  <span className="text-sm text-muted-foreground">({contract.guardian_email || isRTL ? 'غير متوفر' : 'Not available'})</span>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={sendChannels.whatsapp} onCheckedChange={(v) => setSendChannels({...sendChannels, whatsapp: v})} />
                  <MessageSquare className="w-4 h-4" />
                  <span>{isRTL ? 'واتساب' : 'WhatsApp'}</span>
                  <span className="text-sm text-muted-foreground">({contract.guardian_phone || isRTL ? 'غير متوفر' : 'Not available'})</span>
                </div>
              </div>
            </div>
            <div className="bg-najdi-50 border border-najdi-100 rounded p-3 text-sm">
              <p>{isRTL ? 'سيتم إرسال رابط العقد لولي الأمر للمراجعة والتوقيع الإلكتروني' : 'A contract link will be sent to the guardian for review and digital signature'}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSend(false)}>{t('cancel')}</Button>
            <Button onClick={handleSend} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'إرسال' : 'Send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark as Signed Dialog */}
      <Dialog open={showSign} onOpenChange={setShowSign}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isRTL ? 'تحديد العقد كموقع' : 'Mark Contract as Signed'}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-muted-foreground">{isRTL ? 'هل تريد تحديد هذا العقد كموقع من قبل ولي الأمر؟' : 'Do you want to mark this contract as signed by the guardian?'}</p>
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm mt-4">
              <p>{isRTL ? 'ملاحظة: سيتم حفظ تاريخ ووقت التوقيع' : 'Note: Signature date and time will be recorded'}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSign(false)}>{t('cancel')}</Button>
            <Button onClick={handleMarkSigned} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'تأكيد' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showReject} onOpenChange={setShowReject}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isRTL ? 'رفض العقد' : 'Reject Contract'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isRTL ? 'سبب الرفض' : 'Rejection Reason'} *</Label>
              <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReject(false)}>{t('cancel')}</Button>
            <Button onClick={handleReject} disabled={loading} className="bg-red-600 hover:bg-red-700">
              {loading && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'رفض' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}