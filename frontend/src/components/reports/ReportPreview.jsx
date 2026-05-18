import React from 'react';
import { useLanguage } from '../LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Loader2, FileText } from 'lucide-react';

export default function ReportPreview({ data, reportId: _reportId, loading }) {
  const { t: _t, isRTL } = useLanguage();

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isRTL ? 'معاينة التقرير' : 'Report Preview'}</CardTitle>
        <p className="text-sm text-slate-600">
          {data.rows.length} {isRTL ? 'سجل' : 'records'}
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {data.headers.map((header, idx) => (
                  <TableHead key={idx} className={isRTL ? 'text-right' : 'text-left'}>
                    {header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.slice(0, 50).map((row, idx) => (
                <TableRow key={idx}>
                  {row.map((cell, cellIdx) => (
                    <TableCell key={cellIdx} className={isRTL ? 'text-right' : 'text-left'}>
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