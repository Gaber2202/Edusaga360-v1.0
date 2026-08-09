import React, { useState } from 'react';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useTenant } from '../components/TenantContext';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { buildReport, REPORT_SOURCES } from '../lib/reportBuilders';
import { buildReportPrintHtml } from '../lib/reportPrint';
import { buildCsv } from '../lib/csv';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import PageHeader from '../components/ui/PageHeader';
import ExecutiveDashboard from '../components/reports/ExecutiveDashboard';
import ReportBuilder from '../components/reports/ReportBuilder';
import ScheduledReports from '../components/reports/ScheduledReports';
import FinancialReports from '../components/reports/FinancialReports';
import ReportSelector, { AVAILABLE_REPORTS } from '../components/reports/ReportSelector';
import ReportFilters from '../components/reports/ReportFilters';
import ReportPreview from '../components/reports/ReportPreview';
import { BarChart3, FileText, Clock, DollarSign, Download } from 'lucide-react';
import { toast } from 'sonner';

export default function Reports() {
  const { t, isRTL, language } = useLanguage();
  const { tenant } = useTenant();
  const { tenantFilter, hasTenantAccess } = useTenantFilter();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedReport, setSelectedReport] = useState(null);
  const [filters, setFilters] = useState({});
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Reports are generated client-side from tenant-scoped data (the previous
  // /api/functions/generateReport endpoint does not exist on the backend).
  const fetchDatasets = async (reportId) => {
    const tables = REPORT_SOURCES[reportId] || [];
    const datasets = {};
    for (const table of tables) {
      let rows = await fetchData(tenantQuery(table).select('*').match(tenantFilter()));
      if (filters?.status && filters.status !== 'all') {
        rows = rows.filter((r) => r.status === filters.status);
      }
      datasets[table] = rows;
    }
    return datasets;
  };

  const resolveLang = (config) => ((config.language === 'auto' ? language : config.language) === 'ar') || isRTL;

  const handlePreview = async (config) => {
    if (!hasTenantAccess) { toast.error(isRTL ? 'لا توجد صلاحية للوصول' : 'No access'); return; }
    setLoading(true);
    try {
      const datasets = await fetchDatasets(config.reportId);
      setPreviewData(buildReport(config.reportId, datasets, resolveLang(config), tenant?.localization));
      setSelectedReport(config.reportId);
      toast.success(isRTL ? 'تم تحميل المعاينة' : 'Preview loaded');
    } catch (error) {
      console.error('Report preview error:', error);
      toast.error(isRTL ? 'تعذّر تحميل المعاينة' : 'Could not load preview');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async (config) => {
    if (!hasTenantAccess) { toast.error(isRTL ? 'لا توجد صلاحية للوصول' : 'No access'); return; }
    setLoading(true);
    try {
      const useAr = resolveLang(config);
      const datasets = await fetchDatasets(config.reportId);
      const built = buildReport(config.reportId, datasets, useAr, tenant?.localization);
      const report = AVAILABLE_REPORTS.find((r) => r.id === config.reportId);
      const title = report ? (useAr ? report.name_ar : report.name_en) : 'report';

      if (!built.rows.length) {
        toast.info(isRTL ? 'لا توجد بيانات لتصديرها' : 'No data to export');
        return;
      }

      if (config.format === 'pdf') {
        const meta = `${useAr ? 'تاريخ الإنشاء' : 'Generated'}: ${new Date().toLocaleString(useAr ? 'ar' : 'en')} • ${built.rows.length} ${useAr ? 'سجل' : 'records'}`;
        const html = buildReportPrintHtml({ title, meta, headers: built.headers, rows: built.rows, isRTL: useAr });
        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); }
      } else {
        // CSV (also covers the Excel option — opens cleanly in Excel).
        const csv = buildCsv([built.headers, ...built.rows]);
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${String(title || 'report').replace(/\s+/g, '_')}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      }

      toast.success(isRTL ? 'تم تصدير التقرير' : 'Report exported');
    } catch (error) {
      console.error('Report export error:', error);
      toast.error(isRTL ? 'تعذّر تصدير التقرير' : 'Could not export report');
    } finally {
      setLoading(false);
    }
  };

  const currentReportFilters = selectedReport 
    ? AVAILABLE_REPORTS.find(r => r.id === selectedReport)?.filters 
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('reports')}
        subtitle={isRTL ? 'التقارير والتحليلات المتقدمة' : 'Advanced reports and analytics'}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border">
          <TabsTrigger value="dashboard" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            {isRTL ? 'لوحة المؤشرات' : 'Dashboard'}
          </TabsTrigger>
          <TabsTrigger value="downloads" className="gap-2">
            <Download className="w-4 h-4" />
            {isRTL ? 'تنزيل التقارير' : 'Download Reports'}
          </TabsTrigger>
          <TabsTrigger value="financial" className="gap-2">
            <DollarSign className="w-4 h-4" />
            {isRTL ? 'التقارير المالية' : 'Financial Reports'}
          </TabsTrigger>
          <TabsTrigger value="builder" className="gap-2">
            <FileText className="w-4 h-4" />
            {isRTL ? 'إنشاء تقرير' : 'Report Builder'}
          </TabsTrigger>
          <TabsTrigger value="scheduled" className="gap-2">
            <Clock className="w-4 h-4" />
            {isRTL ? 'التقارير المجدولة' : 'Scheduled Reports'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-6">
          <ExecutiveDashboard />
        </TabsContent>

        <TabsContent value="downloads" className="mt-6 space-y-6">
          <ReportSelector
            onGenerate={handleGenerate}
            onPreview={handlePreview}
            loading={loading}
          />
          
          <ReportFilters
            reportId={selectedReport}
            filters={currentReportFilters}
            onChange={setFilters}
          />
          
          <ReportPreview
            data={previewData}
            reportId={selectedReport}
            loading={loading}
          />
        </TabsContent>

        <TabsContent value="financial" className="mt-6">
          <FinancialReports />
        </TabsContent>

        <TabsContent value="builder" className="mt-6">
          <ReportBuilder />
        </TabsContent>

        <TabsContent value="scheduled" className="mt-6">
          <ScheduledReports />
        </TabsContent>
      </Tabs>
    </div>
  );
}