import React, { useState, useRef, useEffect } from 'react';
import { tenantQuery, fetchData, callApi } from '../../api/supabaseClient';
import { extractAiText } from './yamenUtils';
import { useRole } from '../RoleContext';
import { useTenant } from '../TenantContext';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Bot, Send, Loader2, User, Lock, Info } from 'lucide-react';
import { format } from 'date-fns';
import { YamenSection } from './YamenShellParts';
import { yamenLayout } from '../../lib/yamenDesign';

async function buildHRContext(isHRMode, userEmail, nationalisationEnabled = false) {
  try {
    const [employees, allLeaves, attendance, iqama, _payroll, leaveBalances, payRuns, gosiRecords, violations, _essRequests] = await Promise.all([
      fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at').order('created_at', { ascending: false }).limit()),
      fetchData(tenantQuery('leave_requests').select('*').order('created_at', { ascending: false }).limit()),
      fetchData(tenantQuery('employee_attendances').select('*').order('created_at', { ascending: false }).limit()),
      fetchData(tenantQuery('iqama_records').select('*').order('created_at', { ascending: false })),
      fetchData(tenantQuery('pay_runs').select('*').order('created_at', { ascending: false }).limit()),
      fetchData(tenantQuery('leave_balances').select('*').order('created_at', { ascending: false })),
      fetchData(tenantQuery('payroll_inputs').select('*').order('created_at', { ascending: false }).limit()),
      fetchData(tenantQuery('gosi_records').select('*').order('created_at', { ascending: false })).catch(() => []),
      fetchData(tenantQuery('govi_violations').select('*').match({ status: 'open' })).catch(() => []),
      fetchData(tenantQuery('ess_requests').select('*').order('created_at', { ascending: false }).limit()).catch(() => []),
    ]);

    const today = new Date();
    const pendingLeaves = allLeaves.filter(l => l.status === 'pending' || l.status === 'pending_manager' || l.status === 'pending_hr');
    const approvedLeaves = allLeaves.filter(l => l.status === 'approved');
    const recentAbsences = attendance.filter(a => a.status === 'absent').length;
    const expiredIqama = iqama.filter(i => i.expiry_date && new Date(i.expiry_date) < today);
    const expiringIqama = iqama.filter(i => {
      if (!i.expiry_date) return false;
      const d = (new Date(i.expiry_date) - today) / (1000 * 60 * 60 * 24);
      return d >= 0 && d <= 60;
    });
    const lastPayRun = payRuns[0];
    const activeEmployees = employees.filter(e => e.status === 'active');
    const saudiCount = nationalisationEnabled ? employees.filter(e => e.is_saudi).length : 0;

    // Per-employee leave balance summary
    const balanceSummary = leaveBalances.map(b => {
      const emp = employees.find(e => e.id === b.employee_id);
      return {
        employee: emp?.name_en || emp?.name_ar || b.employee_id,
        leaveType: b.leave_type_name_en || b.leave_type_name_ar,
        remaining: b.remaining_days,
        used: b.used_days,
        entitlement: b.entitlement_days,
      };
    });

    // Data coverage check
    const coverage = {
      employees: employees.length > 0,
      leaveBalances: leaveBalances.length > 0,
      attendance: attendance.length > 0,
      payroll: payRuns.length > 0,
      iqama: iqama.length > 0,
      gosi: gosiRecords.length > 0,
      violations: true,
    };

    if (!isHRMode) {
      // Employee self-service: only return data for the current user's employee record
      const myEmp = employees.find(e => e.email === userEmail);
      if (!myEmp) return { _selfMode: true, _noEmployee: true };
      const myBalances = leaveBalances.filter(b => b.employee_id === myEmp.id);
      const myAttendance = attendance.filter(a => a.employee_id === myEmp.id);
      const myLeaves = allLeaves.filter(l => l.employee_id === myEmp.id);
      return {
        _selfMode: true,
        employee: { name: myEmp.name_en || myEmp.name_ar, id: myEmp.employee_id, jobTitle: myEmp.job_title_id, hireDate: myEmp.hire_date, status: myEmp.status },
        leaveBalances: myBalances.map(b => ({ type: b.leave_type_name_en || b.leave_type_name_ar, remaining: b.remaining_days, used: b.used_days, entitlement: b.entitlement_days })),
        recentLeaveRequests: myLeaves.slice(0, 5).map(l => ({ type: l.leave_type_name, status: l.status, from: l.start_date, to: l.end_date, days: l.total_days })),
        recentAttendance: myAttendance.slice(0, 10).map(a => ({ date: a.date, status: a.status, checkIn: a.check_in_time, checkOut: a.check_out_time })),
        lastPayrunMonth: lastPayRun ? `${lastPayRun.period_month}/${lastPayRun.period_year}` : 'N/A',
      };
    }

    return {
      summary: {
        totalEmployees: employees.length,
        activeEmployees: activeEmployees.length,
        ...(nationalisationEnabled ? {
          saudiCount,
          saudizationPct: activeEmployees.length > 0 ? Math.round(saudiCount / activeEmployees.length * 100) : 0,
        } : {}),
        pendingLeaveRequests: pendingLeaves.length,
        approvedLeaveRequests: approvedLeaves.length,
        recentAbsencesLast50: recentAbsences,
        expiredIqamaCount: expiredIqama.length,
        expiringIqama60Days: expiringIqama.length,
        openViolations: violations.length,
        lastPayRunPeriod: lastPayRun ? `${lastPayRun.period_month}/${lastPayRun.period_year} — ${lastPayRun.status}` : 'No payrun found',
        lastPayRunTotalSalary: lastPayRun?.total_net_salary || 0,
        lastPayRunEmployeeCount: lastPayRun?.employee_count || 0,
      },
      leaveBalanceSample: balanceSummary.slice(0, 30),
      pendingLeaveList: pendingLeaves.slice(0, 10).map(l => ({ employee: l.employee_name, type: l.leave_type_name, from: l.start_date, to: l.end_date, days: l.total_days })),
      topAbsentees: attendance.filter(a => a.status === 'absent').slice(0, 5).map(a => ({ employee: a.employee_name, date: a.date })),
      expiredIqamaList: expiredIqama.slice(0, 5).map(i => ({ employee: i.employee_name, expiry: i.expiry_date })),
      coverage,
    };
  } catch(err) {
    return { _error: err.message };
  }
}

