import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { callApi } from '../lib/supabase';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import {
  Search, Eye, Pause, Play, Trash2, Calendar, Building2,
} from 'lucide-react';

const STATUS_STYLES = {
  active: 'bg-emerald-100 text-emerald-700',
  trial: 'bg-amber-100 text-amber-700',
  suspended: 'bg-red-100 text-red-700',
  pending_approval: 'bg-blue-100 text-blue-700',
  denied: 'bg-slate-100 text-slate-700',
};

export default function Tenants() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTenant, setSelectedTenant] = useState(null);

  const { data: tenantsData, isLoading } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => callApi('/api/admin/tenants', {}, { method: 'GET' }),
  });
  const tenants = tenantsData?.tenants ?? [];

  const filtered = tenants.filter(t => {
    const matchesSearch = !search ||
      t.name_ar?.includes(search) ||
      t.name_en?.toLowerCase().includes(search.toLowerCase()) ||
      t.tenant_code?.toLowerCase().includes(search.toLowerCase()) ||
      t.admin_email?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const toggleSuspend = async (tenant) => {
    const newStatus = tenant.status === 'suspended' ? 'active' : 'suspended';
    try {
      await callApi(`/api/admin/tenants/${tenant.id}`, { status: newStatus });
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
      toast.success(`Tenant ${newStatus}`);
    } catch (e) {
      toast.error(e.message || 'Failed to update');
    }
  };

  const extendTrial = async (tenant) => {
    const currentEnd = tenant.trial_end_date ? new Date(tenant.trial_end_date) : new Date();
    const newEnd = addDays(currentEnd, 14);
    try {
      await callApi(`/api/admin/tenants/${tenant.id}`, {
        trial_end_date: format(newEnd, 'yyyy-MM-dd'),
        status: 'trial',
      });
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
      toast.success('Trial extended by 14 days');
    } catch (e) {
      toast.error(e.message || 'Failed to extend');
    }
  };

  const deleteTenant = async (tenant) => {
    if (!confirm(`Delete ${tenant.name_en || tenant.name_ar}? This cannot be undone.`)) return;
    try {
      await callApi(`/api/admin/tenants/${tenant.id}`, {}, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
      toast.success('Tenant deleted');
    } catch (e) {
      toast.error(e.message || 'Failed to delete');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Tenant Management</h1>
          <p className="text-sm text-slate-500">{tenants.length} total tenants</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search tenants..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-1">
          {['all', 'active', 'trial', 'suspended', 'pending_approval'].map(s => (
            <Button
              key={s}
              variant={statusFilter === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? 'All' : s.replace('_', ' ')}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No tenants found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(tenant => (
            <Card key={tenant.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-slate-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">{tenant.name_en || tenant.name_ar}</p>
                      <p className="text-xs text-slate-500">
                        {tenant.tenant_code} · {tenant.admin_email}
                        {tenant.trial_end_date && ` · Trial ends: ${format(new Date(tenant.trial_end_date), 'MMM d, yyyy')}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge className={STATUS_STYLES[tenant.status] || 'bg-slate-100 text-slate-700'}>
                      {tenant.status}
                    </Badge>

                    <Button variant="ghost" size="sm" onClick={() => setSelectedTenant(tenant)}>
                      <Eye className="w-4 h-4" />
                    </Button>

                    {tenant.status === 'trial' && (
                      <Button variant="ghost" size="sm" onClick={() => extendTrial(tenant)} title="Extend trial">
                        <Calendar className="w-4 h-4" />
                      </Button>
                    )}

                    <Button variant="ghost" size="sm" onClick={() => toggleSuspend(tenant)}>
                      {tenant.status === 'suspended' ? <Play className="w-4 h-4 text-emerald-600" /> : <Pause className="w-4 h-4 text-amber-600" />}
                    </Button>

                    <Button variant="ghost" size="sm" onClick={() => deleteTenant(tenant)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>

                {selectedTenant?.id === tenant.id && (
                  <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-slate-500">Arabic Name</p>
                      <p className="font-medium">{tenant.name_ar || '—'}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Plan</p>
                      <p className="font-medium">{tenant.plan || 'trial'}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Max Students</p>
                      <p className="font-medium">{tenant.max_students || '—'}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Max Employees</p>
                      <p className="font-medium">{tenant.max_employees || '—'}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Created</p>
                      <p className="font-medium">{tenant.created_date ? format(new Date(tenant.created_date), 'MMM d, yyyy') : '—'}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">City</p>
                      <p className="font-medium">{tenant.city || '—'}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">School Type</p>
                      <p className="font-medium">{tenant.school_type || '—'}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Monthly Revenue</p>
                      <p className="font-medium">{tenant.monthly_revenue ? `${tenant.monthly_revenue} SAR` : '—'}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
