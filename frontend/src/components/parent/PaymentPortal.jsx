import React, { useState, useEffect } from 'react';
import { tenantQuery, callApi } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useTenant } from '../TenantContext';
import { formatCurrency } from '../lib/localization';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Loader2, CreditCard, Smartphone, CheckCircle2, Clock, AlertCircle, Download } from 'lucide-react';
import { toast } from 'sonner';

// ─── Payment link generators ──────────────────────────────────────────────────
// STC Pay deep link format: stcpay://pay?amount=X&description=Y&ref=Z

function buildSTCPayLink(amount, description, referenceId) {
  const params = new URLSearchParams({ amount: amount.toFixed(2), description, ref: referenceId });
  return `stcpay://pay?${params}`;
}

function statusConfig(status, isRTL) {
  switch (status) {
    case 'paid':    return { label: isRTL ? 'مدفوعة' : 'Paid',    color: 'bg-green-100 text-green-700',  icon: CheckCircle2 };
    case 'partial': return { label: isRTL ? 'جزئية' : 'Partial',  color: 'bg-amber-100 text-amber-700',  icon: Clock };
    default:        return { label: isRTL ? 'معلقة' : 'Pending',  color: 'bg-red-100 text-red-700',      icon: AlertCircle };
  }
}

export default function PaymentPortal({ student }) {
  const { isRTL } = useLanguage();
  const { tenant } = useTenant();
  const [invoices, setInvoices]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [expanded, setExpanded]   = useState(null);
  const [payingId, setPayingId]   = useState(null);
  const [paymentLinks, setPaymentLinks] = useState({});
  const [loadingLinkId, setLoadingLinkId] = useState(null);

  // Load the invoice-specific Moyasar payment link when a parent expands an unpaid invoice.
  useEffect(() => {
    if (!expanded) return;
    const invoice = invoices.find((inv) => inv.id === expanded);
    if (!invoice || invoice.status === 'paid' || paymentLinks[expanded]?.paymentUrl) return;

    setLoadingLinkId(expanded);
    callApi(`/api/invoices/${expanded}/payment-link`, null, { method: 'GET' })
      .then((result) => {
        if (result.paymentUrl) {
          setPaymentLinks((prev) => ({ ...prev, [expanded]: result }));
        }
      })
      .catch((err) => console.error('Error loading payment link:', err))
      .finally(() => setLoadingLinkId(null));
  }, [expanded, invoices, paymentLinks]);

  const handlePay = async (invoice) => {
    if (paymentLinks[invoice.id]?.paymentUrl) {
      window.open(paymentLinks[invoice.id].paymentUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    setPayingId(invoice.id);
    toast.loading(isRTL ? 'جاري تحميل رابط الدفع...' : 'Loading payment link...');
    try {
      const result = await callApi(`/api/invoices/${invoice.id}/payment-link`, null, { method: 'GET' });
      if (result.paymentUrl) {
        window.open(result.paymentUrl, '_blank', 'noopener,noreferrer');
      } else {
        toast.error(isRTL ? 'لم يتم إنشاء رابط الدفع' : 'Payment link not created');
      }
    } catch (err) {
      console.error('Payment link error:', err);
      toast.error(isRTL ? 'فشل تحميل رابط الدفع' : 'Failed to load payment link');
    } finally {
      setPayingId(null);
      toast.dismiss();
    }
  };

  const handleDownload = async (invoice) => {
    toast.loading(isRTL ? 'جاري تحميل الفاتورة...' : 'Downloading invoice...');
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
      toast.success(isRTL ? 'تم تحميل الفاتورة' : 'Invoice downloaded');
    } catch (err) {
      toast.dismiss();
      toast.error(isRTL ? 'فشل تحميل الفاتورة' : 'Failed to download invoice');
    }
  };

  useEffect(() => {
    if (!student?.id || !tenant?.id) return;
    setLoading(true);
    tenantQuery('invoices')
      .select('id, invoice_number, academic_year, total_amount, paid_amount, status, due_date, notes')
      .match({ student_id: student.id, tenant_id: tenant.id })
      .order('created_at', { ascending: false })
      .then(({ data }) => setInvoices(data ?? []))
      .catch(err => console.error('Error fetching invoices:', err))
      .finally(() => setLoading(false));
  }, [student?.id, tenant?.id]);

  if (!student) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground">
          {isRTL ? 'يرجى اختيار طالب' : 'Please select a student'}
        </CardContent>
      </Card>
    );
  }

  const unpaid = invoices.filter(inv => inv.status !== 'paid');
  const totalDue = unpaid.reduce((s, inv) => s + (inv.total_amount - (inv.paid_amount ?? 0)), 0);

  return (
    <div className="space-y-4">

      {/* Summary strip */}
      {unpaid.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-5 h-5" />
              <span className="font-medium text-sm">
                {isRTL
                  ? `${unpaid.length} فاتورة غير مسددة — الإجمالي: ${formatCurrency(totalDue, tenant?.localization, isRTL)}`
                  : `${unpaid.length} unpaid invoice${unpaid.length > 1 ? 's' : ''} — Total: ${formatCurrency(totalDue, tenant?.localization, isRTL)}`}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            {isRTL ? 'الفواتير والمدفوعات' : 'Invoices & Payments'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : invoices.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">
              {isRTL ? 'لا توجد فواتير' : 'No invoices found'}
            </p>
          ) : (
            <div className="space-y-3">
              {invoices.map((invoice) => {
                const { label, color, icon: StatusIcon } = statusConfig(invoice.status, isRTL);
                const outstanding = invoice.total_amount - (invoice.paid_amount ?? 0);
                const isOpen = expanded === invoice.id;
                const description = isRTL
                  ? `رسوم دراسية - فاتورة #${invoice.invoice_number}`
                  : `School fees - Invoice #${invoice.invoice_number}`;

                return (
                  <div key={invoice.id} className="border rounded-xl overflow-hidden">
                    {/* Header row */}
                    <button
                      className="w-full flex items-center justify-between p-4 hover:bg-sand transition-colors text-left"
                      onClick={() => setExpanded(isOpen ? null : invoice.id)}
                    >
                      <div className="flex items-center gap-3">
                        <StatusIcon className={`w-4 h-4 ${invoice.status === 'paid' ? 'text-green-600' : invoice.status === 'partial' ? 'text-amber-600' : 'text-red-600'}`} />
                        <div>
                          <p className="font-medium text-sm">
                            {isRTL ? 'فاتورة #' : 'Invoice #'}{invoice.invoice_number}
                          </p>
                          <p className="text-xs text-muted-foreground">{invoice.academic_year}{invoice.due_date ? ` · ${isRTL ? 'الاستحقاق' : 'Due'}: ${invoice.due_date}` : ''}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-sm">
                          {formatCurrency(invoice.total_amount, tenant?.localization, isRTL)}
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{label}</span>
                      </div>
                    </button>

                    {/* Expanded payment section */}
                    {isOpen && invoice.status !== 'paid' && (
                      <div className="border-t bg-sand p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">{isRTL ? 'الإجمالي' : 'Total'}</span>
                            <p className="font-medium">{formatCurrency(invoice.total_amount, tenant?.localization, isRTL)}</p>
                          </div>
                          {invoice.paid_amount > 0 && (
                            <div>
                              <span className="text-muted-foreground">{isRTL ? 'المدفوع' : 'Paid'}</span>
                              <p className="font-medium text-green-600">{formatCurrency(invoice.paid_amount, tenant?.localization, isRTL)}</p>
                            </div>
                          )}
                          <div>
                            <span className="text-muted-foreground">{isRTL ? 'المتبقي' : 'Outstanding'}</span>
                            <p className="font-semibold text-red-600">{formatCurrency(outstanding, tenant?.localization, isRTL)}</p>
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                          {isRTL ? 'خيارات الدفع' : 'Payment Options'}
                        </p>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          {/* Primary: Moyasar checkout link */}
                          <Button
                            onClick={() => handlePay(invoice)}
                            disabled={payingId === invoice.id}
                            className="flex items-center justify-center gap-2 bg-najdi-900 hover:bg-ink text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors"
                          >
                            {payingId === invoice.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CreditCard className="w-4 h-4" />
                            )}
                            {isRTL ? 'دفع الآن' : 'Pay Now'}
                          </Button>

                          {/* STC Pay */}
                          <a
                            href={buildSTCPayLink(outstanding, description, invoice.id)}
                            onClick={() => toast.info(isRTL ? 'جاري فتح STC Pay...' : 'Opening STC Pay...')}
                            className="flex items-center justify-center gap-2 bg-[#7B2FBE] hover:bg-[#6425a0] text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors"
                          >
                            <Smartphone className="w-4 h-4" />
                            STC Pay
                          </a>

                          {/* Download ZATCA PDF + copy ref */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-sm"
                            onClick={() => handleDownload(invoice)}
                          >
                            <Download className="w-4 h-4 me-1" />
                            {isRTL ? 'تحميل PDF' : 'Download PDF'}
                          </Button>
                        </div>

                        {loadingLinkId === invoice.id && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {isRTL ? 'جاري تحميل رابط الدفع...' : 'Loading payment link...'}
                          </div>
                        )}

                        {paymentLinks[invoice.id]?.paymentUrl && (
                          <div className="p-3 bg-white border rounded-lg space-y-2">
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                              {isRTL ? 'رابط الدفع' : 'Payment link'}
                            </p>
                            <div className="flex items-center gap-2">
                              <a
                                href={paymentLinks[invoice.id].paymentUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-blue-600 hover:underline break-all"
                              >
                                {paymentLinks[invoice.id].paymentUrl}
                              </a>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={() => {
                                navigator.clipboard.writeText(paymentLinks[invoice.id].paymentUrl);
                                toast.success(isRTL ? 'تم نسخ رابط الدفع' : 'Payment link copied');
                              }}
                            >
                              {isRTL ? 'نسخ الرابط' : 'Copy link'}
                            </Button>
                          </div>
                        )}

                        {invoice.notes && (
                          <p className="text-xs text-muted-foreground italic">{invoice.notes}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