const TRIAL_AI_LIMIT = 100; // default monthly limit for trial tenants

function getAiLimit(tenant) {
  if (!tenant) return TRIAL_AI_LIMIT;
  const limit = tenant.yamen_ai_monthly_limit;
  if (!limit || limit === 0) return TRIAL_AI_LIMIT; // treat 0 as "use default"
  return limit;
}

function isAiAllowed(tenant) {
  if (!tenant) return true; // platform owner
  const used = tenant.yamen_ai_used_this_month || 0;
  const limit = getAiLimit(tenant);
  return used < limit;
}

export default function YamenHRChat({ isRTL, isHRMode, nationalisationEnabled = false }) {
  const { user } = useRole();
  const { tenant } = useTenant();
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: isRTL
        ? `مرحباً! أنا يامن، مساعدك الذكي للموارد البشرية في EduSaga.\n\n${isHRMode ? 'يمكنني مساعدتك في تحليل بيانات الموظفين، المخاطر، الامتثال، إعداد التقارير، وأكثر.' : 'يمكنني الإجابة على أسئلتك الخاصة فقط: رصيد الإجازات، سجل الحضور، ملخص الراتب، حالة الطلبات.'}`
        : `Hello! I'm YAMEN, your AI HR Companion for EduSaga.\n\n${isHRMode ? 'I can help you analyze employee data, risks, compliance, draft reports, and more.' : 'I can only answer your personal questions: leave balance, attendance, payslip summary, request status.'}`,
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    // Check AI usage limit before calling
    if (!isAiAllowed(tenant)) {
      const limit = getAiLimit(tenant);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: isRTL
          ? `عذراً، لقد وصلت إلى الحد الشهري لاستخدام يامن AI (${limit} طلب). تواصل مع المسؤول لرفع الحد.`
          : `You've reached your monthly YAMEN AI limit (${limit} requests). Contact your admin to increase the limit.`,
        timestamp: new Date(),
        error: true,
      }]);
      return;
    }

    setMessages(prev => [...prev, { role: 'user', content: text, timestamp: new Date() }]);
    setInput('');
    setLoading(true);

    try {
      // Build conversation history for Claude (last 10 messages, alternating user/assistant)
      const history = messages
        .filter(m => !m.error)
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }));

      // Call backend — Claude handles tool use server-side, no context dump needed
      const res = await callApi('/api/ai/invoke-llm', {
        prompt: text,
        messages: history,
        source: 'chat',
      });

      const responseText = extractAiText(res) || (isRTL ? 'لم يتم استلام رد' : 'No response received');
      setMessages(prev => [...prev, { role: 'assistant', content: responseText, timestamp: new Date(), provider: res?.provider }]);

      // Increment usage counter on tenant (Promise.resolve wraps the
      // Supabase thenable so .catch() is available)
      if (tenant?.id) {
        Promise.resolve(tenantQuery('tenants').update({
          yamen_ai_used_this_month: (tenant.yamen_ai_used_this_month || 0) + 1,
        }).eq('id', tenant.id)).catch(() => {});
      }

      // Log interaction
      Promise.resolve(tenantQuery('audit_logs').insert({
        action: 'generate',
        entity_type: 'YamenAI',
        entity_id: 'chat',
        user_email: user?.email || 'unknown',
        user_name: user?.full_name || '',
        user_role: isHRMode ? 'hr' : 'employee',
        notes: `Q: ${text.slice(0, 100)}`,
        timestamp: new Date().toISOString(),
      })).catch(() => {});
    } catch (e) {
      const errMsg = e?.message || e?.toString() || '';
      let friendlyError;
      if (errMsg.includes('limit') || errMsg.includes('quota') || errMsg.includes('rate')) {
        friendlyError = isRTL ? 'تم تجاوز حد الاستخدام. حاول مرة أخرى بعد قليل.' : 'Usage limit reached. Please try again in a moment.';
      } else if (errMsg.includes('network') || errMsg.includes('fetch') || errMsg.includes('timeout')) {
        friendlyError = isRTL ? 'خطأ في الاتصال بالشبكة. تحقق من الإنترنت وأعد المحاولة.' : 'Network error. Check your connection and try again.';
      } else if (errMsg.includes('model') || errMsg.includes('API')) {
        friendlyError = isRTL ? 'خطأ في خدمة الذكاء الاصطناعي. يرجى المحاولة لاحقاً.' : `AI service error: ${errMsg.slice(0, 80)}`;
      } else {
        friendlyError = isRTL ? `حدث خطأ: ${errMsg.slice(0, 80)}` : `Error: ${errMsg.slice(0, 80) || 'Unknown error. Please try again.'}`;
      }
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: friendlyError,
        timestamp: new Date(),
        error: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const suggested = isHRMode
    ? [
        { id: '1', en: 'Summarize current HR risks', ar: 'لخّص مخاطر الموارد البشرية الحالية' },
        { id: '2', en: 'Who has pending leave approvals?', ar: 'من لديه طلبات إجازة معلقة؟' },
        { id: '3', en: 'Draft a warning letter template', ar: 'صغ قالب خطاب تحذير' },
        { id: '4', en: 'Saudization status overview', ar: 'نظرة عامة على حالة السعودة' },
      ]
    : [
        { id: '1', en: 'What is my leave balance?', ar: 'ما رصيد إجازاتي؟' },
        { id: '2', en: 'Show my recent attendance', ar: 'اعرض حضوري الأخير' },
        { id: '3', en: 'Status of my requests', ar: 'حالة طلباتي' },
      ];

  return (
    <div className={yamenLayout.page}>
      <YamenSection
        title={isRTL ? 'محادثة يامن' : 'YAMEN Chat'}
        subtitle={isHRMode
          ? (isRTL ? 'وضع الموارد البشرية — صلاحيات كاملة' : 'HR Mode — Full Intelligence')
          : (isRTL ? 'وضع الموظف — مساعد آمن' : 'Employee Mode — Safe & Restricted')}
        icon={isHRMode ? Bot : Lock}
        className="overflow-hidden"
      >
        <div className="flex flex-col -m-4 mt-0 rounded-b-xl overflow-hidden border-t border-border/60" style={{ height: 'calc(100vh - 400px)', minHeight: 440 }}>
          {tenant && (
            <div className="px-4 py-2 bg-sand-alt/60 border-b border-border/50 flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                {isRTL
                  ? `${getAiLimit(tenant) - (tenant.yamen_ai_used_this_month || 0)} طلب متبقي من ${getAiLimit(tenant)} هذا الشهر`
                  : `${getAiLimit(tenant) - (tenant.yamen_ai_used_this_month || 0)} of ${getAiLimit(tenant)} requests left this month`}
              </p>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-4 p-4 bg-gradient-to-b from-sand-alt/30 to-white">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? (isRTL ? '' : 'flex-row-reverse') : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${msg.role === 'assistant' ? 'bg-najdi-50 border border-najdi-100 text-najdi-900' : 'bg-sand border border-border text-muted-foreground'}`}>
                  {msg.role === 'assistant' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </div>
                <div className={`max-w-[78%] flex flex-col gap-1 ${msg.role === 'user' ? (isRTL ? 'items-start' : 'items-end') : 'items-start'}`}>
                  <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm ${
                    msg.role === 'assistant'
                      ? `bg-white border border-border/70 text-ink rounded-ss-sm ${msg.error ? 'border-red-300 bg-red-50' : ''}`
                      : 'bg-najdi-900 text-white rounded-se-sm'
                  }`} dir="auto">
                    {msg.content.split(/(\*\*[^*]+\*\*)/g).map((part, idx) =>
                      part.startsWith('**') && part.endsWith('**')
                        ? <strong key={idx}>{part.slice(2, -2)}</strong>
                        : <span key={idx}>{part}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground px-1">{format(msg.timestamp, 'HH:mm')}</span>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-najdi-50 border border-najdi-100 flex items-center justify-center mt-0.5">
                  <Bot className="w-4 h-4 text-najdi-900" />
                </div>
                <div className="bg-white border border-border/70 rounded-2xl rounded-ss-sm px-4 py-3 flex items-center gap-2 shadow-sm">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-najdi-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-najdi-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-najdi-600 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-muted-foreground">{isRTL ? 'يامن يفكر...' : 'YAMEN is thinking...'}</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-border/60 bg-sand-alt/40 px-3 py-2.5 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {suggested.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setInput(isRTL ? p.ar : p.en)}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-border/70 bg-white hover:border-najdi-400 hover:bg-najdi-50 text-ink transition-colors"
                >
                  {isRTL ? p.ar : p.en}
                </button>
              ))}
            </div>
            <div className="flex gap-2 items-end">
              <Textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isRTL ? 'اسأل يامن...' : 'Ask YAMEN anything...'}
                rows={2}
                className="flex-1 resize-none bg-white border-border focus:border-najdi-500 rounded-xl text-sm"
                dir="auto"
              />
              <Button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="h-10 w-10 p-0 rounded-xl bg-najdi-900 hover:bg-ink disabled:opacity-40 flex-shrink-0"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">{isRTL ? 'Enter للإرسال • Shift+Enter لسطر جديد' : 'Enter to send • Shift+Enter for new line'}</p>
          </div>
        </div>
      </YamenSection>
    </div>
  );
}