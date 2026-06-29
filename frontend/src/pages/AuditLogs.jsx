import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import PageHeader from '../components/ui/PageHeader';
import { Search, Eye, Download, Filter, X } from 'lucide-react';
import { format, isValid, parseISO, startOfDay, endOfDay } from 'date-fns';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { buildCsv } from '../lib/csv';

const ACTIONS = ['create', 'update', 'delete', 'approve', 'reject', 'post', 'refund', 'login', 'logout', 'mfa_verify', 'export', 'import', 'send', 'generate', 'configure'];
const ENTITY_TYPES = ['Student', 'Invoice', 'Payment', 'Application', 'Vendor', 'PurchaseOrder', 'JournalEntry', 'User', 'RefundRequest', 'Employee', 'Contract', 'FeeStructure', 'IntegrationConnector', 'PayRun', 'LeaveRequest', 'Report', 'Tenant', 'TenantRequest'];

const PAGE_SIZES = [25, 50, 100, 250];
const DEFAULT_PAGE_SIZE = 50;
const FETCH_LIMIT = 1000;

export default function AuditLogs() {
  const { t, isRTL } = useLanguage();
  const { tenantFilter, tenantId } = useTenantFilter();
  const { user: _user, isCreator } = useRole();
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showDetails, setShowDetails] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Super admin (creator) can view all logs; regular users see only their tenant's logs
  const isSuperAdmin = isCreator();

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['auditLogs', tenantId, isSuperAdmin],
    queryFn: async () => {
      const query = isSuperAdmin
        ? tenantQuery('audit_logs').select('*').order('timestamp', { ascending: false }).limit(FETCH_LIMIT)
        : tenantQuery('audit_logs').select('*').match(tenantFilter()).order('timestamp', { ascending: false }).limit(FETCH_LIMIT);
      const { data } = await query;
      return data || [];
    },
    enabled: isSuperAdmin,
  });

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = fromDate ? startOfDay(parseISO(fromDate)) : null;
    const to = toDate ? endOfDay(parseISO(toDate)) : null;

    return logs.filter((log) => {
      if (q) {
        const hay = [
          log.user_email,
          log.user_name,
          log.entity_id,
          log.entity_type,
          log.notes,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (actionFilter !== 'all' && log.action !== actionFilter) return false;
      if (entityFilter !== 'all' && log.entity_type !== entityFilter) return false;

      if (from || to) {
        if (!log.timestamp) return false;
        const ts = parseISO(log.timestamp);
        if (!isValid(ts)) return false;
        if (from && ts < from) return false;
        if (to && ts > to) return false;
      }
      return true;
    });
  }, [logs, search, actionFilter, entityFilter, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  // Audit logs are restricted to the platform owner / creator only — tenant
  // clients must not see this page.
  if (!isSuperAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('auditLogs')} subtitle={isRTL ? 'سجلات التدقيق' : 'Audit Logs'} />
        <Card className="p-10 text-center text-muted-foreground">
          {isRTL ? 'هذه الصفحة متاحة لمالك المنصة فقط.' : 'This page is available to the platform owner only.'}
        </Card>
      </div>
    );
  }

  const resetFilters = () => {
    setSearch('');
    setActionFilter('all');
    setEntityFilter('all');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const hasAnyFilter =
    search !== '' || actionFilter !== 'all' || entityFilter !== 'all' || fromDate !== '' || toDate !== '';

  const exportLogs = () => {
    const headers = ['Timestamp', 'User Name', 'User Email', 'User Role', 'Action', 'Entity Type', 'Entity ID', 'Tenant ID', 'IP Address', 'Notes'];
    const rows = filteredLogs.map((log) => [
      log.timestamp || '',
      log.user_name || '',
      log.user_email || '',
      log.user_role || '',
      log.action || '',
      log.entity_type || '',
      log.entity_id || '',
      log.tenant_id || '',
      log.ip_address || '',
      log.notes || '',
    ]);
    // buildCsv handles RFC 4180 quoting + CSV-injection hardening (leading =/+/-/@
    // get a single-quote prefix). Same escape path as the payroll bank exports.
    const csvContent = buildCsv([headers, ...rows]);
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit_logs_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getActionColor = (action) => {
    const colors = {
      create: 'bg-emerald-100 text-emerald-700',
      update: 'bg-najdi-50 text-najdi-900',
      delete: 'bg-red-100 text-red-700',
      approve: 'bg-green-100 text-green-700',
      reject: 'bg-red-100 text-red-700',
      post: 'bg-purple-100 text-purple-700',
      refund: 'bg-amber-100 text-amber-700',
      login: 'bg-sand-alt text-ink',
      logout: 'bg-sand-alt text-ink',
      export: 'bg-indigo-100 text-indigo-700',
      import: 'bg-cyan-100 text-cyan-700',
      send: 'bg-najdi-50 text-najdi-900',
      generate: 'bg-purple-100 text-purple-700',
      configure: 'bg-amber-100 text-amber-700',
      mfa_verify: 'bg-teal-100 text-teal-700',
    };
    return colors[action] || 'bg-sand-alt text-ink';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('auditLogs')}
        subtitle={isRTL ? 'سجل جميع العمليات والتغييرات' : 'All operations and changes log'}
      >
        <Button variant="outline" onClick={exportLogs} className="gap-2" disabled={filteredLogs.length === 0}>
          <Download className="w-4 h-4" />
          {t('export')}
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
          <Input
            placeholder={isRTL ? 'بحث بالمستخدم، المعرف، أو الملاحظات...' : 'Search by user, entity, or notes...'}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`}
          />
        </div>
        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40 bg-white">
            <Filter className="w-4 h-4 me-2" />
            <SelectValue placeholder={isRTL ? 'الإجراء' : 'Action'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all')}</SelectItem>
            {ACTIONS.map((action) => <SelectItem key={action} value={action}>{t(action) || action}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={entityFilter} onValueChange={(v) => { setEntityFilter(v); setPage(1); }}>
          <SelectTrigger className="w-48 bg-white">
            <SelectValue placeholder={isRTL ? 'نوع الكيان' : 'Entity Type'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all')}</SelectItem>
            {ENTITY_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          type="date"
          aria-label={isRTL ? 'من تاريخ' : 'From date'}
          value={fromDate}
          onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
          className="w-40 bg-white"
          max={toDate || undefined}
        />
        <Input
          type="date"
          aria-label={isRTL ? 'إلى تاريخ' : 'To date'}
          value={toDate}
          onChange={(e) => { setToDate(e.target.value); setPage(1); }}
          className="w-40 bg-white"
          min={fromDate || undefined}
        />
        {hasAnyFilter && (
          <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1 text-muted-foreground">
            <X className="w-4 h-4" />
            {isRTL ? 'مسح' : 'Clear'}
          </Button>
        )}
      </div>

      {/* Logs Table */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b bg-sand text-sm text-muted-foreground">
          <div>
            {isLoading
              ? t('loading')
              : isRTL
                ? `عرض ${filteredLogs.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, filteredLogs.length)} من ${filteredLogs.length}`
                : `Showing ${filteredLogs.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, filteredLogs.length)} of ${filteredLogs.length}`}
          </div>
          <div className="flex items-center gap-2">
            <span>{isRTL ? 'لكل صفحة:' : 'Per page:'}</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="w-20 h-8 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-sand">
              <TableHead>{isRTL ? 'التاريخ والوقت' : 'Timestamp'}</TableHead>
              <TableHead>{isRTL ? 'المستخدم' : 'User'}</TableHead>
              <TableHead>{isRTL ? 'الإجراء' : 'Action'}</TableHead>
              <TableHead>{isRTL ? 'نوع الكيان' : 'Entity Type'}</TableHead>
              <TableHead>{isRTL ? 'المعرف' : 'Entity ID'}</TableHead>
              <TableHead>{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">{t('loading')}</TableCell></TableRow>
            ) : pageLogs.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t('noData')}</TableCell></TableRow>
            ) : (
              pageLogs.map((log) => (
                <TableRow key={log.id} className="hover:bg-sand">
                  <TableCell className="text-sm whitespace-nowrap">
                    {log.timestamp ? format(new Date(log.timestamp), 'dd/MM/yyyy HH:mm:ss') : '-'}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-ink">{log.user_name || '-'}</p>
                      <p className="text-sm text-muted-foreground">{log.user_email || '-'}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getActionColor(log.action)}`}>
                      {t(log.action) || log.action}
                    </span>
                  </TableCell>
                  <TableCell>{log.entity_type || '-'}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {log.entity_id ? `${log.entity_id.substring(0, 8)}...` : '-'}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => setShowDetails(log)} aria-label="View details">
                      <Eye className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {filteredLogs.length > pageSize && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-white">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              {isRTL ? 'السابق' : 'Previous'}
            </Button>
            <span className="text-sm text-muted-foreground">
              {isRTL ? `صفحة ${currentPage} من ${totalPages}` : `Page ${currentPage} of ${totalPages}`}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              {isRTL ? 'التالي' : 'Next'}
            </Button>
          </div>
        )}
      </Card>

      {/* Details Dialog */}
      <Dialog open={!!showDetails} onOpenChange={() => setShowDetails(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'تفاصيل العملية' : 'Audit Details'}</DialogTitle>
          </DialogHeader>
          {showDetails && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-sand rounded-lg">
                  <p className="text-sm text-muted-foreground">{isRTL ? 'التاريخ والوقت' : 'Timestamp'}</p>
                  <p className="font-medium">{showDetails.timestamp ? format(new Date(showDetails.timestamp), 'dd/MM/yyyy HH:mm:ss') : '-'}</p>
                </div>
                <div className="p-3 bg-sand rounded-lg">
                  <p className="text-sm text-muted-foreground">{isRTL ? 'الإجراء' : 'Action'}</p>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getActionColor(showDetails.action)}`}>
                    {t(showDetails.action) || showDetails.action}
                  </span>
                </div>
                <div className="p-3 bg-sand rounded-lg">
                  <p className="text-sm text-muted-foreground">{isRTL ? 'المستخدم' : 'User'}</p>
                  <p className="font-medium">{showDetails.user_name || '-'}</p>
                  <p className="text-sm text-muted-foreground">{showDetails.user_email || '-'}</p>
                </div>
                <div className="p-3 bg-sand rounded-lg">
                  <p className="text-sm text-muted-foreground">{isRTL ? 'الدور' : 'Role'}</p>
                  <p className="font-medium">{t(showDetails.user_role) || showDetails.user_role || '-'}</p>
                </div>
                <div className="p-3 bg-sand rounded-lg col-span-2">
                  <p className="text-sm text-muted-foreground">{isRTL ? 'نوع الكيان' : 'Entity'}</p>
                  <p className="font-medium">{showDetails.entity_type} - <span className="font-mono text-sm">{showDetails.entity_id}</span></p>
                </div>
                {(showDetails.ip_address || showDetails.session_id) && (
                  <div className="p-3 bg-sand rounded-lg col-span-2">
                    <p className="text-sm text-muted-foreground">{isRTL ? 'الجلسة' : 'Session'}</p>
                    <p className="font-mono text-sm">
                      {showDetails.ip_address && <>IP: {showDetails.ip_address}</>}
                      {showDetails.ip_address && showDetails.session_id && ' • '}
                      {showDetails.session_id && <>Session: {showDetails.session_id}</>}
                    </p>
                  </div>
                )}
                {isSuperAdmin && showDetails.tenant_id && (
                  <div className="p-3 bg-sand rounded-lg col-span-2">
                    <p className="text-sm text-muted-foreground">{isRTL ? 'المستأجر' : 'Tenant'}</p>
                    <p className="font-mono text-sm">{showDetails.tenant_id}</p>
                  </div>
                )}
              </div>

              {showDetails.old_values && (
                <div>
                  <h4 className="font-semibold mb-2">{isRTL ? 'القيم السابقة' : 'Old Values'}</h4>
                  <pre className="bg-red-50 p-3 rounded-lg text-sm overflow-x-auto">
                    {JSON.stringify(showDetails.old_values, null, 2)}
                  </pre>
                </div>
              )}

              {showDetails.new_values && (
                <div>
                  <h4 className="font-semibold mb-2">{isRTL ? 'القيم الجديدة' : 'New Values'}</h4>
                  <pre className="bg-emerald-50 p-3 rounded-lg text-sm overflow-x-auto">
                    {JSON.stringify(showDetails.new_values, null, 2)}
                  </pre>
                </div>
              )}

              {showDetails.notes && (
                <div className="p-3 bg-sand rounded-lg">
                  <p className="text-sm text-muted-foreground">{t('notes')}</p>
                  <p>{showDetails.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
