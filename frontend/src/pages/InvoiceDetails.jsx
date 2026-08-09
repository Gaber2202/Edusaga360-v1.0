import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, callApi } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { formatCurrency, getCurrencySymbol } from '../lib/localization';
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
  AlertCircle,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';
import WhatsAppButton from '../components/communications/WhatsAppButton';
import { WhatsAppMessageTypes } from '../components/communications/WhatsAppService';
import { itemAmount, itemDesc, fmtDate } from '../lib/invoiceFormat';
import { useTenant } from '../components/TenantContext';

export default function InvoiceDetails() {
  const { tenant } = useTenant();
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
      const { data: invoices = [] } = await tenantQuery('invoices').select('*').match(tenantFilter());
      return invoices.find(inv => inv.id === invoiceId);
    },
    enabled: !!invoiceId && hasTenantAccess
  });

  const { data: _payments = [] } = useQuery({
    queryKey: ['payments', invoiceId, tenantId],
    queryFn: async () => {
      const { data: allPayments = [] } = await tenantQuery('payments').select('*').match(tenantFilter()).order('created_at', { ascending: false });
      return allPayments.filter(p => p.invoice_id === invoiceId);
    },
    enabled: !!invoiceId && hasTenantAccess
  });

  const { data: paymentLogs = [] } = useQuery({
    queryKey: ['invoicePaymentLogs', invoiceId, tenantId],
    queryFn: async () => {
      const { data: allLogs = [] } = await tenantQuery('invoice_payment_logs').select('*').match(tenantFilter()).order('created_at', { ascending: false });
      return allLogs.filter(log => log.invoice_id === invoiceId);
    },
    enabled: !!invoiceId && hasTenantAccess
  });

  const { data: guardian } = useQuery({
    queryKey: ['guardian', invoice?.guardian_id, tenantId],
    queryFn: async () => {
      if (!invoice?.guardian_id) return null;
      const { data: guardians = [] } = await tenantQuery('guardians').select('*').match(tenantFilter());
      return guardians.find(g => g.id === invoice.guardian_id);
    },
    enabled: !!invoice?.guardian_id && hasTenantAccess
  });

  const [paymentLink, setPaymentLink] = useState(null);
  const [paymentLinkLoading, setPaymentLinkLoading] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);

  const paymentMethodLabels = {
    mada: isRTL ? 'مدى' : 'Mada',
    creditcard: isRTL ? 'بطاقة ائتمان / مدين' : 'Credit / Debit Card',
    applepay: 'Apple Pay',
    stcpay: 'STC Pay',
    samsungpay: 'Samsung Pay',
    bank_transfer: isRTL ? 'تحويل بنكي' : 'Bank Transfer',
    cash: isRTL ? 'نقداً' : 'Cash',
  };

  useEffect(() => {
    if (!invoice || invoice.status === 'paid' || invoice.document_type !== 'invoice') {
      setPaymentLink(null);
      return;
    }
    const balance = Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0);
    if (balance <= 0) return;

    setPaymentLinkLoading(true);
    callApi(`/api/invoices/${invoice.id}/payment-link`, null, { method: 'GET' })
      .then((result) => {
        if (result.paymentUrl) setPaymentLink(result);
      })
      .catch((err) => console.error('Payment link load failed:', err))
      .finally(() => setPaymentLinkLoading(false));
  }, [invoice?.id, invoice?.status, invoice?.total_amount, invoice?.paid_amount, invoice?.document_type]);

  // Load a live ZATCA PDF preview for the invoice details tab.
  useEffect(() => {
    if (!invoice?.id) {
      setPdfPreviewUrl(null);
      return;
    }
    let objectUrl = null;
    callApi(`/api/invoices/${invoice.id}/download-pdf?inline=1`, null, { method: 'GET', responseType: 'blob' })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setPdfPreviewUrl(objectUrl);
      })
      .catch((err) => console.error('PDF preview load failed:', err));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [invoice?.id]);

  // Primary download: server-generated, ZATCA-compliant PDF (bilingual EN/AR
  // with the Fatoora TLV QR code embedded).
  const handleDownloadPDF = async () => {
    if (!invoice) return;
    toast.loading(isRTL ? 'جاري إنشاء الفاتورة...' : 'Generating invoice...');
    try {
      const blob = await callApi(
        `/api/invoices/${invoice.id}/download-pdf`,
        null,
        { method: 'GET', responseType: 'blob' }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zatca-invoice-${invoice.invoice_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.dismiss();
      toast.success(isRTL ? 'تم تحميل الفاتورة (متوافقة مع هيئة الزكاة)' : 'ZATCA-compliant invoice downloaded');

      logAuditEvent(
        AuditActions.EXPORT,
        'Invoice',
        invoice.id,
        { action: 'download_zatca_pdf', invoice_number: invoice.invoice_number },
        user
      );
    } catch (err) {
      console.error('ZATCA PDF download failed:', err);
      toast.dismiss();
      toast.error(isRTL ? 'فشل إنشاء الفاتورة المتوافقة مع هيئة الزكاة' : 'Failed to generate ZATCA invoice');
    }
  };

  const handlePrint = async () => {
    if (!invoice) return;

    toast.loading(isRTL ? 'جاري تحميل الفاتورة للطباعة...' : 'Loading invoice for printing...');
    try {
      const blob = await callApi(
        `/api/invoices/${invoice.id}/download-pdf`,
        null,
        { method: 'GET', responseType: 'blob' }
      );
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.src = url;

      const cleanup = () => {
        if (iframe.parentNode) document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      };

      iframe.onerror = cleanup;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        toast.dismiss();
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.error('Print failed:', e);
        }
        setTimeout(cleanup, 1000);
      };

      logAuditEvent(
        AuditActions.VIEW,
        'Invoice',
        invoice.id,
        { action: 'print_zatca_pdf', invoice_number: invoice.invoice_number },
        user
      );
    } catch (err) {
      console.error('ZATCA PDF print failed:', err);
      toast.dismiss();
      toast.error(isRTL ? 'فشل تحميل الفاتورة للطباعة' : 'Failed to load invoice for printing');
    }
  };

  const shareViaEmail = async () => {
    if (!invoice) return;
    
    const subject = `Invoice ${invoice.invoice_number} - ${invoice.student_name}`;
    const body = `
Dear Parent,

Please find attached the invoice details for ${invoice.student_name}.

Invoice Number: ${invoice.invoice_number}
Amount: ${formatCurrency((invoice.total_amount), tenant?.localization, isRTL)}
Due Date: ${fmtDate(invoice.due_date)}
Balance: ${formatCurrency((Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0)), tenant?.localization, isRTL)}

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
    
    const message = `*Invoice ${invoice.invoice_number}*\n\nStudent: ${invoice.student_name}\nAmount: ${formatCurrency((invoice.total_amount), tenant?.localization, isRTL)}\nDue Date: ${fmtDate(invoice.due_date)}\nBalance: ${formatCurrency((Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0)), tenant?.localization, isRTL)}`;
    
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
          <div className="w-16 h-16 border-4 border-border border-t-najdi-900 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">{isRTL ? 'لم يتم العثور على الفاتورة' : 'Invoice not found'}</p>
        </div>
      </div>
    );
  }

  const balance = Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0);

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
      default: return 'bg-sand-alt text-ink border-border';
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
          <Button variant="outline" onClick={handleDownloadPDF} className="gap-2">
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
                amount: formatCurrency((invoice.total_amount), tenant?.localization, isRTL),
                due_date: fmtDate(invoice.due_date),
                payment_link: paymentLink?.paymentUrl
              }}
            />
          )}
        </div>
      </div>

      {/* Invoice Card */}
      <Card>
        <CardHeader className="bg-sand">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">
                {isRTL ? 'فاتورة رقم' : 'Invoice'} #{invoice.invoice_number}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {isRTL ? 'تاريخ الإصدار' : 'Issue Date'}: {fmtDate(invoice.issue_date)}
              </p>
            </div>
            <Badge 
              className={
                invoice.status === 'paid' ? 'bg-emerald-100 text-emerald-800' :
                invoice.status === 'partial' ? 'bg-amber-100 text-amber-800' :
                invoice.status === 'overdue' ? 'bg-red-100 text-red-800' :
                'bg-sand-alt text-ink'
              }
            >
              {t(invoice.status)}
            </Badge>
          </div>
        </CardHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="w-full justify-start border-b rounded-none bg-transparent p-0 h-auto">
            <TabsTrigger value="details" className="rounded-none border-b-2 border-transparent data-[state=active]:border-najdi-900 data-[state=active]:bg-transparent">
              <FileText className="w-4 h-4 me-2" />
              {isRTL ? 'تفاصيل الفاتورة' : 'Invoice Details'}
            </TabsTrigger>
            <TabsTrigger value="payments" className="rounded-none border-b-2 border-transparent data-[state=active]:border-najdi-900 data-[state=active]:bg-transparent">
              <CreditCard className="w-4 h-4 me-2" />
              {isRTL ? 'طرق الدفع وسجل السداد' : 'Payment Methods & History'}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="p-6 space-y-6 mt-0">
          {/* ZATCA Invoice Preview */}
          {pdfPreviewUrl && (
            <div className="border rounded-lg overflow-hidden bg-white">
              <div className="bg-sand px-4 py-2 border-b flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">
                  {isRTL ? 'معاينة فاتورة ZATCA' : 'ZATCA Invoice Preview'}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {isRTL ? 'متوافقة مع هيئة الزكاة والضريبة والجمارك' : 'ZATCA-compliant'}
                </span>
              </div>
              <iframe
                src={pdfPreviewUrl}
                title={isRTL ? 'معاينة الفاتورة' : 'Invoice preview'}
                className="w-full h-[500px]"
              />
            </div>
          )}

          {/* Student Info */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">{isRTL ? 'بيانات الطالب' : 'Student Details'}</h3>
              <p className="font-semibold text-lg">{invoice.student_name}</p>
              <p className="text-muted-foreground">{t(invoice.grade)}</p>
              <p className="text-muted-foreground">{invoice.academic_year}</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">{isRTL ? 'تفاصيل الدفع' : 'Payment Details'}</h3>
              <p className="text-muted-foreground">{t('dueDate')}: {fmtDate(invoice.due_date)}</p>
              {invoice.preferred_payment_method && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground">{isRTL ? 'طريقة الدفع المفضلة' : 'Preferred Payment Method'}:</p>
                  <Badge variant="outline" className={`mt-1 ${invoice.preferred_payment_method === 'tamara' ? 'border-purple-300 bg-purple-50 text-purple-700' : ''}`}>
                    {invoice.preferred_payment_method === 'credit_card' && (isRTL ? 'بطاقة ائتمان' : 'Credit Card')}
                    {invoice.preferred_payment_method === 'bank_transfer' && (isRTL ? 'تحويل بنكي' : 'Bank Transfer')}
                    {invoice.preferred_payment_method === 'cash' && (isRTL ? 'نقداً' : 'Cash')}
                    {invoice.preferred_payment_method === 'tamara' && `${t('tamara')} (${t('buyNowPayLater')})`}
                  </Badge>
                </div>
              )}
              {(invoice.payment_methods?.length > 0) && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground">{isRTL ? 'طرق الدفع المتاحة' : 'Accepted Payment Methods'}:</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {invoice.payment_methods.map((method) => (
                      <Badge key={method} variant="outline" className="bg-sand">
                        {paymentMethodLabels[method] || method}
                      </Badge>
                    ))}
                  </div>
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
                <div key={idx} className="flex justify-between items-center py-2 border-b border-border">
                  <div>
                    <p className="font-medium">{itemDesc(item, isRTL)}</p>
                    <p className="text-sm text-muted-foreground">{item.fee_type || item.category_code || ''}</p>
                  </div>
                  <p className="font-semibold">{formatCurrency((itemAmount(item)), tenant?.localization, isRTL)} {getCurrencySymbol(tenant?.localization, isRTL)}</p>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Bank Account Details */}
          {invoice.preferred_payment_method === 'bank_transfer' && invoice.bank_account_details && (
            <>
              <div className="bg-najdi-50 border border-najdi-100 rounded-lg p-4">
                <h3 className="font-semibold mb-2 text-najdi-900">{isRTL ? 'تفاصيل التحويل البنكي' : 'Bank Transfer Details'}</h3>
                <div className="space-y-1 text-sm">
                  <p><span className="text-muted-foreground">{isRTL ? 'اسم البنك' : 'Bank Name'}:</span> <span className="font-medium">{invoice.bank_account_details.bank_name}</span></p>
                  <p><span className="text-muted-foreground">{isRTL ? 'اسم الحساب' : 'Account Name'}:</span> <span className="font-medium">{invoice.bank_account_details.account_name}</span></p>
                  <p><span className="text-muted-foreground">{isRTL ? 'رقم الآيبان' : 'IBAN'}:</span> <span className="font-mono font-medium">{invoice.bank_account_details.iban}</span></p>
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Total Section */}
          <div className="space-y-2">
            <div className="flex justify-between text-muted-foreground">
              <span>{isRTL ? 'المجموع الفرعي' : 'Subtotal'}</span>
              <span>{formatCurrency((invoice.subtotal), tenant?.localization, isRTL)} {getCurrencySymbol(tenant?.localization, isRTL)}</span>
            </div>
            {Number(invoice.vat_amount) > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>{isRTL ? 'ضريبة القيمة المضافة (15%)' : 'VAT (15%)'}</span>
                <span>+{formatCurrency((invoice.vat_amount), tenant?.localization, isRTL)} {getCurrencySymbol(tenant?.localization, isRTL)}</span>
              </div>
            )}
            {Number(invoice.discount_amount) > 0 && (
              <div className="flex justify-between text-red-600">
                <span>{t('discount')}</span>
                <span>-{formatCurrency((invoice.discount_amount), tenant?.localization, isRTL)} {getCurrencySymbol(tenant?.localization, isRTL)}</span>
              </div>
            )}
            <div className="flex justify-between text-xl font-bold pt-2 border-t">
              <span>{t('total')}</span>
              <span>{formatCurrency((invoice.total_amount), tenant?.localization, isRTL)} {getCurrencySymbol(tenant?.localization, isRTL)}</span>
            </div>
            <div className="flex justify-between text-emerald-600">
              <span>{t('paid')}</span>
              <span>{formatCurrency((invoice.paid_amount), tenant?.localization, isRTL)} {getCurrencySymbol(tenant?.localization, isRTL)}</span>
            </div>
            {paymentLogs.length > 0 && (
              <div className="flex justify-between items-center text-sm text-muted-foreground pt-2 border-t border-border">
                <span>{isRTL ? 'تم الدفع بواسطة' : 'Paid via'}:</span>
                <div className="flex gap-2 flex-wrap justify-end">
                  {[...new Set(paymentLogs.filter(log => log.status !== 'reversed').map(log => log.payment_method))].map((method, idx) => (
                    <Badge key={idx} variant="outline" className="gap-1.5 bg-sand">
                      {getPaymentMethodIcon(method)}
                      {getPaymentMethodText(method)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-between text-xl font-bold text-red-600 pt-2 border-t">
              <span>{isRTL ? 'المتبقي' : 'Balance'}</span>
              <span>{formatCurrency((balance), tenant?.localization, isRTL)} {getCurrencySymbol(tenant?.localization, isRTL)}</span>
            </div>
          </div>
          </TabsContent>

          <TabsContent value="payments" className="p-6 space-y-6 mt-0">
            {/* Payment Summary Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{isRTL ? 'إجمالي الفاتورة' : 'Total Invoice'}</p>
                  <p className="text-2xl font-bold">{formatCurrency((invoice.total_amount), tenant?.localization, isRTL)} {getCurrencySymbol(tenant?.localization, isRTL)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{isRTL ? 'المدفوع' : 'Paid to Date'}</p>
                  <p className="text-2xl font-bold text-emerald-600">{formatCurrency((invoice.paid_amount), tenant?.localization, isRTL)} {getCurrencySymbol(tenant?.localization, isRTL)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{isRTL ? 'الرصيد المتبقي' : 'Remaining Balance'}</p>
                  <p className="text-2xl font-bold text-red-600">{formatCurrency((balance), tenant?.localization, isRTL)} {getCurrencySymbol(tenant?.localization, isRTL)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Accepted Payment Methods */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {isRTL ? 'طرق الدفع المسموح بها' : 'Accepted Payment Methods'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(invoice.payment_methods || []).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {invoice.payment_methods.map((method) => (
                      <Badge key={method} variant="outline" className="bg-sand gap-1">
                        {getPaymentMethodIcon(method)}
                        {paymentMethodLabels[method] || method}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {isRTL ? 'لم يتم تحديد طرق دفع بعد.' : 'No payment methods selected for this invoice.'}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Moyasar Payment Link */}
            {invoice.status !== 'paid' && invoice.document_type === 'invoice' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {isRTL ? 'رابط الدفع (Moyasar)' : 'Moyasar Payment Link'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {paymentLinkLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {isRTL ? 'جاري تحميل رابط الدفع...' : 'Loading payment link...'}
                    </div>
                  ) : paymentLink?.paymentUrl ? (
                    <>
                      <div className="p-3 bg-sand rounded border break-all text-sm">
                        {paymentLink.paymentUrl}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(paymentLink.paymentUrl);
                            toast.success(isRTL ? 'تم نسخ الرابط' : 'Payment link copied');
                          }}
                        >
                          {isRTL ? 'نسخ الرابط' : 'Copy Link'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const text = encodeURIComponent(`${isRTL ? 'رابط دفع الفاتورة' : 'Invoice payment link'}: ${paymentLink.paymentUrl}`);
                            window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
                          }}
                        >
                          {isRTL ? 'مشاركة عبر واتساب' : 'Share via WhatsApp'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const subject = encodeURIComponent(`Invoice ${invoice.invoice_number} - Payment Link`);
                            const body = encodeURIComponent(`Please use the following link to pay invoice ${invoice.invoice_number}:\n\n${paymentLink.paymentUrl}`);
                            window.location.href = `mailto:?subject=${subject}&body=${body}`;
                          }}
                        >
                          {isRTL ? 'مشاركة عبر البريد' : 'Share via Email'}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => window.open(paymentLink.paymentUrl, '_blank', 'noopener,noreferrer')}
                        >
                          {isRTL ? 'فتح بوابة الدفع' : 'Open Payment Gateway'}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {isRTL ? 'لا يوجد رابط دفع نشط.' : 'No active payment link.'}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

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
                  <div className="text-center py-12 text-muted-foreground">
                    <Clock className="w-16 h-16 mx-auto mb-3 text-muted-foreground" />
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
                                  <Calendar className="w-4 h-4 text-muted-foreground" />
                                  <div>
                                    <p className="font-medium text-sm">{format(new Date(log.payment_date), 'dd/MM/yyyy')}</p>
                                    <p className="text-xs text-muted-foreground">{format(new Date(log.payment_date), 'HH:mm')}</p>
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
                                  {log.status === 'reversed' ? '-' : ''}{log.amount.toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className="font-medium text-ink">
                                  {remainingAfter.toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}
                                </span>
                              </TableCell>
                              <TableCell>
                                {log.reference_number ? (
                                  <span className="text-xs font-mono bg-sand-alt px-2 py-1 rounded">{log.reference_number}</span>
                                ) : (
                                  <span className="text-muted-foreground text-sm">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <p className="text-sm">{log.collected_by}</p>
                                {log.notes && <p className="text-xs text-muted-foreground mt-1">{log.notes}</p>}
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
                                    className="flex items-center gap-1 text-najdi-700 hover:text-najdi-900 text-sm"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    {isRTL ? 'عرض' : 'View'}
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground text-sm">-</span>
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
              <Button onClick={() => setShowPaymentLogForm(true)} className="gap-2 bg-najdi-900">
                <CreditCard className="w-4 h-4" />
                {isRTL ? 'تسجيل دفعة' : 'Record Payment'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {paymentLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
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
                    'bg-sand border-border'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        log.status === 'reversed' ? 'bg-red-100' :
                        log.status === 'reconciled' ? 'bg-emerald-100' :
                        'bg-sand-alt'
                      }`}>
                        <CheckCircle2 className={`w-5 h-5 ${
                          log.status === 'reversed' ? 'text-red-600' :
                          log.status === 'reconciled' ? 'text-emerald-600' :
                          'text-muted-foreground'
                        }`} />
                      </div>
                      <div>
                        <p className="font-semibold">{log.amount.toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}</p>
                        <p className="text-sm text-muted-foreground">
                          {log.payment_method === 'credit_card' && (isRTL ? 'بطاقة ائتمان' : 'Credit Card')}
                          {log.payment_method === 'bank_transfer' && (isRTL ? 'تحويل بنكي' : 'Bank Transfer')}
                          {log.payment_method === 'cash' && (isRTL ? 'نقداً' : 'Cash')}
                          {log.payment_method === 'internal_settlement' && (isRTL ? 'تسوية داخلية' : 'Internal Settlement')}
                          {log.payment_method === 'other' && (isRTL ? 'أخرى' : 'Other')}
                          {log.reference_number && ` - ${isRTL ? 'رقم المرجع' : 'Ref'}: ${log.reference_number}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(log.payment_date), 'dd/MM/yyyy HH:mm')}
                          {log.collected_by && ` • ${isRTL ? 'بواسطة' : 'by'} ${log.collected_by}`}
                        </p>
                        {log.notes && <p className="text-xs text-muted-foreground mt-1">{log.notes}</p>}
                        {log.attachment_url && (
                          <a href={log.attachment_url} target="_blank" rel="noopener noreferrer" className="text-xs text-najdi-700 hover:underline mt-1 inline-block">
                            {isRTL ? 'عرض المرفق' : 'View Attachment'}
                          </a>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className={
                      log.status === 'reversed' ? 'bg-red-100 text-red-700 border-red-300' :
                      log.status === 'reconciled' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' :
                      'bg-sand-alt text-ink border-border'
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