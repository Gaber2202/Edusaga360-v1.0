import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase, fetchData } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { GraduationCap, ClipboardCheck, CreditCard, Bell } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  const { data: students = [] } = useQuery({
    queryKey: ['parent-students', tenantId],
    queryFn: () => fetchData(
      supabase.from('students')
        .select('*')
        .eq('tenant_id', tenantId)
        .in('id', user?.linked_student_ids || [])
    ),
    enabled: !!tenantId && (user?.linked_student_ids?.length > 0),
  });

  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email || '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Welcome, {displayName}</h1>
        <p className="text-sm text-slate-500">Parent Portal Dashboard</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <GraduationCap className="w-8 h-8 text-blue-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-slate-800">{students.length}</p>
            <p className="text-xs text-slate-500">My Children</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <ClipboardCheck className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-slate-800">—</p>
            <p className="text-xs text-slate-500">Attendance Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CreditCard className="w-8 h-8 text-amber-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-slate-800">—</p>
            <p className="text-xs text-slate-500">Outstanding Fees</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Bell className="w-8 h-8 text-purple-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-slate-800">0</p>
            <p className="text-xs text-slate-500">Notifications</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-5">
          <h3 className="font-semibold text-slate-800 mb-4">My Children</h3>
          {students.length === 0 ? (
            <div className="text-center py-8">
              <GraduationCap className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No students linked to your account yet.</p>
              <p className="text-xs text-slate-400 mt-1">Please contact your school administrator.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {students.map(student => (
                <div key={student.id} className="bg-slate-50 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <GraduationCap className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">{student.name_en || student.name_ar}</p>
                      <p className="text-xs text-slate-500">{student.grade} · {student.status}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
