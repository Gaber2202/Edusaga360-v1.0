import React from 'react';
import { useLanguage } from '../LanguageContext';
import { useTenant } from '../TenantContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Download, Printer, FileText } from 'lucide-react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import { toast } from 'sonner';

export default function DepreciationReport({ run, assets = [] }) {
  const { t: _t, isRTL } = useLanguage();
  const { tenant } = useTenant();

  const exportToPDF = () => {
    try {
      const doc = new jsPDF();
      
      // Title
      doc.setFontSize(18);
      doc.text(isRTL ? 'تقرير الإهلاك الشهري' : 'Monthly Depreciation Report', 20, 20);
      
      // Period
      doc.setFontSize(12);
      doc.text(`${isRTL ? 'الفترة' : 'Period'}: ${run.period}`, 20, 35);
      doc.text(`${isRTL ? 'التاريخ' : 'Date'}: ${format(new Date(run.run_date), 'dd/MM/yyyy')}`, 20, 42);
      
      // Summary
      doc.setFontSize(14);
      doc.text(isRTL ? 'الملخص' : 'Summary', 20, 55);
      doc.setFontSize(10);
      doc.text(`${isRTL ? 'عدد الأصول' : 'Assets Count'}: ${run.asset_count}`, 20, 65);
      doc.text(`${isRTL ? 'إجمالي الإهلاك' : 'Total Depreciation'}: $<Currency amount={run.total_depreciation} />`, 20, 72);
      
      // Table Headers
      let y = 85;
      doc.setFontSize(10);
      doc.text('Asset Code', 20, y);
      doc.text('Asset Name', 60, y);
      doc.text('Amount', 150, y);
      
      // Table Data
      y += 7;
      run.entries?.forEach((entry, _index) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        doc.text(entry.asset_code || '', 20, y);
        doc.text((entry.asset_name || '').substring(0, 40), 60, y);
        doc.text(entry.depreciation_amount?.toLocaleString() || '0', 150, y);
        y += 7;
      });
      
      // Footer
      doc.setFontSize(8);
      doc.text('EduSaga 360', 20, 285);
      
      doc.save(`depreciation_report_${run.period}.pdf`);
      toast.success(isRTL ? 'تم التصدير بنجاح' : 'Exported successfully');
    } catch (_error) {
      toast.error(isRTL ? 'فشل التصدير' : 'Export failed');
    }
  };

  const exportToCSV = () => {
    try {
      const headers = ['Asset Code', 'Asset Name', 'Category', 'Acquisition Cost', 'Accumulated Dep.', 'Monthly Dep.', 'NBV'];
      const rows = run.entries?.map(entry => {
        const asset = assets.find(a => a.id === entry.asset_id) || {};
        return [
          entry.asset_code,
          entry.asset_name,
          asset.category || '',
          asset.acquisition_cost || 0,
          asset.accumulated_depreciation || 0,
          entry.depreciation_amount || 0,
          asset.net_book_value || 0
        ];
      }) || [];
      
      const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `depreciation_detailed_${run.period}.csv`;
      link.click();
      
      toast.success(isRTL ? 'تم التصدير بنجاح' : 'Exported successfully');
    } catch (_error) {
      toast.error(isRTL ? 'فشل التصدير' : 'Export failed');
    }
  };

  const printReport = () => {
    const printContent = `
      <html>
        <head>
          <title>Depreciation Report - ${run.period}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #1e293b; border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
            th { background-color: #f1f5f9; font-weight: 600; }
            .summary { background-color: #f8fafc; padding: 15px; margin: 20px 0; border-radius: 8px; }
            .footer { margin-top: 30px; text-align: center; color: #64748b; font-size: 12px; }
          </style>
        </head>
        <body>
          <h1>${isRTL ? 'تقرير الإهلاك الشهري' : 'Monthly Depreciation Report'}</h1>
          <div class="summary">
            <p><strong>${isRTL ? 'الفترة' : 'Period'}:</strong> ${run.period}</p>
            <p><strong>${isRTL ? 'التاريخ' : 'Date'}:</strong> ${format(new Date(run.run_date), 'dd/MM/yyyy')}</p>
            <p><strong>${isRTL ? 'عدد الأصول' : 'Assets Count'}:</strong> ${run.asset_count}</p>
            <p><strong>${isRTL ? 'إجمالي الإهلاك' : 'Total Depreciation'}:</strong> $<Currency amount={run.total_depreciation} /></p>
          </div>
          <table>
            <thead>
              <tr>
                <th>${isRTL ? 'رمز الأصل' : 'Asset Code'}</th>
                <th>${isRTL ? 'اسم الأصل' : 'Asset Name'}</th>
                <th>${isRTL ? 'مبلغ الإهلاك' : 'Depreciation Amount'}</th>
              </tr>
            </thead>
            <tbody>
              ${run.entries?.map(entry => `
                <tr>
                  <td>${entry.asset_code}</td>
                  <td>${entry.asset_name}</td>
                  <td>$<Currency amount={entry.depreciation_amount} /></td>
                </tr>
              `).join('') || ''}
            </tbody>
          </table>
          <div class="footer">
            <p>EduSaga 360 - ${format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
          </div>
        </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          {isRTL ? 'تصدير التقارير' : 'Export Reports'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button variant="outline" onClick={exportToPDF} className="w-full justify-start gap-2">
          <Download className="w-4 h-4" />
          {isRTL ? 'تصدير PDF' : 'Export PDF'}
        </Button>
        <Button variant="outline" onClick={exportToCSV} className="w-full justify-start gap-2">
          <Download className="w-4 h-4" />
          {isRTL ? 'تصدير CSV (مفصل)' : 'Export CSV (Detailed)'}
        </Button>
        <Button variant="outline" onClick={printReport} className="w-full justify-start gap-2">
          <Printer className="w-4 h-4" />
          {isRTL ? 'طباعة' : 'Print'}
        </Button>
      </CardContent>
    </Card>
  );
}