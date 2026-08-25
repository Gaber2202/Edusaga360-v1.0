import React, { useMemo, useState } from 'react';
import { format, addDays } from 'date-fns';
import { toast } from 'sonner';
import { CalendarDays, Receipt, Search } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData, callApi } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useTenant } from '../components/TenantContext';
import { useRole } from '../components/RoleContext';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { useTenantQuery } from '../hooks/useTenantQuery';
import { formatCurrency } from '../lib/localization';
import { generateSlots } from '../lib/storeAvailability';
import { openStoreReceipt, shortStoreReceiptNo } from '../lib/storeReceipt';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Card } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';

const STATUSES = ['all', 'pending_payment', 'ready_for_collect', 'collected', 'cancelled'];
const KINDS = ['all', 'purchase', 'booking'];
const PAYMENT_METHODS = [
  { value: 'cash', en: 'Cash', ar: 'نقداً' },
  { value: 'card', en: 'Card', ar: 'بطاقة' },
  { value: 'mada', en: 'Mada', ar: 'مدى' },
  { value: 'bank_transfer', en: 'Bank transfer', ar: 'تحويل بنكي' },
];

function productName(row, isRTL) {
  return isRTL ? (row?.name_ar || row?.name_en || '') : (row?.name_en || row?.name_ar || '');
}

function studentName(students, id, isRTL) {
  const row = students.find((s) => s.id === id);
  if (!row) return id || '—';
  return isRTL ? (row.name_ar || row.name_en) : (row.name_en || row.name_ar);
}

function statusLabel(status, isRTL) {
  const map = {
    pending_payment: { en: 'Awaiting payment', ar: 'بانتظار الدفع' },
    ready_for_collect: { en: 'Ready to collect', ar: 'جاهز للاستلام' },
    collected: { en: 'Collected', ar: 'تم الاستلام' },
    cancelled: { en: 'Cancelled', ar: 'ملغى' },
    held: { en: 'Held', ar: 'محجوز مؤقتاً' },
    confirmed: { en: 'Confirmed', ar: 'مؤكد' },
  };
  return map[status]?.[isRTL ? 'ar' : 'en'] || status;
}

