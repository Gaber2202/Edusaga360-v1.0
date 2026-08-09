import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, uploadFileApi } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { getCurrencySymbol } from '../../lib/localization';
import { useTenant } from '../TenantContext';
import { useRole } from '../RoleContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { logAuditEvent, AuditActions } from '../AuditService';

export default function PaymentLogForm({ open, onClose, invoice }) {
  const { t, isRTL } = useLanguage();
  const { tenant } = useTenant();
  const { user } = useRole();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    payment_method: 'credit_card',
    amount: invoice?.balance || 0,
    payment_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    reference_number: '',
    attachment_url: '',
    notes: '',
    tamara_order_id: '',
    tamara_status: 'initiated'
  });

  const createPaymentMutation = useMutation({
    mutationFn: async (data) => {
      // Create payment log
      const logNumber = `PAY-${Date.now().toString(36).toUpperCase()}`;
      const paymentLog = await tenantQuery('invoice_payment_logs').insert({
        log_number: logNumber,
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        student_id: invoice.student_id,
        student_name: invoice.student_name,
        branch_id: invoice.branch_id,
        collected_by: user?.full_name || user?.email,
        collected_by_email: user?.email,
        status: 'recorded',
        ...data
      });

      // Update invoice paid amount and status
      const newPaidAmount = (invoice.paid_amount || 0) + parseFloat(data.amount);
      const newBalance = invoice.total_amount - newPaidAmount;
      const newStatus = newBalance <= 0 ? 'paid' : 'partial';

      await tenantQuery('invoices').update({
        paid_amount: newPaidAmount,
        balance: newBalance,
        status: newStatus
      });

      await logAuditEvent(
        AuditActions.CREATE,
        'InvoicePaymentLog',
        paymentLog.id,
        { log_number: logNumber, amount: data.amount, method: data.payment_method },
        user
      );

      return paymentLog;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice'] });
      queryClient.invalidateQueries({ queryKey: ['invoicePaymentLogs'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.success(isRTL ? 'تم تسجيل الدفعة' : 'Payment recorded');
      onClose();
    },
    onError: (error) => {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await uploadFileApi(file);
      setFormData(prev => ({ ...prev, attachment_url: result.signedUrl || result.path }));
      toast.success(isRTL ? 'تم رفع الملف' : 'File uploaded');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(isRTL ? 'فشل رفع الملف' : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.amount || formData.amount <= 0) {
      toast.error(isRTL ? 'أدخل المبلغ' : 'Enter amount');
      return;
    }
    createPaymentMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isRTL ? 'تسجيل دفعة جديدة' : 'Record New Payment'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-sand p-4 rounded-lg">
            <p className="text-sm text-muted-foreground">{isRTL ? 'فاتورة' : 'Invoice'}: #{invoice?.invoice_number}</p>
            <p className="text-lg font-bold">{isRTL ? 'الرصيد المتبقي' : 'Balance'}: {invoice?.balance?.toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'طريقة الدفع' : 'Payment Method'} *</Label>
              <Select value={formData.payment_method} onValueChange={(v) => setFormData(p => ({ ...p, payment_method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit_card">{isRTL ? 'بطاقة ائتمان' : 'Credit Card'}</SelectItem>
                  <SelectItem value="bank_transfer">{isRTL ? 'تحويل بنكي' : 'Bank Transfer'}</SelectItem>
                  <SelectItem value="cash">{isRTL ? 'نقداً' : 'Cash'}</SelectItem>
                  <SelectItem value="tamara">{t('tamara')} ({t('buyNowPayLater')})</SelectItem>
                  <SelectItem value="internal_settlement">{isRTL ? 'تسوية داخلية' : 'Internal Settlement'}</SelectItem>
                  <SelectItem value="other">{isRTL ? 'أخرى' : 'Other'}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'المبلغ' : 'Amount'} *</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
                max={invoice?.balance}
              />
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'تاريخ ووقت الدفع' : 'Payment Date & Time'}</Label>
              <Input
                type="datetime-local"
                value={formData.payment_date}
                onChange={(e) => setFormData(p => ({ ...p, payment_date: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'رقم المرجع' : 'Reference Number'}</Label>
              <Input
                value={formData.reference_number}
                onChange={(e) => setFormData(p => ({ ...p, reference_number: e.target.value }))}
                placeholder={isRTL ? 'رقم المعاملة' : 'Transaction ID'}
              />
            </div>
          </div>

          {formData.payment_method === 'tamara' && (
            <div className="grid grid-cols-2 gap-4 bg-purple-50 p-4 rounded-lg border border-purple-200">
              <div className="space-y-2">
                <Label>{t('tamaraReference')}</Label>
                <Input
                  value={formData.tamara_order_id}
                  onChange={(e) => setFormData(p => ({ ...p, tamara_order_id: e.target.value }))}
                  placeholder="TAMARA-XXXXX"
                />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'حالة تمارا' : 'TAMARA Status'}</Label>
                <Select value={formData.tamara_status} onValueChange={(v) => setFormData(p => ({ ...p, tamara_status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="initiated">{isRTL ? 'تم الإنشاء' : 'Initiated'}</SelectItem>
                    <SelectItem value="approved">{isRTL ? 'معتمد' : 'Approved'}</SelectItem>
                    <SelectItem value="completed">{isRTL ? 'مكتمل' : 'Completed'}</SelectItem>
                    <SelectItem value="failed">{isRTL ? 'فشل' : 'Failed'}</SelectItem>
                    <SelectItem value="cancelled">{isRTL ? 'ملغي' : 'Cancelled'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 text-xs text-purple-700">
                ℹ️ {isRTL ? 'الأقساط تُدار بواسطة تمارا. المدرسة تتلقى المبلغ الكامل بعد الموافقة.' : 'Installments managed by TAMARA. School receives full amount upon approval.'}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>{isRTL ? 'مرفق' : 'Attachment'} ({isRTL ? 'إيصال، لقطة شاشة' : 'Receipt, screenshot'})</Label>
            <div className="flex gap-2">
              <Input type="file" accept="image/*,.pdf" onChange={handleFileUpload} disabled={uploading} />
              {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
            </div>
            {formData.attachment_url && (
              <p className="text-xs text-green-600">✓ {isRTL ? 'تم رفع الملف' : 'File uploaded'}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t('notes')}</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t('cancel')}</Button>
            <Button type="submit" disabled={createPaymentMutation.isPending}>
              {createPaymentMutation.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'تسجيل الدفعة' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}