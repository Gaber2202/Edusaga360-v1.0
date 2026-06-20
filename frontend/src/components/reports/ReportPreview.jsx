import React from 'react';
import { useLanguage } from '../LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Loader2, FileText, Printer } from 'lucide-react';
import { buildReportPrintHtml } from '../../lib/reportPrint';
import { AVAILABLE_REPORTS } from './ReportSelector';

export default function ReportPreview({ data, reportId, loading }) {
  const { isRTL } = useLanguage();

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400" />
          <p className="text-slate-600 mt-4">{isRTL ? 'جاري التحميل...' : 'Loading...'}</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.rows || data.rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="w-12 h-12 mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500">{isRTL ? 'لا توجد بيانات' : 'No data available'}</p>
        </CardContent>
      </Card>
    );
  }

  const report = AVAILABLE_REPORTS.find((r) => r.id === reportId);
  const title = report ? (isRTL ? report.name_ar : report.name_en) : (isRTL ? 'تقرير' : 'Report');

  const handlePrint = () => {
    const meta = `${isRTL ? 'تاريخ الإنشاء' : 'Generated'}: ${new Date().toLocaleString(isRTL ? 'ar' : 'en')} • ${data.rows.length} ${isRTL ? 'سجل' : 'records'}`;
    const html = buildReportPrintHtml({ title, meta, headers: data.headers, rows: data.rows, isRTL });
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{isRTL ? 'معاينة التقرير' : 'Report Preview'}</CardTitle>
            <p className="text-sm text-slate-600 mt-1">
              {data.rows.length} {isRTL ? 'سجل' : 'records'}
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={handlePrint}>
            <Printer className="w-4 h-4" />
            {isRTL ? 'طباعة' : 'Print'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {data.headers.map((header, idx) => (
                  <TableHead key={idx} className="text-start">
                    {header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.slice(0, 50).map((row, idx) => (
                <TableRow key={idx}>
                  {row.map((cell, cellIdx) => (
                    <TableCell key={cellIdx} className="text-start">
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {data.rows.length > 50 && (
            <div className="text-center text-sm text-slate-500 mt-4">
              {isRTL
                ? `عرض أول 50 سجل من ${data.rows.length}`
                : `Showing first 50 of ${data.rows.length} records`}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
