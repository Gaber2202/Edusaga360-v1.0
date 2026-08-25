import React, { useState } from 'react';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '../ui/badge';
import { useTenantFilter } from '../../hooks/useTenantFilter';
import { AlertTriangle, TrendingDown, Sparkles } from 'lucide-react';
import { useJurisdictionFeatures } from '../JurisdictionFeatureContext';
import { NATIONALISATION_FEATURES } from '../../lib/jurisdictionFeatures.js';
import {
  predictChurnRisk,
  detectPayrollAnomalies,
  forecastAbsencePatterns,
  calculateDepartmentHealth,
  assessTrainingNeeds,
  checkSaudiLaborCompliance,
} from './yamenUtils';
import { YamenSection, YamenPanelEmpty } from './YamenShellParts';
import { yamenLayout } from '../../lib/yamenDesign';

export default function YamenInsightsDashboard({ isRTL }) {
  const [activeTab, setActiveTab] = useState('churn');
  const { isFeatureEnabled } = useJurisdictionFeatures();
  const nationalisationEnabled = isFeatureEnabled(NATIONALISATION_FEATURES[0]);
  const { tenantId } = useTenantFilter();

  const { data: employees } = useQuery({
    queryKey: ['yamen-employees', tenantId],
    queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at').order('created_at', { ascending: false }).limit()),
  });

  const { data: attendance } = useQuery({ enabled: false /* employee_attendances table not built */, queryKey: ['yamen-attendance', tenantId], queryFn: () => fetchData(tenantQuery('employee_attendances').select('*').order('created_at', { ascending: false }).limit()), initialData: [] });

  const { data: leaveRequests } = useQuery({
    queryKey: ['yamen-leaves', tenantId],
    queryFn: () => fetchData(tenantQuery('leave_requests').select('*').order('created_at', { ascending: false }).limit()),
  });

  const { data: evaluations } = useQuery({ enabled: false /* performance_evaluations table not built */, queryKey: ['yamen-evaluations', tenantId], queryFn: () => fetchData(tenantQuery('performance_evaluations').select('*').order('created_at', { ascending: false }).limit()).catch(() => []), initialData: [] });

  const { data: payRuns } = useQuery({
    queryKey: ['yamen-payroll', tenantId],
    queryFn: () => fetchData(tenantQuery('pay_runs').select('*').order('created_at', { ascending: false }).limit()).catch(() => []),
  });

  if (!employees || !attendance || !leaveRequests) {
    return (
      <div className={yamenLayout.page}>
        <YamenSection
          title={isRTL ? 'رؤى تنبؤية' : 'Predictive Insights'}
          icon={Sparkles}
        >
          <p className="text-sm text-muted-foreground text-center py-8">
            {isRTL ? 'جاري التحميل...' : 'Loading insights…'}
          </p>
        </YamenSection>
      </div>
    );
  }

  const churnRisks = predictChurnRisk(employees, attendance, leaveRequests, evaluations || []);
  const payrollAnomalies = detectPayrollAnomalies(payRuns || [], employees);
  const absenceForcast = forecastAbsencePatterns(attendance);
  const departmentHealth = calculateDepartmentHealth(employees, attendance, leaveRequests);
  const trainingNeeds = assessTrainingNeeds(employees, evaluations || []);

  const allTabs = [
    { id: 'churn', label: isRTL ? 'مخاطر التسرب' : 'Churn Risk', count: churnRisks.filter(c => c.riskLevel === 'HIGH').length },
    { id: 'payroll', label: isRTL ? 'الشواذ المالية' : 'Payroll Anomalies', count: payrollAnomalies.length },
    { id: 'absence', label: isRTL ? 'توقعات الغياب' : 'Absence Forecast' },
    { id: 'health', label: isRTL ? 'صحة الأقسام' : 'Department Health' },
    { id: 'training', label: isRTL ? 'احتياجات التدريب' : 'Training Needs', count: trainingNeeds.length },
    { id: 'compliance', label: isRTL ? 'الامتثال' : 'Compliance' },
  ];
  const tabs = nationalisationEnabled ? allTabs : allTabs.filter(t => t.id !== 'compliance');

  return (
    <div className={yamenLayout.page}>
      <YamenSection
        title={isRTL ? 'رؤى تنبؤية للموارد البشرية' : 'Predictive HR Insights'}
        subtitle={isRTL ? 'تحليلات التسرب والشواذ وصحة الأقسام' : 'Churn, anomalies, and department health analytics'}
        icon={Sparkles}
      >
        <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap transition border ${
                activeTab === tab.id
                  ? 'bg-najdi-900 text-white border-najdi-900'
                  : 'bg-sand-alt text-muted-foreground border-border/60 hover:bg-white hover:text-ink'
              }`}
            >
              {tab.label}
              {tab.count != null && tab.count > 0 && <span className="ms-1 font-semibold">({tab.count})</span>}
            </button>
          ))}
        </div>

        {activeTab === 'churn' && (
          <div className="space-y-2">
            {churnRisks.filter(c => c.riskLevel === 'HIGH').slice(0, 8).length === 0 ? (
              <YamenPanelEmpty
                icon={TrendingDown}
                title={isRTL ? 'لا توجد مخاطر تسرب عالية' : 'No high churn risks detected'}
              />
            ) : (
              churnRisks.filter(c => c.riskLevel === 'HIGH').slice(0, 8).map(emp => (
                <div key={emp.employeeId} className="p-3 bg-red-50 border border-red-100 rounded-xl text-sm">
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-ink font-medium">{emp.name}</span>
                    <Badge className="bg-red-600 text-white">{emp.churnRisk}%</Badge>
                  </div>
                  <div className="text-red-600 text-xs mt-1">{isRTL ? 'خطر عالي' : 'High Risk'}</div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'payroll' && (
          <div className="space-y-2">
            {payrollAnomalies.length > 0 ? (
              payrollAnomalies.map((anom, i) => (
                <div key={i} className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-sm">
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-ink">{isRTL ? 'الفترة:' : 'Period:'} {anom.period}</span>
                    <Badge className="bg-amber-600 text-white">{anom.variance}% {isRTL ? 'تباين' : 'Variance'}</Badge>
                  </div>
                  <div className="text-amber-700 text-xs mt-1">{isRTL ? 'يتطلب مراجعة' : 'Requires Review'}</div>
                </div>
              ))
            ) : (
              <YamenPanelEmpty
                title={isRTL ? 'لا توجد شواذ' : 'No anomalies detected'}
              />
            )}
          </div>
        )}

        {activeTab === 'absence' && (
          <div className="p-4 bg-sand-alt/60 border border-border/60 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-najdi-800">
              <TrendingDown className="w-4 h-4" />
              <span className="text-sm font-medium">{isRTL ? 'متوسط الغياب:' : 'Avg Absence:'} {absenceForcast.avgAbsencesPerMonth}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              <span>{isRTL ? 'الاتجاه:' : 'Trend:'}</span>
              <span className="ms-2 font-medium text-ink">{absenceForcast.trend}</span>
            </div>
            <div className="text-xs text-ink p-3 bg-white rounded-lg border border-border/50">{absenceForcast.recommendation}</div>
          </div>
        )}

        {activeTab === 'health' && (
          <div className="space-y-2">
            {Object.entries(departmentHealth).slice(0, 8).map(([dept, data]) => (
              <div key={dept} className="p-3 bg-sand-alt/50 border border-border/50 rounded-xl text-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-ink font-medium">{dept}</span>
                    <div className="text-muted-foreground text-xs mt-1">{data.count} {isRTL ? 'موظفين' : 'employees'}</div>
                  </div>
                  <Badge className={data.health === 'GOOD' ? 'bg-emerald-600 text-white' : data.health === 'FAIR' ? 'bg-amber-600 text-white' : 'bg-red-600 text-white'}>
                    {data.health}
                  </Badge>
                </div>
                <div className="text-muted-foreground text-xs mt-1">{isRTL ? 'معدل الغياب:' : 'Absence Rate:'} {data.absenceRate}%</div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'training' && (
          <div className="space-y-2">
            {trainingNeeds.length > 0 ? (
              trainingNeeds.map((need, i) => (
                <div key={i} className="p-3 bg-purple-50 border border-purple-100 rounded-xl text-sm">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <span className="text-ink font-medium">{need.employee}</span>
                      <div className="text-purple-700 text-xs mt-1">{need.area}</div>
                    </div>
                    <Badge className={need.priority === 'HIGH' ? 'bg-red-600 text-white' : 'bg-amber-600 text-white'}>{need.priority}</Badge>
                  </div>
                </div>
              ))
            ) : (
              <YamenPanelEmpty
                title={isRTL ? 'لا توجد احتياجات' : 'No training needs identified'}
              />
            )}
          </div>
        )}

        {nationalisationEnabled && activeTab === 'compliance' && (
          <div className="space-y-2">
            {employees.slice(0, 8).map(emp => {
              const issues = checkSaudiLaborCompliance(emp);
              return issues.length > 0 ? (
                <div key={emp.id} className={`p-3 rounded-xl text-sm border ${
                  issues.some(i => i.severity === 'CRITICAL') ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'
                }`}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-red-500" />
                    <div className="flex-1">
                      <div className="text-ink font-medium">{emp.name_en || emp.name_ar}</div>
                      <div className="space-y-1 mt-1">
                        {issues.map((issue, i) => (
                          <div key={i} className={issue.severity === 'CRITICAL' ? 'text-red-700 text-xs' : 'text-amber-700 text-xs'}>
                            {issue.issue}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null;
            })}
          </div>
        )}
      </YamenSection>
    </div>
  );
}