/**
 * iPad / touch-first canteen POS.
 * Menu is always visible; tap a student, tap items, pay.
 * Parent-set allergen types surface as alerts when a matching item is tapped.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { tenantQuery } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useTenant } from '../TenantContext';
import { useRole } from '../RoleContext';
import { formatCurrency } from '../../lib/localization';
import { applyCanteenStock } from '../../lib/canteenStock';
import { allergenLabel, itemAllergenHits, studentAllergens } from '../../lib/canteenAllergens';
import { openCanteenReceipt, shortReceiptNo } from '../../lib/canteenReceipt';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  AlertTriangle, CheckCircle, Minus, Plus, Printer, Scan, Search, ShoppingBag, Wallet, X, Zap,
} from 'lucide-react';

const CATEGORIES = [
  { value: 'all', ar: 'الكل', en: 'All' },
  { value: 'main', ar: 'وجبات', en: 'Mains' },
  { value: 'snack', ar: 'سناك', en: 'Snacks' },
  { value: 'drink', ar: 'مشروبات', en: 'Drinks' },
  { value: 'fruit', ar: 'فاكهة', en: 'Fruit' },
  { value: 'dessert', ar: 'حلويات', en: 'Dessert' },
  { value: 'other', ar: 'أخرى', en: 'Other' },
];

export default function QuickPOS({ students, wallets, menuItems, getTenantIdForCreate, onTransaction }) {
  const { isRTL } = useLanguage();
  const { tenant } = useTenant();
  const { user } = useRole();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [student, setStudent] = useState(null);
  const [cart, setCart] = useState([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);
  const [showTopup, setShowTopup] = useState(false);
  const [topupAmount, setTopupAmount] = useState(50);
  const [pendingAllergen, setPendingAllergen] = useState(null);
  const [ackedAllergens, setAckedAllergens] = useState({});
  const searchRef = useRef(null);

  const wallet = student ? wallets.find((w) => w.student_id === student.id) : null;
  const allergies = studentAllergens(student);
  const cartTotal = cart.reduce((sum, line) => sum + line.item.price * line.qty, 0);
  const today = format(new Date(), 'yyyy-MM-dd');
  const studentName = (s) => (isRTL ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar));
  const schoolName = isRTL
    ? (tenant?.name_ar || tenant?.school_name_ar || tenant?.name_en || '')
    : (tenant?.name_en || tenant?.school_name_en || tenant?.name_ar || '');
  const cashierName = user?._displayName || user?.email || 'cashier';
  const currencyCode = tenant?.localization?.currencyCode || tenant?.currency_code;
  if (!currencyCode) {
    throw new Error('currency_unresolved: canteen POS requires tenant localization currencyCode');
  }

  const printReceipt = (payload) => {
    openCanteenReceipt({
      ...payload,
      schoolName,
      isRTL,
      currencyCode,
    });
  };

  const focusSearch = () => {
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  useEffect(() => {
    focusSearch();
  }, []);

  const filteredStudents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (students || []).filter((s) => {
      if (!q) return true;
      return [s.name_ar, s.name_en, s.student_id, s.national_id, s.id].some((v) =>
        String(v || '').toLowerCase().includes(q)
      );
    });
  }, [students, query]);

  const visibleItems = useMemo(() => {
    return (menuItems || []).filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      return true;
    });
  }, [menuItems, category]);

  const selectStudent = (next) => {
    setStudent(next);
    setCart([]);
    setAckedAllergens({});
    setDone(null);
    setQuery('');
    focusSearch();
  };

  const handleSearchKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const raw = query.trim();
    if (!raw) return;
    const needle = raw.toLowerCase();
    const exact = (students || []).find((s) =>
      [s.student_id, s.national_id, s.id].some((v) => String(v ?? '').trim().toLowerCase() === needle)
    );
    if (exact) {
      selectStudent(exact);
      return;
    }
    if (filteredStudents.length === 1) {
      selectStudent(filteredStudents[0]);
      return;
    }
    if (filteredStudents.length === 0) {
      toast.error(isRTL ? 'لم يُعثر على طالب بهذا الرمز' : 'No student matches this scan');
    }
  };

  const tryAddItem = (item) => {
    const stock = Number(item.stock_qty) || 0;
    if (item.is_prohibited) {
      toast.error(isRTL ? 'هذا الصنف ممنوع في المقصف' : 'This item is prohibited');
      return;
    }
    if (!item.is_available) {
      toast.error(isRTL ? 'الصنف غير متاح حالياً' : 'Item is not on the menu today');
      return;
    }
    if (stock <= 0) {
      toast.error(isRTL ? 'نفد المخزون' : 'Out of stock');
      return;
    }
    if (!student) {
      toast.error(isRTL ? 'اختر الطالب أولاً' : 'Select a student first');
      return;
    }
    const hits = itemAllergenHits(item, student);
    if (hits.length && !ackedAllergens[item.id]) {
      setPendingAllergen({ item, hits });
      return;
    }
    addToCart(item);
  };

  const addToCart = (item) => {
    const stock = Number(item.stock_qty) || 0;
    setCart((current) => {
      const existing = current.find((line) => line.item.id === item.id);
      const nextQty = existing ? existing.qty + 1 : 1;
      if (nextQty > stock) {
        toast.error(isRTL ? `المتبقي ${stock} فقط` : `Only ${stock} left`);
        return current;
      }
      if (existing) return current.map((line) => (line.item.id === item.id ? { ...line, qty: nextQty } : line));
      return [...current, { item, qty: 1 }];
    });
  };

  const setQty = (itemId, qty) => {
    setCart((current) => {
      if (qty <= 0) return current.filter((line) => line.item.id !== itemId);
      return current.map((line) => {
        if (line.item.id !== itemId) return line;
        const stock = Number(line.item.stock_qty) || 0;
        return { ...line, qty: Math.min(qty, stock) };
      });
    });
  };

  const confirmAllergenAdd = () => {
    if (!pendingAllergen) return;
    setAckedAllergens((prev) => ({ ...prev, [pendingAllergen.item.id]: true }));
    addToCart(pendingAllergen.item);
    setPendingAllergen(null);
  };

  const handlePay = async () => {
    if (!student || !wallet || cart.length === 0) return;
    if (cartTotal > wallet.balance) {
      toast.error(isRTL ? 'الرصيد غير كافٍ' : 'Insufficient balance');
      return;
    }
    setSaving(true);
    try {
      const tid = getTenantIdForCreate();
      const newBalance = parseFloat((wallet.balance - cartTotal).toFixed(2));
      const now = new Date();

      const { error: walletErr } = await tenantQuery('canteen_wallets').update({
        balance: newBalance,
        last_transaction_date: today,
      }).eq('id', wallet.id);
      if (walletErr) throw walletErr;

      const items = cart.map((line) => ({
        item_id: line.item.id,
        item_name: line.item.name_ar || line.item.name_en,
        name_en: line.item.name_en,
        quantity: line.qty,
        unit_price: line.item.price,
        allergens: line.item.allergens || [],
      }));
      const time = format(now, 'HH:mm');
      const { data: txn, error: txnErr } = await tenantQuery('canteen_transactions').insert({
        ...(tid && { tenant_id: tid }),
        wallet_id: wallet.id,
        student_id: student.id,
        student_name: studentName(student),
        transaction_type: 'purchase',
        amount: cartTotal,
        balance_before: wallet.balance,
        balance_after: newBalance,
        items,
        payment_method: 'wallet',
        transaction_date: today,
        transaction_time: time,
        notes: allergies.length ? `allergens:${allergies.join(',')}` : null,
        processed_by: cashierName,
      }).select('id').single();
      if (txnErr) throw txnErr;

      for (const line of cart) {
        await applyCanteenStock({
          tenantId: tid,
          itemId: line.item.id,
          movementType: 'sale',
          qtyDelta: -line.qty,
          reason: isRTL ? `بيع نقطة البيع — ${studentName(student)}` : `POS sale — ${studentName(student)}`,
          performedBy: cashierName,
          saleTxnId: txn?.id,
        });
      }

      const receipt = {
        kind: 'purchase',
        receiptNo: shortReceiptNo(txn?.id),
        studentName: studentName(student),
        grade: student.grade || '',
        date: today,
        time,
        cashier: cashierName,
        paymentMethod: 'wallet',
        items,
        amount: cartTotal,
        balanceBefore: wallet.balance,
        balanceAfter: newBalance,
      };
      printReceipt(receipt);
      setDone(receipt);
      setCart([]);
      onTransaction?.();
      toast.success(isRTL ? 'تم الدفع — يمكنك طباعة الإيصال' : 'Paid — print the receipt');
    } catch (err) {
      toast.error(err.message === 'INSUFFICIENT_STOCK'
        ? (isRTL ? 'المخزون غير كافٍ' : 'Insufficient stock')
        : (err.message || (isRTL ? 'تعذر إتمام الدفع' : 'Payment failed')));
    } finally {
      setSaving(false);
    }
  };

  const handleTopup = async () => {
    if (!student) return;
    const amount = parseFloat(topupAmount);
    if (!amount || amount <= 0) {
      toast.error(isRTL ? 'أدخل مبلغاً صحيحاً' : 'Enter a valid amount');
      return;
    }
    setSaving(true);
    try {
      const tid = getTenantIdForCreate();
      const now = new Date();
      const time = format(now, 'HH:mm');
      const before = Number(wallet?.balance) || 0;
      const after = parseFloat((before + amount).toFixed(2));
      let walletId = wallet?.id;

      if (walletId) {
        const { error: walletErr } = await tenantQuery('canteen_wallets').update({
          balance: after,
          last_transaction_date: today,
        }).eq('id', walletId);
        if (walletErr) throw walletErr;
      } else {
        const { data: created, error: createErr } = await tenantQuery('canteen_wallets').insert({
          ...(tid && { tenant_id: tid }),
          student_id: student.id,
          student_name: studentName(student),
          grade: student.grade,
          balance: after,
          is_active: true,
          last_transaction_date: today,
        }).select('id').single();
        if (createErr) throw createErr;
        walletId = created?.id;
      }

      const { data: txn, error: txnErr } = await tenantQuery('canteen_transactions').insert({
        ...(tid && { tenant_id: tid }),
        wallet_id: walletId,
        student_id: student.id,
        student_name: studentName(student),
        transaction_type: 'topup',
        amount,
        balance_before: before,
        balance_after: after,
        payment_method: 'cash',
        transaction_date: today,
        transaction_time: time,
        processed_by: cashierName,
      }).select('id').single();
      if (txnErr) throw txnErr;

      const receipt = {
        kind: 'topup',
        receiptNo: shortReceiptNo(txn?.id),
        studentName: studentName(student),
        grade: student.grade || '',
        date: today,
        time,
        cashier: cashierName,
        paymentMethod: 'cash',
        items: [],
        amount,
        balanceBefore: before,
        balanceAfter: after,
      };
      printReceipt(receipt);
      setDone(receipt);
      setShowTopup(false);
      setTopupAmount(50);
      onTransaction?.();
      toast.success(isRTL ? 'تم شحن المحفظة' : 'Wallet topped up');
    } catch (err) {
      toast.error(err.message || (isRTL ? 'تعذر شحن المحفظة' : 'Top-up failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_320px] gap-4 min-h-[70vh]">
      {/* Students */}
      <aside className="rounded-2xl border bg-white p-3 flex flex-col min-h-[240px]">
        <div className="relative mb-3">
          <Search className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none ${isRTL ? 'right-3.5' : 'left-3.5'}`} />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder={isRTL ? 'ابحث أو امسح رقم الطالب...' : 'Search or scan student ID...'}
            aria-label={isRTL ? 'بحث أو مسح باركود الطالب' : 'Search or scan student barcode'}
            className={`${isRTL ? 'pr-11 pl-11' : 'pl-11 pr-11'} h-14 text-lg`}
          />
          <Scan className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-orange-500 pointer-events-none ${isRTL ? 'left-3.5' : 'right-3.5'}`} />
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {filteredStudents.map((s) => {
            const w = wallets.find((row) => row.student_id === s.id);
            const selected = student?.id === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => selectStudent(s)}
                className={`w-full min-h-[72px] rounded-2xl border-2 px-3 py-3 text-start touch-manipulation active:scale-[0.98] transition ${selected ? 'border-orange-500 bg-orange-50' : 'border-border bg-white'}`}
              >
                <p className="font-semibold text-ink leading-tight">{studentName(s)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.grade || '—'}</p>
                <p className={`text-sm font-bold mt-1 ${(w?.balance || 0) < 20 ? 'text-red-600' : 'text-green-700'}`}>
                  {formatCurrency(w?.balance || 0, tenant?.localization, isRTL)}
                </p>
              </button>
            );
          })}
          {filteredStudents.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">{isRTL ? 'لا طلاب' : 'No students'}</p>
          )}
        </div>
      </aside>

      {/* Menu */}
      <section className="rounded-2xl border bg-white p-3 flex flex-col min-h-[420px]">
        {student && (
          <div className="mb-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-orange-900">{studentName(student)}</p>
                <p className="text-xs text-orange-700">{student.grade} · {isRTL ? 'الرصيد' : 'Balance'} {formatCurrency(wallet?.balance || 0, tenant?.localization, isRTL)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-10 rounded-full"
                  onClick={() => setShowTopup(true)}
                >
                  <Wallet className="w-4 h-4 me-1" />
                  {isRTL ? 'شحن' : 'Top up'}
                </Button>
                <button type="button" onClick={() => selectStudent(null)} className="h-10 w-10 rounded-full border bg-white grid place-items-center touch-manipulation">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {allergies.length > 0 ? (
              <div className="mt-2 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-2">
                <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-red-800">{isRTL ? 'حساسية مسجّلة من ولي الأمر' : 'Parent-set allergies'}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {allergies.map((key) => (
                      <span key={key} className="text-xs px-2 py-1 rounded-full bg-red-600 text-white font-medium">{allergenLabel(key, isRTL)}</span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-orange-700 mt-2">{isRTL ? 'لا توجد حساسية مسجّلة' : 'No allergies on file'}</p>
            )}
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto pb-3">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCategory(cat.value)}
              className={`shrink-0 h-11 px-4 rounded-full text-sm font-medium border touch-manipulation ${category === cat.value ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-ink'}`}
            >
              {isRTL ? cat.ar : cat.en}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 overflow-y-auto flex-1 content-start">
          {visibleItems.map((item) => {
            const inCart = cart.find((line) => line.item.id === item.id);
            const stock = Number(item.stock_qty) || 0;
            const hits = student ? itemAllergenHits(item, student) : [];
            const disabledLook = stock <= 0 || item.is_prohibited || !item.is_available;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => tryAddItem(item)}
                className={`min-h-[132px] rounded-2xl border-2 p-4 text-start touch-manipulation active:scale-[0.97] transition ${inCart ? 'border-orange-500 bg-orange-50' : hits.length ? 'border-red-400 bg-red-50' : 'border-border bg-white'} ${disabledLook ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-base leading-tight text-ink">{isRTL ? (item.name_ar || item.name_en) : (item.name_en || item.name_ar)}</p>
                  {inCart && <span className="h-7 min-w-7 px-1 rounded-full bg-orange-600 text-white text-sm font-bold grid place-items-center">×{inCart.qty}</span>}
                </div>
                <p className="text-lg font-bold text-orange-600 mt-2">{formatCurrency(item.price, tenant?.localization, isRTL)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stock <= 0 ? (isRTL ? 'نفد' : 'Out of stock') : (isRTL ? `${stock} متاح` : `${stock} in stock`)}
                </p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {(item.allergens || []).map((key) => (
                    <span key={key} className={`text-[10px] px-1.5 py-0.5 rounded-full ${hits.includes(key) ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-800'}`}>
                      {allergenLabel(key, isRTL)}
                    </span>
                  ))}
                  {item.is_prohibited && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">{isRTL ? 'ممنوع' : 'Prohibited'}</span>}
                </div>
              </button>
            );
          })}
          {visibleItems.length === 0 && (
            <p className="col-span-full text-center text-muted-foreground py-16">{isRTL ? 'لا توجد أصناف' : 'No menu items'}</p>
          )}
        </div>
      </section>

      {/* Cart */}
      <aside className="rounded-2xl border bg-white p-4 flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <ShoppingBag className="w-5 h-5 text-orange-500" />
          <h2 className="font-semibold">{isRTL ? 'السلة' : 'Order'}</h2>
        </div>
        {done ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-2">
            <div className="w-16 h-16 bg-green-100 rounded-full grid place-items-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <p className="font-bold text-green-700">{done.kind === 'topup' ? (isRTL ? 'تم الشحن' : 'Topped up') : (isRTL ? 'تم الدفع' : 'Paid')}</p>
            <p className="text-sm text-muted-foreground">{done.studentName}</p>
            <p className="font-semibold">{formatCurrency(done.amount, tenant?.localization, isRTL)}</p>
            <p className="text-xs text-muted-foreground">
              {isRTL ? 'الرصيد بعد' : 'Balance after'} {formatCurrency(done.balanceAfter, tenant?.localization, isRTL)}
            </p>
            <Button
              type="button"
              className="w-full h-12 rounded-2xl bg-orange-600 hover:bg-orange-700 text-white"
              onClick={() => printReceipt(done)}
            >
              <Printer className="w-4 h-4 me-1" />
              {isRTL ? 'طباعة الإيصال' : 'Print receipt'}
            </Button>
            <Button type="button" variant="outline" className="w-full h-11 rounded-2xl" onClick={() => setDone(null)}>
              {isRTL ? 'عملية جديدة' : 'New sale'}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto space-y-2">
              {cart.map((line) => (
                <div key={line.item.id} className="rounded-xl border p-3">
                  <p className="font-medium text-sm">{isRTL ? line.item.name_ar : (line.item.name_en || line.item.name_ar)}</p>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <button type="button" className="h-11 w-11 rounded-xl border grid place-items-center touch-manipulation" onClick={() => setQty(line.item.id, line.qty - 1)}>
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-6 text-center font-bold">{line.qty}</span>
                      <button type="button" className="h-11 w-11 rounded-xl border grid place-items-center touch-manipulation" onClick={() => setQty(line.item.id, line.qty + 1)}>
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <span className="font-semibold">{formatCurrency(line.item.price * line.qty, tenant?.localization, isRTL)}</span>
                  </div>
                </div>
              ))}
              {cart.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-10">{isRTL ? 'اضغط على الأصناف لإضافتها' : 'Tap menu items to add them'}</p>
              )}
            </div>
            <div className="border-t pt-3 mt-3 space-y-3">
              <div className="flex justify-between text-lg font-bold">
                <span>{isRTL ? 'الإجمالي' : 'Total'}</span>
                <span className={wallet && cartTotal > wallet.balance ? 'text-red-600' : ''}>{formatCurrency(cartTotal, tenant?.localization, isRTL)}</span>
              </div>
              <Button
                onClick={handlePay}
                disabled={saving || !student || cart.length === 0 || !wallet || cartTotal > wallet.balance}
                className="w-full h-14 text-base bg-orange-600 hover:bg-orange-700 text-white rounded-2xl touch-manipulation"
              >
                <Zap className="w-5 h-5 me-1" />
                {isRTL ? 'دفع' : 'Charge'}
              </Button>
              {!wallet && student && (
                <p className="text-xs text-red-600 flex items-center gap-1"><Wallet className="w-3 h-3" />{isRTL ? 'لا توجد محفظة لهذا الطالب — اشحن لإنشائها' : 'No wallet for this student — top up to create one'}</p>
              )}
            </div>
          </>
        )}
      </aside>

      <Dialog open={showTopup} onOpenChange={setShowTopup}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'شحن المحفظة' : 'Top up wallet'}</DialogTitle>
          </DialogHeader>
          {student && (
            <div className="space-y-3">
              <div className="rounded-xl bg-green-50 border border-green-100 p-3">
                <p className="font-medium text-sm">{studentName(student)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isRTL ? 'الرصيد الحالي' : 'Current balance'} {formatCurrency(wallet?.balance || 0, tenant?.localization, isRTL)}
                </p>
              </div>
              <div className="space-y-1">
                <Label>{isRTL ? 'المبلغ نقداً' : 'Cash amount'}</Label>
                <Input type="number" min="1" value={topupAmount} onChange={(e) => setTopupAmount(e.target.value)} />
              </div>
              <div className="flex gap-2">
                {[20, 50, 100, 200].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTopupAmount(value)}
                    className="flex-1 py-2 text-xs border rounded-xl hover:bg-sand"
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTopup(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleTopup} disabled={saving || !student} className="bg-orange-600 hover:bg-orange-700 text-white">
              {isRTL ? 'شحن وطباعة' : 'Top up & print'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingAllergen} onOpenChange={(open) => { if (!open) setPendingAllergen(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              {isRTL ? 'تنبيه حساسية' : 'Allergy alert'}
            </DialogTitle>
          </DialogHeader>
          {pendingAllergen && (
            <div className="space-y-3">
              <p className="text-sm">
                {isRTL
                  ? `${studentName(student)} لديه حساسية من هذا الصنف.`
                  : `${studentName(student)} is allergic to this item.`}
              </p>
              <p className="font-semibold">{isRTL ? pendingAllergen.item.name_ar : pendingAllergen.item.name_en}</p>
              <div className="flex flex-wrap gap-1">
                {pendingAllergen.hits.map((key) => (
                  <span key={key} className="text-xs px-2 py-1 rounded-full bg-red-600 text-white">{allergenLabel(key, isRTL)}</span>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingAllergen(null)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={confirmAllergenAdd}>
              {isRTL ? 'إضافة رغم التنبيه' : 'Add anyway'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
