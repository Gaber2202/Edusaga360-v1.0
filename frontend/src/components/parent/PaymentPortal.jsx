import React, { useState, useEffect } from 'react';
import { tenantQuery } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useTenant } from '../TenantContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Loader2, CreditCard, Smartphone, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

// ─── Payment link generators ──────────────────────────────────────────────────
// STC Pay deep link format: stcpay://pay?amount=X&description=Y&ref=Z
// Mada: redirects to bank's e-payment gateway via URL params
// We generate a hosted checkout URL that the school's payment gateway would handle.
// For now we produce deep links + fallback to a Moyasar / payment page URL pattern.

const PAYMENT_GATEWAY = import.meta.env.VITE_PAYMENT_GATEWAY_URL ?? 'https://platform.edusaga360.com/pay';

function buildSTCPayLink(amount, description, referenceId) {
  const params = new URLSearchParams({ amount: amount.toFixed(2), description, ref: referenceId });
  return `stcpay://pay?${params}`;
}

function buildPaymentPageLink(tenantId, invoiceId, amount, description) {
  const params = new URLSearchParams({ tenant: tenantId, invoice: invoiceId, amount: amount.toFixed(2), desc: description });
  return `${PAYMENT_GATEWAY}?${params}`;
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
        <CardContent className="py-6 text-center text-slate-500">
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
                  ? `${unpaid.length} فاتورة غير مسددة — الإجمالي: ${totalDue.toLocaleString('en-SA', { minimumFractionDigits: 2 })} ريال`
                  : `${unpaid.length} unpaid invoice${unpaid.length > 1 ? 's' : ''} — Total: SAR ${totalDue.toLocaleString('en-SA', { minimumFractionDigits: 2 })}`}
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
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : invoices.length === 0 ? (
            <p className="text-center text-slate-500 py-6">
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
                      className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left"
                      onClick={() => setExpanded(isOpen ? null : invoice.id)}
                    >
                      <div className="flex items-center gap-3">
                        <StatusIcon className={`w-4 h-4 ${invoice.status === 'paid' ? 'text-green-600' : invoice.status === 'partial' ? 'text-amber-600' : 'text-red-600'}`} />
                        <div>
                          <p className="font-medium text-sm">
                            {isRTL ? 'فاتورة #' : 'Invoice #'}{invoice.invoice_number}
                          </p>
                          <p className="text-xs text-slate-500">{invoice.academic_year}{invoice.due_date ? ` · ${isRTL ? 'الاستحقاق' : 'Due'}: ${invoice.due_date}` : ''}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-sm">
                          {invoice.total_amount.toLocaleString('en-SA', { minimumFractionDigits: 2 })} {isRTL ? 'ر.س' : 'SAR'}
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{label}</span>
                      </div>
                    </button>

                    {/* Expanded payment section */}
                    {isOpen && invoice.status !== 'paid' && (
                      <div className="border-t bg-slate-50 p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-slate-500">{isRTL ? 'الإجمالي' : 'Total'}</span>
                            <p className="font-medium">{invoice.total_amount.toLocaleString('en-SA', { minimumFractionDigits: 2 })} {isRTL ? 'ر.س' : 'SAR'}</p>
                          </div>
                          {invoice.paid_amount > 0 && (
                            <div>
                              <span className="text-slate-500">{isRTL ? 'المدفوع' : 'Paid'}</span>
                              <p className="font-medium text-green-600">{invoice.paid_amount.toLocaleString('en-SA', { minimumFractionDigits: 2 })} {isRTL ? 'ر.س' : 'SAR'}</p>
                            </div>
                          )}
                          <div>
                            <span className="text-slate-500">{isRTL ? 'المتبقي' : 'Outstanding'}</span>
                            <p className="font-semibold text-red-600">{outstanding.toLocaleString('en-SA', { minimumFractionDigits: 2 })} {isRTL ? 'ر.س' : 'SAR'}</p>
                          </div>
                        </div>

                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                          {isRTL ? 'خيارات الدفع' : 'Payment Options'}
                        </p>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          {/* STC Pay */}
                          <a
                            href={buildSTCPayLink(outstanding, description, invoice.id)}
                            onClick={() => toast.info(isRTL ? 'جاري فتح STC Pay...' : 'Opening STC Pay...')}
                            className="flex items-center justify-center gap-2 bg-[#7B2FBE] hover:bg-[#6425a0] text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors"
                          >
                            <Smartphone className="w-4 h-4" />
                            STC Pay
                          </a>

                          {/* Mada / online payment page */}
                          <a
                            href={buildPaymentPageLink(tenant.id, invoice.id, outstanding, description)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => toast.info(isRTL ? 'جاري فتح بوابة الدفع...' : 'Opening payment gateway...')}
                            className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors"
                          >
                            <CreditCard className="w-4 h-4" />
                            {isRTL ? 'مدى / بطاقة' : 'Mada / Card'}
                          </a>

                          {/* Copy reference */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-sm"
                            onClick={() => {
                              navigator.clipboard.writeText(invoice.invoice_number);
                              toast.success(isRTL ? 'تم نسخ رقم الفاتورة' : 'Invoice number copied');
                            }}
                          >
                            {isRTL ? 'نسخ رقم الفاتورة' : 'Copy Ref'}
                          </Button>
                        </div>

                        {invoice.notes && (
                          <p className="text-xs text-slate-500 italic">{invoice.notes}</p>
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
