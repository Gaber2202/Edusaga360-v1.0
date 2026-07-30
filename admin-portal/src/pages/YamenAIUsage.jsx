import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Brain, Coins, Hash, Layers } from 'lucide-react';

const now = new Date();
const CURRENT = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const LAST = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const LAST_PERIOD = `${LAST.getFullYear()}-${String(LAST.getMonth() + 1).padStart(2, '0')}`;

function formatUsd(n) {
  if (n == null) return '$0.0000';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4 }).format(n);
}

function StatCard({ title, value, sub, icon: Icon, color }) {
  const colors = {
    blue: 'bg-najdi-50 text-najdi-700',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
  };
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5 flex items-start gap-4">
        <div className={`p-3 rounded-xl ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-ink mt-0.5">{value ?? '—'}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function BreakdownTable({ title, rows }) {
  if (!rows?.length) return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3"><CardTitle className="text-base font-semibold text-ink">{title}</CardTitle></CardHeader>
      <CardContent className="p-5"><p className="text-sm text-muted-foreground">No usage for this period.</p></CardContent>
    </Card>
  );
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3"><CardTitle className="text-base font-semibold text-ink">{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        <table className="w-full">
          <thead className="border-b border-border">
            <tr>
              {['Name', 'Requests', 'Input Tokens', 'Output Tokens', 'Total Tokens', 'Cost'].map(h => (
                <th key={h} className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((r, i) => (
              <tr key={`${r.name}-${i}`} className="hover:bg-sand">
                <td className="px-5 py-3 text-sm font-medium text-ink capitalize">{r.name ?? '—'}</td>
                <td className="px-5 py-3 text-sm text-muted-foreground">{r.requests?.toLocaleString()}</td>
                <td className="px-5 py-3 text-sm text-muted-foreground">{r.input_tokens?.toLocaleString()}</td>
                <td className="px-5 py-3 text-sm text-muted-foreground">{r.output_tokens?.toLocaleString()}</td>
                <td className="px-5 py-3 text-sm text-muted-foreground">{r.total_tokens?.toLocaleString()}</td>
                <td className="px-5 py-3 text-sm font-medium text-emerald-600">{formatUsd(r.cost_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export default function YamenAIUsage() {
  const [period, setPeriod] = useState(CURRENT);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-ai-usage', period],
    queryFn: () => apiGet('/api/admin/ai-usage', { period }),
  });

  const summary = data?.summary || { requests: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0, cost_usd: 0 };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Yamen AI Usage & Cost</h1>
          <p className="text-sm text-muted-foreground mt-1">Token consumption and estimated spend across all schools</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CURRENT}>This month</SelectItem>
            <SelectItem value={LAST_PERIOD}>Last month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading usage…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Total Requests" value={summary.requests} sub={`${summary.total_tokens?.toLocaleString()} tokens`} icon={Hash} color="blue" />
            <StatCard title="Input Tokens" value={summary.input_tokens?.toLocaleString()} icon={Layers} color="amber" />
            <StatCard title="Output Tokens" value={summary.output_tokens?.toLocaleString()} icon={Brain} color="purple" />
            <StatCard title="Estimated Cost" value={formatUsd(summary.cost_usd)} sub="USD" icon={Coins} color="emerald" />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <BreakdownTable title="By Source / Module" rows={data?.by_source} />
            <BreakdownTable title="By Provider" rows={data?.by_provider} />
          </div>

          <BreakdownTable title="By Tenant" rows={data?.by_tenant} />

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base font-semibold text-ink">Recent Calls</CardTitle></CardHeader>
            <CardContent className="p-0">
              {(data?.recent?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground p-5">No calls recorded for this period.</p>
              ) : (
                <table className="w-full">
                  <thead className="border-b border-border">
                    <tr>
                      {['Time', 'Tenant', 'Provider', 'Model', 'Source', 'Tokens', 'Cost'].map(h => (
                        <th key={h} className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.recent.map((r) => (
                      <tr key={r.id} className="hover:bg-sand">
                        <td className="px-5 py-3 text-sm text-muted-foreground">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                        <td className="px-5 py-3 text-sm text-muted-foreground font-mono text-xs">{r.tenant_id?.slice(0, 8)}…</td>
                        <td className="px-5 py-3 text-sm text-muted-foreground capitalize">{r.provider ?? '—'}</td>
                        <td className="px-5 py-3 text-sm text-muted-foreground">{r.model ?? '—'}</td>
                        <td className="px-5 py-3"><Badge variant="outline" className="text-xs capitalize">{r.source ?? 'unknown'}</Badge></td>
                        <td className="px-5 py-3 text-sm text-muted-foreground">{r.total_tokens?.toLocaleString()}</td>
                        <td className="px-5 py-3 text-sm font-medium text-emerald-600">{formatUsd(r.cost_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
