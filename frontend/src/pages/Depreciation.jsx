import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatCard from '../components/ui/StatCard';
import { Play, FileText, TrendingDown, AlertCircle, CheckCircle, Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { logAuditEvent } from '../components/AuditService';
import DepreciationScheduler from '../components/depreciation/DepreciationScheduler';
import AssetLifecycleTracker from '../components/depreciation/AssetLifecycleTracker';
import DepreciationReport from '../components/depreciation/DepreciationReport';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { createJournalEntry } from '../api/journalEntry';

export default function Depreciation() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();

  const [activeTab, setActiveTab] = useState('schedules');
  const [showRunDialog, setShowRunDialog] = useState(false);
  const [running, setRunning] = useState(false);
  const [runPeriod, setRunPeriod] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedRun, setSelectedRun] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);

  const { data: assets = [], isLoading: loadingAssets } = useQuery({
    queryKey: ['assets', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('fixed_assets').select('*').match(tenantFilter(branchFilter({ status: 'active' })))),
    enabled: hasTenantAccess,
  });

  const { data: depRuns = [], isLoading: loadingRuns } = useQuery({
    queryKey: ['depreciationRuns', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('asset_depreciations').select('*').match(tenantFilter(branchFilter()), '-created_date')),
    enabled: hasTenantAccess,
  });

  const filteredAssets = filterByBranch(assets);
  const filteredRuns = filterByBranch(depRuns);

  // Calculate stats
  const totalAssetValue = filteredAssets.reduce((sum, a) => sum + (a.acquisition_cost || 0), 0);
  const totalAccDep = filteredAssets.reduce((sum, a) => sum + (a.accumulated_depreciation || 0), 0);
  const totalNBV = totalAssetValue - totalAccDep;
  const completedRuns = filteredRuns.filter(r => r.status === 'posted').length;

  // Calculate depreciation schedule for an asset
  const calculateMonthlyDepreciation = (asset) => {
    if (!asset.acquisition_cost || !asset.useful_life_years) return 0;
    
    const depreciableAmount = asset.acquisition_cost - (asset.salvage_value || 0);
    const monthlyRate = asset.depreciation_rate / 12;
    
    if (asset.depreciation_method === 'straight_line') {
      return depreciableAmount / (asset.useful_life_years * 12);
    } else {
      // Declining balance
      const nbv = asset.net_book_value || asset.acquisition_cost;
      return nbv * (monthlyRate / 100);
    }
  };

  // Run monthly depreciation
  const handleRunDepreciation = async () => {
    setRunning(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const [year, month] = runPeriod.split('-');
      const periodDate = new Date(parseInt(year), parseInt(month) - 1, 1);

      // Check if run already exists for this period
      const existingRun = depRuns.find(r => r.period === runPeriod && r.branch_id === selectedBranchId);
      if (existingRun) {
        toast.error(isRTL ? 'تم تشغيل الإهلاك لهذه الفترة مسبقاً' : 'Depreciation already run for this period');
        setRunning(false);
        return;
      }

      // Calculate depreciation for each asset
      const depreciationEntries = [];
      let totalDepAmount = 0;

      for (const asset of filteredAssets) {
        const monthlyDep = calculateMonthlyDepreciation(asset);
        if (monthlyDep > 0) {
          depreciationEntries.push({
            asset_id: asset.id,
            asset_code: asset.asset_code,
            asset_name: asset.name_ar,
            depreciation_amount: monthlyDep
          });
          totalDepAmount += monthlyDep;

          // Update asset accumulated depreciation
          await tenantQuery('fixed_assets').update({
            accumulated_depreciation: (asset.accumulated_depreciation || 0) + monthlyDep,
            net_book_value: (asset.net_book_value || asset.acquisition_cost) - monthlyDep
          });
        }
      }

      // Create depreciation run record
      const tid = getTenantIdForCreate();
      const depRun = await tenantQuery('asset_depreciations').insert({
        ...(tid && { tenant_id: tid }),
        period: runPeriod,
        period_date: format(periodDate, 'yyyy-MM-dd'),
        branch_id: selectedBranchId,
        total_depreciation: totalDepAmount,
        asset_count: depreciationEntries.length,
        entries: depreciationEntries,
        status: 'completed',
        run_by: user?.email,
        run_date: format(new Date(), 'yyyy-MM-dd')
      });

      // Create journal entry for depreciation
      const journalLines = [
        {
          line_number: 1,
          account_id: 'SYSTEM_DEP_EXPENSE', // Placeholder - should link to actual account
          description: isRTL ? `إهلاك ${runPeriod}` : `Depreciation ${runPeriod}`,
          debit: totalDepAmount,
          credit: 0
        },
        {
          line_number: 2,
          account_id: 'SYSTEM_ACC_DEP', // Placeholder - should link to actual account
          description: isRTL ? `إهلاك متراكم ${runPeriod}` : `Accumulated Depreciation ${runPeriod}`,
          debit: 0,
          credit: totalDepAmount
        }
      ];

      const journalEntry = await createJournalEntry({
        journal_number: `DEP-${Date.now()}`,
        journal_type: 'depreciation',
        date: format(new Date(), 'yyyy-MM-dd'),
        description: isRTL ? `إهلاك الأصول - ${runPeriod}` : `Asset Depreciation - ${runPeriod}`,
        reference: `DEP-RUN-${depRun.id}`,
        branch_id: selectedBranchId,
        lines: journalLines,
        source_document_type: 'DepreciationEntry',
        source_document_id: depRun.id,
        requested_status: 'posted',
      });

      // Update depreciation run with journal entry reference
      await tenantQuery('asset_depreciations').update({
        journal_entry_id: journalEntry.id,
        status: 'posted'
      });

      await logAuditEvent({
        action: 'RUN_DEPRECIATION',
        entityType: 'AssetDepreciation',
        entityId: depRun.id,
        newValues: { period: runPeriod, total: totalDepAmount }
      });

      queryClient.invalidateQueries({ queryKey: ['depreciationRuns'] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      setShowRunDialog(false);
      toast.success(isRTL ? 'تم تشغيل الإهلاك بنجاح' : 'Depreciation run completed successfully');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setRunning(false);
    }
  };

  // Export depreciation report
  const exportReport = (run) => {
    const headers = ['Asset Code', 'Asset Name', 'Depreciation Amount'];
    const rows = run.entries?.map(e => [e.asset_code, e.asset_name, e.depreciation_amount]) || [];
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `depreciation_${run.period}.csv`;
    link.click();
  };

  const scheduleColumns = [
    { header: isRTL ? 'رمز الأصل' : 'Asset Code', cell: (row) => <span className="font-mono text-sm">{row.asset_code}</span> },
    { header: isRTL ? 'الأصل' : 'Asset', accessorKey: 'name_ar' },
    { header: isRTL ? 'القيمة الأصلية' : 'Original Cost', cell: (row) => `${row.acquisition_cost?.toLocaleString()} ${t('sar')}` },
    { header: isRTL ? 'الإهلاك المتراكم' : 'Acc. Depreciation', cell: (row) => <span className="text-red-600">{(row.accumulated_depreciation || 0).toLocaleString()} {t('sar')}</span> },
    { header: isRTL ? 'صافي القيمة' : 'NBV', cell: (row) => <span className="font-semibold">{(row.net_book_value || row.acquisition_cost)?.toLocaleString()} {t('sar')}</span> },
    { header: isRTL ? 'الإهلاك الشهري' : 'Monthly Dep.', cell: (row) => <span className="text-orange-600">{calculateMonthlyDepreciation(row).toFixed(2)} {t('sar')}</span> }
  ];

  const runsColumns = [
    { header: isRTL ? 'الفترة' : 'Period', accessorKey: 'period' },
    { header: isRTL ? 'التاريخ' : 'Date', cell: (row) => format(new Date(row.run_date), 'dd/MM/yyyy') },
    { header: isRTL ? 'عدد الأصول' : 'Asset Count', accessorKey: 'asset_count' },
    { header: isRTL ? 'إجمالي الإهلاك' : 'Total Depreciation', cell: (row) => `${row.total_depreciation?.toLocaleString()} ${t('sar')}` },
    { header: t('status'), cell: (row) => {
      const colors = { completed: 'bg-blue-100 text-blue-700', posted: 'bg-emerald-100 text-emerald-700' };
      const labels = { completed: isRTL ? 'مكتمل' : 'Completed', posted: isRTL ? 'مرحل' : 'Posted' };
      return <Badge className={colors[row.status]}>{labels[row.status]}</Badge>;
    }},
    { header: t('actions'), cell: (row) => (
      <Button size="sm" variant="ghost" onClick={() => exportReport(row)}>
        <Download className="w-4 h-4 me-1" /> {isRTL ? 'تصدير' : 'Export'}
      </Button>
    )}
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('depreciation')}
        subtitle={isRTL ? 'إدارة إهلاك الأصول الثابتة' : 'Manage fixed asset depreciation'}
        action
        actionLabel={isRTL ? 'تشغيل الإهلاك' : 'Run Depreciation'}
        actionIcon={Play}
        onAction={() => setShowRunDialog(true)}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard title={isRTL ? 'إجمالي الأصول' : 'Total Assets'} value={`${(totalAssetValue/1000).toFixed(0)}K`} icon={FileText} iconClassName="bg-blue-50" />
        <StatCard title={isRTL ? 'الإهلاك المتراكم' : 'Accumulated Depreciation'} value={`${(totalAccDep/1000).toFixed(0)}K`} icon={TrendingDown} iconClassName="bg-red-50" />
        <StatCard title={isRTL ? 'صافي القيمة' : 'Net Book Value'} value={`${(totalNBV/1000).toFixed(0)}K`} icon={FileText} iconClassName="bg-emerald-50" />
        <StatCard title={isRTL ? 'عمليات الإهلاك' : 'Completed Runs'} value={completedRuns} icon={CheckCircle} iconClassName="bg-purple-50" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="schedules">{isRTL ? 'جدول الإهلاك' : 'Depreciation Schedule'}</TabsTrigger>
          <TabsTrigger value="runs">{isRTL ? 'عمليات الإهلاك' : 'Depreciation Runs'}</TabsTrigger>
          <TabsTrigger value="automation">{isRTL ? 'الأتمتة' : 'Automation'}</TabsTrigger>
        </TabsList>

        <TabsContent value="schedules" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <DataTable 
                columns={scheduleColumns} 
                data={filteredAssets} 
                loading={loadingAssets} 
                emptyMessage={t('noData')}
                onRowClick={(asset) => setSelectedAsset(asset)}
              />
            </div>
            <div>
              {selectedAsset && <AssetLifecycleTracker asset={selectedAsset} />}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="runs" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <DataTable 
                columns={runsColumns} 
                data={filteredRuns} 
                loading={loadingRuns} 
                emptyMessage={t('noData')}
                onRowClick={(run) => setSelectedRun(run)}
              />
            </div>
            <div>
              {selectedRun && <DepreciationReport run={selectedRun} assets={assets} />}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="automation" className="mt-6">
          <div className="max-w-2xl">
            <DepreciationScheduler />
          </div>
        </TabsContent>
      </Tabs>

      {/* Run Depreciation Dialog */}
      <Dialog open={showRunDialog} onOpenChange={setShowRunDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isRTL ? 'تشغيل إهلاك الأصول' : 'Run Asset Depreciation'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900">
                <p className="font-medium mb-1">{isRTL ? 'تنبيه' : 'Warning'}</p>
                <p>{isRTL ? 'سيتم احتساب الإهلاك لجميع الأصول النشطة وترحيل قيد محاسبي تلقائياً' : 'Depreciation will be calculated for all active assets and a journal entry will be posted automatically'}</p>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>{isRTL ? 'الفترة' : 'Period'}</Label>
              <Input type="month" value={runPeriod} onChange={(e) => setRunPeriod(e.target.value)} />
            </div>

            <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>{isRTL ? 'عدد الأصول' : 'Assets Count'}:</span>
                <span className="font-semibold">{filteredAssets.length}</span>
              </div>
              <div className="flex justify-between">
                <span>{isRTL ? 'الإهلاك الشهري المتوقع' : 'Estimated Monthly Depreciation'}:</span>
                <span className="font-semibold">
                  {filteredAssets.reduce((sum, a) => sum + calculateMonthlyDepreciation(a), 0).toFixed(2)} {t('sar')}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRunDialog(false)}>{t('cancel')}</Button>
            <Button onClick={handleRunDepreciation} disabled={running}>
              {running && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'تشغيل' : 'Run'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}