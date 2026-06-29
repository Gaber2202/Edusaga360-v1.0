import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { useTenantFilter } from '../../hooks/useTenantFilter';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { MessageSquare, Phone, Shield, Users, Clock, Search } from 'lucide-react';
import { format } from 'date-fns';

export default function YamenEmployeeAssistant({ isRTL, isHRView = false }) {
  const [search, setSearch] = useState('');
  const { tenantId } = useTenantFilter();

  const { data: auditLogs = [] } = useQuery({
    queryKey: ['yamenLogs', tenantId],
    queryFn: () => fetchData(tenantQuery('audit_logs').select('*').match({ entity_type: 'YamenAI' }))
  });

  const { data: _employees = [] } = useQuery({
    queryKey: ['employees', tenantId],
    queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at').order())
  });

  const filtered = auditLogs.filter((l) =>
  !search || l.user_email?.includes(search) || l.notes?.includes(search)
  );

  const hrModeCount = auditLogs.filter((l) => l.user_role === 'hr').length;
  const empModeCount = auditLogs.filter((l) => l.user_role === 'employee').length;
  const today = new Date().toDateString();
  const todayLogs = auditLogs.filter((l) => l.timestamp && new Date(l.timestamp).toDateString() === today);

  return (
    <div className="space-y-6">
      {/* WhatsApp Integration Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="w-4 h-4 text-emerald-400" />
            {isRTL ? 'بوابة واتساب المؤمّنة' : 'Secured WhatsApp Gateway'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-sand p-4 rounded-lg border border-najdi-900 space-y-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-900/40 flex items-center justify-center">
                <Shield className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-sm font-medium">{isRTL ? 'ربط آمن بـ OTP' : 'OTP Secure Linking'}</p>
              <p className="text-ink text-xs">{isRTL ? 'يربط الموظف واتساب بمعرف موظفه عبر رمز OTP' : 'Employee links WhatsApp to their ID via OTP verification'}</p>
            </div>
            <div className="bg-sand p-4 rounded-lg border border-najdi-900 space-y-2">
              <div className="w-8 h-8 rounded-lg bg-najdi-900/40 flex items-center justify-center">
                <MessageSquare className="w-4 h-4 text-najdi-500" />
              </div>
              <p className="text-sm font-medium">{isRTL ? 'استفسارات الموظف فقط' : 'Employee-Only Queries'}</p>
              <p className="text-ink text-xs">{isRTL ? 'رصيد الإجازة، الحضور، كشف الراتب، حالة الطلبات' : 'Leave balance, attendance, payslip, request status'}</p>
            </div>
            <div className="bg-sand p-4 rounded-lg border border-najdi-900 space-y-2">
              <div className="w-8 h-8 rounded-lg bg-amber-900/40 flex items-center justify-center">
                <Users className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-sm font-medium">{isRTL ? 'عزل البيانات' : 'Data Isolation'}</p>
              <p className="text-ink text-xs">{isRTL ? 'لا يمكن لأي موظف رؤية بيانات زميله' : 'No cross-employee data access possible'}</p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-amber-900/20 border border-amber-700/50">
            <p className="text-ink text-xs">
              {isRTL ?
              '⚠️ تكامل واتساب يتطلب تفعيل وكيل يامن عبر لوحة إدارة النظام وربط رقم واتساب Business. تواصل مع المسؤول لإتمام الإعداد.' :
              '⚠️ WhatsApp integration requires activating YAMEN agent via system admin panel and linking a WhatsApp Business number. Contact system admin to complete setup.'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Interaction Logs */}
      {isHRView &&
      <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                {isRTL ? 'سجل التفاعلات مع يامن' : 'YAMEN Interaction Logs'}
              </CardTitle>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>{isRTL ? 'HR:' : 'HR:'} <strong className="text-emerald-400">{hrModeCount}</strong></span>
                <span>{isRTL ? 'موظف:' : 'Emp:'} <strong className="text-najdi-500">{empModeCount}</strong></span>
                <span>{isRTL ? 'اليوم:' : 'Today:'} <strong className="text-white">{todayLogs.length}</strong></span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-3 relative">
              <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={isRTL ? 'بحث في السجلات...' : 'Search logs...'} className={isRTL ? 'pr-10' : 'pl-10'} />
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filtered.length === 0 ?
            <p className="text-center text-muted-foreground py-6 text-sm">{isRTL ? 'لا توجد سجلات بعد' : 'No logs yet'}</p> :
            filtered.slice(0, 50).map((log) =>
            <div key={log.id} className="bg-sand p-3 text-sm rounded-lg flex items-start gap-3 border border-najdi-900/50">
                  <Badge className={`text-xs flex-shrink-0 ${log.user_role === 'hr' ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700' : 'bg-najdi-900/40 text-najdi-500 border-najdi-700'}`}>
                    {log.user_role === 'hr' ? 'HR' : isRTL ? 'موظف' : 'Emp'}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-ink truncate">{log.user_email}</p>
                    {log.notes && <p className="text-xs text-muted-foreground truncate mt-0.5">{log.notes}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {log.timestamp ? format(new Date(log.timestamp), 'dd/MM HH:mm') : '-'}
                  </span>
                </div>
            )}
            </div>
          </CardContent>
        </Card>
      }
    </div>);

}