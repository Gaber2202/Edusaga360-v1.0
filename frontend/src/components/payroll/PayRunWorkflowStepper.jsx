import React from 'react';
import { useLanguage } from '../LanguageContext';
import { Check, Clock, XCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function PayRunWorkflowStepper({ payRun }) {
  const { isRTL } = useLanguage();

  const stages = [
    { key: 'draft', label: { ar: 'مسودة', en: 'Draft' } },
    { key: 'calculated', label: { ar: 'تم الإعداد', en: 'Calculated' } },
    { key: 'review', label: { ar: 'قيد المراجعة', en: 'Review' } },
    { key: 'approved', label: { ar: 'معتمد', en: 'Approved' } },
    { key: 'exported', label: { ar: 'تم التصدير', en: 'Exported' } },
    { key: 'completed', label: { ar: 'مكتمل', en: 'Completed' } }
  ];

  const currentStageIndex = stages.findIndex(s => s.key === payRun.workflow_stage || s.key === payRun.status);
  const isAborted = payRun.status === 'aborted' || payRun.workflow_stage === 'aborted';

  const getStageInfo = (stageKey) => {
    const history = payRun.stage_history?.find(h => h.to_stage === stageKey);
    return {
      timestamp: history?.timestamp || (stageKey === 'draft' ? payRun.created_at : null),
      user: history?.done_by || (stageKey === 'draft' ? payRun.created_by : null)
    };
  };

  if (isAborted) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center">
            <XCircle className="w-7 h-7 text-white" />
          </div>
          <div>
            <p className="font-semibold text-red-900">{isRTL ? 'تم إلغاء مسير الرواتب' : 'Pay Run Aborted'}</p>
            <p className="text-sm text-red-700">
              {payRun.aborted_date && format(new Date(payRun.aborted_date), 'dd/MM/yyyy HH:mm')}
              {payRun.aborted_by && ` • ${payRun.aborted_by}`}
            </p>
          </div>
        </div>
        {payRun.abort_reason && (
          <div className="bg-white p-3 rounded border border-red-200">
            <p className="text-sm text-slate-600">{isRTL ? 'السبب:' : 'Reason:'}</p>
            <p className="text-sm mt-1">{payRun.abort_reason}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        {stages.map((stage, index) => {
          const isCompleted = index < currentStageIndex;
          const isCurrent = index === currentStageIndex;
          const stageInfo = getStageInfo(stage.key);

          return (
            <React.Fragment key={stage.key}>
              <div className="flex flex-col items-center gap-2 flex-1">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                  isCompleted ? 'bg-emerald-500 text-white' :
                  isCurrent ? 'bg-blue-500 text-white animate-pulse' :
                  'bg-slate-100 text-slate-400'
                }`}>
                  {isCompleted ? <Check className="w-6 h-6" /> : 
                   isCurrent ? <Clock className="w-6 h-6" /> :
                   index + 1}
                </div>
                <div className="text-center">
                  <p className={`text-sm font-medium ${isCurrent ? 'text-slate-900' : 'text-slate-500'}`}>
                    {isRTL ? stage.label.ar : stage.label.en}
                  </p>
                  {stageInfo.timestamp && (
                    <p className="text-xs text-slate-400 mt-1">
                      {format(new Date(stageInfo.timestamp), 'dd/MM HH:mm')}
                    </p>
                  )}
                  {stageInfo.user && (
                    <p className="text-xs text-slate-400">
                      {stageInfo.user}
                    </p>
                  )}
                </div>
              </div>
              {index < stages.length - 1 && (
                <div className={`h-1 w-full mx-2 rounded transition-all ${
                  isCompleted ? 'bg-emerald-500' : 'bg-slate-200'
                }`} style={{ maxWidth: '60px' }} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Stage History */}
      {payRun.stage_history && payRun.stage_history.length > 0 && (
        <div className="mt-6 pt-6 border-t">
          <p className="text-sm font-medium text-slate-700 mb-3">
            {isRTL ? 'سجل التغييرات' : 'Change History'}
          </p>
          <div className="space-y-2">
            {payRun.stage_history.slice(-3).reverse().map((h, idx) => (
              <div key={idx} className="flex items-start gap-3 text-xs bg-slate-50 p-2 rounded">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                  h.action === 'rollback' ? 'bg-amber-100 text-amber-700' :
                  h.action === 'reject' ? 'bg-red-100 text-red-700' :
                  h.action === 'abort' ? 'bg-red-500 text-white' :
                  'bg-emerald-100 text-emerald-700'
                }`}>
                  {h.action === 'abort' || h.action === 'reject' ? <XCircle className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                </div>
                <div className="flex-1">
                  <p className="text-slate-700">
                    {h.from_stage} → {h.to_stage}
                  </p>
                  <p className="text-slate-500">
                    {h.done_by} • {format(new Date(h.timestamp), 'dd/MM/yyyy HH:mm')}
                  </p>
                  {h.reason && <p className="text-slate-600 mt-1">{h.reason}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}