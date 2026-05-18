/**
 * MonthEndClose — AC#6: Structured digital close checklist targeting Day 7
 * Auto-completes system tasks, tracks manual tasks per assignee
 */
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { useBranch } from '../components/BranchContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { format, startOfMonth, addMonths, subMonths } from 'date-fns';
import { toast } from 'sonner';
import {
  CheckCircle, Circle, Clock, Zap, ChevronLeft, ChevronRight,
  Lock, Unlock, RefreshCw, Download
} from 'lucide-react';

const CLOSE_CHECKLIST = [
  // DAY 1–3
  { id: 'recurring_journals', day: 1, auto: true,   role: 'system',   ar: 'ترحيل القيود الدورية للشهر',           en: 'Post all recurring journals for the month' },
  { id: 'depreciation',       day: 1, auto: true,   role: 'system',   ar: 'تشغيل دفعة الاستهلاك الشهري',         en: 'Run monthly depreciation batch' },
  { id: 'deferred_rev',       day: 2, auto: true,   role: 'system',   ar: 'ترحيل قيد الإيرادات المؤجلة',         en: 'Post deferred revenue recognition journal' },
  { id: 'eosb_provision',     day: 2, auto: true,   role: 'system',   ar: 'ترحيل قيد مخصص نهاية الخدمة',        en: 'Post EOSB provision journal' },
  { id: 'gosi_accrual',       day: 2, auto: true,   role: 'system',   ar: 'ترحيل مستحق التأمينات الاجتماعية',    en: 'Post GOSI accrual if not yet paid' },
  { id: 'payroll_confirm',    day: 3, auto: false,  role: 'accountant', ar: 'تأكيد ترحيل الرواتب بشكل صحيح',     en: 'Confirm payroll posted correctly' },
  { id: 'ap_accruals',        day: 3, auto: true,   role: 'system',   ar: 'استحقاقات الموردين (بضاعة بدون فاتورة)', en: 'Run AP accruals for GRNs without invoices' },
  // DAY 3–5
  { id: 'bank_recon',         day: 4, auto: false,  role: 'accountant', ar: 'إتمام تسوية جميع الحسابات البنكية', en: 'Complete bank reconciliation — all accounts' },
  { id: 'petty_cash_recon',   day: 4, auto: false,  role: 'accountant', ar: 'تسوية الصندوق',                     en: 'Complete petty cash reconciliation' },
  { id: 'ar_aging',           day: 5, auto: true,   role: 'accountant', ar: 'مراجعة أعمار الذمم ومخصص الديون',   en: 'AR aging review + doubtful debt provision' },
  { id: 'prepaid_amort',      day: 5, auto: false,  role: 'accountant', ar: 'مراجعة إطفاء المصروفات المدفوعة مسبقاً', en: 'Review prepaid expense amortization' },
  { id: 'fixed_assets',       day: 5, auto: true,   role: 'system',   ar: 'تأكيد إضافات الأصول الثابتة',         en: 'Confirm fixed asset additions' },
  // DAY 5–7
  { id: 'je_review',          day: 6, auto: false,  role: 'senior_accountant', ar: 'مراجعة جميع قيود الشهر',    en: 'Review all journal entries this month' },
  { id: 'pl_vs_budget',       day: 6, auto: false,  role: 'senior_accountant', ar: 'مراجعة الأرباح والخسائر مقابل الميزانية', en: 'Review P&L vs budget — investigate variances' },
  { id: 'vat_recon',          day: 7, auto: false,  role: 'senior_accountant', ar: 'تسوية حسابات الضريبة',       en: 'VAT ledger reconciliation' },
  // DAY 7–10
  { id: 'fs_review',          day: 8, auto: false,  role: 'finance_manager', ar: 'مراجعة القوائم المالية المبدئية', en: 'Review financial statements draft' },
  { id: 'fm_approval',        day: 9, auto: false,  role: 'finance_manager', ar: 'اعتماد وتوقيع إقفال الفترة',  en: 'Approve and sign off on period close' },
  { id: 'soft_close',         day: 9, auto: false,  role: 'finance_manager', ar: 'إقفال الفترة (قيد جزئي)',     en: 'Soft-close period' },
  { id: 'hard_close',        day: 30, auto: false,  role: 'finance_manager', ar: 'إقفال نهائي للفترة',          en: 'Hard-close period' },
];

