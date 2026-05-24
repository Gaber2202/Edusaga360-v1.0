import React, { useState } from 'react';
import { useLanguage } from '../LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Download, FileText, Eye } from 'lucide-react';

const AVAILABLE_REPORTS = [
  {
    id: 'student_list',
    name_ar: 'قائمة الطلاب',
    name_en: 'Student List',
    category: 'academic',
    filters: ['branch', 'grade', 'status', 'academic_year']
  },
  {
    id: 'fee_collection',
    name_ar: 'تقرير تحصيل الرسوم',
    name_en: 'Fee Collection Report',
    category: 'finance',
    filters: ['branch', 'date_range', 'status']
  },
  {
    id: 'invoice_aging',
    name_ar: 'أعمار الفواتير',
    name_en: 'Invoice Aging Report',
    category: 'finance',
    filters: ['branch', 'date_range']
  },
  {
    id: 'attendance_summary',
    name_ar: 'ملخص الحضور',
    name_en: 'Attendance Summary',
    category: 'academic',
    filters: ['branch', 'grade', 'date_range']
  },
  {
    id: 'payroll_summary',
    name_ar: 'ملخص الرواتب',
    name_en: 'Payroll Summary',
    category: 'hr',
    filters: ['branch', 'company', 'period']
  },
  {
    id: 'financial_statement',
    name_ar: 'القوائم المالية',
    name_en: 'Financial Statement',
    category: 'finance',
    filters: ['branch', 'company', 'fiscal_period']
  }
];

export default function ReportSelector({ onGenerate, onPreview, loading }) {
  const { t, isRTL } = useLanguage();
  const [selectedReport, setSelectedReport] = useState('');
  // PDF export is not yet implemented server-side; default to Excel so the
  // Download button works out of the box. The `pdf` option is still present
  // in the UI but the server returns a helpful 400 if it's selected.
  const [format, setFormat] = useState('excel');
  const [exportLanguage, setExportLanguage] = useState('auto');

  const currentReport = AVAILABLE_REPORTS.find(r => r.id === selectedReport);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          {isRTL ? 'اختيار التقرير' : 'Report Selection'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Report Selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>{isRTL ? 'اختر التقرير' : 'Select Report'} *</Label>
            <Select value={selectedReport} onValueChange={setSelectedReport}>
              <SelectTrigger>
                <SelectValue placeholder={isRTL ? 'اختر تقرير' : 'Choose report'} />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_REPORTS.map(report => (
                  <SelectItem key={report.id} value={report.id}>
                    {isRTL ? report.name_ar : report.name_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{isRTL ? 'الصيغة' : 'Format'} *</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{isRTL ? 'لغة التصدير' : 'Export Language'}</Label>
            <Select value={exportLanguage} onValueChange={setExportLanguage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{isRTL ? 'تلقائي' : 'Auto'}</SelectItem>
                <SelectItem value="ar">{isRTL ? 'عربي' : 'Arabic'}</SelectItem>
                <SelectItem value="en">{isRTL ? 'إنجليزي' : 'English'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Report Description */}
        {currentReport && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-slate-700">
              <strong>{isRTL ? 'الفئة:' : 'Category:'}</strong>{' '}
              {t(currentReport.category)}
            </p>
            <p className="text-xs text-slate-600 mt-1">
              {isRTL 
                ? 'سيتم تطبيق الفلاتر المحددة على هذا التقرير' 
                : 'Selected filters will be applied to this report'}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <Button
            onClick={() => onPreview({ reportId: selectedReport, format, language: exportLanguage })}
            disabled={!selectedReport || loading}
            variant="outline"
            className="gap-2"
          >
            <Eye className="w-4 h-4" />
            {isRTL ? 'معاينة' : 'Preview'}
          </Button>
          <Button
            onClick={() => onGenerate({ reportId: selectedReport, format, language: exportLanguage })}
            disabled={!selectedReport || loading}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            {isRTL ? 'تنزيل' : 'Download'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export { AVAILABLE_REPORTS };