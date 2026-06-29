/**
 * QuickPOS — AC#3: Student pays for lunch by scanning ID in <3 seconds.
 * Cashier scans student ID → wallet auto-loads → cashier selects items → one-tap pay.
 * Transaction visible to parent immediately (real-time subscription).
 */
import React, { useState, useRef, useEffect } from 'react';
import { tenantQuery } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Scan, CheckCircle, AlertTriangle, Zap, X } from 'lucide-react';

export default function QuickPOS({ students, wallets, menuItems, getTenantIdForCreate, onTransaction }) {
  const { isRTL } = useLanguage();
  const scanRef = useRef(null);

  const [idScan, setIdScan] = useState('');
  const [student, setStudent] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [cart, setCart] = useState([]); // [{item, qty}]
  const [phase, setPhase] = useState('scan'); // 'scan' | 'select' | 'confirm' | 'done'
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { scanRef.current?.focus(); }, []);

  const availableItems = menuItems.filter(m => m.is_available && !m.is_prohibited);
  const cartTotal = cart.reduce((s, c) => s + c.item.price * c.qty, 0);
  const today = format(new Date(), 'yyyy-MM-dd');

  const handleScan = (e) => {
    if (e.key !== 'Enter') return;
    const q = idScan.trim();
    if (!q) return;

    const s = students.find(st => st.student_id === q || st.national_id === q || st.id === q || st.name_ar?.includes(q));
    if (!s) {
      setError(isRTL ? `لم يُعثر على طالب: ${q}` : `Student not found: ${q}`);
      setIdScan('');
      return;
    }
    const w = wallets.find(wl => wl.student_id === s.id);
    if (!w || w.balance <= 0) {
      setError(isRTL ? `رصيد المحفظة صفر — ${s.name_ar}` : `Zero balance — ${s.name_ar}`);
      setIdScan('');
      return;
    }
    setError('');
    setStudent(s);
    setWallet(w);
    setCart([]);
    setPhase('select');
  };

  const addToCart = (item) => {
    setCart(c => {
      const existing = c.find(x => x.item.id === item.id);
      if (existing) return c.map(x => x.item.id === item.id ? { ...x, qty: x.qty + 1 } : x);
      return [...c, { item, qty: 1 }];
    });
  };

  const removeFromCart = (itemId) => {
    setCart(c => c.filter(x => x.item.id !== itemId));
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

      await tenantQuery('canteen_wallets').update({
        balance: newBalance,
        last_transaction_date: today,
      });

      await tenantQuery('canteen_transactions').insert({
        ...(tid && { tenant_id: tid }),
        wallet_id: wallet.id,
        student_id: student.id,
        student_name: student.name_ar,
        transaction_type: 'purchase',
        amount: cartTotal,
        balance_before: wallet.balance,
        balance_after: newBalance,
        items: cart.map(c => ({ item_name: c.item.name_ar, quantity: c.qty, unit_price: c.item.price })),
        payment_method: 'wallet',
        transaction_date: today,
        transaction_time: format(now, 'HH:mm'),
        processed_by: 'cashier',
      });

      setPhase('done');
      onTransaction?.();
      toast.success(isRTL ? `✓ تم الدفع — المتبقي: ${newBalance} ر.س` : `✓ Paid — Balance: ${newBalance} SAR`);

      setTimeout(() => {
        setPhase('scan'); setIdScan(''); setStudent(null); setWallet(null); setCart([]);
        scanRef.current?.focus();
      }, 2500);
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* PHASE: SCAN */}
      {phase === 'scan' && (
        <div className="space-y-3">
          <div className="text-center py-4">
            <Scan className="w-12 h-12 text-orange-400 mx-auto mb-2 animate-pulse" />
            <p className="font-semibold text-ink text-lg">{isRTL ? 'امسح بطاقة الطالب' : 'Scan Student ID'}</p>
            <p className="text-xs text-muted-foreground mt-1">{isRTL ? 'أو أدخل رقم الطالب يدوياً' : 'Or type student ID manually'}</p>
          </div>
          <Input
            ref={scanRef}
            value={idScan}
            onChange={e => { setIdScan(e.target.value); setError(''); }}
            onKeyDown={handleScan}
            placeholder={isRTL ? 'رقم الطالب...' : 'Student ID...'}
            className="text-center h-14 text-xl font-mono tracking-widest"
            autoComplete="off"
          />
        </div>
      )}

      {/* PHASE: SELECT ITEMS */}
      {phase === 'select' && student && wallet && (
        <div className="space-y-3">
          {/* Wallet header */}
          <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-xl">
            <div>
              <p className="font-bold text-orange-800">{student.name_ar}</p>
              <p className="text-xs text-orange-600">{student.grade}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-orange-500">{isRTL ? 'الرصيد' : 'Balance'}</p>
              <p className={`text-xl font-bold ${wallet.balance < 20 ? 'text-red-600' : 'text-green-600'}`}>{wallet.balance} SAR</p>
            </div>
          </div>

          {/* Menu items grid */}
          <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
            {availableItems.map(item => {
              const inCart = cart.find(c => c.item.id === item.id);
              return (
                <button key={item.id} onClick={() => addToCart(item)}
                  className={`flex flex-col p-3 rounded-xl border-2 text-start transition-all ${inCart ? 'border-orange-500 bg-orange-50' : 'border-border hover:border-orange-300'}`}>
                  <p className="font-semibold text-sm text-ink leading-tight">{item.name_ar}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-orange-600 font-bold">{item.price} SAR</span>
                    {inCart && <span className="text-xs bg-orange-500 text-white rounded-full w-5 h-5 flex items-center justify-center font-bold">×{inCart.qty}</span>}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Cart summary */}
          {cart.length > 0 && (
            <div className="space-y-1">
              {cart.map(c => (
                <div key={c.item.id} className="flex items-center justify-between text-sm">
                  <span>{c.item.name_ar} ×{c.qty}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{(c.item.price * c.qty).toFixed(2)} SAR</span>
                    <button onClick={() => removeFromCart(c.item.id)} className="text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
              <div className="border-t pt-1 flex justify-between font-bold text-base">
                <span>{isRTL ? 'الإجمالي' : 'Total'}</span>
                <span className={cartTotal > wallet.balance ? 'text-red-600' : 'text-ink'}>{cartTotal.toFixed(2)} SAR</span>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setPhase('scan'); setStudent(null); setWallet(null); setCart([]); }} className="flex-1 h-10">
              ← {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handlePay} disabled={saving || cart.length === 0 || cartTotal > wallet.balance}
              className="flex-2 h-10 bg-orange-600 hover:bg-orange-700 text-white px-6">
              <Zap className="w-4 h-4 me-1" />
              {isRTL ? `دفع ${cartTotal.toFixed(2)} SAR` : `Pay ${cartTotal.toFixed(2)} SAR`}
            </Button>
          </div>
        </div>
      )}

      {/* DONE */}
      {phase === 'done' && (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <p className="text-lg font-bold text-green-700">{isRTL ? 'تم الدفع!' : 'Payment Done!'}</p>
          <p className="text-sm text-muted-foreground text-center">
            {student?.name_ar} — {cartTotal.toFixed(2)} SAR<br />
            <span className="text-xs text-muted-foreground">{isRTL ? 'سيتلقى ولي الأمر إشعاراً فورياً' : 'Parent notified in real time'}</span>
          </p>
        </div>
      )}
    </div>
  );
}