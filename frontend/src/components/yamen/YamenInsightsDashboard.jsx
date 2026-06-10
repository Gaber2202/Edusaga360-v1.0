import React, { useState } from 'react';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '../ui/badge';
import { useTenantFilter } from '../../hooks/useTenantFilter';
import { AlertTriangle, TrendingDown } from 'lucide-react';
import {
  predictChurnRisk,
  detectPayrollAnomalies,
  forecastAbsencePatterns,
  calculateDepartmentHealth,
  assessTrainingNeeds,
  checkSaudiLaborCompliance,
} from './yamenUtils';

export default function YamenInsightsDashboard({ isRTL }) {
  const [activeTab, setActiveTab] = useState('churn');
  const { tenantId } = useTenantFilter();

  const { data: employees } = useQuery({
    queryKey: ['yamen-employees', tenantId],
    queryFn: () => fetchData(tenantQuery('employees').select('*').order('created_date', { ascending: false }).limit()),
  });

  const { data: attendance } = useQuery({
    queryKey: ['yamen-attendance', tenantId],
    queryFn: () => fetchData(tenantQuery('employee_attendances').select('*').order('created_date', { ascending: false }).limit()),
  });

  const { data: leaveRequests } = useQuery({
    queryKey: ['yamen-leaves', tenantId],
    queryFn: () => fetchData(tenantQuery('leave_requests').select('*').order('created_date', { ascending: false }).limit()),
  });

  const { data: evaluations } = useQuery({
    queryKey: ['yamen-evaluations', tenantId],
    queryFn: () => fetchData(tenantQuery('performance_evaluations').select('*').order('created_date', { ascending: false }).limit().catch(() => [])),
  });

  const { data: payRuns } = useQuery({
    queryKey: ['yamen-payroll', tenantId],
    queryFn: () => fetchData(tenantQuery('pay_runs').select('*').order('created_date', { ascending: false }).limit().catch(() => [])),
  });

  if (!employees || !attendance || !leaveRequests) return <div className="text-slate-400 text-sm">{isRTL ? 'جاري التحميل...' : 'Loading...'}</div>;

  const churnRisks = predictChurnRisk(employees, attendance, leaveRequests, evaluations || []);
  const payrollAnomalies = detectPayrollAnomalies(payRuns || [], employees);
  const absenceForcast = forecastAbsencePatterns(attendance);
  const departmentHealth = calculateDepartmentHealth(employees, attendance, leaveRequests);
  const trainingNeeds = assessTrainingNeeds(employees, evaluations || []);

  const tabs = [
    { id: 'churn', label: isRTL ? 'مخاطر التسرب' : 'Churn Risk', count: churnRisks.filter(c => c.riskLevel === 'HIGH').length },
    { id: 'payroll', label: isRTL ? 'الشواذ المالية' : 'Payroll Anomalies', count: payrollAnomalies.length },
    { id: 'absence', label: isRTL ? 'توقعات الغياب' : 'Absence Forecast' },
    { id: 'health', label: isRTL ? 'صحة الأقسام' : 'Department Health' },
    { id: 'training', label: isRTL ? 'احتياجات التدريب' : 'Training Needs', count: trainingNeeds.length },
    { id: 'compliance', label: isRTL ? 'الامتثال' : 'Compliance' },
  ];

  return (
    <div className="space-y-4 p-4 bg-slate-900 rounded-xl border border-slate-700">
      {/* Tab Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap transition ${
              activeTab === tab.id
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {tab.label}
            {tab.count && <span className="ml-1 font-semibold">({tab.count})</span>}
          </button>
        ))}
      </div>

      {/* Churn Risk */}
      {activeTab === 'churn' && (
        <div className="space-y-2">
          {churnRisks.filter(c => c.riskLevel === 'HIGH').slice(0, 5).map(emp => (
            <div key={emp.employeeId} className="p-2 bg-red-900/20 border border-red-700/30 rounded text-xs">
              <div className="flex justify-between items-start">
                <span className="text-slate-200 font-medium">{emp.name}</span>
                <Badge className="bg-red-600">{emp.churnRisk}%</Badge>
              </div>
              <div className="text-red-300 text-xs mt-1">{isRTL ? 'خطر عالي' : 'High Risk'}</div>
            </div>
          ))}
        </div>
      )}

      {/* Payroll Anomalies */}
      {activeTab === 'payroll' && (
        <div className="space-y-2">
          {payrollAnomalies.length > 0 ? (
            payrollAnomalies.map((anom, i) => (
              <div key={i} className="p-2 bg-amber-900/20 border border-amber-700/30 rounded text-xs">
                <div className="flex justify-between items-start">
                  <span className="text-slate-200">{isRTL ? 'الفترة:' : 'Period:'} {anom.period}</span>
                  <Badge className="bg-amber-600">{anom.variance}% {isRTL ? 'تباين' : 'Variance'}</Badge>
                </div>
                <div className="text-amber-300 text-xs mt-1">{isRTL ? 'يتطلب مراجعة' : 'Requires Review'}</div>
              </div>
            ))
          ) : (
            <div className="text-slate-400 text-xs">{isRTL ? 'لا توجد شواذ' : 'No anomalies detected'}</div>
          )}
        </div>
      )}

      {/* Absence Forecast */}
      {activeTab === 'absence' && (
        <div className="p-3 bg-blue-900/20 border border-blue-700/30 rounded space-y-2">
          <div className="flex items-center gap-2 text-blue-300">
            <TrendingDown className="w-4 h-4" />
            <span className="text-sm font-medium">{isRTL ? 'متوسط الغياب:' : 'Avg Absence:'} {absenceForcast.avgAbsencesPerMonth}</span>
          </div>
          <div className="text-xs text-slate-300">
            <span className="text-slate-400">{isRTL ? 'الاتجاه:' : 'Trend:'}</span>
            <span className="ml-2 text-blue-400">{absenceForcast.trend}</span>
          </div>
          <div className="text-xs text-slate-300 p-2 bg-slate-800/50 rounded">{absenceForcast.recommendation}</div>
        </div>
      )}

      {/* Department Health */}
      {activeTab === 'health' && (
        <div className="space-y-2">
          {Object.entries(departmentHealth).slice(0, 5).map(([dept, data]) => (
            <div key={dept} className="p-2 bg-slate-800/50 rounded text-xs">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-slate-200 font-medium">{isRTL ? 'القسم:' : 'Dept:'} {dept}</span>
                  <div className="text-slate-400 text-xs mt-1">{data.count} {isRTL ? 'موظفين' : 'employees'}</div>
                </div>
                <Badge className={data.health === 'GOOD' ? 'bg-emerald-600' : data.health === 'FAIR' ? 'bg-amber-600' : 'bg-red-600'}>
                  {data.health}
                </Badge>
              </div>
              <div className="text-slate-400 text-xs mt-1">{isRTL ? 'معدل الغياب:' : 'Absence Rate:'} {data.absenceRate}%</div>
            </div>
          ))}
        </div>
      )}

      {/* Training Needs */}
      {activeTab === 'training' && (
        <div className="space-y-2">
          {trainingNeeds.length > 0 ? (
            trainingNeeds.map((need, i) => (
              <div key={i} className="p-2 bg-purple-900/20 border border-purple-700/30 rounded text-xs">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <span className="text-slate-200 font-medium">{need.employee}</span>
                    <div className="text-purple-300 text-xs mt-1">{need.area}</div>
                  </div>
                  <Badge className={need.priority === 'HIGH' ? 'bg-red-600' : 'bg-amber-600'}>{need.priority}</Badge>
                </div>
              </div>
            ))
          ) : (
            <div className="text-slate-400 text-xs">{isRTL ? 'لا توجد احتياجات' : 'No training needs identified'}</div>
          )}
        </div>
      )}

      {/* Compliance */}
      {activeTab === 'compliance' && (
        <div className="space-y-2">
          {employees.slice(0, 5).map(emp => {
            const issues = checkSaudiLaborCompliance(emp);
            return issues.length > 0 ? (
              <div key={emp.id} className={`p-2 rounded text-xs border ${
                issues.some(i => i.severity === 'CRITICAL') ? 'bg-red-900/20 border-red-700/30' : 'bg-amber-900/20 border-amber-700/30'
              }`}>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-red-400" />
                  <div className="flex-1">
                    <div className="text-slate-200 font-medium">{emp.name_en || emp.name_ar}</div>
                    <div className="space-y-1 mt-1">
                      {issues.map((issue, i) => (
                        <div key={i} className={issue.severity === 'CRITICAL' ? 'text-red-300' : 'text-amber-300'}>
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
    </div>
  );
}