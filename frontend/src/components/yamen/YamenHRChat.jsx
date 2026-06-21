import React, { useState, useRef, useEffect } from 'react';
import { tenantQuery, fetchData, callApi } from '../../api/supabaseClient';
import { extractAiText } from './yamenUtils';
import { useRole } from '../RoleContext';
import { useTenant } from '../TenantContext';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Bot, Send, Loader2, User, Lock, BarChart3, FileText, AlertCircle, Info } from 'lucide-react';
import { format } from 'date-fns';

async function buildHRContext(isHRMode, userEmail) {
  try {
    const [employees, allLeaves, attendance, iqama, _payroll, leaveBalances, payRuns, gosiRecords, violations, _essRequests] = await Promise.all([
      fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_date').order('created_date', { ascending: false }).limit()),
      fetchData(tenantQuery('leave_requests').select('*').order('created_date', { ascending: false }).limit()),
      fetchData(tenantQuery('employee_attendances').select('*').order('created_date', { ascending: false }).limit()),
      fetchData(tenantQuery('iqama_records').select('*').order()),
      fetchData(tenantQuery('pay_runs').select('*').order('created_date', { ascending: false }).limit()),
      fetchData(tenantQuery('leave_balances').select('*').order()),
      fetchData(tenantQuery('payroll_inputs').select('*').order('created_date', { ascending: false }).limit()),
      fetchData(tenantQuery('gosi_records').select('*').order()).catch(() => []),
      fetchData(tenantQuery('govi_violations').select('*').match({ status: 'open' })).catch(() => []),
      fetchData(tenantQuery('ess_requests').select('*').order('created_date', { ascending: false }).limit()).catch(() => []),
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
    const saudiCount = employees.filter(e => e.is_saudi || e.nationality === 'Saudi').length;
    const activeEmployees = employees.filter(e => e.status === 'active');

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
        saudiCount,
        saudizationPct: activeEmployees.length > 0 ? Math.round(saudiCount / activeEmployees.length * 100) : 0,
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

export default function YamenHRChat({ isRTL, isHRMode }) {
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
  const [showQuickActions, setShowQuickActions] = useState(false);
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
      });

      const responseText = extractAiText(res) || (isRTL ? 'لم يتم استلام رد' : 'No response received');
      setMessages(prev => [...prev, { role: 'assistant', content: responseText, timestamp: new Date(), provider: res?.provider }]);

      // Increment usage counter on tenant
      if (tenant?.id) {
        tenantQuery('tenants').update({
          yamen_ai_used_this_month: (tenant.yamen_ai_used_this_month || 0) + 1,
        }).catch(() => {});
      }

      // Log interaction
      tenantQuery('audit_logs').insert({
        action: 'generate',
        entity_type: 'YamenAI',
        entity_id: 'chat',
        user_email: user?.email || 'unknown',
        user_name: user?.full_name || '',
        user_role: isHRMode ? 'hr' : 'employee',
        notes: `Q: ${text.slice(0, 100)}`,
        timestamp: new Date().toISOString(),
      }).catch(() => {});
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

  return (
    <div className="flex flex-col rounded-2xl border border-[hsl(220,14%,20%)] bg-[hsl(220,18%,10%)] overflow-hidden" style={{ height: 'calc(100vh - 320px)', minHeight: 480 }}>
      {/* Chat Header */}
      <div className={`flex items-center gap-3 px-4 py-3 border-b border-[hsl(220,14%,18%)] ${isHRMode ? 'bg-emerald-900/20' : 'bg-amber-900/20'}`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isHRMode ? 'bg-emerald-900/60 border border-emerald-700' : 'bg-amber-900/60 border border-amber-700'}`}>
          {isHRMode ? <Bot className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4 text-amber-400" />}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-200">YAMEN</p>
          <p className={`text-xs ${isHRMode ? 'text-emerald-400' : 'text-amber-400'}`}>
            {isHRMode
              ? (isRTL ? 'وضع الموارد البشرية — صلاحيات كاملة' : 'HR Mode — Full Intelligence')
              : (isRTL ? 'وضع الموظف — مساعد آمن' : 'Employee Mode — Safe & Restricted')}
          </p>
        </div>
        <div className={`ms-auto w-2 h-2 rounded-full ${isHRMode ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse`} />
      </div>

      {/* Trial mode soft warning */}
      {tenant && !tenant.ai_enabled && (
        <div className="px-4 py-2 bg-amber-900/20 border-b border-amber-700/30 flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <p className="text-xs text-amber-300">
            {isRTL
              ? `وضع تجريبي — ${getAiLimit(tenant) - (tenant.yamen_ai_used_this_month || 0)} طلب متبقي من ${getAiLimit(tenant)}`
              : `Trial mode — ${getAiLimit(tenant) - (tenant.yamen_ai_used_this_month || 0)} of ${getAiLimit(tenant)} requests remaining`}
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? (isRTL ? '' : 'flex-row-reverse') : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${msg.role === 'assistant' ? 'bg-emerald-900/50 border border-emerald-700' : 'bg-slate-700 border border-slate-600'}`}>
              {msg.role === 'assistant' ? <Bot className="w-4 h-4 text-emerald-400" /> : <User className="w-4 h-4 text-slate-300" />}
            </div>
            <div className={`max-w-[78%] flex flex-col gap-1 ${msg.role === 'user' ? (isRTL ? 'items-start' : 'items-end') : 'items-start'}`}>
              <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                msg.role === 'assistant'
                  ? `bg-[hsl(220,18%,15%)] border border-[hsl(220,14%,22%)] text-slate-200 rounded-tl-sm ${msg.error ? 'border-red-700/60' : ''}`
                  : 'bg-emerald-700/25 border border-emerald-700/40 text-emerald-50 rounded-tr-sm'
              }`} dir="auto">
                {msg.content.split(/(\*\*[^*]+\*\*)/g).map((part, idx) => 
                  part.startsWith('**') && part.endsWith('**') 
                    ? <strong key={idx}>{part.slice(2, -2)}</strong>
                    : <span key={idx}>{part}</span>
                )}
              </div>
              <span className="text-xs text-slate-600 px-1">{format(msg.timestamp, 'HH:mm')}</span>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-900/50 border border-emerald-700 flex items-center justify-center mt-0.5">
              <Bot className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="bg-[hsl(220,18%,15%)] border border-[hsl(220,14%,22%)] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs text-slate-400">{isRTL ? 'يامن يفكر...' : 'YAMEN is thinking...'}</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick Actions */}
      {isHRMode && (
        <div className="border-t border-[hsl(220,14%,18%)] bg-[hsl(220,18%,11%)] px-3 py-2">
          <button
            onClick={() => setShowQuickActions(!showQuickActions)}
            className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
          >
            ⚡ {isRTL ? 'إجراءات سريعة' : 'Quick Actions'}
          </button>
          {showQuickActions && (
            <div className="grid grid-cols-3 gap-2 mt-2">
              <button onClick={() => { setInput(isRTL ? 'أعط لي تحليل المخاطر الحالي' : 'Show me current risk analysis'); setShowQuickActions(false); }} className="text-xs bg-emerald-900/40 border border-emerald-700/40 rounded px-2 py-1 hover:bg-emerald-900/60 flex items-center gap-1 text-emerald-300">
                <BarChart3 className="w-3 h-3" /> {isRTL ? 'التحليلات' : 'Analytics'}
              </button>
              <button onClick={() => { setInput(isRTL ? 'أعط توصيات السياسات' : 'Policy recommendations'); setShowQuickActions(false); }} className="text-xs bg-emerald-900/40 border border-emerald-700/40 rounded px-2 py-1 hover:bg-emerald-900/60 flex items-center gap-1 text-emerald-300">
                <AlertCircle className="w-3 h-3" /> {isRTL ? 'السياسات' : 'Policies'}
              </button>
              <button onClick={() => { setInput(isRTL ? 'ساعدني في صياغة خطاب تحذير' : 'Draft a warning letter'); setShowQuickActions(false); }} className="text-xs bg-emerald-900/40 border border-emerald-700/40 rounded px-2 py-1 hover:bg-emerald-900/60 flex items-center gap-1 text-emerald-300">
                <FileText className="w-3 h-3" /> {isRTL ? 'مستندات' : 'Documents'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-[hsl(220,14%,18%)] p-3 bg-[hsl(220,18%,11%)]">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRTL ? 'اسأل يامن...' : 'Ask YAMEN anything...'}
            rows={2}
            className="flex-1 resize-none bg-[hsl(220,16%,16%)] border-[hsl(220,14%,24%)] text-slate-200 placeholder:text-slate-500 focus:border-emerald-600 rounded-xl text-sm"
            dir="auto"
          />
          <Button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="h-10 w-10 p-0 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 flex-shrink-0"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-xs text-slate-600 mt-1.5 text-center">{isRTL ? 'Enter للإرسال • Shift+Enter لسطر جديد' : 'Enter to send • Shift+Enter for new line'}</p>
      </div>
    </div>
  );
}