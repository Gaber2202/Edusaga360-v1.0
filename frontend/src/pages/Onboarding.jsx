import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData, callApi } from '../api/supabaseClient';
import { extractAiText } from '../components/yamen/yamenUtils';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import PageHeader from '../components/ui/PageHeader';
import { Loader2, Users, CheckCircle2 } from 'lucide-react';
import { useTenantFilter } from '../hooks/useTenantFilter';
import OnboardingDetailDialog from '../components/onboarding/OnboardingDetailDialog';

function calcPct(onb) {
  const docs = onb.hr_documents || [];
  const policies = onb.policy_acknowledgements || [];
  const trainings = onb.training_assignments || [];
  const total = docs.length + policies.length + trainings.length;
  if (total === 0) return 0;
  const done = docs.filter(d => d.completed).length
    + policies.filter(p => p.acknowledged).length
    + trainings.filter(t => t.completed).length;
  return Math.round((done / total) * 100);
}

function ProgressRing({ pct, size = 56 }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
        style={{ transform: 'rotate(90deg)', transformOrigin: '50% 50%', fontSize: 11, fontWeight: 700, fill: color }}>
        {pct}%
      </text>
    </svg>
  );
}

export default function OnboardingPage() {
  const { isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  const [selected, setSelected] = useState(null);
  const [aiInsight, setAiInsight] = useState('');
  const [loadingAI, setLoadingAI] = useState(false);

  const { data: onboardings = [], isLoading } = useQuery({
    queryKey: ['onboardings', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('onboardings').select('*').match(tenantFilter(branchFilter())).order('created_at', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const { data: hrPolicies = [] } = useQuery({
    queryKey: ['hr_policies_published', tenantId],
    queryFn: () => fetchData(tenantQuery('hr_policys').select('*').match({ status: 'published' })),
    enabled: hasTenantAccess,
  });

  const filtered = filterByBranch(onboardings);
  const active = filtered.filter(o => o.status === 'in_progress');
  const completed = filtered.filter(o => o.status === 'completed');

  const handleAI = async (onb) => {
    setLoadingAI(true);
    setAiInsight('');
    const docsDone = (onb.hr_documents || []).filter(d => d.completed).length;
    const polsDone = (onb.policy_acknowledgements || []).filter(p => p.acknowledged).length;
    const trainsDone = (onb.training_assignments || []).filter(t => t.completed).length;
    const prompt = `You are Yamen AI, an HR onboarding advisor for a Saudi school group.

Employee Onboarding Status:
- Employee: ${onb.employee_name}
- Job Title: ${onb.job_title || 'N/A'}
- Start Date: ${onb.start_date}
- Overall Completion: ${calcPct(onb)}%
- HR Docs Completed: ${docsDone}/${(onb.hr_documents || []).length}
- Policies Acknowledged: ${polsDone}/${(onb.policy_acknowledgements || []).length}
- Trainings Completed: ${trainsDone}/${(onb.training_assignments || []).length}
- Pending Documents: ${(onb.hr_documents || []).filter(d => !d.completed).map(d => d.en).join(', ') || 'None'}
- Pending Policies: ${(onb.policy_acknowledgements || []).filter(p => !p.acknowledged).map(p => p.en).join(', ') || 'None'}
- Pending Trainings: ${(onb.training_assignments || []).filter(t => !t.completed).map(t => t.en).join(', ') || 'None'}

Provide:
1. Compliance risk assessment (Saudi labor law)
2. Early attrition risk prediction with reasoning
3. Incomplete items priority ranking
4. Recommended actions for HR

Respond in both Arabic and English. Be specific and actionable.`;
    const res = await callApi('/api/ai/invoke-llm', { prompt });
    setAiInsight(extractAiText(res));
    setLoadingAI(false);
  };

  const OnboardingCard = ({ onb }) => {
    const pct = calcPct(onb);
    const docsPending = (onb.hr_documents || []).filter(d => !d.completed).length;
    const polsPending = (onb.policy_acknowledgements || []).filter(p => !p.acknowledged).length;
    const trainsPending = (onb.training_assignments || []).filter(t => !t.completed).length;
    return (
      <Card
        className="bg-white hover:shadow-md transition-shadow cursor-pointer border border-border"
        onClick={() => { setSelected(onb); setAiInsight(''); }}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-ink truncate">{onb.employee_name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{onb.job_title || '-'}</p>
              <p className="text-xs text-muted-foreground">{isRTL ? 'البداية:' : 'Start:'} {onb.start_date}</p>
              <div className="flex gap-2 mt-2 flex-wrap">
                {docsPending > 0 && <Badge className="text-xs bg-red-100 text-red-700">{docsPending} {isRTL ? 'مستندات' : 'docs'}</Badge>}
                {polsPending > 0 && <Badge className="text-xs bg-amber-100 text-amber-700">{polsPending} {isRTL ? 'سياسات' : 'policies'}</Badge>}
                {trainsPending > 0 && <Badge className="text-xs bg-najdi-50 text-najdi-900">{trainsPending} {isRTL ? 'تدريبات' : 'trainings'}</Badge>}
                {pct === 100 && <Badge className="text-xs bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3 me-1" />{isRTL ? 'مكتمل' : 'Complete'}</Badge>}
              </div>
            </div>
            <ProgressRing pct={pct} />
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'إلحاق الموظفين الجدد' : 'Employee Onboarding'}
        subtitle={isRTL ? 'تتبع عملية إلحاق الموظفين الجدد وإتمام المتطلبات' : 'Track new employee onboarding and compliance requirements'}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-white"><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-najdi-700">{active.length}</p>
          <p className="text-xs text-muted-foreground mt-1">{isRTL ? 'قيد الإلحاق' : 'In Progress'}</p>
        </CardContent></Card>
        <Card className="bg-white"><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{completed.length}</p>
          <p className="text-xs text-muted-foreground mt-1">{isRTL ? 'مكتمل' : 'Completed'}</p>
        </CardContent></Card>
        <Card className="bg-white"><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-red-500">{active.filter(o => calcPct(o) < 30).length}</p>
          <p className="text-xs text-muted-foreground mt-1">{isRTL ? 'بطيء الإنجاز' : 'Low Progress'}</p>
        </CardContent></Card>
        <Card className="bg-white"><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-amber-500">
            {active.length > 0 ? Math.round(active.reduce((s, o) => s + calcPct(o), 0) / active.length) : 0}%
          </p>
          <p className="text-xs text-muted-foreground mt-1">{isRTL ? 'متوسط الإتمام' : 'Avg Completion'}</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="active">
        <TabsList className="bg-white border">
          <TabsTrigger value="active">
            <Users className="w-4 h-4 me-2" />
            {isRTL ? 'قيد الإلحاق' : 'In Progress'} ({active.length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            <CheckCircle2 className="w-4 h-4 me-2" />
            {isRTL ? 'مكتمل' : 'Completed'} ({completed.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="active">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : active.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{isRTL ? 'لا توجد عمليات إلحاق نشطة' : 'No active onboardings'}</p>
              <p className="text-xs mt-1">{isRTL ? 'سيتم الإنشاء تلقائياً عند تحويل المتقدم إلى موظف' : 'Auto-created when a candidate is converted to employee'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {active.map(o => <OnboardingCard key={o.id} onb={o} />)}
            </div>
          )}
        </TabsContent>
        <TabsContent value="completed">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {completed.map(o => <OnboardingCard key={o.id} onb={o} />)}
          </div>
        </TabsContent>
      </Tabs>

      {selected && (
        <OnboardingDetailDialog
          onb={selected}
          hrPolicies={hrPolicies}
          aiInsight={aiInsight}
          loadingAI={loadingAI}
          onAI={handleAI}
          onClose={() => { setSelected(null); setAiInsight(''); }}
          onUpdated={(updated) => setSelected(updated)}
        />
      )}
    </div>
  );
}