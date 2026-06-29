import React, { useState } from 'react';
import { useLanguage } from '../LanguageContext';
import { useRole } from '../RoleContext';
import { tenantQuery } from '../../api/supabaseClient';
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
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { logAuditEvent, AuditActions } from '../AuditService';
import { reportError } from '../../lib/errorReporter';
import { NotificationHelper } from '../notifications/NotificationHelper';
import { toast } from 'sonner';
import { createJournalEntry } from '../../api/journalEntry';

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'card', 'cheque', 'online'];

export default function PaymentForm({ open, onClose, onSuccess, invoice }) {
  const { t, isRTL } = useLanguage();
  const { user } = useRole();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    amount: 0,
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    payment_method: 'cash',
    reference_number: '',
    notes: ''
  });

  // CRITICAL FIX: Reset form when invoice changes
  React.useEffect(() => {
    if (invoice && open) {
      const remaining = invoice.total_amount - (invoice.paid_amount || 0);
      setFormData({
        amount: remaining,
        payment_date: format(new Date(), 'yyyy-MM-dd'),
        payment_method: 'cash',
        reference_number: '',
        notes: ''
      });
    }
  }, [invoice, open]);

  if (!invoice) return null;

  const remaining = invoice.total_amount - (invoice.paid_amount || 0);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const paymentNumber = `PAY-${Date.now().toString(36).toUpperCase()}`;
      
      // Create payment record
      const payment = await tenantQuery('payments').insert({
        payment_number: paymentNumber,
        invoice_id: invoice.id,
        student_id: invoice.student_id,
        student_name: invoice.student_name,
        amount: parseFloat(formData.amount),
        payment_date: formData.payment_date,
        payment_method: formData.payment_method,
        reference_number: formData.reference_number,
        notes: formData.notes,
        received_by: user?.email
      });

      // Update invoice
      const newPaidAmount = (invoice.paid_amount || 0) + parseFloat(formData.amount);
      let newStatus = invoice.status;
      
      if (newPaidAmount >= invoice.total_amount) {
        newStatus = 'paid';
      } else if (newPaidAmount > 0) {
        newStatus = 'partial';
      }

      await tenantQuery('invoices').update({
        paid_amount: newPaidAmount,
        status: newStatus
      });

      // Create journal entry: Debit Cash/Bank, Credit AR
      try {
        const amt = parseFloat(formData.amount);
        await createJournalEntry({
          journal_type: 'receipts',
          branch_id: invoice.branch_id || 'all',
          date: formData.payment_date,
          reference: paymentNumber,
          description: `Payment ${paymentNumber} - ${invoice.student_name} - ${invoice.invoice_number}`,
          lines: [
            { line_number: 1, account_code: '1100', account_name: 'Cash / Bank', debit: amt, credit: 0, description: formData.payment_method },
            { line_number: 2, account_code: '1200', account_name: 'Accounts Receivable', debit: 0, credit: amt, description: invoice.student_name },
          ],
          source_document_type: 'Payment',
          source_document_id: payment.id,
          requested_status: 'approved',
        });
      } catch (jeErr) {
        reportError({
          error: jeErr,
          module: 'fees',
          action: 'create_payment_journal_entry',
          severity: 'high',
          context: { payment_id: payment.id, invoice_id: invoice?.id, payment_number: paymentNumber },
        });
      }

      // Audit log
      await logAuditEvent({
        action: AuditActions.CREATE,
        entityType: 'Payment',
        entityId: payment.id,
        newValues: {
          payment_number: paymentNumber,
          invoice_number: invoice.invoice_number,
          student_name: invoice.student_name,
          amount: parseFloat(formData.amount),
          payment_method: formData.payment_method,
          received_by: user?.email
        },
        page: 'Fees',
        notes: `Payment of ${formData.amount} SAR recorded for invoice ${invoice.invoice_number}`
      });

      // Notify finance team on large payments (>10k SAR)
      if (parseFloat(formData.amount) >= 10000) {
        NotificationHelper.notifyPaymentReceived(payment, invoice);
      }

      toast.success(isRTL ? 'تم تسجيل الدفعة بنجاح' : 'Payment recorded successfully');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error recording payment:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isRTL ? 'تسجيل دفعة' : 'Record Payment'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Invoice Info */}
          <div className="bg-sand rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{isRTL ? 'رقم الفاتورة' : 'Invoice'}</span>
              <span className="font-medium">{invoice.invoice_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('studentName')}</span>
              <span className="font-medium">{invoice.student_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('total')}</span>
              <span className="font-medium">{invoice.total_amount?.toLocaleString()} {t('sar')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('paid')}</span>
              <span className="font-medium text-emerald-600">{(invoice.paid_amount || 0).toLocaleString()} {t('sar')}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-muted-foreground">{isRTL ? 'المتبقي' : 'Remaining'}</span>
              <span className="font-bold text-red-600">{remaining.toLocaleString()} {t('sar')}</span>
            </div>
          </div>

          {/* Payment Amount */}
          <div className="space-y-2">
            <Label>{t('amount')} *</Label>
            <div className="relative">
              <Input
                type="number"
                value={formData.amount}
                onChange={(e) => handleChange('amount', e.target.value)}
                max={remaining}
                required
                className="pe-12"
              />
              <span className="absolute top-1/2 -translate-y-1/2 end-3 text-muted-foreground text-sm">
                {t('sar')}
              </span>
            </div>
          </div>

          {/* Payment Date */}
          <div className="space-y-2">
            <Label>{t('date')} *</Label>
            <Input
              type="date"
              value={formData.payment_date}
              onChange={(e) => handleChange('payment_date', e.target.value)}
              required
            />
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label>{isRTL ? 'طريقة الدفع' : 'Payment Method'} *</Label>
            <Select value={formData.payment_method} onValueChange={(v) => handleChange('payment_method', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(method => (
                  <SelectItem key={method} value={method}>
                    {isRTL ? {
                      cash: 'نقداً',
                      bank_transfer: 'تحويل بنكي',
                      card: 'بطاقة ائتمان',
                      cheque: 'شيك',
                      online: 'دفع إلكتروني'
                    }[method] : method.replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reference Number */}
          <div className="space-y-2">
            <Label>{isRTL ? 'رقم المرجع' : 'Reference Number'}</Label>
            <Input
              value={formData.reference_number}
              onChange={(e) => handleChange('reference_number', e.target.value)}
              placeholder={isRTL ? 'رقم الحوالة أو الشيك' : 'Transfer or cheque number'}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>{t('notes')}</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
              {loading && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'تسجيل الدفعة' : 'Record Payment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}