import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Receipt, Search, Printer } from 'lucide-react';
import { useLanguage } from '../components/LanguageContext';
import { useTenant } from '../components/TenantContext';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { useTenantQuery } from '../hooks/useTenantQuery';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { formatCurrency } from '../lib/localization';
import { allergenLabel } from '../lib/canteenAllergens';
import { openCanteenReceipt, receiptPayloadFromTransaction } from '../lib/canteenReceipt';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';

const TYPES = ['all', 'purchase', 'topup', 'refund', 'adjustment'];
const PAYMENTS = ['all', 'wallet', 'cash', 'online'];

function orderItems(row) {
  return Array.isArray(row?.items) ? row.items : [];
}

function itemName(item, isRTL) {
  return isRTL ? (item.item_name || item.name_en || 'item') : (item.name_en || item.item_name || 'item');
}

function lineTotal(item) {
  const qty = Number(item.quantity) || 1;
  const unit = Number(item.unit_price ?? item.price) || 0;
  return qty * unit;
}

function itemSummary(items, isRTL) {
  if (!Array.isArray(items) || items.length === 0) return '—';
  return items.map((item) => `${itemName(item, isRTL)} ×${item.quantity || 1}`).join(', ');
}

export default function CanteenPOSOrders() {
  const { isRTL } = useLanguage();
  const { tenant } = useTenant();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();

  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [payment, setPayment] = useState('all');
  const [student, setStudent] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);

  const { data: transactions = [], isLoading } = useTenantQuery(
    ['canteenPosOrders', tenantId],
    () => fetchData(tenantQuery('canteen_transactions').select('*').match(tenantFilter()).order('created_at', { ascending: false }).limit(500)),
    { enabled: hasTenantAccess },
  );

  const studentOptions = useMemo(() => {
    const names = [...new Set(transactions.map((row) => row.student_name).filter(Boolean))];
    return names.sort((a, b) => a.localeCompare(b));
  }, [transactions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((row) => {
      if (type !== 'all' && row.transaction_type !== type) return false;
      if (payment !== 'all' && (row.payment_method || '') !== payment) return false;
      if (student !== 'all' && row.student_name !== student) return false;
      if (fromDate && row.transaction_date < fromDate) return false;
      if (toDate && row.transaction_date > toDate) return false;
      const amount = Number(row.amount) || 0;
      if (minAmount !== '' && amount < Number(minAmount)) return false;
      if (maxAmount !== '' && amount > Number(maxAmount)) return false;
      if (q) {
        const hay = [
          row.student_name,
          row.transaction_type,
          row.payment_method,
          row.notes,
          row.processed_by,
          itemSummary(row.items, isRTL),
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, type, payment, student, fromDate, toDate, minAmount, maxAmount, search, isRTL]);

  const purchaseCount = filtered.filter((row) => row.transaction_type === 'purchase').length;
  const purchaseTotal = filtered
    .filter((row) => row.transaction_type === 'purchase')
    .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  const reset = () => {
    setSearch(''); setType('all'); setPayment('all'); setStudent('all');
    setFromDate(''); setToDate(''); setMinAmount(''); setMaxAmount('');
  };

  const printOrder = (row) => {
    openCanteenReceipt({
      ...receiptPayloadFromTransaction(row, {
        schoolName: isRTL ? (tenant?.name_ar || tenant?.name_en || '') : (tenant?.name_en || tenant?.name_ar || ''),
        isRTL,
      }),
      currencyCode: (() => {
        const code = tenant?.localization?.currencyCode || tenant?.currency_code;
        if (!code) throw new Error('currency_unresolved: canteen orders require tenant currency');
        return code;
      })(),
    });
  };

  const typeLabel = (value) => {
    const map = {
      purchase: isRTL ? 'بيع' : 'Sale',
      topup: isRTL ? 'شحن' : 'Top-up',
      refund: isRTL ? 'استرجاع' : 'Refund',
      adjustment: isRTL ? 'تعديل' : 'Adjustment',
    };
    return map[value] || value;
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-ink">{isRTL ? 'طلبات نقطة البيع' : 'POS orders'}</h1>
        <p className="text-sm text-muted-foreground">{isRTL ? 'كل عمليات المقصف مع التصفية حسب التاريخ والطالب والنوع' : 'Every canteen order, filterable by date, student, type, and amount'}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{isRTL ? 'النتائج' : 'Matching rows'}</p>
          <p className="text-2xl font-semibold">{filtered.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{isRTL ? 'مبيعات POS' : 'POS sales'}</p>
          <p className="text-2xl font-semibold">{purchaseCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{isRTL ? 'إجمالي المبيعات' : 'Sales total'}</p>
          <p className="text-2xl font-semibold">{formatCurrency(purchaseTotal, tenant?.localization, isRTL)}</p>
        </Card>
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="space-y-1 md:col-span-2">
            <Label>{isRTL ? 'بحث' : 'Search'}</Label>
            <div className="relative">
              <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} className={isRTL ? 'pr-9' : 'pl-9'} placeholder={isRTL ? 'طالب، صنف، طريقة دفع...' : 'Student, item, payment...'} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>{isRTL ? 'النوع' : 'Type'}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((value) => <SelectItem key={value} value={value}>{value === 'all' ? (isRTL ? 'الكل' : 'All') : typeLabel(value)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{isRTL ? 'طريقة الدفع' : 'Payment'}</Label>
            <Select value={payment} onValueChange={setPayment}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENTS.map((value) => <SelectItem key={value} value={value}>{value === 'all' ? (isRTL ? 'الكل' : 'All') : value}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{isRTL ? 'الطالب' : 'Student'}</Label>
            <Select value={student} onValueChange={setStudent}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isRTL ? 'الكل' : 'All'}</SelectItem>
                {studentOptions.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{isRTL ? 'من تاريخ' : 'From'}</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{isRTL ? 'إلى تاريخ' : 'To'}</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{isRTL ? 'الحد الأدنى' : 'Min amount'}</Label>
            <Input type="number" min="0" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{isRTL ? 'الحد الأعلى' : 'Max amount'}</Label>
            <Input type="number" min="0" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>{isRTL ? 'مسح التصفية' : 'Clear filters'}</Button>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isRTL ? 'التاريخ' : 'When'}</TableHead>
                <TableHead>{isRTL ? 'الطالب' : 'Student'}</TableHead>
                <TableHead>{isRTL ? 'النوع' : 'Type'}</TableHead>
                <TableHead>{isRTL ? 'الأصناف' : 'Items'}</TableHead>
                <TableHead>{isRTL ? 'الدفع' : 'Payment'}</TableHead>
                <TableHead className="text-end">{isRTL ? 'المبلغ' : 'Amount'}</TableHead>
                <TableHead>{isRTL ? 'بواسطة' : 'By'}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => {
                const items = orderItems(row);
                const multi = items.length > 1;
                return (
                <TableRow
                  key={row.id}
                  className={multi ? 'cursor-pointer hover:bg-sand/60' : undefined}
                  onClick={() => { if (multi) setSelectedOrder(row); }}
                >
                  <TableCell className="text-xs whitespace-nowrap">{row.transaction_date} {row.transaction_time || (row.created_at ? format(new Date(row.created_at), 'HH:mm') : '')}</TableCell>
                  <TableCell className="font-medium text-sm">{row.student_name || '—'}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${row.transaction_type === 'purchase' ? 'bg-orange-50 text-orange-800' : row.transaction_type === 'topup' ? 'bg-green-100 text-green-700' : 'bg-sand-alt text-muted-foreground'}`}>
                      {typeLabel(row.transaction_type)}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs max-w-64">
                    {multi ? (
                      <button
                        type="button"
                        className="text-orange-700 font-medium underline-offset-2 hover:underline"
                        onClick={(e) => { e.stopPropagation(); setSelectedOrder(row); }}
                      >
                        {isRTL ? `${items.length} أصناف — عرض التفاصيل` : `${items.length} items — view details`}
                      </button>
                    ) : (
                      <span className="truncate block">{itemSummary(items, isRTL)}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{row.payment_method || '—'}</TableCell>
                  <TableCell className={`text-end font-semibold ${row.transaction_type === 'purchase' ? 'text-red-600' : 'text-green-700'}`}>
                    {row.transaction_type === 'purchase' ? '−' : '+'}{formatCurrency(row.amount, tenant?.localization, isRTL)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.processed_by || '—'}</TableCell>
                  <TableCell className="text-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={(e) => { e.stopPropagation(); printOrder(row); }}
                    >
                      <Printer className="w-3.5 h-3.5 me-1" />
                      {isRTL ? 'إيصال' : 'Receipt'}
                    </Button>
                  </TableCell>
                </TableRow>
                );
              })}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    {isRTL ? 'لا توجد طلبات مطابقة' : 'No matching orders'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={!!selectedOrder} onOpenChange={(open) => { if (!open) setSelectedOrder(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'تفاصيل الطلب' : 'Order details'}</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">{isRTL ? 'الطالب' : 'Student'}</p>
                  <p className="font-medium">{selectedOrder.student_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{isRTL ? 'التاريخ' : 'When'}</p>
                  <p className="font-medium">{selectedOrder.transaction_date} {selectedOrder.transaction_time || ''}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{isRTL ? 'النوع' : 'Type'}</p>
                  <p className="font-medium">{typeLabel(selectedOrder.transaction_type)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{isRTL ? 'الدفع' : 'Payment'}</p>
                  <p className="font-medium">{selectedOrder.payment_method || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{isRTL ? 'بواسطة' : 'Processed by'}</p>
                  <p className="font-medium">{selectedOrder.processed_by || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{isRTL ? 'الرصيد بعد' : 'Balance after'}</p>
                  <p className="font-medium">{formatCurrency(selectedOrder.balance_after, tenant?.localization, isRTL)}</p>
                </div>
              </div>

              <div className="rounded-xl border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isRTL ? 'الصنف' : 'Item'}</TableHead>
                      <TableHead className="text-end">{isRTL ? 'الكمية' : 'Qty'}</TableHead>
                      <TableHead className="text-end">{isRTL ? 'السعر' : 'Unit'}</TableHead>
                      <TableHead className="text-end">{isRTL ? 'الإجمالي' : 'Total'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderItems(selectedOrder).map((item, index) => (
                      <TableRow key={item.item_id || `${item.item_name}-${index}`}>
                        <TableCell>
                          <p className="font-medium text-sm">{itemName(item, isRTL)}</p>
                          {item.name_en && item.item_name && item.name_en !== item.item_name && (
                            <p className="text-xs text-muted-foreground">{isRTL ? item.name_en : item.item_name}</p>
                          )}
                          {Array.isArray(item.allergens) && item.allergens.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {item.allergens.map((key) => (
                                <span key={key} className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">{allergenLabel(key, isRTL)}</span>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-end">{item.quantity || 1}</TableCell>
                        <TableCell className="text-end">{formatCurrency(item.unit_price ?? item.price ?? 0, tenant?.localization, isRTL)}</TableCell>
                        <TableCell className="text-end font-semibold">{formatCurrency(lineTotal(item), tenant?.localization, isRTL)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-between items-center text-base font-bold border-t pt-3">
                <span>{isRTL ? 'إجمالي الطلب' : 'Order total'}</span>
                <span>{formatCurrency(selectedOrder.amount, tenant?.localization, isRTL)}</span>
              </div>
              {selectedOrder.notes && (
                <p className="text-xs text-muted-foreground">{isRTL ? 'ملاحظة' : 'Notes'}: {selectedOrder.notes}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedOrder(null)}>{isRTL ? 'إغلاق' : 'Close'}</Button>
            <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => printOrder(selectedOrder)}>
              <Printer className="w-4 h-4 me-1" />
              {isRTL ? 'طباعة الإيصال' : 'Print receipt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
