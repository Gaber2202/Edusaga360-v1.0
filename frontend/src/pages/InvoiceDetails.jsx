import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import PaymentForm from '../components/fees/PaymentForm';
import PaymentLogForm from '../components/fees/PaymentLogForm';
import { 
  ArrowLeft, 
  Download, 
  Printer, 
  Mail,
  CreditCard,
  CheckCircle2,
  Clock,
  FileText,
  Banknote,
  Building2,
  Wallet,
  Calendar,
  ExternalLink,
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import jsPDF from 'jspdf';
import { useTenantFilter } from '../hooks/useTenantFilter';
import WhatsAppButton from '../components/communications/WhatsAppButton';
import { WhatsAppMessageTypes } from '../components/communications/WhatsAppService';

export default function InvoiceDetails() {
  const { t, isRTL } = useLanguage();
  const { userRole, user } = useRole();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showPaymentLogForm, setShowPaymentLogForm] = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const invoiceId = urlParams.get('id');

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', invoiceId, tenantId],
    queryFn: async () => {
      const invoices = await tenantQuery('invoices').select('*').match(tenantFilter());
      return invoices.find(inv => inv.id === invoiceId);
    },
    enabled: !!invoiceId && hasTenantAccess
  });

  const { data: _payments = [] } = useQuery({
    queryKey: ['payments', invoiceId, tenantId],
    queryFn: async () => {
      const allPayments = await tenantQuery('payments').select('*').match(tenantFilter(), '-created_date');
      return allPayments.filter(p => p.invoice_id === invoiceId);
    },
    enabled: !!invoiceId && hasTenantAccess
  });

  const { data: paymentLogs = [] } = useQuery({
    queryKey: ['invoicePaymentLogs', invoiceId, tenantId],
    queryFn: async () => {
      const allLogs = await tenantQuery('invoice_payment_logs').select('*').match(tenantFilter(), '-payment_date');
      return allLogs.filter(log => log.invoice_id === invoiceId);
    },
    enabled: !!invoiceId && hasTenantAccess
  });

  const { data: guardian } = useQuery({
    queryKey: ['guardian', invoice?.guardian_id, tenantId],
    queryFn: async () => {
      if (!invoice?.guardian_id) return null;
      const guardians = await tenantQuery('guardians').select('*').match(tenantFilter());
      return guardians.find(g => g.id === invoice.guardian_id);
    },
    enabled: !!invoice?.guardian_id && hasTenantAccess
  });

  const generatePDF = () => {
    if (!invoice) return;

    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.text('INVOICE', 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.text('EduSaga 360', 105, 28, { align: 'center' });
    doc.text('School Management System', 105, 33, { align: 'center' });
    
    // Invoice Details
    doc.setFontSize(12);
    doc.text(`Invoice #: ${invoice.invoice_number}`, 20, 50);
    doc.text(`Date: ${format(new Date(invoice.issue_date), 'dd/MM/yyyy')}`, 20, 57);
    doc.text(`Due Date: ${format(new Date(invoice.due_date), 'dd/MM/yyyy')}`, 20, 64);
    
    // Student Info
    doc.text(`Student: ${invoice.student_name}`, 20, 78);
    doc.text(`Grade: ${invoice.grade}`, 20, 85);
    
    // Items Header
    doc.setFontSize(10);
    doc.setFillColor(240, 240, 240);
    doc.rect(20, 95, 170, 8, 'F');
    doc.text('Description', 22, 100);
    doc.text('Amount (SAR)', 160, 100);
    
    // Items
    let y = 110;
    invoice.items?.forEach(item => {
      doc.text(item.description_ar || item.description, 22, y);
      doc.text(item.amount.toLocaleString(), 160, y);
      y += 7;
    });
    
    // Payment Method - Actual Paid By
    if (paymentLogs.length > 0) {
      const activeLogs = paymentLogs.filter(log => log.status !== 'reversed');
      const methodsMap = {};
      activeLogs.forEach(log => {
        if (!methodsMap[log.payment_method]) methodsMap[log.payment_method] = 0;
        methodsMap[log.payment_method] += log.amount;
      });
      
      y += 5;
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Paid By:', 20, y);
      doc.setFont(undefined, 'normal');
      
      const methodKeys = Object.keys(methodsMap);
      if (methodKeys.length === 1) {
        const method = methodKeys[0];
        const methodNames = { 
          credit_card: 'Credit Card', 
          bank_transfer: 'Bank Transfer', 
          cash: 'Cash',
          tamara: 'TAMARA (Buy Now, Pay Later)',
          internal_settlement: 'Internal Settlement',
          other: 'Other'
        };
        doc.text(methodNames[method] || method, 50, y);
        
        // Show TAMARA reference if available
        const tamaraLog = activeLogs.find(l => l.payment_method === 'tamara');
        if (tamaraLog?.tamara_order_id) {
          y += 5;
          doc.text(`TAMARA Ref: ${tamaraLog.tamara_order_id}`, 50, y);
        }
      } else {
        doc.text('Mixed Payments', 50, y);
        y += 5;
        Object.entries(methodsMap).forEach(([method, amount]) => {
          const methodNames = { 
            credit_card: 'Credit Card', 
            bank_transfer: 'Bank Transfer', 
            cash: 'Cash',
            tamara: 'TAMARA',
            internal_settlement: 'Internal Settlement'
          };
          doc.text(`  - ${methodNames[method] || method}: ${amount.toLocaleString()} SAR`, 50, y);
          y += 5;
        });
      }
      y += 2;
    }

    // Bank Account Details
    if (invoice.preferred_payment_method === 'bank_transfer' && invoice.bank_account_details) {
      doc.setFont(undefined, 'bold');
      doc.text('Bank Transfer Details:', 20, y);
      doc.setFont(undefined, 'normal');
      y += 7;
      doc.text(`Bank: ${invoice.bank_account_details.bank_name}`, 20, y);
      y += 5;
      doc.text(`Account: ${invoice.bank_account_details.account_name}`, 20, y);
      y += 5;
      doc.text(`IBAN: ${invoice.bank_account_details.iban}`, 20, y);
      y += 10;
    }

    // Total Section
    y += 5;
    doc.line(20, y, 190, y);
    y += 8;
    doc.setFontSize(11);
    doc.text('Subtotal:', 140, y);
    doc.text(`${invoice.subtotal?.toLocaleString()} SAR`, 160, y);
    
    if (invoice.discount_amount > 0) {
      y += 7;
      doc.text('Discount:', 140, y);
      doc.text(`-${invoice.discount_amount.toLocaleString()} SAR`, 160, y);
    }
    
    y += 7;
    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.text('Total:', 140, y);
    doc.text(`${invoice.total_amount.toLocaleString()} SAR`, 160, y);
    
    y += 7;
    doc.text('Paid:', 140, y);
    doc.text(`${(invoice.paid_amount || 0).toLocaleString()} SAR`, 160, y);
    
    y += 7;
    const balance = invoice.total_amount - (invoice.paid_amount || 0);
    doc.text('Balance:', 140, y);
    doc.text(`${balance.toLocaleString()} SAR`, 160, y);
    
    // Save
    doc.save(`Invoice_${invoice.invoice_number}.pdf`);
    
    // Log audit
    logAuditEvent(
      AuditActions.EXPORT,
      'Invoice',
      invoice.id,
      { action: 'download_pdf', invoice_number: invoice.invoice_number },
      user
    );
    
    toast.success(isRTL ? 'تم تحميل الفاتورة' : 'Invoice downloaded');
  };

  const handlePrint = () => {
    if (!invoice) return;
    
    const printWindow = window.open('', '_blank');
    const html = `
      <!DOCTYPE html>
      <html dir="${isRTL ? 'rtl' : 'ltr'}">
      <head>
        <title>Invoice ${invoice.invoice_number}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; }
          .header { text-align: center; margin-bottom: 30px; }
          .header h1 { margin: 0; color: #1e293b; }
          .details { margin-bottom: 30px; }
          .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th { background: #f1f5f9; padding: 10px; text-align: left; }
          td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
          .total-section { margin-top: 20px; text-align: right; }
          .total-row { display: flex; justify-content: flex-end; gap: 50px; margin: 5px 0; }
          .total-row.grand { font-size: 18px; font-weight: bold; margin-top: 10px; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>INVOICE</h1>
          <p>EduSaga 360 - School Management System</p>
        </div>
        
        <div class="details">
          <div class="details-grid">
            <div>
              <p><strong>Invoice #:</strong> ${invoice.invoice_number}</p>
              <p><strong>Date:</strong> ${format(new Date(invoice.issue_date), 'dd/MM/yyyy')}</p>
              <p><strong>Due Date:</strong> ${format(new Date(invoice.due_date), 'dd/MM/yyyy')}</p>
            </div>
            <div>
              <p><strong>Student:</strong> ${invoice.student_name}</p>
              <p><strong>Grade:</strong> ${invoice.grade}</p>
              <p><strong>Status:</strong> ${invoice.status}</p>
            </div>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Type</th>
              <th style="text-align: right;">Amount (SAR)</th>
            </tr>
          </thead>
          <tbody>
            ${invoice.items?.map(item => `
              <tr>
                <td>${item.description_ar || item.description}</td>
                <td>${item.fee_type}</td>
                <td style="text-align: right;">${item.amount.toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        ${paymentLogs.length > 0 ? `
          <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-left: 4px solid #10b981;">
            <h3 style="margin: 0 0 10px 0; font-size: 14px;">Payment Information</h3>
            ${(() => {
              const activeLogs = paymentLogs.filter(log => log.status !== 'reversed');
              const methodsMap = {};
              activeLogs.forEach(log => {
                if (!methodsMap[log.payment_method]) methodsMap[log.payment_method] = 0;
                methodsMap[log.payment_method] += log.amount;
              });
              const methodKeys = Object.keys(methodsMap);
              
              if (methodKeys.length === 1) {
                const method = methodKeys[0];
                const methodNames = { 
                  credit_card: 'Credit Card', 
                  bank_transfer: 'Bank Transfer', 
                  cash: 'Cash',
                  tamara: 'TAMARA (Buy Now, Pay Later)',
                  internal_settlement: 'Internal Settlement'
                };
                const tamaraLog = activeLogs.find(l => l.payment_method === 'tamara');
                return `<p style="margin: 5px 0;"><strong>Paid By:</strong> ${methodNames[method] || method}</p>
                        ${tamaraLog?.tamara_order_id ? `<p style="margin: 5px 0; font-size: 12px;"><strong>TAMARA Ref:</strong> ${tamaraLog.tamara_order_id}</p>` : ''}`;
              } else {
                const breakdown = Object.entries(methodsMap).map(([method, amount]) => {
                  const methodNames = { 
                    credit_card: 'Credit Card', 
                    bank_transfer: 'Bank Transfer', 
                    cash: 'Cash',
                    tamara: 'TAMARA',
                    internal_settlement: 'Internal Settlement'
                  };
                  return `<li>${methodNames[method] || method}: ${amount.toLocaleString()} SAR</li>`;
                }).join('');
                return `<p style="margin: 5px 0;"><strong>Paid By:</strong> Mixed Payments</p>
                        <ul style="margin: 5px 0 0 20px; font-size: 12px;">${breakdown}</ul>`;
              }
            })()}
          </div>
        ` : ''}
        
        <div class="total-section">
          <div class="total-row">
            <span>Subtotal:</span>
            <span>${invoice.subtotal?.toLocaleString()} SAR</span>
          </div>
          ${invoice.discount_amount > 0 ? `
            <div class="total-row">
              <span>Discount:</span>
              <span>-${invoice.discount_amount.toLocaleString()} SAR</span>
            </div>
          ` : ''}
          <div class="total-row grand">
            <span>Total:</span>
            <span>${invoice.total_amount.toLocaleString()} SAR</span>
          </div>
          <div class="total-row">
            <span>Paid:</span>
            <span>${(invoice.paid_amount || 0).toLocaleString()} SAR</span>
          </div>
          <div class="total-row grand">
            <span>Balance:</span>
            <span>${(invoice.total_amount - (invoice.paid_amount || 0)).toLocaleString()} SAR</span>
          </div>
        </div>
        
        <button onclick="window.print()" style="margin-top: 30px; padding: 10px 20px; background: #1e293b; color: white; border: none; cursor: pointer;">
          Print Invoice
        </button>
      </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
    
    logAuditEvent(
      AuditActions.VIEW,
      'Invoice',
      invoice.id,
      { action: 'print', invoice_number: invoice.invoice_number },
      user
    );
  };

  const shareViaEmail = async () => {
    if (!invoice) return;
    
    const subject = `Invoice ${invoice.invoice_number} - ${invoice.student_name}`;
    const body = `
Dear Parent,

Please find attached the invoice details for ${invoice.student_name}.

Invoice Number: ${invoice.invoice_number}
Amount: ${invoice.total_amount.toLocaleString()} SAR
Due Date: ${format(new Date(invoice.due_date), 'dd/MM/yyyy')}
Balance: ${(invoice.total_amount - (invoice.paid_amount || 0)).toLocaleString()} SAR

Thank you,
EduSaga 360
    `;
    
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    logAuditEvent(
      AuditActions.CREATE,
      'Invoice',
      invoice.id,
      { action: 'share_email', invoice_number: invoice.invoice_number },
      user
    );
    
    toast.success(isRTL ? 'تم فتح البريد الإلكتروني' : 'Email client opened');
  };

  const _shareViaWhatsApp = () => {
    if (!invoice) return;
    
    const message = `*Invoice ${invoice.invoice_number}*\n\nStudent: ${invoice.student_name}\nAmount: ${invoice.total_amount.toLocaleString()} SAR\nDue Date: ${format(new Date(invoice.due_date), 'dd/MM/yyyy')}\nBalance: ${(invoice.total_amount - (invoice.paid_amount || 0)).toLocaleString()} SAR`;
    
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    
    logAuditEvent(
      AuditActions.CREATE,
      'Invoice',
      invoice.id,
      { action: 'share_whatsapp', invoice_number: invoice.invoice_number },
      user
    );
    
    toast.success(isRTL ? 'تم فتح واتساب' : 'WhatsApp opened');
  };

  const _getPaymentMethodLabel = (method) => {
    const methods = {
      cash: isRTL ? 'نقدي' : 'Cash',
      mada: 'Mada',
      visa: 'Visa',
      mastercard: 'Mastercard',
      bank_transfer: isRTL ? 'تحويل بنكي' : 'Bank Transfer',
      sadad: 'SADAD',
      stc_pay: 'STC Pay',
      apple_pay: 'Apple Pay',
      cheque: isRTL ? 'شيك' : 'Cheque',
      advance_applied: isRTL ? 'تسوية داخلية' : 'Internal Settlement'
    };
    return methods[method] || method;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-slate-300 border-t-slate-900 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600">{isRTL ? 'لم يتم العثور على الفاتورة' : 'Invoice not found'}</p>
        </div>
      </div>
    );
  }

  const balance = invoice.total_amount - (invoice.paid_amount || 0);

  const getPaymentMethodIcon = (method) => {
    switch (method) {
      case 'credit_card': return <CreditCard className="w-4 h-4" />;
      case 'bank_transfer': return <Building2 className="w-4 h-4" />;
      case 'cash': return <Banknote className="w-4 h-4" />;
      case 'tamara': return <CreditCard className="w-4 h-4 text-purple-600" />;
      case 'internal_settlement': return <Wallet className="w-4 h-4" />;
      default: return <CreditCard className="w-4 h-4" />;
    }
  };

  const getPaymentMethodText = (method) => {
    const methods = {
      credit_card: isRTL ? 'بطاقة ائتمان' : 'Credit Card',
      bank_transfer: isRTL ? 'تحويل بنكي' : 'Bank Transfer',
      cash: isRTL ? 'نقداً' : 'Cash',
      tamara: t('tamara'),
      internal_settlement: isRTL ? 'تسوية داخلية' : 'Internal Settlement',
      other: isRTL ? 'أخرى' : 'Other'
    };
    return methods[method] || method;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'reconciled': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'recorded': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'reversed': return 'bg-red-100 text-red-800 border-red-200';
      case 'failed': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const getStatusText = (status) => {
    const statuses = {
      recorded: isRTL ? 'مسجل' : 'Recorded',
      reconciled: isRTL ? 'تمت المطابقة' : 'Reconciled',
      reversed: isRTL ? 'ملغي' : 'Reversed',
      failed: isRTL ? 'فشل' : 'Failed'
    };
    return statuses[status] || status;
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => window.history.back()}
          className="gap-2"
        >
          <ArrowLeft className={`w-4 h-4 ${isRTL ? 'rotate-180' : ''}`} />
          {t('back')}
        </Button>

        <div className="flex gap-2">
          <Button variant="outline" onClick={generatePDF} className="gap-2">
            <Download className="w-4 h-4" />
            {isRTL ? 'تحميل' : 'Download'}
          </Button>
          <Button variant="outline" onClick={handlePrint} className="gap-2">
            <Printer className="w-4 h-4" />
            {t('print')}
          </Button>
          <Button variant="outline" onClick={shareViaEmail} className="gap-2">
            <Mail className="w-4 h-4" />
            {isRTL ? 'بريد' : 'Email'}
          </Button>
          {guardian?.phone && (
            <WhatsAppButton
              recipientType="guardian"
              recipientId={guardian.id}
              recipientName={guardian.name_ar || guardian.name}
              phoneNumber={guardian.phone}
              messageType={WhatsAppMessageTypes.INVOICE_NOTIFICATION}
              variables={{
                student_name: invoice.student_name,
                invoice_number: invoice.invoice_number,
                amount: invoice.total_amount.toLocaleString(),
                due_date: format(new Date(invoice.due_date), 'dd/MM/yyyy'),
                payment_link: window.location.origin
              }}
            />
          )}
        </div>
      </div>

      {/* Invoice Card */}
      <Card>
        <CardHeader className="bg-slate-50">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">
                {isRTL ? 'فاتورة رقم' : 'Invoice'} #{invoice.invoice_number}
              </CardTitle>
              <p className="text-sm text-slate-600 mt-1">
                {isRTL ? 'تاريخ الإصدار' : 'Issue Date'}: {format(new Date(invoice.issue_date), 'dd/MM/yyyy')}
              </p>
            </div>
            <Badge 
              className={
                invoice.status === 'paid' ? 'bg-emerald-100 text-emerald-800' :
                invoice.status === 'partial' ? 'bg-amber-100 text-amber-800' :
                invoice.status === 'overdue' ? 'bg-red-100 text-red-800' :
                'bg-slate-100 text-slate-800'
              }
            >
              {t(invoice.status)}
            </Badge>
          </div>
        </CardHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="w-full justify-start border-b rounded-none bg-transparent p-0 h-auto">
            <TabsTrigger value="details" className="rounded-none border-b-2 border-transparent data-[state=active]:border-slate-900 data-[state=active]:bg-transparent">
              <FileText className="w-4 h-4 me-2" />
              {isRTL ? 'تفاصيل الفاتورة' : 'Invoice Details'}
            </TabsTrigger>
            <TabsTrigger value="payments" className="rounded-none border-b-2 border-transparent data-[state=active]:border-slate-900 data-[state=active]:bg-transparent">
              <CreditCard className="w-4 h-4 me-2" />
              {isRTL ? 'طرق الدفع وسجل السداد' : 'Payment Methods & History'}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="p-6 space-y-6 mt-0">
          {/* Student Info */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-500 mb-2">{isRTL ? 'بيانات الطالب' : 'Student Details'}</h3>
              <p className="font-semibold text-lg">{invoice.student_name}</p>
              <p className="text-slate-600">{t(invoice.grade)}</p>
              <p className="text-slate-600">{invoice.academic_year}</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-500 mb-2">{isRTL ? 'تفاصيل الدفع' : 'Payment Details'}</h3>
              <p className="text-slate-600">{t('dueDate')}: {format(new Date(invoice.due_date), 'dd/MM/yyyy')}</p>
              {invoice.preferred_payment_method && (
                <div className="mt-2">
                  <p className="text-xs text-slate-500">{isRTL ? 'طريقة الدفع المفضلة' : 'Preferred Payment Method'}:</p>
                  <Badge variant="outline" className={`mt-1 ${invoice.preferred_payment_method === 'tamara' ? 'border-purple-300 bg-purple-50 text-purple-700' : ''}`}>
                    {invoice.preferred_payment_method === 'credit_card' && (isRTL ? 'بطاقة ائتمان' : 'Credit Card')}
                    {invoice.preferred_payment_method === 'bank_transfer' && (isRTL ? 'تحويل بنكي' : 'Bank Transfer')}
                    {invoice.preferred_payment_method === 'cash' && (isRTL ? 'نقداً' : 'Cash')}
                    {invoice.preferred_payment_method === 'tamara' && `${t('tamara')} (${t('buyNowPayLater')})`}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Invoice Items */}
          <div>
            <h3 className="font-semibold mb-4">{isRTL ? 'بنود الفاتورة' : 'Invoice Items'}</h3>
            <div className="space-y-2">
              {invoice.items?.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-100">
                  <div>
                    <p className="font-medium">{item.description_ar || item.description}</p>
                    <p className="text-sm text-slate-500">{item.fee_type}</p>
                  </div>
                  <p className="font-semibold">{item.amount.toLocaleString()} {t('sar')}</p>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Bank Account Details */}
          {invoice.preferred_payment_method === 'bank_transfer' && invoice.bank_account_details && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold mb-2 text-blue-900">{isRTL ? 'تفاصيل التحويل البنكي' : 'Bank Transfer Details'}</h3>
                <div className="space-y-1 text-sm">
                  <p><span className="text-slate-600">{isRTL ? 'اسم البنك' : 'Bank Name'}:</span> <span className="font-medium">{invoice.bank_account_details.bank_name}</span></p>
                  <p><span className="text-slate-600">{isRTL ? 'اسم الحساب' : 'Account Name'}:</span> <span className="font-medium">{invoice.bank_account_details.account_name}</span></p>
                  <p><span className="text-slate-600">{isRTL ? 'رقم الآيبان' : 'IBAN'}:</span> <span className="font-mono font-medium">{invoice.bank_account_details.iban}</span></p>
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Total Section */}
          <div className="space-y-2">
            <div className="flex justify-between text-slate-600">
              <span>{isRTL ? 'المجموع الفرعي' : 'Subtotal'}</span>
              <span>{invoice.subtotal?.toLocaleString()} {t('sar')}</span>
            </div>
            {invoice.discount_amount > 0 && (
              <div className="flex justify-between text-red-600">
                <span>{t('discount')}</span>
                <span>-{invoice.discount_amount.toLocaleString()} {t('sar')}</span>
              </div>
            )}
            <div className="flex justify-between text-xl font-bold pt-2 border-t">
              <span>{t('total')}</span>
              <span>{invoice.total_amount.toLocaleString()} {t('sar')}</span>
            </div>
            <div className="flex justify-between text-emerald-600">
              <span>{t('paid')}</span>
              <span>{(invoice.paid_amount || 0).toLocaleString()} {t('sar')}</span>
            </div>
            {paymentLogs.length > 0 && (
              <div className="flex justify-between items-center text-sm text-slate-600 pt-2 border-t border-slate-100">
                <span>{isRTL ? 'تم الدفع بواسطة' : 'Paid via'}:</span>
                <div className="flex gap-2 flex-wrap justify-end">
                  {[...new Set(paymentLogs.filter(log => log.status !== 'reversed').map(log => log.payment_method))].map((method, idx) => (
                    <Badge key={idx} variant="outline" className="gap-1.5 bg-slate-50">
                      {getPaymentMethodIcon(method)}
                      {getPaymentMethodText(method)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-between text-xl font-bold text-red-600 pt-2 border-t">
              <span>{isRTL ? 'المتبقي' : 'Balance'}</span>
              <span>{balance.toLocaleString()} {t('sar')}</span>
            </div>
          </div>
          </TabsContent>

          <TabsContent value="payments" className="p-6 space-y-6 mt-0">
            {/* Payment Summary Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-slate-500">{isRTL ? 'إجمالي الفاتورة' : 'Total Invoice'}</p>
                  <p className="text-2xl font-bold">{invoice.total_amount.toLocaleString()} {t('sar')}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-slate-500">{isRTL ? 'المدفوع' : 'Paid to Date'}</p>
                  <p className="text-2xl font-bold text-emerald-600">{(invoice.paid_amount || 0).toLocaleString()} {t('sar')}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-slate-500">{isRTL ? 'الرصيد المتبقي' : 'Remaining Balance'}</p>
                  <p className="text-2xl font-bold text-red-600">{balance.toLocaleString()} {t('sar')}</p>
                </CardContent>
              </Card>
            </div>

            {/* Payment History Table */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{isRTL ? 'سجل الدفعات' : 'Payment History'}</CardTitle>
                  {balance > 0 && (userRole === 'admin' || userRole === 'accountant') && (
                    <Button onClick={() => setShowPaymentLogForm(true)} size="sm" className="gap-2">
                      <CreditCard className="w-4 h-4" />
                      {isRTL ? 'تسجيل دفعة' : 'Record Payment'}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {paymentLogs.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <Clock className="w-16 h-16 mx-auto mb-3 text-slate-300" />
                    <p className="text-lg font-medium">{isRTL ? 'لا توجد دفعات مسجلة' : 'No payments recorded yet'}</p>
                    <p className="text-sm mt-1">{isRTL ? 'سيتم عرض سجل الدفعات هنا' : 'Payment history will appear here'}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className={isRTL ? 'text-right' : 'text-left'}>{isRTL ? 'التاريخ والوقت' : 'Date & Time'}</TableHead>
                          <TableHead className={isRTL ? 'text-right' : 'text-left'}>{isRTL ? 'طريقة الدفع' : 'Payment Method'}</TableHead>
                          <TableHead className={isRTL ? 'text-right' : 'text-left'}>{isRTL ? 'المبلغ' : 'Amount'}</TableHead>
                          <TableHead className={isRTL ? 'text-right' : 'text-left'}>{isRTL ? 'الرصيد بعد الدفع' : 'Remaining After'}</TableHead>
                          <TableHead className={isRTL ? 'text-right' : 'text-left'}>{isRTL ? 'المرجع' : 'Reference'}</TableHead>
                          <TableHead className={isRTL ? 'text-right' : 'text-left'}>{isRTL ? 'المحصل' : 'Collected By'}</TableHead>
                          <TableHead className={isRTL ? 'text-right' : 'text-left'}>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                          <TableHead className={isRTL ? 'text-right' : 'text-left'}>{isRTL ? 'المرفق' : 'Attachment'}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paymentLogs.map((log, index) => {
                          // Calculate remaining balance after this payment
                          const previousPayments = paymentLogs.slice(index + 1);
                          const paidBefore = previousPayments.reduce((sum, p) => sum + (p.status !== 'reversed' ? p.amount : 0), 0);
                          const remainingAfter = invoice.total_amount - paidBefore - (log.status !== 'reversed' ? log.amount : 0);
                          
                          return (
                            <TableRow key={log.id} className={log.status === 'reversed' ? 'opacity-50' : ''}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Calendar className="w-4 h-4 text-slate-400" />
                                  <div>
                                    <p className="font-medium text-sm">{format(new Date(log.payment_date), 'dd/MM/yyyy')}</p>
                                    <p className="text-xs text-slate-500">{format(new Date(log.payment_date), 'HH:mm')}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {getPaymentMethodIcon(log.payment_method)}
                                  <div>
                                    <span className="text-sm">{getPaymentMethodText(log.payment_method)}</span>
                                    {log.payment_method === 'tamara' && (
                                      <div className="text-xs text-purple-600 mt-0.5">
                                        {log.tamara_order_id && `${t('tamaraReference')}: ${log.tamara_order_id}`}
                                        {log.tamara_status && (
                                          <span className="ms-2 px-1.5 py-0.5 bg-purple-100 rounded text-purple-700">
                                            {log.tamara_status === 'completed' && (isRTL ? 'مكتمل' : 'Completed')}
                                            {log.tamara_status === 'approved' && (isRTL ? 'معتمد' : 'Approved')}
                                            {log.tamara_status === 'initiated' && (isRTL ? 'تم الإنشاء' : 'Initiated')}
                                            {log.tamara_status === 'failed' && (isRTL ? 'فشل' : 'Failed')}
                                            {log.tamara_status === 'cancelled' && (isRTL ? 'ملغي' : 'Cancelled')}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="font-bold text-emerald-600">
                                  {log.status === 'reversed' ? '-' : ''}{log.amount.toLocaleString()} {t('sar')}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className="font-medium text-slate-700">
                                  {remainingAfter.toLocaleString()} {t('sar')}
                                </span>
                              </TableCell>
                              <TableCell>
                                {log.reference_number ? (
                                  <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded">{log.reference_number}</span>
                                ) : (
                                  <span className="text-slate-400 text-sm">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <p className="text-sm">{log.collected_by}</p>
                                {log.notes && <p className="text-xs text-slate-500 mt-1">{log.notes}</p>}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={getStatusColor(log.status)}>
                                  {getStatusText(log.status)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {log.attachment_url ? (
                                  <a 
                                    href={log.attachment_url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    {isRTL ? 'عرض' : 'View'}
                                  </a>
                                ) : (
                                  <span className="text-slate-400 text-sm">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payment Notes */}
            {paymentLogs.some(log => log.status === 'reversed') && (
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-900">{isRTL ? 'ملاحظة' : 'Note'}</p>
                      <p className="text-sm text-amber-800">
                        {isRTL 
                          ? 'المدفوعات الملغية تظهر مخففة ولا تحتسب في الرصيد' 
                          : 'Reversed payments appear faded and are not counted in the balance'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </Card>

      {/* Legacy Payment Logs Card - Hidden but kept for compatibility */}
      <div className="hidden">
      {/* Payment Logs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{isRTL ? 'سجل المدفوعات' : 'Payments Log'}</CardTitle>
            {balance > 0 && (userRole === 'admin' || userRole === 'accountant') && (
              <Button onClick={() => setShowPaymentLogForm(true)} className="gap-2 bg-slate-900">
                <CreditCard className="w-4 h-4" />
                {isRTL ? 'تسجيل دفعة' : 'Record Payment'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {paymentLogs.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Clock className="w-12 h-12 mx-auto mb-2 text-slate-300" />
              <p>{isRTL ? 'لا توجد دفعات مسجلة' : 'No payments recorded yet'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {paymentLogs.map((log) => (
                <div 
                  key={log.id} 
                  className={`p-4 rounded-lg border ${
                    log.status === 'reversed' ? 'bg-red-50 border-red-200' :
                    log.status === 'reconciled' ? 'bg-emerald-50 border-emerald-200' :
                    'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        log.status === 'reversed' ? 'bg-red-100' :
                        log.status === 'reconciled' ? 'bg-emerald-100' :
                        'bg-slate-200'
                      }`}>
                        <CheckCircle2 className={`w-5 h-5 ${
                          log.status === 'reversed' ? 'text-red-600' :
                          log.status === 'reconciled' ? 'text-emerald-600' :
                          'text-slate-600'
                        }`} />
                      </div>
                      <div>
                        <p className="font-semibold">{log.amount.toLocaleString()} {t('sar')}</p>
                        <p className="text-sm text-slate-600">
                          {log.payment_method === 'credit_card' && (isRTL ? 'بطاقة ائتمان' : 'Credit Card')}
                          {log.payment_method === 'bank_transfer' && (isRTL ? 'تحويل بنكي' : 'Bank Transfer')}
                          {log.payment_method === 'cash' && (isRTL ? 'نقداً' : 'Cash')}
                          {log.payment_method === 'internal_settlement' && (isRTL ? 'تسوية داخلية' : 'Internal Settlement')}
                          {log.payment_method === 'other' && (isRTL ? 'أخرى' : 'Other')}
                          {log.reference_number && ` - ${isRTL ? 'رقم المرجع' : 'Ref'}: ${log.reference_number}`}
                        </p>
                        <p className="text-xs text-slate-500">
                          {format(new Date(log.payment_date), 'dd/MM/yyyy HH:mm')}
                          {log.collected_by && ` • ${isRTL ? 'بواسطة' : 'by'} ${log.collected_by}`}
                        </p>
                        {log.notes && <p className="text-xs text-slate-600 mt-1">{log.notes}</p>}
                        {log.attachment_url && (
                          <a href={log.attachment_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                            {isRTL ? 'عرض المرفق' : 'View Attachment'}
                          </a>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className={
                      log.status === 'reversed' ? 'bg-red-100 text-red-700 border-red-300' :
                      log.status === 'reconciled' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' :
                      'bg-slate-100 text-slate-700 border-slate-300'
                    }>
                      {log.status === 'recorded' && (isRTL ? 'مسجل' : 'Recorded')}
                      {log.status === 'reconciled' && (isRTL ? 'تمت المطابقة' : 'Reconciled')}
                      {log.status === 'reversed' && (isRTL ? 'ملغي' : 'Reversed')}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </div>

      {/* Payment Forms */}
      <PaymentForm
        open={showPaymentForm}
        onClose={() => setShowPaymentForm(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });
          queryClient.invalidateQueries({ queryKey: ['payments', invoiceId] });
        }}
        invoice={invoice}
      />

      <PaymentLogForm
        open={showPaymentLogForm}
        onClose={() => setShowPaymentLogForm(false)}
        invoice={invoice}
      />
    </div>
  );
}