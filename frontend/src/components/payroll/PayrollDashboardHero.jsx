import React from 'react';
import { Calendar, Landmark, PlayCircle, Wallet } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { formatCurrency } from '../../lib/localization';

/**
 * Payroll hero — 21st Financial Dashboard / score-card layout adapted to EduSaga tokens.
 */
export default function PayrollDashboardHero({
  isRTL,
  tenant,
  periodLabel,
  currentPayRun,
  netAmount,
  statusLabel,
  statusClass,
  onNavigatePayRuns,
}) {
  const schoolName = isRTL ? (tenant?.name_ar || tenant?.name_en) : (tenant?.name_en || tenant?.name_ar);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-najdi-900 via-[#0a5a42] to-najdi-900 text-white shadow-lg">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(200,164,81,0.18),transparent_55%)] pointer-events-none" />
      <div className="absolute -start-10 -top-16 w-48 h-48 rounded-full bg-white/5 blur-2xl pointer-events-none" />

      <div className="relative p-5 md:p-6 flex flex-col gap-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div className="space-y-3 min-w-0">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0">
                <Wallet className="w-6 h-6 text-white/90" />
              </div>
              <div className="min-w-0">
                {schoolName && (
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-white/55 truncate">
                    {schoolName}
                  </p>
                )}
                <div className="flex items-center gap-2 text-white/70 text-sm">
                  <Calendar className="w-4 h-4" />
                  {isRTL ? 'كشف الرواتب الحالي' : 'Current pay run'}
                </div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">{periodLabel}</h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {currentPayRun ? (
                <>
                  <Badge className={`${statusClass} border-0`}>{statusLabel}</Badge>
                  <span className="text-sm text-white/65">
                    {currentPayRun.employee_count || 0}{' '}
                    {isRTL ? 'موظف' : 'employees'}
                  </span>
                  {currentPayRun.journal_entry_id && (
                    <Badge className="bg-emerald-500/20 text-emerald-100 border border-emerald-400/30 gap-1">
                      <Landmark className="w-3 h-3" />
                      {isRTL ? 'مرحّل للأستاذ' : 'Posted to GL'}
                    </Badge>
                  )}
                </>
              ) : (
                <Badge className="bg-white/10 text-white/80 border border-white/15">
                  {isRTL ? 'لم يتم الإنشاء بعد' : 'Not created yet'}
                </Badge>
              )}
            </div>
          </div>

          <div className="lg:text-end space-y-1">
            <p className="text-xs uppercase tracking-wide text-white/55">
              {isRTL ? 'صافي الرواتب' : 'Net payroll'}
            </p>
            <p className="text-3xl md:text-4xl font-bold tabular-nums leading-none">
              {formatCurrency(netAmount || 0, tenant?.localization, isRTL)}
            </p>
            {currentPayRun?.payment_date && (
              <p className="text-sm text-white/55">
                {isRTL ? 'تاريخ الصرف:' : 'Payment date:'}{' '}
                {currentPayRun.payment_date}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5 bg-white/10 text-white border-white/20 hover:bg-white/20 hover:text-white"
            onClick={onNavigatePayRuns}
          >
            <PlayCircle className="w-4 h-4" />
            {currentPayRun
              ? isRTL
                ? 'عرض الكشوفات'
                : 'View pay runs'
              : isRTL
                ? 'إنشاء كشف الرواتب'
                : 'Create pay run'}
          </Button>
          {currentPayRun?.status === 'draft' && (
            <Button
              size="sm"
              className="gap-1.5 bg-white text-najdi-900 hover:bg-white/90"
              onClick={onNavigatePayRuns}
            >
              {isRTL ? 'متابعة المعالجة' : 'Continue processing'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