export default function StoreOrders() {
  const { isRTL } = useLanguage();
  const { tenant } = useTenant();
  const { user } = useRole();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('orders');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [kind, setKind] = useState('all');
  const [selected, setSelected] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [calDate, setCalDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [calProduct, setCalProduct] = useState('all');
  const [busy, setBusy] = useState(false);

  const actorName = user?.full_name || user?.email || '';
  const currencyCode = tenant?.localization?.currencyCode || tenant?.currency_code;

  const { data: orders = [], isLoading } = useTenantQuery(
    ['storeOrders', tenantId],
    () => fetchData(tenantQuery('store_orders').select('*, store_order_lines(*)').match(tenantFilter()).order('created_at', { ascending: false }).limit(400)),
    { enabled: hasTenantAccess },
  );
  const { data: bookings = [] } = useTenantQuery(
    ['storeBookings', tenantId],
    () => fetchData(tenantQuery('store_bookings').select('*').match(tenantFilter()).order('starts_at', { ascending: false }).limit(500)),
    { enabled: hasTenantAccess },
  );
  const { data: products = [] } = useTenantQuery(
    ['storeProducts', tenantId],
    () => fetchData(tenantQuery('store_products').select('id, name_en, name_ar, is_bookable').match(tenantFilter())),
    { enabled: hasTenantAccess },
  );
  const { data: hours = [] } = useTenantQuery(
    ['storeHours', tenantId],
    () => fetchData(tenantQuery('store_product_hours').select('*').match(tenantFilter())),
    { enabled: hasTenantAccess },
  );
  const { data: blackouts = [] } = useTenantQuery(
    ['storeBlackouts', tenantId],
    () => fetchData(tenantQuery('store_product_blackouts').select('*').match(tenantFilter())),
    { enabled: hasTenantAccess },
  );
  const { data: students = [] } = useTenantQuery(
    ['students', tenantId],
    () => fetchData(tenantQuery('students').select('id, name_en, name_ar').match(tenantFilter())),
    { enabled: hasTenantAccess },
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['storeOrders'] });
    queryClient.invalidateQueries({ queryKey: ['storeBookings'] });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((row) => {
      if (status !== 'all' && row.status !== status) return false;
      const lines = row.store_order_lines || [];
      const isBooking = lines.some((l) => l.slot_start) || bookings.some((b) => b.order_id === row.id && b.kind === 'booking');
      if (kind === 'booking' && !isBooking) return false;
      if (kind === 'purchase' && isBooking) return false;
      if (q) {
        const hay = [row.order_number, studentName(students, row.student_id, isRTL), ...lines.map((l) => l.product_name_en), ...lines.map((l) => l.product_name_ar)].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, status, kind, search, students, isRTL, bookings]);

  const bookableProducts = products.filter((p) => p.is_bookable);
  const dayBookings = bookings.filter((b) => b.status !== 'cancelled' && String(b.starts_at).slice(0, 10) === calDate && (calProduct === 'all' || b.product_id === calProduct));

  const daySlots = useMemo(() => {
    if (calProduct === 'all') return [];
    return generateSlots({
      date: calDate,
      hours: hours.filter((h) => h.product_id === calProduct),
      blackouts: blackouts.filter((b) => b.product_id === calProduct),
      bookings: bookings.filter((b) => b.product_id === calProduct),
    });
  }, [calDate, calProduct, hours, blackouts, bookings]);

  const collectPayment = async (order) => {
    if (!currencyCode) {
      toast.error(isRTL ? 'تعذر تحديد العملة' : 'Could not resolve currency');
      return;
    }
    setBusy(true);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const time = format(new Date(), 'HH:mm');
      const result = await callApi(`/api/store/orders/${order.id}/collect-payment`, {
        payment_method: paymentMethod,
        amount: Number(order.total_amount) || 0,
        reference: paymentReference.trim() || undefined,
      });
      const updated = result.order || { ...order, status: 'ready_for_collect' };
      setSelected(updated);
      refresh();
      openStoreReceipt({
        receiptNo: shortStoreReceiptNo(result.payment?.id || result.receipt?.id),
        orderNo: order.order_number,
        invoiceNo: result.invoice?.invoice_number || '',
        schoolName: isRTL ? (tenant?.name_ar || tenant?.name_en || '') : (tenant?.name_en || tenant?.name_ar || ''),
        studentName: studentName(students, order.student_id, isRTL),
        date: today,
        time,
        cashier: actorName,
        paymentMethod,
        items: updated.store_order_lines || order.store_order_lines || [],
        amount: Number(order.total_amount) || 0,
        isRTL,
        currencyCode,
      });
      toast.success(isRTL ? 'تم تحصيل الدفع — جاهز للاستلام' : 'Payment collected — ready for pickup');
    } catch (err) {
      toast.error(err.message || (isRTL ? 'فشل تحصيل الدفع' : 'Failed to collect payment'));
    } finally {
      setBusy(false);
    }
  };

  const markCollected = async (order) => {
    setBusy(true);
    try {
      const { error } = await tenantQuery('store_orders').update({
        status: 'collected',
        collected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', order.id);
      if (error) throw error;
      refresh();
      setSelected(null);
      toast.success(isRTL ? 'تم الاستلام' : 'Marked collected');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async (order) => {
    setBusy(true);
    try {
      const { error } = await tenantQuery('store_orders').update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      }).eq('id', order.id);
      if (error) throw error;
      await tenantQuery('store_bookings').update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      }).eq('order_id', order.id);
      refresh();
      setSelected(null);
      toast.success(isRTL ? 'تم الإلغاء' : 'Cancelled');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const cancelBooking = async (booking) => {
    setBusy(true);
    try {
      const { error } = await tenantQuery('store_bookings').update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      }).eq('id', booking.id);
      if (error) throw error;
      if (booking.order_id) {
        await tenantQuery('store_orders').update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        }).eq('id', booking.order_id);
      }
      refresh();
      toast.success(isRTL ? 'تم تحرير الموعد' : 'Slot released');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const blockSlot = async (slot) => {
    if (calProduct === 'all') return;
    setBusy(true);
    try {
      const tid = typeof getTenantIdForCreate === 'function' ? getTenantIdForCreate() : tenantId;
      const { error } = await supabase.rpc('store_reserve_slot', {
        p_tenant_id: tid,
        p_product_id: calProduct,
        p_starts_at: slot.starts_at,
        p_ends_at: slot.ends_at,
        p_kind: 'block',
        p_status: 'confirmed',
        p_notes: 'Staff block',
      });
      if (error) throw error;
      refresh();
      toast.success(isRTL ? 'تم حظر الموعد' : 'Slot blocked');
    } catch (err) {
      toast.error(err.message?.includes('slot_unavailable') ? (isRTL ? 'الموعد غير متاح' : 'Slot unavailable') : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-ink">{isRTL ? 'طلبات وحجوزات المتجر' : 'Store orders & bookings'}</h1>
        <p className="text-sm text-muted-foreground">{isRTL ? 'الاستلام والإلغاء وتقويم الحجوزات' : 'Collect, cancel, and view booked slots'}</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white border">
          <TabsTrigger value="orders"><Receipt className="w-4 h-4 me-1" />{isRTL ? 'الطلبات' : 'Orders'}</TabsTrigger>
          <TabsTrigger value="calendar"><CalendarDays className="w-4 h-4 me-1" />{isRTL ? 'التقويم' : 'Calendar'}</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="ps-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={isRTL ? 'بحث' : 'Search'} />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s === 'all' ? (isRTL ? 'كل الحالات' : 'All statuses') : statusLabel(s, isRTL)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k === 'all' ? (isRTL ? 'الكل' : 'All types') : k === 'booking' ? (isRTL ? 'حجوزات' : 'Bookings') : (isRTL ? 'مبيعات' : 'Purchases')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isRTL ? 'الطلب' : 'Order'}</TableHead>
                  <TableHead>{isRTL ? 'الطالب' : 'Student'}</TableHead>
                  <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead>{isRTL ? 'الإجمالي' : 'Total'}</TableHead>
                  <TableHead>{isRTL ? 'التاريخ' : 'Date'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer" onClick={() => setSelected(row)}>
                    <TableCell className="font-medium">{row.order_number}</TableCell>
                    <TableCell>{studentName(students, row.student_id, isRTL)}</TableCell>
                    <TableCell>{statusLabel(row.status, isRTL)}</TableCell>
                    <TableCell>{formatCurrency(row.total_amount, tenant?.localization, isRTL)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.created_at ? format(new Date(row.created_at), 'yyyy-MM-dd') : '—'}</TableCell>
                  </TableRow>
                ))}
                {!isLoading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                      {isRTL ? 'لا توجد طلبات مطابقة' : 'No matching orders'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="calendar" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <Label>{isRTL ? 'اليوم' : 'Day'}</Label>
              <Input type="date" value={calDate} onChange={(e) => setCalDate(e.target.value)} />
            </div>
            <div className="flex gap-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setCalDate(format(addDays(new Date(calDate), -1), 'yyyy-MM-dd'))}>{isRTL ? 'السابق' : 'Prev'}</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setCalDate(format(addDays(new Date(calDate), 1), 'yyyy-MM-dd'))}>{isRTL ? 'التالي' : 'Next'}</Button>
            </div>
            <div>
              <Label>{isRTL ? 'المنتج' : 'Item'}</Label>
              <Select value={calProduct} onValueChange={setCalProduct}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isRTL ? 'كل الحجوزات' : 'All bookings'}</SelectItem>
                  {bookableProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{productName(p, isRTL)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {calProduct !== 'all' && (
            <div className="flex flex-wrap gap-2">
              {daySlots.map((slot) => (
                <Button
                  key={slot.starts_at}
                  type="button"
                  size="sm"
                  variant={slot.available ? 'outline' : 'secondary'}
                  disabled={busy || !slot.available}
                  onClick={() => slot.available && blockSlot(slot)}
                >
                  {String(slot.starts_at).slice(11, 16)} {slot.available ? (isRTL ? 'حظر' : 'block') : (isRTL ? 'محجوز' : 'taken')}
                </Button>
              ))}
              {daySlots.length === 0 && <p className="text-sm text-muted-foreground">{isRTL ? 'لا توجد أوقات هذا اليوم' : 'No slots this day'}</p>}
            </div>
          )}

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isRTL ? 'الوقت' : 'Time'}</TableHead>
                  <TableHead>{isRTL ? 'المنتج' : 'Item'}</TableHead>
                  <TableHead>{isRTL ? 'النوع' : 'Kind'}</TableHead>
                  <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {dayBookings.map((row) => {
                  const product = products.find((p) => p.id === row.product_id);
                  return (
                    <TableRow key={row.id}>
                      <TableCell>{String(row.starts_at).slice(11, 16)}–{String(row.ends_at).slice(11, 16)}</TableCell>
                      <TableCell>{productName(product, isRTL)}</TableCell>
                      <TableCell>{row.kind === 'block' ? (isRTL ? 'حظر' : 'Block') : (isRTL ? 'حجز' : 'Booking')}</TableCell>
                      <TableCell>{statusLabel(row.status, isRTL)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => cancelBooking(row)}>
                          {isRTL ? 'إلغاء' : 'Cancel'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {dayBookings.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {isRTL ? 'لا حجوزات في هذا اليوم' : 'No bookings on this day'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) { setSelected(null); setPaymentReference(''); setPaymentMethod('cash'); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.order_number}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <p>{studentName(students, selected.student_id, isRTL)}</p>
              <p>{statusLabel(selected.status, isRTL)} · {formatCurrency(selected.total_amount, tenant?.localization, isRTL)}</p>
              {(selected.store_order_lines || []).map((line) => (
                <p key={line.id}>
                  {isRTL ? (line.product_name_ar || line.product_name_en) : (line.product_name_en || line.product_name_ar)}
                  {line.slot_start ? ` · ${String(line.slot_start).slice(0, 16).replace('T', ' ')}` : ''}
                </p>
              ))}
              {selected.status === 'pending_payment' && (
                <div className="space-y-2 pt-2 border-t">
                  <p className="font-medium">{isRTL ? 'تحصيل الدفع في المدرسة' : 'Collect in-school payment'}</p>
                  <div>
                    <Label>{isRTL ? 'طريقة الدفع' : 'Payment method'}</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>{isRTL ? m.ar : m.en}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{isRTL ? 'مرجع (اختياري)' : 'Reference (optional)'}</Label>
                    <Input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder={isRTL ? 'رقم إيصال / مرجع' : 'Receipt or reference #'} />
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 flex-wrap">
            {selected?.status === 'pending_payment' && (
              <Button disabled={busy} onClick={() => collectPayment(selected)}>
                {isRTL ? 'تحصيل الدفع وطباعة الإيصال' : 'Collect payment & print receipt'}
              </Button>
            )}
            {selected?.status === 'ready_for_collect' && (
              <Button disabled={busy} onClick={() => markCollected(selected)}>{isRTL ? 'تم الاستلام' : 'Mark collected'}</Button>
            )}
            {(selected?.status === 'pending_payment' || selected?.status === 'ready_for_collect') && (
              <Button variant="outline" disabled={busy} onClick={() => cancelOrder(selected)}>{isRTL ? 'إلغاء' : 'Cancel order'}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
