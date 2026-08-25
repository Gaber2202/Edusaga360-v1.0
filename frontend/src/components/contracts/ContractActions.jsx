import React, { useState } from 'react';
import { callApi, tenantQuery } from '../../api/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '../LanguageContext';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Send, Download, CheckCircle, XCircle, Loader2, Mail, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { logAuditEvent, AuditActions } from '../AuditService';

export default function ContractActions({ contract }) {
  const { isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const [showSend, setShowSend] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const handleSend = async () => {
    setLoading(true);
    try {
      await callApi(`/api/contracts/${contract.id}/share`, {});
      await logAuditEvent({
        action: AuditActions.SEND,
        entityType: 'StudentContract',
        entityId: contract.id,
        newValues: { channels: ['email', 'whatsapp'] },
      });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast.success(isRTL ? 'تم الإرسال عبر البريد وواتساب' : 'Sent via email AND WhatsApp');
      setShowSend(false);
    } catch (error) {
      console.error('Error sending contract:', error);
      toast.error(
        (error?.body?.message
          || (isRTL ? 'فشل الإرسال (يلزم نجاح القناتين): ' : 'Send failed (both channels required): '))
        + (error.message || '')
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    setLoading(true);
    try {
      const blob = await callApi(`/api/contracts/${contract.id}/pdf`, null, {
        method: 'GET',
        responseType: 'blob',
      });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error) {
      toast.error(error?.message || (isRTL ? 'تعذر تحميل PDF' : 'Could not download PDF'));
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      const { error } = await tenantQuery('student_contracts').update({
        status: 'rejected',
        rejection_reason: rejectReason,
        rejected_date: new Date().toISOString(),
      }).eq('id', contract.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast.success(isRTL ? 'تم الرفض' : 'Contract rejected');
      setShowReject(false);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex gap-1">
        {(contract.status === 'draft' || contract.status === 'sent') && (
          <Button size="sm" variant="ghost" onClick={() => setShowSend(true)} title={isRTL ? 'إرسال' : 'Send'}>
            <Send className="w-4 h-4" />
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={handleDownloadPDF} disabled={loading} title="PDF">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        </Button>
        {contract.status !== 'rejected' && contract.status !== 'signed' && (
          <Button size="sm" variant="ghost" onClick={() => setShowReject(true)} title={isRTL ? 'رفض' : 'Reject'}>
            <XCircle className="w-4 h-4 text-red-500" />
          </Button>
        )}
        {contract.status === 'signed' && (
          <CheckCircle className="w-4 h-4 text-green-600 self-center" />
        )}
      </div>

      <Dialog open={showSend} onOpenChange={setShowSend}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isRTL ? 'إرسال العقد للتوقيع' : 'Send contract for signing'}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {isRTL
              ? 'سيتم الإرسال عبر البريد الإلكتروني وواتساب معاً. يجب نجاح القناتين.'
              : 'Sends via email AND WhatsApp together. Both channels must succeed.'}
          </p>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1"><Mail className="w-4 h-4" /> Email</span>
            <span className="flex items-center gap-1"><MessageSquare className="w-4 h-4" /> WhatsApp</span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSend(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSend} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'إرسال' : 'Send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showReject} onOpenChange={setShowReject}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isRTL ? 'رفض العقد' : 'Reject contract'}</DialogTitle>
          </DialogHeader>
          <div>
            <Label>{isRTL ? 'السبب' : 'Reason'}</Label>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReject(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button variant="destructive" onClick={handleReject} disabled={loading}>{isRTL ? 'رفض' : 'Reject'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
