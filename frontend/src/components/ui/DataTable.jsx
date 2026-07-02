import React, { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';
import { Skeleton } from './skeleton';
import { Button } from './button';
import { useLanguage } from '../LanguageContext';
import { ChevronUp, ChevronDown, ChevronsUpDown, Inbox } from 'lucide-react';

export function DataTable({
  columns,
  data,
  loading,
  onRowClick,
  emptyMessage,
  emptyIcon,
  emptyAction,
}) {
  const { t, isRTL } = useLanguage();
  const [sortConfig, setSortConfig] = useState({ key: null, dir: null });

  const handleSort = (col) => {
    if (!col.sortable) return;
    const key = col.sortKey || col.accessorKey;
    setSortConfig((prev) => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: null, dir: null };
    });
  };

  const sortedData = useMemo(() => {
    if (!data) return data;
    if (!sortConfig.key || !sortConfig.dir) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal === bVal) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp =
        typeof aVal === 'number' && typeof bVal === 'number'
          ? aVal - bVal
          : String(aVal).localeCompare(String(bVal));
      return sortConfig.dir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortConfig]);

  const SortIcon = ({ col }) => {
    if (!col.sortable) return null;
    const key = col.sortKey || col.accessorKey;
    if (sortConfig.key !== key)
      return <ChevronsUpDown className="inline-block ml-1 w-4 h-4 text-muted-foreground" />;
    if (sortConfig.dir === 'asc')
      return <ChevronUp className="inline-block ml-1 w-4 h-4 text-muted-foreground" />;
    return <ChevronDown className="inline-block ml-1 w-4 h-4 text-muted-foreground" />;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto" dir={isRTL ? 'rtl' : 'ltr'}>
          <Table className="w-full" style={{ minWidth: '600px' }}>
            <TableHeader className="sticky top-0 z-10 bg-sand">
              <TableRow className="bg-sand">
                {columns.map((col, i) => (
                  <TableHead
                    key={i}
                    className="text-muted-foreground font-semibold px-2 sm:px-4 py-2 whitespace-nowrap"
                    style={{
                      minWidth: col.width || '120px',
                      textAlign: col.align || (isRTL ? 'right' : 'left'),
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
                        minWidth: col.width || '120px',
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
    const EmptyIcon = emptyIcon || null;
    return (
      <div className="bg-white rounded-xl border border-border p-12 text-center">
        <div className="flex flex-col items-center gap-3">
          {EmptyIcon ? (
            <EmptyIcon className="w-12 h-12 text-muted-foreground" />
          ) : (
            <Inbox className="w-12 h-12 text-muted-foreground" />
          )}
          <p className="text-muted-foreground">{emptyMessage || t('noData')}</p>
          {emptyAction && (
            <Button
              size="sm"
              className="mt-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={emptyAction.onClick}
            >
              {emptyAction.label}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // On phones the horizontal-scroll table loses too much context, so render a
  // stacked card per row instead. A column can set `primary: true` to headline
  // the card, `hideOnMobileCard: true` to drop from cards, and columns with no
  // header (e.g. an actions column) render full-width without a label.
  const primaryCol = columns.find((c) => c.primary) || columns[0];
  const cardBodyCols = columns.filter((c) => c !== primaryCol && !c.hideOnMobileCard);

  return (
    <>
    {/* Mobile: stacked cards */}
    <div className="md:hidden space-y-3" dir={isRTL ? 'rtl' : 'ltr'}>
      {sortedData.map((row, i) => (
        <div
          key={row.id || i}
          onClick={() => onRowClick && onRowClick(row)}
          className={`bg-white rounded-xl border border-border p-4 ${onRowClick ? 'cursor-pointer active:bg-sand' : ''}`}
        >
          {primaryCol && (
            <div className="font-semibold text-ink text-base mb-2 break-words">
              {primaryCol.cell ? primaryCol.cell(row) : row[primaryCol.accessorKey]}
            </div>
          )}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
            {cardBodyCols.map((col, j) => {
              const value = col.cell ? col.cell(row) : row[col.accessorKey];
              const noLabel = !col.header;
              return (
                <div key={j} className={`min-w-0 ${noLabel ? 'col-span-2' : ''}`}>
                  {!noLabel && (
                    <dt className="text-xs text-muted-foreground truncate">{col.header}</dt>
                  )}
                  <dd className="text-sm text-ink break-words">{value}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
    </div>

    {/* Tablet / desktop: table with horizontal scroll + sticky header */}
    <div className="hidden md:block bg-white rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto" dir={isRTL ? 'rtl' : 'ltr'}>
        <Table className="w-full" style={{ minWidth: '600px' }}>
          <TableHeader className="sticky top-0 z-10 bg-sand">
            <TableRow className="bg-sand hover:bg-sand">
              {columns.map((col, i) => (
                <TableHead
                  key={i}
                  className={`text-muted-foreground font-semibold whitespace-nowrap px-2 sm:px-4 py-2 ${col.sortable ? 'cursor-pointer select-none' : ''} ${col.headerClassName || col.className || ''}`}
                  style={{
                    minWidth: col.width || '120px',
                    textAlign: col.align || (isRTL ? 'right' : 'left'),
                  }}
                  onClick={() => handleSort(col)}
                >
                  {col.header}
                  <SortIcon col={col} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((row, i) => (
              <TableRow
                key={row.id || i}
                className={onRowClick ? 'cursor-pointer hover:bg-sand' : ''}
              >
                {columns.map((col, j) => (
                  <TableCell
                    key={j}
                    className={`px-2 sm:px-4 py-2 ${col.cellClassName || col.className || ''}`}
                    style={{
                      minWidth: col.width || '120px',
                      textAlign: col.align || (isRTL ? 'right' : 'left'),
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
    </>
  );
}

export default DataTable;
