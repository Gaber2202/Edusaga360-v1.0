import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Search, Clock, Shield, DollarSign, TrendingDown } from 'lucide-react';
import { differenceInDays } from 'date-fns';
import { useTenantFilter } from '../../hooks/useTenantFilter';

function ScoreBar({ value, color: _color }) {
  const c = value >= 70 ? 'bg-red-500' : value >= 40 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 bg-slate-700 rounded-full h-1.5 flex-shrink-0">
        <div className={`h-1.5 rounded-full ${c}`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-xs font-medium w-7 text-end ${value >= 70 ? 'text-red-400' : value >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>{value}%</span>
    </div>
  );
}

export default function YamenRiskMonitor({ isRTL }) {
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();

  const { data: employees = [] } = useQuery({ queryKey: ['employees', tenantId], queryFn: () => fetchData(tenantQuery('employees').select('*').match(tenantFilter())), enabled: hasTenantAccess });
  const { data: attendance = [] } = useQuery({ queryKey: ['employeeAttendance', tenantId], queryFn: () => fetchData(tenantQuery('employee_attendances').select('*').match(tenantFilter()).order('date', { ascending: false }).limit(300)), enabled: hasTenantAccess });
  const { data: iqamaRecords = [] } = useQuery({ queryKey: ['iqamaRecords', tenantId], queryFn: () => fetchData(tenantQuery('iqama_records').select('*').match(tenantFilter())), enabled: hasTenantAccess });
  const { data: evaluations = [] } = useQuery({ queryKey: ['performanceEvals', tenantId], queryFn: () => fetchData(tenantQuery('performance_evaluations').select('*').match(tenantFilter())), enabled: hasTenantAccess });
  const { data: leaves = [] } = useQuery({ queryKey: ['leaveRequests', tenantId], queryFn: () => fetchData(tenantQuery('leave_requests').select('*').match(tenantFilter()).order('created_date', { ascending: false }).limit(200)), enabled: hasTenantAccess });

  const today = new Date();

  const scored = useMemo(() => {
    return employees.filter(e => e.status === 'active').map(emp => {
      const empAtt = attendance.filter(a => a.employee_id === emp.id);
      const absences = empAtt.filter(a => a.status === 'absent').length;
      const lates = empAtt.filter(a => a.status === 'late').length;
      const attRisk = Math.min(100, absences * 15 + lates * 5);

      const iqama = iqamaRecords.find(i => i.employee_id === emp.id);
      let compRisk = 0;
      if (!emp.is_saudi) {
        if (!iqama) compRisk = 60;
        else if (iqama.expiry_date) {
          const d = differenceInDays(new Date(iqama.expiry_date), today);
          if (d < 0) compRisk = 100;
          else if (d < 30) compRisk = 80;
          else if (d < 90) compRisk = 40;
        }
      }

      const payRisk = !emp.basic_salary ? 50 : (!emp.iban ? 30 : 0);

      const empEvals = evaluations.filter(e => e.employee_id === emp.id);
      let perfRisk = 0;
      if (empEvals.length > 0) {
        const avg = empEvals.reduce((s, e) => s + (e.overall_score || 0), 0) / empEvals.length;
        if (avg < 40) perfRisk = 80;
        else if (avg < 60) perfRisk = 40;
      }

      // Leave abuse: >3 requests in last 3 months
      const recentLeaves = leaves.filter(l => l.employee_id === emp.id && l.status === 'approved' && l.created_date && differenceInDays(today, new Date(l.created_date)) <= 90);
      const leaveRisk = recentLeaves.length > 3 ? Math.min(80, recentLeaves.length * 15) : 0;

      const overall = Math.round(attRisk * 0.3 + compRisk * 0.25 + payRisk * 0.15 + perfRisk * 0.2 + leaveRisk * 0.1);

      const flags = [];
      if (absences > 2) flags.push(isRTL ? 'غياب متكرر' : 'Chronic Absenteeism');
      if (lates > 3) flags.push(isRTL ? 'تأخر متكرر' : 'Frequent Lateness');
      if (compRisk >= 80) flags.push(isRTL ? 'إقامة منتهية/قريبة' : 'Iqama Expiry Risk');
      if (payRisk >= 50) flags.push(isRTL ? 'راتب غير مُعدّ' : 'Salary Not Setup');
      if (!emp.iban) flags.push(isRTL ? 'لا يوجد IBAN' : 'Missing IBAN');
      if (perfRisk >= 70) flags.push(isRTL ? 'أداء ضعيف' : 'Low Performance');
      if (leaveRisk > 0) flags.push(isRTL ? 'إساءة استخدام الإجازات' : 'Leave Abuse Pattern');

      return { ...emp, attRisk, compRisk, payRisk, perfRisk, leaveRisk, overall, flags, iqama };
    }).sort((a, b) => b.overall - a.overall);
  }, [employees, attendance, iqamaRecords, evaluations, leaves]);

  const filtered = scored.filter(e => {
    const matchSearch = e.name_ar?.includes(search) || e.name_en?.toLowerCase().includes(search.toLowerCase()) || e.employee_id?.includes(search);
    const matchRisk = riskFilter === 'all' || (riskFilter === 'high' && e.overall >= 70) || (riskFilter === 'medium' && e.overall >= 40 && e.overall < 70) || (riskFilter === 'low' && e.overall < 40);
    return matchSearch && matchRisk;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={isRTL ? 'بحث...' : 'Search...'} className={isRTL ? 'pr-10' : 'pl-10'} />
        </div>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isRTL ? 'جميع المستويات' : 'All Levels'}</SelectItem>
            <SelectItem value="high">{isRTL ? 'مخاطر عالية' : 'High Risk'}</SelectItem>
            <SelectItem value="medium">{isRTL ? 'مخاطر متوسطة' : 'Medium Risk'}</SelectItem>
            <SelectItem value="low">{isRTL ? 'مخاطر منخفضة' : 'Low Risk'}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-slate-400">{filtered.length} {isRTL ? 'موظف' : 'employees'}</p>

      <div className="space-y-3">
        {filtered.map(emp => {
          const riskLevel = emp.overall >= 70 ? 'high' : emp.overall >= 40 ? 'medium' : 'low';
          const badgeClass = riskLevel === 'high' ? 'bg-red-900/40 text-red-300 border-red-700' : riskLevel === 'medium' ? 'bg-amber-900/40 text-amber-300 border-amber-700' : 'bg-emerald-900/40 text-emerald-300 border-emerald-700';
          return (
            <Card key={emp.id}>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-white">{isRTL ? emp.name_ar : (emp.name_en || emp.name_ar)}</p>
                      <Badge className={`text-xs border ${badgeClass}`}>
                        {emp.overall}% {riskLevel === 'high' ? (isRTL ? 'عالي' : 'High') : riskLevel === 'medium' ? (isRTL ? 'متوسط' : 'Medium') : (isRTL ? 'منخفض' : 'Low')}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">{emp.employee_id}</p>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <p className="text-slate-400 mb-1 flex items-center gap-1"><Clock className="w-3 h-3" />{isRTL ? 'الحضور' : 'Attendance'}</p>
                        <ScoreBar value={emp.attRisk} />
                      </div>
                      <div>
                        <p className="text-slate-400 mb-1 flex items-center gap-1"><Shield className="w-3 h-3" />{isRTL ? 'الامتثال' : 'Compliance'}</p>
                        <ScoreBar value={emp.compRisk} />
                      </div>
                      <div>
                        <p className="text-slate-400 mb-1 flex items-center gap-1"><DollarSign className="w-3 h-3" />{isRTL ? 'الرواتب' : 'Payroll'}</p>
                        <ScoreBar value={emp.payRisk} />
                      </div>
                      <div>
                        <p className="text-slate-400 mb-1 flex items-center gap-1"><TrendingDown className="w-3 h-3" />{isRTL ? 'الأداء' : 'Performance'}</p>
                        <ScoreBar value={emp.perfRisk} />
                      </div>
                    </div>

                    {emp.flags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {emp.flags.map((f, i) => (
                          <span key={i} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{f}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-slate-400 py-10">{isRTL ? 'لا توجد نتائج' : 'No results found'}</p>
        )}
      </div>
    </div>
  );
}