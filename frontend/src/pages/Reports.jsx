import React, { useState } from 'react';
import { callApi } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
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
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedReport, setSelectedReport] = useState(null);
  const [filters, setFilters] = useState({});
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);

  const handlePreview = async (config) => {
    setLoading(true);
    try {
      const response = await callApi('/api/functions/generateReport', {
        reportId: config.reportId,
        format: config.format,
        filters,
        language: config.language === 'auto' ? language : config.language,
        preview: true
      });
      
      if (response.data?.success) {
        setPreviewData(response.data.data);
        setSelectedReport(config.reportId);
        toast.success(isRTL ? 'تم تحميل المعاينة' : 'Preview loaded');
      }
    } catch (_error) {
      toast.error(isRTL ? 'خطأ في المعاينة' : 'Preview error');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async (config) => {
    setLoading(true);
    try {
      const response = await callApi('/api/functions/generateReport', {
        reportId: config.reportId,
        format: config.format,
        filters,
        language: config.language === 'auto' ? language : config.language,
        preview: false
      });

      const resData = response.data;

      if (resData?.error) {
        toast.error(resData.error);
        return;
      }

      if (config.format === 'excel' && resData?.base64) {
        // Decode base64 to binary blob
        const binary = atob(resData.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = resData.filename || 'report.xlsx';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      } else if (config.format === 'csv' && typeof resData === 'string') {
        const blob = new Blob([resData], { type: 'text/csv; charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'report.csv';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      } else {
        toast.info(isRTL ? 'لا توجد بيانات لتنزيلها' : 'No data to download');
        return;
      }

      toast.success(isRTL ? 'تم تنزيل التقرير بنجاح' : 'Report downloaded successfully');
    } catch (_error) {
      toast.error(isRTL ? 'خطأ في التنزيل' : 'Download error');
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