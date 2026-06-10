import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import { AlertTriangle, Loader2, Trash2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function SystemErrorLog() {
  const { t, isRTL } = useLanguage();
  const { user: _user, userRole } = useRole();
  const queryClient = useQueryClient();
  
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleting, setDeleting] = useState(false);

  const isAdmin = userRole === 'admin';

  const { data: errors = [], isLoading, refetch } = useQuery({
    queryKey: ['systemErrors'],
    queryFn: () => fetchData(tenantQuery('system_errors').select('*').order('created_date', { ascending: false })),
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    enabled: isAdmin,
  });

  // Admin only
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="max-w-md w-full p-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-6 h-6 text-red-600" />
            <h2 className="text-lg font-semibold">{isRTL ? 'غير مصرح' : 'Unauthorized'}</h2>
          </div>
          <p className="text-slate-600">
            {isRTL ? 'هذه الصفحة متاحة للمسؤولين فقط.' : 'This page is available for administrators only.'}
          </p>
        </Card>
      </div>
    );
  }

  const filteredErrors = errors.filter(err => {
    const matchesSearch = 
      err.error_message?.toLowerCase().includes(search.toLowerCase()) ||
      err.user_email?.includes(search) ||
      err.error_id?.includes(search) ||
      err.page?.includes(search);
    
    const matchesSeverity = severityFilter === 'all' || err.severity === severityFilter;
    const matchesStatus = statusFilter === 'all' || err.status === statusFilter;
    
    return matchesSearch && matchesSeverity && matchesStatus;
  });

  const handleDeleteAll = async () => {
    if (!window.confirm(isRTL ? 'حذف جميع السجلات؟' : 'Delete all error logs?')) return;
    
    setDeleting(true);
    try {
      await Promise.all(errors.map(err => tenantQuery('system_errors').delete().eq('id', err.id)));
      queryClient.invalidateQueries({ queryKey: ['systemErrors'] });
      toast.success(isRTL ? 'تم الحذف' : 'Deleted successfully');
    } catch (_error) {
      toast.error(isRTL ? 'خطأ في الحذف' : 'Error deleting');
    } finally {
      setDeleting(false);
    }
  };

  const handleMarkResolved = async (errorId) => {
    try {
      await tenantQuery('system_errors').update({ status: 'resolved' });
      queryClient.invalidateQueries({ queryKey: ['systemErrors'] });
      toast.success(isRTL ? 'تم التحديث' : 'Updated');
    } catch (_error) {
      toast.error(isRTL ? 'خطأ' : 'Error');
    }
  };

  const errorStats = {
    critical: errors.filter(e => e.severity === 'critical').length,
    high: errors.filter(e => e.severity === 'high').length,
    medium: errors.filter(e => e.severity === 'medium').length,
    new: errors.filter(e => e.status === 'new').length,
  };

  const columns = [
    {
      header: isRTL ? 'الخطأ' : 'Error ID',
      cell: (row) => (
        <div>
          <p className="font-mono text-sm">{row.error_id}</p>
          <p className="text-xs text-slate-500 mt-1">{format(new Date(row.timestamp), 'PPpp')}</p>
        </div>
      )
    },
    {
      header: isRTL ? 'الرسالة' : 'Message',
      cell: (row) => (
        <div className="max-w-xs">
          <p className="text-sm truncate">{row.error_message}</p>
          <p className="text-xs text-slate-500 mt-1">{row.page}</p>
        </div>
      )
    },
    {
      header: isRTL ? 'المستخدم' : 'User',
      cell: (row) => (
        <div>
          <p className="text-sm">{row.user_name || '-'}</p>
          <p className="text-xs text-slate-500">{row.user_email}</p>
        </div>
      )
    },
    {
      header: isRTL ? 'الخطورة' : 'Severity',
      cell: (row) => {
        const colors = {
          critical: 'bg-red-100 text-red-800',
          high: 'bg-orange-100 text-orange-800',
          medium: 'bg-yellow-100 text-yellow-800',
          low: 'bg-blue-100 text-blue-800'
        };
        return (
          <span className={`px-2 py-1 rounded text-xs font-semibold ${colors[row.severity] || colors.medium}`}>
            {row.severity}
          </span>
        );
      }
    },
    {
      header: isRTL ? 'الحالة' : 'Status',
      cell: (row) => <StatusBadge status={row.status} />
    },
    {
      header: t('actions'),
      cell: (row) => row.status === 'new' && (
        <Button 
          size="sm" 
          variant="outline"
          onClick={() => handleMarkResolved(row.id)}
        >
          {isRTL ? 'تم الحل' : 'Mark Resolved'}
        </Button>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'سجل أخطاء النظام' : 'System Error Log'}
        subtitle={isRTL ? 'مراقبة وتشخيص مشاكل النظام' : 'Monitor and diagnose system issues'}
      />

      {/* Error Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-slate-500 mb-1">{isRTL ? 'حرجة' : 'Critical'}</div>
          <div className="text-2xl font-bold text-red-600">{errorStats.critical}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500 mb-1">{isRTL ? 'عالية' : 'High'}</div>
          <div className="text-2xl font-bold text-orange-600">{errorStats.high}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500 mb-1">{isRTL ? 'متوسطة' : 'Medium'}</div>
          <div className="text-2xl font-bold text-yellow-600">{errorStats.medium}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500 mb-1">{isRTL ? 'جديدة' : 'New'}</div>
          <div className="text-2xl font-bold text-slate-900">{errorStats.new}</div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder={isRTL ? 'بحث...' : 'Search...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <select 
          value={severityFilter} 
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-3 py-2 border rounded-md bg-white"
        >
          <option value="all">{isRTL ? 'جميع المستويات' : 'All Severity'}</option>
          <option value="critical">{isRTL ? 'حرجة' : 'Critical'}</option>
          <option value="high">{isRTL ? 'عالية' : 'High'}</option>
          <option value="medium">{isRTL ? 'متوسطة' : 'Medium'}</option>
        </select>
        <select 
          value={statusFilter} 
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border rounded-md bg-white"
        >
          <option value="all">{isRTL ? 'جميع الحالات' : 'All Status'}</option>
          <option value="new">{isRTL ? 'جديد' : 'New'}</option>
          <option value="investigating">{isRTL ? 'قيد الفحص' : 'Investigating'}</option>
          <option value="resolved">{isRTL ? 'محل' : 'Resolved'}</option>
        </select>
        <Button
          onClick={() => refetch()}
          variant="outline"
          className="gap-2"
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          {isRTL ? 'تحديث' : 'Refresh'}
        </Button>
        <Button
          onClick={handleDeleteAll}
          variant="destructive"
          className="gap-2"
          disabled={errors.length === 0 || deleting}
        >
          {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
          <Trash2 className="w-4 h-4" />
          {isRTL ? 'حذف الكل' : 'Clear All'}
        </Button>
      </div>

      {/* Error Summary */}
      {filteredErrors.length > 0 && (
        <div className="bg-slate-50 p-4 rounded-lg border">
          <p className="text-sm text-slate-600">
            {isRTL 
              ? `عرض ${filteredErrors.length} من أصل ${errors.length} سجل خطأ`
              : `Showing ${filteredErrors.length} of ${errors.length} error records`}
          </p>
        </div>
      )}

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={filteredErrors}
        loading={isLoading}
        emptyMessage={isRTL ? 'لا توجد أخطاء - النظام يعمل بشكل سليم' : 'No errors - System is healthy'}
      />
    </div>
  );
}