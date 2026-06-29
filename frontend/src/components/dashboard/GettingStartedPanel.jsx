import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { callApi } from '../../api/supabaseClient';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import {
  Rocket, CheckCircle2, Circle, X, UserPlus, Users, CreditCard,
  Building2, GraduationCap, ArrowRight, Loader2, Sparkles, Mail,
} from 'lucide-react';

const INVITE_ROLES = [
  { id: 'branch_manager', ar: 'مدير الفرع', en: 'Branch Manager' },
  { id: 'admissions', ar: 'قبول وتسجيل', en: 'Admissions Officer' },
  { id: 'finance', ar: 'مالية', en: 'Finance Officer' },
  { id: 'accountant', ar: 'محاسب', en: 'Accountant' },
  { id: 'hr_admin', ar: 'مدير الموارد البشرية', en: 'HR Admin' },
  { id: 'hr_officer', ar: 'موظف موارد بشرية', en: 'HR Officer' },
  { id: 'teacher', ar: 'معلم', en: 'Teacher' },
];

/**
 * First-run onboarding panel for school admins. Shows a setup checklist and an
 * inline "invite your team" form so a freshly onboarded admin can start adding
 * colleagues right from the dashboard. Dismissible per-tenant via localStorage.
 */
export default function GettingStartedPanel({ isRTL, tenant, counts = {} }) {
  const tt = (ar, en) => (isRTL ? ar : en);
  const tenantKey = tenant?.id || 'default';
  const dismissKey = `es_getting_started_dismissed_${tenantKey}`;

  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(dismissKey) === '1'; } catch { return false; }
  });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('teacher');
  const [sending, setSending] = useState(false);

  const { students = 0, employees = 0, branches = 0, invoices = 0, teamInvites = 0 } = counts;

  const steps = [
    {
      key: 'team',
      done: teamInvites > 0 || employees > 0,
      icon: UserPlus,
      title: tt('ادعُ فريقك', 'Invite your team'),
      desc: tt('أضف الموظفين والمعلمين وأولياء الأمور', 'Add staff, teachers and finance officers'),
      action: () => setInviteOpen((v) => !v),
      cta: tt('دعوة', 'Invite'),
    },
    {
      key: 'branches',
      done: branches > 0,
      icon: Building2,
      title: tt('أضف الفروع', 'Set up branches'),
      desc: tt('عرّف فروع مدرستك ومواقعها', 'Define your school branches & campuses'),
      href: createPageUrl('Branches'),
      cta: tt('إعداد', 'Set up'),
    },
    {
      key: 'students',
      done: students > 0,
      icon: GraduationCap,
      title: tt('سجّل الطلاب', 'Add students'),
      desc: tt('سجّل الطلاب أو استورد قائمة', 'Enroll students or import a roster'),
      href: createPageUrl('Students'),
      cta: tt('إضافة', 'Add'),
    },
    {
      key: 'fees',
      done: invoices > 0,
      icon: CreditCard,
      title: tt('إعداد الرسوم', 'Configure fees'),
      desc: tt('حدّد هيكل الرسوم وأصدر الفواتير', 'Define fee structure & issue invoices'),
      href: createPageUrl('TuitionFeesConfiguration'),
      cta: tt('إعداد', 'Configure'),
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const pct = Math.round((completed / steps.length) * 100);

  if (dismissed || pct === 100) return null;

  const dismiss = () => {
    try { localStorage.setItem(dismissKey, '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  const submitInvite = async () => {
    if (!email.trim()) {
      toast.error(tt('البريد الإلكتروني مطلوب', 'Email is required'));
      return;
    }
    setSending(true);
    try {
      await callApi('/api/tenant-users/request', {
        name: name.trim() || email.trim(),
        email: email.trim(),
        requested_role: role,
      });
      toast.success(tt(
        'تم إرسال الدعوة! سيتم إشعار المستخدم بمجرد الموافقة.',
        'Invitation sent! The user will be notified once approved.',
      ));
      setName(''); setEmail(''); setRole('teacher');
      setInviteOpen(false);
    } catch (error) {
      const code = error?.body?.error;
      if (code === 'LIMIT_REACHED') {
        toast.error(error.message || tt('وصلت إلى الحد الأقصى للمستخدمين في خطتك.', 'You have reached your plan\'s user limit.'));
      } else if (code === 'DUPLICATE') {
        toast.error(tt('يوجد طلب معلق لهذا البريد بالفعل.', 'A pending invitation already exists for this email.'));
      } else {
        toast.error(error.message || tt('حدث خطأ', 'Something went wrong'));
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-najdi-100/60 bg-gradient-to-br from-najdi-700 via-blue-700 to-indigo-800 text-white shadow-lg">
      {/* Decorative glow */}
      <div className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 w-56 h-56 rounded-full bg-indigo-400/20 blur-2xl" />

      <button
        onClick={dismiss}
        className="absolute top-3 end-3 z-10 text-white/60 hover:text-white transition-colors"
        title={tt('إخفاء', 'Dismiss')}
      >
        <X className="w-4 h-4" />
      </button>

      <div className="relative p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center flex-shrink-0">
            <Rocket className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">
                {tt('مرحباً بك في EduSaga 360', 'Welcome to EduSaga 360')}
              </h2>
              <Sparkles className="w-4 h-4 text-amber-300" />
            </div>
            <p className="text-sm text-najdi-100/90 mt-0.5">
              {tt(
                'لنُجهّز مدرستك في بضع خطوات. ابدأ بدعوة فريقك.',
                'Let\'s get your school set up in a few steps. Start by inviting your team.',
              )}
            </p>

            {/* Progress */}
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1 h-2 rounded-full bg-white/20 overflow-hidden max-w-xs">
                <div
                  className="h-full bg-gradient-to-r from-emerald-300 to-emerald-400 transition-all duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-white tabular-nums">
                {completed}/{steps.length} {tt('مكتمل', 'done')}
              </span>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-5">
          {steps.map((step) => {
            const StepIcon = step.icon;
            return (
              <div
                key={step.key}
                className={`group flex items-center gap-3 rounded-xl border p-3 transition-all ${
                  step.done
                    ? 'border-emerald-300/40 bg-emerald-400/10'
                    : 'border-white/15 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="flex-shrink-0">
                  {step.done
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                    : <Circle className="w-5 h-5 text-white/40" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <StepIcon className="w-3.5 h-3.5 text-najdi-100" />
                    <p className="text-sm font-semibold truncate">{step.title}</p>
                  </div>
                  <p className="text-xs text-najdi-100/70 truncate">{step.desc}</p>
                </div>
                {!step.done && (
                  step.href ? (
                    <Link to={step.href}>
                      <Button size="sm" variant="secondary" className="h-7 text-xs gap-1 bg-white text-najdi-900 hover:bg-najdi-50">
                        {step.cta} <ArrowRight className={`w-3 h-3 ${isRTL ? 'rotate-180' : ''}`} />
                      </Button>
                    </Link>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={step.action} className="h-7 text-xs gap-1 bg-white text-najdi-900 hover:bg-najdi-50">
                      {step.cta} <ArrowRight className={`w-3 h-3 ${isRTL ? 'rotate-180' : ''}`} />
                    </Button>
                  )
                )}
              </div>
            );
          })}
        </div>

        {/* Inline invite form */}
        {inviteOpen && (
          <div className="mt-4 rounded-xl bg-white p-4 text-ink shadow-inner">
            <div className="flex items-center gap-2 mb-3">
              <UserPlus className="w-4 h-4 text-najdi-700" />
              <h3 className="text-sm font-bold">{tt('دعوة عضو فريق', 'Invite a team member')}</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <Input
                placeholder={tt('الاسم', 'Full name')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9"
              />
              <Input
                type="email"
                dir="ltr"
                placeholder={tt('البريد الإلكتروني', 'Email address')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9"
              />
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INVITE_ROLES.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{isRTL ? r.ar : r.en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-3 mt-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="w-3 h-3" />
                {tt('ستتم مراجعة الدعوات في الفترة التجريبية.', 'Invitations are reviewed during your trial.')}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setInviteOpen(false)} className="h-8 text-xs">
                  {tt('إلغاء', 'Cancel')}
                </Button>
                <Button size="sm" onClick={submitInvite} disabled={sending} className="h-8 text-xs gap-1.5 bg-najdi-700 hover:bg-najdi-900">
                  {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                  {tt('إرسال الدعوة', 'Send invite')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Footer link to full user management */}
        <div className="mt-4 flex items-center justify-between text-xs text-najdi-100/80">
          <Link to={createPageUrl('UserManagement')} className="inline-flex items-center gap-1 hover:text-white transition-colors font-medium">
            <Users className="w-3.5 h-3.5" />
            {tt('إدارة المستخدمين', 'Manage all users')}
          </Link>
          <button onClick={dismiss} className="hover:text-white transition-colors">
            {tt('تخطّي الإعداد', 'Skip setup')}
          </button>
        </div>
      </div>
    </div>
  );
}
