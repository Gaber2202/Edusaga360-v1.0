import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Clock, ArrowLeft, RefreshCcw } from 'lucide-react';

export default function PaymentResult() {
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status') || 'pending';
  const id = searchParams.get('id') || '';
  const [language, setLanguage] = useState('ar');

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('erp_language') : 'ar';
    if (stored === 'en' || stored === 'ar') setLanguage(stored);
  }, []);

  const isRTL = language === 'ar';

  const content = {
    success: {
      icon: <CheckCircle className="w-16 h-16 text-green-600" />,
      title: isRTL ? 'تم الدفع بنجاح' : 'Payment Successful',
      message: isRTL
        ? 'تم استلام دفعتك وسيتم إصدار الإيصال. شكراً لك.'
        : 'Your payment has been received and a receipt will be issued. Thank you.',
      primary: { label: isRTL ? 'العودة إلى بوابة ولي الأمر' : 'Back to Parent Portal', to: '/school-login' },
      secondary: { label: isRTL ? 'تحميل الإيصال' : 'Download Receipt', to: id ? `/api/billing/invoices/${id}/download-pdf` : '#' },
    },
    pending: {
      icon: <Clock className="w-16 h-16 text-amber-500" />,
      title: isRTL ? 'جاري معالجة الدفع' : 'Payment Processing',
      message: isRTL
        ? 'الدفع قيد المعالجة. سيتم تحديث الحالة قريباً.'
        : 'Your payment is being processed. The status will be updated shortly.',
      primary: { label: isRTL ? 'العودة إلى بوابة ولي الأمر' : 'Back to Parent Portal', to: '/school-login' },
      secondary: { label: isRTL ? 'إعادة المحاولة' : 'Try Again', to: id ? `/payment/result?status=pending&id=${id}` : '#' },
    },
    failure: {
      icon: <XCircle className="w-16 h-16 text-red-600" />,
      title: isRTL ? 'فشل الدفع' : 'Payment Failed',
      message: isRTL
        ? 'لم نتمكن من إكمال الدفع. يرجى التواصل مع المدرسة أو المحاولة مرة أخرى.'
        : 'We could not complete the payment. Please contact the school or try again.',
      primary: { label: isRTL ? 'حاول مرة أخرى' : 'Try Again', to: id ? `/payment/result?status=pending&id=${id}` : '#' },
      secondary: { label: isRTL ? 'تواصل مع المدرسة' : 'Contact School', to: '/school-login' },
    },
  };

  const c = content[status] || content.pending;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="flex justify-center mb-4">{c.icon}</div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">{c.title}</h1>
        <p className="text-slate-600 mb-8">{c.message}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to={c.primary.to}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-najdi-700 text-white rounded-lg hover:bg-najdi-800 transition"
          >
            {status === 'failure' ? <RefreshCcw className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
            {c.primary.label}
          </Link>
          {c.secondary && (
            <Link
              to={c.secondary.to}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition"
            >
              {c.secondary.label}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
