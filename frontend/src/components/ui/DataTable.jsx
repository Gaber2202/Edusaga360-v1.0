import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';
import { Skeleton } from './skeleton';
import { useLanguage } from '../LanguageContext';

export function DataTable({ 
  columns, 
  data, 
  loading,
  onRowClick,
  emptyMessage
}) {
  const { t, isRTL } = useLanguage();
  
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto" dir={isRTL ? 'rtl' : 'ltr'}>
          <Table className="w-full" style={{ minWidth: '600px' }}>
            <TableHeader>
              <TableRow className="bg-slate-50">
                {columns.map((col, i) => (
                  <TableHead 
                    key={i} 
                    className="text-slate-600 font-semibold px-2 sm:px-4 py-2 whitespace-nowrap"
                    style={{ 
                      minWidth: col.width || '120px',
                      textAlign: col.align || (isRTL ? 'right' : 'left')
                    }}
                  >
                    {col.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                  {columns.map((col, j) => (
                    <TableCell 
                      key={j}
                      className="px-2 sm:px-4 py-2"
                      style={{ 
                        minWidth: col.width || '120px'
                      }}
                    >
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }
  
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <p className="text-slate-500">{emptyMessage || t('noData')}</p>
      </div>
    );
  }
  
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto" dir={isRTL ? 'rtl' : 'ltr'}>
        <Table className="w-full" style={{ minWidth: '600px' }}>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              {columns.map((col, i) => (
                <TableHead 
                   key={i} 
                   className={`text-slate-600 font-semibold whitespace-nowrap px-2 sm:px-4 py-2 ${col.headerClassName || col.className || ''}`}
                   style={{ 
                     minWidth: col.width || '120px',
                     textAlign: col.align || (isRTL ? 'right' : 'left')
                   }}
                 >
                   {col.header}
                 </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, i) => (
              <TableRow 
                key={row.id || i}
                className={onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''}
              >
                {columns.map((col, j) => (
                  <TableCell 
                     key={j} 
                     className={`px-2 sm:px-4 py-2 ${col.cellClassName || col.className || ''}`}
                     style={{ 
                       minWidth: col.width || '120px',
                       textAlign: col.align || (isRTL ? 'right' : 'left')
                     }}
                     onClick={(e) => {
                       if (!col.cell && onRowClick) {
                         onRowClick(row);
                       }
                     }}
                   >
                     {col.cell ? col.cell(row) : row[col.accessorKey]}
                   </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default DataTable;