import React, { useState, useEffect } from 'react';
import { supabase, tenantQuery } from '../api/supabaseClient';

/**
 * Shown when the platform returns user_not_registered.
 *
 * Single flow:
 * - Check if the user has a pending/approved RegistrationRequest by email.
 *   • pending   → "under review" screen
 *   • approved, setup_completed=false → "check your email for setup link" screen
 *   • none found → redirect to /register (the ONLY entry point for new users)
 */
export default function UserNotRegisteredError() {
  const [status, setStatus] = useState('checking'); // checking | pending | awaiting_setup | redirect
  const [request, setRequest] = useState(null);

  useEffect(() => { checkStatus(); }, []);

  const checkStatus = async () => {
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      if (!user?.email) { window.location.replace('/register'); return; }

      const regs = await tenantQuery('registration_requests').select('*').match({ email: user.email });
      if (regs.length > 0) {
        regs.sort((a, b) => new Date(b.submitted_at || b.created_date) - new Date(a.submitted_at || a.created_date));
        const latest = regs[0];

        if (latest.status === 'pending') {
          setRequest(latest);
          setStatus('pending');
          return;
        }
        if (latest.status === 'approved' && !latest.setup_completed) {
          setRequest(latest);
          setStatus('awaiting_setup');
          return;
        }
      }
      // No known request → send to registration
      window.location.replace('/register');
    } catch (_e) {
      window.location.replace('/register');
    }
  };

  const handleLogout = () => supabase.auth.signOut();

  if (status === 'checking') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  const Logo = () => (
    <img
      src="/edusaga-logo.svg"
      alt="EduSaga 360"
      className="h-12 w-auto mx-auto"
    />
  );

  if (status === 'awaiting_setup') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4" dir="rtl">
        <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap'); body { font-family: 'IBM Plex Sans Arabic', sans-serif; }`}</style>
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-100 p-8 text-center space-y-5">
          <Logo />
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">تم قبول طلبك!</h1>
            <p className="text-slate-500 mt-2 text-sm leading-relaxed">
              تم قبول مدرستك <strong>{request?.school_name}</strong> على منصة EduSaga 360.
              يرجى فتح رابط الإعداد المُرسَل إلى بريدك الإلكتروني لإكمال إنشاء بيئة مدرستك.
            </p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 text-start">
            <p className="font-semibold">📧 تحقق من بريدك الإلكتروني</p>
            <p className="text-xs mt-1 text-amber-600">{request?.email}</p>
            <p className="text-xs mt-1 text-amber-500">إذا لم تجد الرسالة، تفقد مجلد البريد العشوائي (Spam)</p>
          </div>
          <button onClick={handleLogout} className="w-full py-2.5 px-4 border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-colors text-sm">
            تسجيل الخروج
          </button>
        </div>
      </div>
    );
  }

  // status === 'pending'
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4" dir="rtl">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap'); body { font-family: 'IBM Plex Sans Arabic', sans-serif; }`}</style>
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-100 p-8 text-center space-y-5">
        <Logo />
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">طلبك قيد المراجعة</h1>
          <p className="text-slate-500 mt-2 text-sm leading-relaxed">
            تم استلام طلب تسجيل <strong>{request?.school_name}</strong>. سيتواصل معك فريقنا خلال 24 ساعة.
          </p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 text-start">
          <p className="font-semibold">⏳ في انتظار الموافقة</p>
          <p className="text-xs mt-1 text-amber-600">سنُرسل إليك رابط الإعداد على: <strong>{request?.email}</strong></p>
        </div>
        <button onClick={handleLogout} className="w-full py-2.5 px-4 border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-colors text-sm">
          تسجيل الخروج
        </button>
      </div>
    </div>
  );
}