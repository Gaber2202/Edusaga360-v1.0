import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData, callApi } from '../api/supabaseClient';
import { extractAiText } from '../components/yamen/yamenUtils';
import { useLanguage } from '../components/LanguageContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import PageHeader from '../components/ui/PageHeader';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Bot, Loader2, Users, DollarSign, TrendingUp, Briefcase } from 'lucide-react';
import { useTenantFilter } from '../hooks/useTenantFilter';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function WorkforcePlanning() {
  const { isRTL } = useLanguage();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  const [activeTab, setActiveTab] = useState('overview');
  const [aiInsight, setAiInsight] = useState('');
  const [loadingAI, setLoadingAI] = useState(false);
  const [hiringScenario, setHiringScenario] = useState({ count: 5, avg_salary: 8000, months: 6 });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', tenantId],
    queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments', tenantId],
    queryFn: () => fetchData(tenantQuery('departments').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const { data: recruitments = [] } = useQuery({
    queryKey: ['recruitments', tenantId],
    queryFn: () => fetchData(tenantQuery('recruitments').select('*').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  // Metrics
  const activeEmployees = employees.filter(e => e.status === 'active');
  const totalPayroll = activeEmployees.reduce((sum, e) => sum + (e.salary || 0), 0);
  const openVacancies = recruitments.filter(r => r.status === 'approved').reduce((sum, r) => sum + (r.number_of_positions || 1), 0);
  const avgSalary = activeEmployees.length > 0 ? Math.round(totalPayroll / activeEmployees.length) : 0;

  // Department breakdown
  const deptData = departments.map(d => ({
    name: d.name_ar,
    count: employees.filter(e => e.department_id === d.id && e.status === 'active').length,
  })).filter(d => d.count > 0);

  // Nationality breakdown
  const saudiCount = activeEmployees.filter(e => e.is_saudi).length;
  const nonSaudiCount = activeEmployees.length - saudiCount;
  const saudizationRate = activeEmployees.length > 0 ? Math.round((saudiCount / activeEmployees.length) * 100) : 0;

  const nationalityData = [
    { name: isRTL ? 'سعودي' : 'Saudi', value: saudiCount },
    { name: isRTL ? 'غير سعودي' : 'Non-Saudi', value: nonSaudiCount },
  ];

  // Employment type breakdown
  const typeData = ['full_time', 'part_time', 'contract'].map(type => ({
    name: type === 'full_time' ? (isRTL ? 'دوام كامل' : 'Full Time') : type === 'part_time' ? (isRTL ? 'دوام جزئي' : 'Part Time') : (isRTL ? 'عقد' : 'Contract'),
    count: activeEmployees.filter(e => e.employment_type === type).length,
  }));

  // Hiring simulation
  const simulatedCost = hiringScenario.count * hiringScenario.avg_salary * hiringScenario.months;
  const newPayroll = totalPayroll + (hiringScenario.count * hiringScenario.avg_salary);

  const handleAI = async () => {
    setLoadingAI(true);
    setAiInsight('');
    const prompt = `You are Yamen AI, an HR workforce planning advisor for a Saudi school.
    Current workforce data:
    - Total active employees: ${activeEmployees.length}
    - Total monthly payroll: ${totalPayroll.toLocaleString()} SAR
    - Average salary: ${avgSalary.toLocaleString()} SAR
    - Saudization rate: ${saudizationRate}%
    - Open vacancies: ${openVacancies}
    - Department breakdown: ${JSON.stringify(deptData)}
    - Employment types: ${JSON.stringify(typeData)}
    
    Provide strategic workforce planning recommendations including:
    1. Saudization risk assessment vs Vision 2030 targets
    2. Payroll sustainability analysis
    3. Hiring prioritization recommendations
    4. Risk indicators
    
    Respond in both Arabic and English. If data is insufficient, clearly state what's missing.`;
    const res = await callApi('/api/ai/invoke-llm', { prompt });
    setAiInsight(extractAiText(res));
    setLoadingAI(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'تخطيط القوى العاملة' : 'Workforce Planning'}
        subtitle={isRTL ? 'تحليل الهيكل الوظيفي وتوقعات التوظيف' : 'Workforce structure analysis & hiring forecasts'}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center"><Users className="w-5 h-5 text-blue-600" /></div>
            <div>
              <p className="text-xs text-slate-500">{isRTL ? 'إجمالي الموظفين' : 'Total Employees'}</p>
              <p className="text-2xl font-bold text-slate-900">{activeEmployees.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center"><DollarSign className="w-5 h-5 text-green-600" /></div>
            <div>
              <p className="text-xs text-slate-500">{isRTL ? 'الرواتب الشهرية' : 'Monthly Payroll'}</p>
              <p className="text-2xl font-bold text-slate-900">{(totalPayroll / 1000).toFixed(0)}K</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-amber-600" /></div>
            <div>
              <p className="text-xs text-slate-500">{isRTL ? 'نسبة السعودة' : 'Saudization'}</p>
              <p className={`text-2xl font-bold ${saudizationRate >= 50 ? 'text-green-600' : 'text-red-600'}`}>{saudizationRate}%</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center"><Briefcase className="w-5 h-5 text-purple-600" /></div>
            <div>
              <p className="text-xs text-slate-500">{isRTL ? 'وظائف شاغرة' : 'Open Vacancies'}</p>
              <p className="text-2xl font-bold text-slate-900">{openVacancies}</p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border">
          <TabsTrigger value="overview">{isRTL ? 'نظرة عامة' : 'Overview'}</TabsTrigger>
          <TabsTrigger value="simulation">{isRTL ? 'محاكاة التوظيف' : 'Hiring Simulation'}</TabsTrigger>
          <TabsTrigger value="ai"><Bot className="w-4 h-4 me-1" />Yamen AI</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-5">
              <h3 className="font-semibold text-slate-900 mb-4">{isRTL ? 'توزيع الموظفين حسب القسم' : 'Employees by Department'}</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={deptData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5">
              <h3 className="font-semibold text-slate-900 mb-4">{isRTL ? 'السعودة' : 'Nationalization'}</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={nationalityData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {nationalityData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5">
              <h3 className="font-semibold text-slate-900 mb-4">{isRTL ? 'نوع التوظيف' : 'Employment Type'}</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={typeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5">
              <h3 className="font-semibold text-slate-900 mb-4">{isRTL ? 'ملخص الرواتب' : 'Payroll Summary'}</h3>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b"><span className="text-slate-500">{isRTL ? 'إجمالي شهري' : 'Monthly Total'}</span><span className="font-bold">{totalPayroll.toLocaleString()} SAR</span></div>
                <div className="flex justify-between py-2 border-b"><span className="text-slate-500">{isRTL ? 'متوسط الراتب' : 'Avg Salary'}</span><span className="font-bold">{avgSalary.toLocaleString()} SAR</span></div>
                <div className="flex justify-between py-2 border-b"><span className="text-slate-500">{isRTL ? 'سنوي تقديري' : 'Annual Estimate'}</span><span className="font-bold">{(totalPayroll * 12).toLocaleString()} SAR</span></div>
                <div className="flex justify-between py-2"><span className="text-slate-500">{isRTL ? 'نسبة السعودة' : 'Saudization Rate'}</span><span className={`font-bold ${saudizationRate >= 50 ? 'text-green-600' : 'text-red-600'}`}>{saudizationRate}%</span></div>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="simulation" className="space-y-4">
          <Card className="p-6">
            <h3 className="font-semibold text-slate-900 mb-4">{isRTL ? 'محاكاة أثر التوظيف على الرواتب' : 'Hiring Impact Simulation'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="space-y-2">
                <Label>{isRTL ? 'عدد الموظفين الجدد' : 'New Hires'}</Label>
                <Input type="number" min="1" value={hiringScenario.count} onChange={e => setHiringScenario(p => ({ ...p, count: parseInt(e.target.value) || 1 }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'متوسط الراتب (SAR)' : 'Avg Salary (SAR)'}</Label>
                <Input type="number" min="0" value={hiringScenario.avg_salary} onChange={e => setHiringScenario(p => ({ ...p, avg_salary: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'عدد الأشهر' : 'Months'}</Label>
                <Input type="number" min="1" value={hiringScenario.months} onChange={e => setHiringScenario(p => ({ ...p, months: parseInt(e.target.value) || 1 }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-xl p-4 text-center">
                <p className="text-xs text-slate-500 mb-1">{isRTL ? 'التكلفة الإجمالية' : 'Total Cost'}</p>
                <p className="text-xl font-bold text-blue-700">{simulatedCost.toLocaleString()}</p>
                <p className="text-xs text-slate-400">SAR</p>
              </div>
              <div className="bg-green-50 rounded-xl p-4 text-center">
                <p className="text-xs text-slate-500 mb-1">{isRTL ? 'الرواتب الجديدة' : 'New Payroll'}</p>
                <p className="text-xl font-bold text-green-700">{newPayroll.toLocaleString()}</p>
                <p className="text-xs text-slate-400">{isRTL ? 'شهرياً' : 'Monthly'}</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-4 text-center">
                <p className="text-xs text-slate-500 mb-1">{isRTL ? 'الزيادة %' : 'Increase %'}</p>
                <p className="text-xl font-bold text-amber-700">{totalPayroll > 0 ? Math.round(((newPayroll - totalPayroll) / totalPayroll) * 100) : 0}%</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <p className="text-xs text-slate-500 mb-1">{isRTL ? 'إجمالي الموظفين' : 'Total Headcount'}</p>
                <p className="text-xl font-bold text-slate-700">{activeEmployees.length + hiringScenario.count}</p>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="ai">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                <Bot className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold">Yamen AI — {isRTL ? 'تخطيط القوى العاملة' : 'Workforce Strategy'}</h3>
                <p className="text-sm text-slate-500">{isRTL ? 'توصيات استراتيجية مبنية على البيانات الفعلية' : 'Data-driven strategic recommendations'}</p>
              </div>
            </div>
            <Button onClick={handleAI} disabled={loadingAI} className="mb-4 gap-2 bg-purple-600 hover:bg-purple-700">
              {loadingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
              {isRTL ? 'توليد تقرير استراتيجي' : 'Generate Strategic Report'}
            </Button>
            {aiInsight && <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 whitespace-pre-wrap text-sm">{aiInsight}</div>}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}