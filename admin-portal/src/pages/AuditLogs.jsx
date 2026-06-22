import React, { useState, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { apiGet } from '../lib/supabase';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { format } from 'date-fns';
import { Search, History, RefreshCw } from 'lucide-react';

// Colour-code actions by their verb for fast scanning.
function actionColor(action = '') {
  if (action.includes('delete') || action.includes('suspend')) return 'bg-red-100 text-red-700';
  if (action.includes('convert')) return 'bg-emerald-100 text-emerald-700';
  if (action.includes('create') || action.includes('activate')) return 'bg-blue-100 text-blue-700';
  if (action.includes('deactivate') || action.includes('extend')) return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

export default function AuditLogs() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [targetType, setTargetType] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-audit-log', { search, targetType }],
    queryFn: () => apiGet('/api/admin/audit-log', { search, target_type: targetType, limit: 300 }),
    placeholderData: keepPreviousData,
  });
  const logs = data?.log ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Audit Log</h1>
          <p className="text-sm text-slate-500">Every action taken in the admin portal</p>
        </div>
        <button onClick={() => refetch()} className="text-slate-400 hover:text-slate-600" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search actor, action or target…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="pl-10" />
        </div>
        <select className="h-9 rounded-md border border-slate-200 px-3 text-sm bg-white" value={targetType} onChange={(e) => setTargetType(e.target.value)}>
          <option value="">All targets</option>
          <option value="user">Users</option>
          <option value="tenant">Schools</option>
          <option value="invitation">Invitations</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full" /></div>
      ) : logs.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><History className="w-12 h-12 text-slate-200 mx-auto mb-3" /><p className="text-slate-400">No audit activity yet — actions you take will appear here</p></CardContent></Card>
      ) : (
        <Card className="border-0 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-400 uppercase tracking-wide">
              <tr>{['Time', 'Actor', 'Action', 'Target', 'Details'].map((h) => <th key={h} className="text-left px-4 py-3">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{l.created_at ? format(new Date(l.created_at), 'MMM d, HH:mm') : '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{l.actor_email || '—'}</td>
                  <td className="px-4 py-3"><Badge className={`text-xs ${actionColor(l.action)}`}>{l.action}</Badge></td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {l.target_label || '—'}
                    {l.target_type && <span className="text-slate-300"> · {l.target_type}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400 max-w-xs truncate">{l.metadata && Object.keys(l.metadata).length ? JSON.stringify(l.metadata) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
