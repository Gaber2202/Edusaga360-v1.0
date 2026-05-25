import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase, fetchData } from '../lib/supabase';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { format } from 'date-fns';
import { Search, History } from 'lucide-react';

export default function AuditLogs() {
  const [search, setSearch] = useState('');

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['admin-audit-logs'],
    queryFn: () => fetchData(
      supabase.from('audit_logs').select('*').order('created_date', { ascending: false }).limit(100)
    ),
  });

  const filtered = logs.filter(l => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      l.action?.toLowerCase().includes(s) ||
      l.entity_type?.toLowerCase().includes(s) ||
      l.user_email?.toLowerCase().includes(s) ||
      l.notes?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Audit Logs</h1>
        <p className="text-sm text-slate-500">Cross-tenant activity log</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input placeholder="Search logs..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <History className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No audit logs found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 text-xs text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Time</th>
                <th className="text-left px-4 py-3">Action</th>
                <th className="text-left px-4 py-3">Entity</th>
                <th className="text-left px-4 py-3">User</th>
                <th className="text-left px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(log => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {log.created_date ? format(new Date(log.created_date), 'MMM d, HH:mm') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded">{log.action}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{log.entity_type}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{log.user_email || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">{log.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
