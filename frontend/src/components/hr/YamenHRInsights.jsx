import React, { useState } from 'react';
import { callApi } from '../../api/supabaseClient';
import { extractAiText } from '../yamen/yamenUtils';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Bot, Loader2 } from 'lucide-react';
import { useJurisdictionFeatures } from '../JurisdictionFeatureContext';
import { NATIONALISATION_FEATURES, SOCIAL_INSURANCE_FEATURES, GOVERNMENT_RELATIONS_FEATURES } from '../../lib/jurisdictionFeatures.js';

/**
 * Reusable Yamen AI insights panel — pass any data context.
 */
export default function YamenHRInsights({ module, data = {}, isRTL }) {
  const { isFeatureEnabled } = useJurisdictionFeatures();
  const nationalisationEnabled = isFeatureEnabled(NATIONALISATION_FEATURES[0]);
  const socialInsuranceEnabled = isFeatureEnabled(SOCIAL_INSURANCE_FEATURES[0]);
  const governmentEnabled = isFeatureEnabled(GOVERNMENT_RELATIONS_FEATURES[0]);
  const socialInsuranceCount = data?.gosiCount ?? 0;
  const socialInsuranceCompliance = data?.gosiCompliance ?? 0;
  const [insight, setInsight] = useState('');
  const [loading, setLoading] = useState(false);

  const modulePrompts = {
    recruitment: `You are Yamen AI, an enterprise HR recruitment advisor for a school group. Analyze only this recruitment data:
      - Total job requisitions: ${data.total || 0}
      - Open positions: ${data.open || 0}
      - Applicants in pipeline: ${data.applicants || 0}
      - Interviewed: ${data.interviewed || 0}
      - Offers extended: ${data.offered || 0}
      - Hired this cycle: ${data.hired || 0}
      - Rejected: ${data.rejected || 0}
      - Avg time-to-fill (days): ${data.avgTimeFill || 'N/A'}
      ${nationalisationEnabled ? `- Saudization impact: ${data.saudizationHires || 0} citizen nationals hired` : ''}      - Salary range used: ${data.salaryRangeMin || 0} – ${data.salaryRangeMax || 0}
      
      Analyze: candidate drop-off stages, offer acceptance rate, ${nationalisationEnabled ? 'nationalisation compliance impact, ' : ''}salary benchmarking, and hiring bottlenecks.
      Flag: incomplete candidate profiles, missing documents, positions open >30 days.
      Suggest: salary ranges, top candidate indicators, hiring probability.
      If data is insufficient, list exactly which data points are missing.
      Respond in Arabic first, then English.`,

    leaves: `You are Yamen AI, an HR advisor. Analyze leave data and detect anomalies:
      - Total requests: ${data.total || 0}
      - Pending: ${data.pending || 0}
      - Approved: ${data.approved || 0}
      - Rejected: ${data.rejected || 0}
      - Leave types breakdown: ${JSON.stringify(data.byType || {})}
      Detect potential leave abuse patterns, forecast year-end liability, and suggest policy improvements. Be specific. Respond in Arabic and English.`,
    
    overtime: `You are Yamen AI. Analyze overtime data for compliance and budget risk:
      - Total overtime requests: ${data.total || 0}
      - Pending approval: ${data.pending || 0}
      - Total hours logged: ${data.hours || 0}
      - Total cost estimate: ${formatCurrency(data.cost || 0, tenant?.localization, isRTL)}
      - Employees with 10+ OT hours this month: ${data.excessive || 0}
      Flag excessive overtime, budget overrun risks, and employees who may be at burnout risk. Arabic and English.`,
    
    attendance: `You are Yamen AI. Analyze employee attendance patterns:
      - Total records: ${data.total || 0}
      - Late arrivals: ${data.late || 0}
      - Absent: ${data.absent || 0}
      - Attendance rate: ${data.rate || 0}%
      - Repeat offenders (3+ lates): ${data.repeatLate || 0}
      Identify abnormal patterns, predict burnout risk, flag departments with issues. Arabic and English.`,
    
    payroll: `You are Yamen AI. Review payroll data for anomalies:
      - Total payroll: ${data.totalPayroll || 0}
      - Average salary: ${data.avgSalary || 0}
      - Pay runs processed: ${data.payRuns || 0}
      - Employees with salary changes: ${data.salaryChanges || 0}
      ${socialInsuranceEnabled ? `- Social insurance registered: ${socialInsuranceCount}` : ''}
      Detect payroll anomalies, unusual salary changes, ${socialInsuranceEnabled ? 'social insurance compliance gaps' : 'payroll compliance gaps'}. Arabic and English.`,

    eos: `You are Yamen AI. Review End of Service data:
      - Employees with EOS calculations pending: ${data.pending || 0}
      - Terminated this year: ${data.terminated || 0}
      - Average EOS liability per employee: ${data.avgEOS || 0}
      - Labor Law compliance issues: ${data.issues || 0}
      Validate EOS compliance, flag legal risks, estimate total EOS liability. Arabic and English.`,

    government: `You are Yamen AI. Review government compliance status:
      ${nationalisationEnabled ? `- Saudization rate: ${data.saudization || 0}%` : ''}
      ${governmentEnabled ? `- Expiring Iqama (60 days): ${data.iqamaExpiring || 0}
      - Qiwa violations: ${data.violations || 0}` : ''}
      ${socialInsuranceEnabled ? `- Social insurance compliance: ${socialInsuranceCompliance}%` : ''}
      Predict ${nationalisationEnabled ? 'compliance risks and nationalisation targets gap' : 'compliance risks'}. Arabic and English.`,

    approvals: `You are Yamen AI. Analyze HR approval workflow performance:
      - Total pending approvals: ${data.pending || 0}
      - Overdue (3+ days): ${data.overdue || 0}
      - Average resolution time: ${data.avgTime || 0} days
      - Approval types: ${JSON.stringify(data.byType || {})}
      Detect bottlenecks, recommend workflow optimizations, flag SLA breaches. Arabic and English.`,
  };

  const handleAnalyze = async () => {
    const prompt = modulePrompts[module] || `Analyze this HR module data and provide insights: ${JSON.stringify(data)}. Respond in Arabic and English.`;
    setLoading(true);
    setInsight('');
    const res = await callApi('/api/ai/invoke-llm', { prompt, source: 'hr' });
    setInsight(extractAiText(res));
    setLoading(false);
  };

  const moduleLabels = {
    recruitment: { ar: 'تحليل التوظيف', en: 'Recruitment Analysis' },
    leaves: { ar: 'تحليل الإجازات', en: 'Leave Analysis' },
    overtime: { ar: 'تحليل الوقت الإضافي', en: 'Overtime Analysis' },
    attendance: { ar: 'تحليل الحضور', en: 'Attendance Analysis' },
    payroll: { ar: 'تحليل الرواتب', en: 'Payroll Analysis' },
    eos: { ar: 'تحليل نهاية الخدمة', en: 'EOS Analysis' },
    government: { ar: 'تحليل الامتثال الحكومي', en: 'Government Compliance Analysis' },
    approvals: { ar: 'تحليل الموافقات', en: 'Approvals Analysis' },
  };

  const label = moduleLabels[module] || { ar: 'تحليل يامن', en: 'Yamen Analysis' };

  return (
    <Card className="border-purple-200">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 text-purple-700">
          <Bot className="w-5 h-5" />
          Yamen AI — {isRTL ? label.ar : label.en}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Button onClick={handleAnalyze} disabled={loading} className="mb-4 bg-purple-600 hover:bg-purple-700 gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
          {isRTL ? 'تحليل البيانات' : 'Analyze Data'}
        </Button>
        {insight && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 whitespace-pre-wrap text-sm text-ink leading-relaxed">
            {insight}
          </div>
        )}
      </CardContent>
    </Card>
  );
}