const ROLE_COLORS = {
  system: 'bg-purple-100 text-purple-700',
  accountant: 'bg-blue-100 text-blue-700',
  senior_accountant: 'bg-indigo-100 text-indigo-700',
  finance_manager: 'bg-emerald-100 text-emerald-700',
};

export default function MonthEndClose() {
  const { isRTL } = useLanguage();
  const { branchFilter: _branchFilter } = useBranch();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate: _getTenantIdForCreate } = useTenantFilter();

  const [selectedPeriod, setSelectedPeriod] = useState(format(startOfMonth(new Date()), 'yyyy-MM'));
  const [completedItems, setCompletedItems] = useState({});
  const [saving, setSaving] = useState(null);

  const periodStart = selectedPeriod + '-01';
  const periodLabel = format(new Date(periodStart), 'MMMM yyyy');

  const { data: fiscalPeriods = [] } = useQuery({
    queryKey: ['fiscalPeriods', tenantId],
    queryFn: () => tenantQuery('fiscal_periods').select('*').match(tenantFilter({ is_active: true })),
    enabled: hasTenantAccess,
  });

  const currentPeriod = fiscalPeriods.find(p => p.period_start?.startsWith(selectedPeriod));

  // Auto-mark system tasks as done based on period data
  const autoCompletedIds = useMemo(() => {
    // In a real system these would check actual entity states
    // Here we mark system tasks as done if period is open/active
    if (!currentPeriod) return new Set();
    const done = new Set();
    if (currentPeriod.depreciation_posted) done.add('depreciation');
    if (currentPeriod.recurring_posted) done.add('recurring_journals');
    if (currentPeriod.deferred_rev_posted) done.add('deferred_rev');
    if (currentPeriod.eosb_posted) done.add('eosb_provision');
    return done;
  }, [currentPeriod]);

  const isCompleted = (id) => completedItems[id] || autoCompletedIds.has(id);

  const totalItems = CLOSE_CHECKLIST.length;
  const completedCount = CLOSE_CHECKLIST.filter(item => isCompleted(item.id)).length;
  const pct = Math.round((completedCount / totalItems) * 100);

  const handleToggle = async (item) => {
    if (item.auto && autoCompletedIds.has(item.id)) return; // auto items not manually toggleable
    setSaving(item.id);
    const newVal = !completedItems[item.id];
    setCompletedItems(prev => ({ ...prev, [item.id]: newVal }));
    // In production: persist to FiscalPeriod entity
    await new Promise(r => setTimeout(r, 200));
    toast.success(isRTL ? (newVal ? 'تم الإكمال' : 'تم إلغاء الإكمال') : (newVal ? 'Marked complete' : 'Unmarked'));
    setSaving(null);
  };

  const daysGrouped = useMemo(() => {
    const groups = {};
    CLOSE_CHECKLIST.forEach(item => {
      const key = item.day;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }, []);

  const dayRangeLabel = (day) => {
    if (day <= 3) return isRTL ? 'الأيام ١-٣' : 'Days 1–3';
    if (day <= 5) return isRTL ? 'الأيام ٣-٥' : 'Days 3–5';
    if (day <= 7) return isRTL ? 'الأيام ٥-٧' : 'Days 5–7';
    if (day <= 10) return isRTL ? 'الأيام ٧-١٠' : 'Days 7–10';
    return isRTL ? 'يوم ٣٠' : 'Day 30';
  };

  const prevPeriod = () => {
    const d = subMonths(new Date(periodStart), 1);
    setSelectedPeriod(format(d, 'yyyy-MM'));
  };
  const nextPeriod = () => {
    const d = addMonths(new Date(periodStart), 1);
    setSelectedPeriod(format(d, 'yyyy-MM'));
  };

  const statusColor = pct === 100 ? 'text-emerald-600' : pct >= 70 ? 'text-amber-600' : 'text-red-500';

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800">{isRTL ? 'قائمة إقفال الفترة' : 'Month-End Close Checklist'}</h1>
        <p className="text-sm text-slate-500">{isRTL ? 'هدف: إقفال الفترة بحلول اليوم ٧ من الشهر التالي' : 'Target: close by Day 7 of following month'}</p>
      </div>

      {/* Period selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={prevPeriod}><ChevronLeft className="w-4 h-4" /></Button>
            <div className="text-center">
              <p className="font-bold text-lg text-slate-800">{periodLabel}</p>
              <p className={`text-sm font-semibold ${statusColor}`}>{pct}% {isRTL ? 'مكتمل' : 'Complete'}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={nextPeriod}><ChevronRight className="w-4 h-4" /></Button>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>{completedCount}/{totalItems} {isRTL ? 'مهمة' : 'tasks'}</span>
            {currentPeriod && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                currentPeriod.status === 'hard_closed' ? 'bg-red-100 text-red-700' :
                currentPeriod.status === 'soft_closed' ? 'bg-amber-100 text-amber-700' :
                'bg-green-100 text-green-700'
              }`}>
                {currentPeriod.status === 'hard_closed' ? (isRTL ? 'مقفل نهائياً' : 'Hard Closed') :
                 currentPeriod.status === 'soft_closed' ? (isRTL ? 'مقفل جزئياً' : 'Soft Closed') :
                 (isRTL ? 'مفتوح' : 'Open')}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Checklist grouped by day range */}
      {Object.entries(daysGrouped).sort((a, b) => +a[0] - +b[0]).map(([day, items]) => {
        const groupLabel = dayRangeLabel(+day);
        const groupDone = items.every(i => isCompleted(i.id));
        return (
          <div key={day}>
            <div className="flex items-center gap-2 mb-2">
              {groupDone
                ? <CheckCircle className="w-4 h-4 text-emerald-500" />
                : <Clock className="w-4 h-4 text-slate-300" />}
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{groupLabel}</h3>
              {groupDone && <span className="text-xs text-emerald-600 font-medium">{isRTL ? '✓ مكتمل' : '✓ Done'}</span>}
            </div>

            <div className="space-y-2">
              {items.map(item => {
                const done = isCompleted(item.id);
                const isSaving = saving === item.id;
                return (
                  <div key={item.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                      done ? 'bg-green-50/50 border-green-200' : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}>
                    <button onClick={() => handleToggle(item)} disabled={!!isSaving || (item.auto && autoCompletedIds.has(item.id))}
                      className="mt-0.5 flex-shrink-0">
                      {isSaving
                        ? <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
                        : done
                        ? <CheckCircle className="w-5 h-5 text-emerald-500" />
                        : <Circle className="w-5 h-5 text-slate-300" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-medium ${done ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                          {isRTL ? item.ar : item.en}
                        </p>
                        {item.auto && (
                          <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-600">
                            <Zap className="w-2.5 h-2.5" />{isRTL ? 'تلقائي' : 'Auto'}
                          </span>
                        )}
                        <span className={`text-xs px-1.5 py-0.5 rounded-md ${ROLE_COLORS[item.role] || 'bg-slate-100 text-slate-500'}`}>
                          {item.role.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    {!item.auto && (
                      <span className="text-xs text-slate-300 flex-shrink-0">
                        {isRTL ? `يوم ${item.day}` : `Day ${item.day}`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Period lock controls */}
      <Card className="border-slate-300">
        <CardContent className="p-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">{isRTL ? 'إدارة الفترة' : 'Period Management'}</p>
          <div className="flex gap-3 flex-wrap">
            <Button variant="outline" size="sm" className="text-amber-700 border-amber-300 hover:bg-amber-50">
              <Unlock className="w-4 h-4 me-1" />{isRTL ? 'إقفال جزئي' : 'Soft Close'}
            </Button>
            <Button variant="outline" size="sm" className="text-red-700 border-red-300 hover:bg-red-50">
              <Lock className="w-4 h-4 me-1" />{isRTL ? 'إقفال نهائي' : 'Hard Close'}
            </Button>
            <Button variant="outline" size="sm" className="ms-auto">
              <Download className="w-4 h-4 me-1" />{isRTL ? 'تصدير قائمة الإقفال' : 'Export Checklist'}
            </Button>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {isRTL
              ? 'الإقفال الجزئي: قيد جديد للمدير المالي فقط | الإقفال النهائي: لا قيود على الإطلاق'
              : 'Soft Close: Finance Manager posting only | Hard Close: no posting possible'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}