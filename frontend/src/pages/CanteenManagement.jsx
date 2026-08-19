import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useTenant } from '../components/TenantContext';
import { useRole } from '../components/RoleContext';
import { getCurrencySymbol, formatCurrency } from '../lib/localization';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { useTenantQuery } from '../hooks/useTenantQuery';
import { applyCanteenStock, stockStatus } from '../lib/canteenStock';
import { openCanteenReceipt, shortReceiptNo } from '../lib/canteenReceipt';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Switch } from '../components/ui/switch';
import StatCard from '../components/ui/StatCard';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ShoppingCart, Plus, Search, AlertTriangle, Wallet, UtensilsCrossed, CheckCircle, Coffee, Scan, Package, ClipboardList } from 'lucide-react';
import { Textarea } from '../components/ui/textarea';
import QuickPOS from '../components/canteen/QuickPOS';

const CATEGORIES = [
  { value: 'main', ar: 'وجبة رئيسية', en: 'Main Meal' },
  { value: 'snack', ar: 'وجبة خفيفة', en: 'Snack' },
  { value: 'drink', ar: 'مشروب', en: 'Drink' },
  { value: 'fruit', ar: 'فاكهة', en: 'Fruit' },
  { value: 'dessert', ar: 'حلوى', en: 'Dessert' },
  { value: 'other', ar: 'أخرى', en: 'Other' },
];
const ALLERGENS = ['nuts', 'dairy', 'gluten', 'eggs', 'soy', 'fish', 'shellfish'];

const BLANK_ITEM = { name_ar: '', name_en: '', category: 'main', price: 0, calories: 0, allergens: [], is_halal: true, is_prohibited: false, is_available: true, stock_qty: 0, low_stock_threshold: 10 };
const ADJUST_REASONS = [
  { value: 'count_correction', ar: 'تصحيح الجرد', en: 'Count correction' },
  { value: 'damaged', ar: 'تالف', en: 'Damaged' },
  { value: 'expired', ar: 'منتهي الصلاحية', en: 'Expired' },
  { value: 'waste', ar: 'هدر / إتلاف', en: 'Waste' },
  { value: 'other', ar: 'سبب آخر', en: 'Other' },
];
const MOVEMENT_LABELS = {
  opening: { ar: 'رصيد افتتاحي', en: 'Opening' },
  receive: { ar: 'إضافة مخزون', en: 'Received' },
  sale: { ar: 'بيع', en: 'Sale' },
  waste: { ar: 'هدر', en: 'Waste' },
  adjustment: { ar: 'تعديل', en: 'Adjustment' },
};

export default function CanteenManagement() {
  const { isRTL } = useLanguage();
  const { tenant } = useTenant();
  const { user, userRole } = useRole();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();
  const queryClient = useQueryClient();

  const actorName = user?._displayName || user?.email || 'staff';

  const [tab, setTab] = useState('dashboard');
  const [showItemForm, setShowItemForm] = useState(false);
  const [showTopupForm, setShowTopupForm] = useState(false);
  const [itemForm, setItemForm] = useState(BLANK_ITEM);
  const [editingItem, setEditingItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [topupData, setTopupData] = useState({ student_id: '', student_name: '', amount: 50 });
  const [studentSearch, setStudentSearch] = useState('');
  const [stockDialog, setStockDialog] = useState(null); // { mode: 'add'|'adjust', item }
  const [stockQty, setStockQty] = useState(10);
  const [stockReason, setStockReason] = useState('count_correction');
  const [stockNote, setStockNote] = useState('');

  const { data: menuItems = [], isLoading: _menuLoading } = useTenantQuery(
    ['canteenMenu', tenantId],
    () => fetchData(tenantQuery('canteen_menu_items').select('*').match(tenantFilter())),
    { enabled: hasTenantAccess },
  );

  const { data: wallets = [] } = useTenantQuery(
    ['canteenWallets', tenantId],
    () => fetchData(tenantQuery('canteen_wallets').select('*').match(tenantFilter())),
    { enabled: hasTenantAccess },
  );

  const { data: transactions = [] } = useTenantQuery(
    ['canteenTransactions', tenantId],
    () => fetchData(tenantQuery('canteen_transactions').select('*').match(tenantFilter()).order('created_at', { ascending: false })),
    { enabled: hasTenantAccess },
  );

  const { data: students = [] } = useTenantQuery(
    ['students', tenantId],
    () => fetchData(tenantQuery('students').select('*').match(tenantFilter()).order('created_at', { ascending: false })),
    { enabled: hasTenantAccess },
  );

  const rosterStudents = React.useMemo(() => {
    if (userRole === 'parent') {
      return students.filter((s) => user?.linked_student_ids?.includes(s.id));
    }
    if (userRole === 'teacher') {
      const teacherGrades = user?.assigned_grades || [];
      const teacherSections = user?.assigned_sections || [];
      return students.filter((s) => teacherGrades.includes(s.grade) || teacherSections.includes(s.section));
    }
    return students;
  }, [students, userRole, user]);

  const { data: stockMovements = [] } = useTenantQuery(
    ['canteenStockMovements', tenantId],
    () => fetchData(tenantQuery('canteen_stock_movements').select('*').match(tenantFilter()).order('created_at', { ascending: false }).limit(200)),
    { enabled: hasTenantAccess },
  );

  const refreshCanteen = () => {
    queryClient.invalidateQueries({ queryKey: ['canteenMenu'] });
    queryClient.invalidateQueries({ queryKey: ['canteenWallets'] });
    queryClient.invalidateQueries({ queryKey: ['canteenTransactions'] });
    queryClient.invalidateQueries({ queryKey: ['canteenStockMovements'] });
  };

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayTxns = transactions.filter(t => t.transaction_date === today && t.transaction_type === 'purchase');
  const todayRevenue = todayTxns.reduce((s, t) => s + (t.amount || 0), 0);
  const lowBalanceWallets = wallets.filter(w => w.balance < 20).length;
  const zeroBalanceWallets = wallets.filter(w => w.balance <= 0).length;
  const prohibitedCount = menuItems.filter(m => m.is_prohibited).length;
  const lowStockItems = menuItems.filter(m => stockStatus(m) !== 'ok');
  const outOfStockCount = menuItems.filter(m => stockStatus(m) === 'out').length;

  const filteredMenu = menuItems.filter(m => {
    const q = search.toLowerCase();
    return !q || m.name_ar?.includes(search) || m.name_en?.toLowerCase().includes(q);
  });

  const filteredStudents = rosterStudents.filter(s => {
    const q = studentSearch.toLowerCase();
    return !q || s.name_ar?.includes(studentSearch) || s.name_en?.toLowerCase().includes(q);
  });

  const handleSaveItem = async () => {
    if (!itemForm.name_ar) return toast.error(isRTL ? 'أدخل اسم الصنف' : 'Enter item name');
    setSaving(true);
    try {
      const tid = getTenantIdForCreate();
      const payload = {
        name_ar: itemForm.name_ar,
        name_en: itemForm.name_en,
        category: itemForm.category,
        price: itemForm.price,
        calories: itemForm.calories,
        allergens: itemForm.allergens || [],
        is_halal: itemForm.is_halal,
        is_prohibited: itemForm.is_prohibited,
        is_available: itemForm.is_available,
        low_stock_threshold: parseInt(itemForm.low_stock_threshold, 10) || 10,
      };
      if (editingItem) {
        const { error } = await tenantQuery('canteen_menu_items').update(payload).eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const openingQty = Math.max(0, parseInt(itemForm.stock_qty, 10) || 0);
        const { data: created, error } = await tenantQuery('canteen_menu_items')
          .insert({ ...payload, stock_qty: 0, ...(tid && { tenant_id: tid }) })
          .select('id')
          .single();
        if (error) throw error;
        if (openingQty > 0 && created?.id) {
          await applyCanteenStock({
            tenantId: tid,
            itemId: created.id,
            movementType: 'opening',
            qtyDelta: openingQty,
            reason: isRTL ? 'رصيد افتتاحي عند إضافة الصنف' : 'Opening stock on item create',
            performedBy: actorName,
          });
        }
      }
      refreshCanteen();
      setShowItemForm(false); setItemForm(BLANK_ITEM); setEditingItem(null);
      toast.success(isRTL ? 'تم الحفظ' : 'Saved');
    } catch (err) {
      toast.error(err.message || (isRTL ? 'تعذر الحفظ' : 'Could not save'));
    } finally { setSaving(false); }
  };

  const openStockDialog = (mode, item) => {
    setStockDialog({ mode, item });
    setStockQty(mode === 'add' ? 10 : (item.stock_qty || 0));
    setStockReason('count_correction');
    setStockNote('');
  };

  const handleStockChange = async () => {
    if (!stockDialog?.item) return;
    const item = stockDialog.item;
    const tid = getTenantIdForCreate();
    const qty = parseInt(stockQty, 10);
    if (!Number.isFinite(qty) || qty < 0) return toast.error(isRTL ? 'أدخل كمية صحيحة' : 'Enter a valid quantity');

    let movementType;
    let qtyDelta;
    let reason;
    if (stockDialog.mode === 'add') {
      if (qty <= 0) return toast.error(isRTL ? 'أدخل كمية أكبر من صفر' : 'Enter a quantity greater than 0');
      movementType = 'receive';
      qtyDelta = qty;
      reason = stockNote || (isRTL ? 'إضافة مخزون' : 'Stock received');
    } else {
      qtyDelta = qty - (Number(item.stock_qty) || 0);
      if (qtyDelta === 0) return toast.error(isRTL ? 'لم يتغير المخزون' : 'Stock is unchanged');
      const reasonLabel = ADJUST_REASONS.find(r => r.value === stockReason)?.[isRTL ? 'ar' : 'en'] || stockReason;
      reason = stockNote ? `${reasonLabel}: ${stockNote}` : reasonLabel;
      if (stockReason === 'waste' || stockReason === 'damaged' || stockReason === 'expired') {
        movementType = qtyDelta < 0 ? 'waste' : 'adjustment';
      } else {
        movementType = 'adjustment';
      }
    }

    setSaving(true);
    try {
      await applyCanteenStock({
        tenantId: tid,
        itemId: item.id,
        movementType,
        qtyDelta,
        reason,
        performedBy: actorName,
      });
      refreshCanteen();
      setStockDialog(null);
      toast.success(isRTL ? 'تم تحديث المخزون' : 'Stock updated');
    } catch (err) {
      toast.error(err.message === 'INSUFFICIENT_STOCK'
        ? (isRTL ? 'الكمية غير كافية' : 'Not enough stock')
        : (err.message || (isRTL ? 'تعذر تحديث المخزون' : 'Could not update stock')));
    } finally { setSaving(false); }
  };

  const handleTopup = async () => {
    if (!topupData.student_id || topupData.amount <= 0) return toast.error(isRTL ? 'بيانات غير صحيحة' : 'Invalid data');
    setSaving(true);
    try {
      const tid = getTenantIdForCreate();
      const amount = parseFloat(topupData.amount);
      const existingWallet = wallets.find(w => w.student_id === topupData.student_id);
      const student = students.find(s => s.id === topupData.student_id);
      const studentName = isRTL
        ? (student?.name_ar || student?.name_en || topupData.student_name)
        : (student?.name_en || student?.name_ar || topupData.student_name);
      const before = existingWallet?.balance || 0;
      const newBalance = before + amount;
      const time = format(new Date(), 'HH:mm');
      let walletId = existingWallet?.id;
      if (existingWallet) {
        const { error } = await tenantQuery('canteen_wallets').update({ balance: newBalance, last_transaction_date: today }).eq('id', existingWallet.id);
        if (error) throw error;
      } else {
        const { data: created, error } = await tenantQuery('canteen_wallets').insert({
          ...(tid && { tenant_id: tid }),
          student_id: topupData.student_id,
          student_name: studentName,
          grade: student?.grade,
          balance: amount,
          is_active: true,
          last_transaction_date: today,
        }).select('id').single();
        if (error) throw error;
        walletId = created?.id;
      }
      const { data: txn, error: txnErr } = await tenantQuery('canteen_transactions').insert({
        ...(tid && { tenant_id: tid }),
        wallet_id: walletId,
        student_id: topupData.student_id,
        student_name: studentName,
        transaction_type: 'topup',
        amount,
        balance_before: before,
        balance_after: newBalance,
        payment_method: 'cash',
        transaction_date: today,
        transaction_time: time,
        processed_by: actorName,
      }).select('id').single();
      if (txnErr) throw txnErr;
      openCanteenReceipt({
        kind: 'topup',
        receiptNo: shortReceiptNo(txn?.id),
        schoolName: isRTL ? (tenant?.name_ar || tenant?.name_en || '') : (tenant?.name_en || tenant?.name_ar || ''),
        studentName,
        grade: student?.grade || '',
        date: today,
        time,
        cashier: actorName,
        paymentMethod: 'cash',
        amount,
        balanceBefore: before,
        balanceAfter: newBalance,
        isRTL,
        currencyCode: tenant?.localization?.currencyCode || tenant?.currency_code || 'SAR',
      });
      queryClient.invalidateQueries({ queryKey: ['canteenWallets'] });
      queryClient.invalidateQueries({ queryKey: ['canteenTransactions'] });
      setShowTopupForm(false); setTopupData({ student_id: '', student_name: '', amount: 50 }); setStudentSearch('');
      toast.success(isRTL ? `تم إضافة ${formatCurrency(amount, tenant?.localization, isRTL)}` : `Topped up ${formatCurrency(amount, tenant?.localization, isRTL)}`);
    } catch (err) {
      toast.error(err.message || (isRTL ? 'تعذر شحن المحفظة' : 'Top-up failed'));
    } finally { setSaving(false); }
  };

  const toggleAllergen = (allergen) => {
    setItemForm(f => ({
      ...f,
      allergens: f.allergens?.includes(allergen)
        ? f.allergens.filter(a => a !== allergen)
        : [...(f.allergens || []), allergen]
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">{isRTL ? 'إدارة المقصف' : 'Canteen Management'}</h1>
          <p className="text-sm text-muted-foreground">{isRTL ? 'المحفظة الرقمية، القائمة، والمبيعات' : 'Digital wallet, menu management & sales'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowTopupForm(true)}>
            <Wallet className="w-4 h-4 me-1" />{isRTL ? 'شحن محفظة' : 'Top Up Wallet'}
          </Button>
          <Button onClick={() => { setEditingItem(null); setItemForm(BLANK_ITEM); setShowItemForm(true); }} className="bg-orange-600 hover:bg-orange-700 text-white">
            <Plus className="w-4 h-4 me-1" />{isRTL ? 'إضافة صنف' : 'Add Item'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatCard title={isRTL ? 'إيراد اليوم' : "Today's Revenue"} value={`${formatCurrency(todayRevenue, tenant?.localization, isRTL)}`} icon={ShoppingCart} iconClassName="bg-orange-50" />
        <StatCard title={isRTL ? 'رصيد منخفض' : 'Low Balance'} value={lowBalanceWallets} icon={AlertTriangle} iconClassName="bg-amber-50" />
        <StatCard title={isRTL ? 'رصيد صفر' : 'Zero Balance'} value={zeroBalanceWallets} icon={AlertTriangle} iconClassName="bg-red-50" />
        <StatCard title={isRTL ? 'مخزون منخفض' : 'Low / out of stock'} value={lowStockItems.length} subtitle={outOfStockCount ? (isRTL ? `${outOfStockCount} نفد` : `${outOfStockCount} out`) : undefined} icon={Package} iconClassName="bg-amber-50" />
        <StatCard title={isRTL ? 'أصناف ممنوعة' : 'Prohibited Items'} value={prohibitedCount} icon={UtensilsCrossed} iconClassName="bg-red-50" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white border">
          <TabsTrigger value="pos"><Scan className="w-4 h-4 me-1 text-orange-500" />{isRTL ? 'نقطة البيع' : 'Quick POS'}</TabsTrigger>
          <TabsTrigger value="dashboard"><ShoppingCart className="w-4 h-4 me-1" />{isRTL ? 'لوحة التحكم' : 'Dashboard'}</TabsTrigger>
          <TabsTrigger value="menu"><UtensilsCrossed className="w-4 h-4 me-1" />{isRTL ? 'قائمة الطعام' : 'Menu'}</TabsTrigger>
          <TabsTrigger value="wallets"><Wallet className="w-4 h-4 me-1" />{isRTL ? 'المحافظ' : 'Wallets'}</TabsTrigger>
          <TabsTrigger value="transactions"><Coffee className="w-4 h-4 me-1" />{isRTL ? 'المعاملات' : 'Transactions'}</TabsTrigger>
          <TabsTrigger value="stock"><ClipboardList className="w-4 h-4 me-1" />{isRTL ? 'سجل المخزون' : 'Stock log'}</TabsTrigger>
        </TabsList>

        {/* QUICK POS */}
        <TabsContent value="pos" className="mt-4">
          <QuickPOS
            students={rosterStudents}
            wallets={wallets}
            menuItems={menuItems}
            getTenantIdForCreate={getTenantIdForCreate}
            onTransaction={refreshCanteen}
          />
        </TabsContent>

        {/* DASHBOARD */}
        <TabsContent value="dashboard" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">{isRTL ? 'أكثر الأصناف طلباً اليوم' : "Today's Top Items"}</CardTitle></CardHeader>
              <CardContent>
                {todayTxns.length === 0 ? <p className="text-muted-foreground text-sm text-center py-6">{isRTL ? 'لا مبيعات اليوم' : 'No sales today'}</p> : (
                  <div className="space-y-2">
                    {Object.entries(
                      todayTxns.flatMap(t => t.items || []).reduce((acc, item) => {
                        acc[item.item_name] = (acc[item.item_name] || 0) + (item.quantity || 1);
                        return acc;
                      }, {})
                    ).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, qty]) => (
                      <div key={name} className="flex justify-between items-center text-sm">
                        <span>{name}</span>
                        <span className="font-semibold text-orange-600">×{qty}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">{isRTL ? 'تنبيهات الرصيد' : 'Balance Alerts'}</CardTitle></CardHeader>
              <CardContent>
                {wallets.filter(w => w.balance < 20).slice(0, 8).map(w => (
                  <div key={w.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{w.student_name}</p>
                      <p className="text-xs text-muted-foreground">{w.grade}</p>
                    </div>
                    <span className={`text-sm font-bold ${w.balance <= 0 ? 'text-red-600' : 'text-amber-600'}`}>{formatCurrency(w.balance, tenant?.localization, isRTL)}</span>
                  </div>
                ))}
                {wallets.filter(w => w.balance < 20).length === 0 && <p className="text-muted-foreground text-sm text-center py-6">{isRTL ? 'جميع الأرصدة جيدة' : 'All balances are good'}</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">{isRTL ? 'تنبيهات المخزون' : 'Stock alerts'}</CardTitle></CardHeader>
              <CardContent>
                {lowStockItems.slice(0, 8).map(item => {
                  const status = stockStatus(item);
                  return (
                    <div key={item.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                      <div>
                        <p className="text-sm font-medium">{isRTL ? item.name_ar : (item.name_en || item.name_ar)}</p>
                        <p className="text-xs text-muted-foreground">{CATEGORIES.find(c => c.value === item.category)?.[isRTL ? 'ar' : 'en']}</p>
                      </div>
                      <span className={`text-sm font-bold ${status === 'out' ? 'text-red-600' : 'text-amber-600'}`}>
                        {status === 'out' ? (isRTL ? 'نفد' : 'Out') : `${item.stock_qty}`}
                      </span>
                    </div>
                  );
                })}
                {lowStockItems.length === 0 && <p className="text-muted-foreground text-sm text-center py-6">{isRTL ? 'المخزون كافٍ' : 'Stock levels are healthy'}</p>}
              </CardContent>
            </Card>
          </div>

          {/* Allergen compliance alert */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">{isRTL ? 'متطلبات الامتثال للمقصف' : 'Canteen Compliance Requirements'}</p>
              <p className="text-xs text-amber-700 mt-0.5">{isRTL ? 'جميع الأصناف يجب أن تكون حلال. يُمنع بيع مشروبات الطاقة والأصناف عالية السكر وفقًا لسياسة المدرسة.' : 'All items must be Halal certified. Energy drinks and high-sugar items are prohibited by school policy.'}</p>
            </div>
          </div>
        </TabsContent>

        {/* MENU */}
        <TabsContent value="menu" className="mt-4 space-y-4">
          <div className="relative max-w-72">
            <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
            <Input placeholder={isRTL ? 'بحث...' : 'Search...'} value={search} onChange={e => setSearch(e.target.value)} className={`${isRTL ? 'pr-9' : 'pl-9'} bg-white h-9`} />
          </div>
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isRTL ? 'الصنف' : 'Item'}</TableHead>
                    <TableHead>{isRTL ? 'الفئة' : 'Category'}</TableHead>
                    <TableHead className="text-end">{isRTL ? 'السعر' : 'Price'}</TableHead>
                    <TableHead className="text-end">{isRTL ? 'المخزون المتاح' : 'Available stock'}</TableHead>
                    <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMenu.map(item => {
                    const status = stockStatus(item);
                    return (
                      <TableRow key={item.id} className={item.is_prohibited ? 'opacity-70' : ''}>
                        <TableCell>
                          <p className="font-medium text-sm">{item.name_ar}</p>
                          {item.name_en && <p className="text-xs text-muted-foreground">{item.name_en}</p>}
                          {item.allergens?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {item.allergens.map(a => <span key={a} className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{a}</span>)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{CATEGORIES.find(c => c.value === item.category)?.[isRTL ? 'ar' : 'en']}</TableCell>
                        <TableCell className="text-end font-semibold text-orange-600">{formatCurrency(item.price, tenant?.localization, isRTL)}</TableCell>
                        <TableCell className="text-end">
                          <span className={`text-base font-bold ${status === 'out' ? 'text-red-600' : status === 'low' ? 'text-amber-600' : 'text-green-700'}`}>
                            {item.stock_qty ?? 0}
                          </span>
                          {status === 'low' && <p className="text-[10px] text-amber-600">{isRTL ? 'منخفض' : 'Low'}</p>}
                          {status === 'out' && <p className="text-[10px] text-red-600">{isRTL ? 'نفد' : 'Out of stock'}</p>}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {item.is_available ? <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">{isRTL ? 'متاح' : 'On menu'}</span> : <span className="text-xs px-1.5 py-0.5 rounded bg-sand-alt text-muted-foreground">{isRTL ? 'غير متاح' : 'Hidden'}</span>}
                            {item.is_prohibited && <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">{isRTL ? 'ممنوع' : 'Prohibited'}</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 justify-end">
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openStockDialog('add', item)}>
                              <Plus className="w-3 h-3 me-1" />{isRTL ? 'إضافة كمية' : 'Add qty'}
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openStockDialog('adjust', item)}>
                              {isRTL ? 'تعديل المخزون' : 'Adjust'}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingItem(item); setItemForm({ ...BLANK_ITEM, ...item }); setShowItemForm(true); }}>
                              {isRTL ? 'تعديل' : 'Edit'}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredMenu.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">{isRTL ? 'لا توجد أصناف' : 'No menu items'}</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* WALLETS */}
        <TabsContent value="wallets" className="mt-4">
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isRTL ? 'الطالب' : 'Student'}</TableHead>
                    <TableHead>{isRTL ? 'الصف' : 'Grade'}</TableHead>
                    <TableHead className="text-end">{isRTL ? 'الرصيد' : 'Balance'}</TableHead>
                    <TableHead>{isRTL ? 'الحد اليومي' : 'Daily Limit'}</TableHead>
                    <TableHead>{isRTL ? 'آخر معاملة' : 'Last Txn'}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wallets.sort((a, b) => a.balance - b.balance).map(w => (
                    <TableRow key={w.id}>
                      <TableCell className="font-medium text-sm">{w.student_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{w.grade}</TableCell>
                      <TableCell className="text-end">
                        <span className={`font-bold ${w.balance <= 0 ? 'text-red-600' : w.balance < 20 ? 'text-amber-600' : 'text-green-600'}`}>{formatCurrency(w.balance, tenant?.localization, isRTL)}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{w.daily_limit ? `${formatCurrency(w.daily_limit, tenant?.localization, isRTL)}` : '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{w.last_transaction_date || '—'}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setTopupData({ student_id: w.student_id, student_name: w.student_name, amount: 50 }); setStudentSearch(w.student_name); setShowTopupForm(true); }}>
                          <Wallet className="w-3 h-3 me-1" />{isRTL ? 'شحن' : 'Top Up'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {wallets.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{isRTL ? 'لا محافظ' : 'No wallets'}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* TRANSACTIONS */}
        <TabsContent value="transactions" className="mt-4">
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isRTL ? 'الطالب' : 'Student'}</TableHead>
                    <TableHead>{isRTL ? 'النوع' : 'Type'}</TableHead>
                    <TableHead className="text-end">{isRTL ? 'المبلغ' : 'Amount'}</TableHead>
                    <TableHead className="text-end">{isRTL ? 'الرصيد بعد' : 'Balance After'}</TableHead>
                    <TableHead>{isRTL ? 'التاريخ' : 'Date'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.slice(0, 50).map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium text-sm">{t.student_name}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.transaction_type === 'topup' ? 'bg-green-100 text-green-700' : t.transaction_type === 'purchase' ? 'bg-najdi-50 text-najdi-900' : 'bg-sand-alt text-muted-foreground'}`}>
                          {t.transaction_type}
                        </span>
                      </TableCell>
                      <TableCell className={`text-end font-semibold ${t.transaction_type === 'purchase' ? 'text-red-600' : 'text-green-600'}`}>
                        {t.transaction_type === 'purchase' ? '-' : '+'}{formatCurrency(t.amount, tenant?.localization, isRTL)}
                      </TableCell>
                      <TableCell className="text-end text-sm">{formatCurrency(t.balance_after?.toFixed(2), tenant?.localization, isRTL)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.transaction_date} {t.transaction_time}</TableCell>
                    </TableRow>
                  ))}
                  {transactions.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">{isRTL ? 'لا معاملات' : 'No transactions'}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* STOCK LOG */}
        <TabsContent value="stock" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{isRTL ? 'سجل حركات المخزون' : 'Stock movement audit'}</CardTitle>
              <p className="text-xs text-muted-foreground">{isRTL ? 'كل إضافة أو تعديل أو بيع يُسجَّل هنا للمسؤول' : 'Every receive, adjustment, waste, and sale is logged for admin review'}</p>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isRTL ? 'التاريخ' : 'When'}</TableHead>
                    <TableHead>{isRTL ? 'الصنف' : 'Item'}</TableHead>
                    <TableHead>{isRTL ? 'النوع' : 'Type'}</TableHead>
                    <TableHead className="text-end">{isRTL ? 'التغيير' : 'Change'}</TableHead>
                    <TableHead className="text-end">{isRTL ? 'قبل → بعد' : 'Before → after'}</TableHead>
                    <TableHead>{isRTL ? 'بواسطة' : 'By'}</TableHead>
                    <TableHead>{isRTL ? 'السبب' : 'Reason'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockMovements.map(m => {
                    const label = MOVEMENT_LABELS[m.movement_type] || { ar: m.movement_type, en: m.movement_type };
                    const positive = (m.qty_delta || 0) > 0;
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{m.created_at ? format(new Date(m.created_at), 'yyyy-MM-dd HH:mm') : '—'}</TableCell>
                        <TableCell className="font-medium text-sm">{m.item_name}</TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.movement_type === 'receive' || m.movement_type === 'opening' ? 'bg-green-100 text-green-700' : m.movement_type === 'sale' ? 'bg-orange-50 text-orange-800' : m.movement_type === 'waste' ? 'bg-red-100 text-red-700' : 'bg-sand-alt text-muted-foreground'}`}>
                            {isRTL ? label.ar : label.en}
                          </span>
                        </TableCell>
                        <TableCell className={`text-end font-semibold ${positive ? 'text-green-600' : 'text-red-600'}`}>
                          {positive ? '+' : ''}{m.qty_delta}
                        </TableCell>
                        <TableCell className="text-end text-sm tabular-nums">{m.qty_before} → {m.qty_after}</TableCell>
                        <TableCell className="text-sm">{m.performed_by || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-56 truncate">{m.reason || '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                  {stockMovements.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">{isRTL ? 'لا حركات مخزون بعد' : 'No stock movements yet'}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Item Form Dialog */}
      <Dialog open={showItemForm} onOpenChange={setShowItemForm}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editingItem ? (isRTL ? 'تعديل صنف' : 'Edit Item') : (isRTL ? 'إضافة صنف' : 'Add Menu Item')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>{isRTL ? 'الاسم (عربي) *' : 'Name (Arabic) *'}</Label><Input value={itemForm.name_ar} onChange={e => setItemForm(f => ({ ...f, name_ar: e.target.value }))} /></div>
              <div className="space-y-1"><Label>{isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'}</Label><Input value={itemForm.name_en} onChange={e => setItemForm(f => ({ ...f, name_en: e.target.value }))} /></div>
              <div className="space-y-1"><Label>{isRTL ? 'الفئة' : 'Category'}</Label>
                <Select value={itemForm.category} onValueChange={v => setItemForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{isRTL ? c.ar : c.en}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>{isRTL ? `السعر (${getCurrencySymbol(tenant?.localization, isRTL)})` : `Price (${getCurrencySymbol(tenant?.localization, isRTL)})`}</Label><Input type="number" value={itemForm.price} onChange={e => setItemForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))} /></div>
              <div className="space-y-1"><Label>{isRTL ? 'السعرات الحرارية' : 'Calories'}</Label><Input type="number" value={itemForm.calories} onChange={e => setItemForm(f => ({ ...f, calories: parseInt(e.target.value) || 0 }))} /></div>
              {!editingItem && (
                <div className="space-y-1"><Label>{isRTL ? 'الكمية الافتتاحية' : 'Opening quantity'}</Label><Input type="number" min="0" value={itemForm.stock_qty} onChange={e => setItemForm(f => ({ ...f, stock_qty: e.target.value }))} /></div>
              )}
              <div className="space-y-1"><Label>{isRTL ? 'حد المخزون المنخفض' : 'Low-stock alert at'}</Label><Input type="number" min="0" value={itemForm.low_stock_threshold} onChange={e => setItemForm(f => ({ ...f, low_stock_threshold: e.target.value }))} /></div>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'مسببات الحساسية' : 'Allergens'}</Label>
              <div className="flex flex-wrap gap-2">
                {ALLERGENS.map(a => (
                  <button key={a} onClick={() => toggleAllergen(a)} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${itemForm.allergens?.includes(a) ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-muted-foreground border-border'}`}>{a}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2"><Switch checked={itemForm.is_halal} onCheckedChange={v => setItemForm(f => ({ ...f, is_halal: v }))} /><Label>{isRTL ? 'حلال' : 'Halal'}</Label></div>
              <div className="flex items-center gap-2"><Switch checked={itemForm.is_prohibited} onCheckedChange={v => setItemForm(f => ({ ...f, is_prohibited: v }))} /><Label className="text-red-600">{isRTL ? 'ممنوع' : 'Prohibited'}</Label></div>
              <div className="flex items-center gap-2"><Switch checked={itemForm.is_available} onCheckedChange={v => setItemForm(f => ({ ...f, is_available: v }))} /><Label>{isRTL ? 'متاح' : 'Available'}</Label></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowItemForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSaveItem} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white">{isRTL ? 'حفظ' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Top-up Dialog */}
      <Dialog open={showTopupForm} onOpenChange={setShowTopupForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{isRTL ? 'شحن المحفظة' : 'Top Up Wallet'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'الطالب' : 'Student'}</Label>
              {!topupData.student_id ? (
                <>
                  <Input placeholder={isRTL ? 'ابحث عن الطالب...' : 'Search student...'} value={studentSearch} onChange={e => setStudentSearch(e.target.value)} />
                  {studentSearch && (
                    <div className="border rounded-lg max-h-40 overflow-y-auto">
                      {filteredStudents.slice(0, 6).map(s => (
                        <button key={s.id} onClick={() => { setTopupData(d => ({ ...d, student_id: s.id, student_name: s.name_ar })); setStudentSearch(s.name_ar); }} className="w-full text-start px-3 py-2 hover:bg-sand text-sm border-b last:border-0">{s.name_ar} — {s.grade}</button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium">{topupData.student_name}</span>
                  <button onClick={() => { setTopupData(d => ({ ...d, student_id: '', student_name: '' })); setStudentSearch(''); }} className="text-xs text-muted-foreground ms-auto">×</button>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? `المبلغ (${getCurrencySymbol(tenant?.localization, isRTL)})` : `Amount (${getCurrencySymbol(tenant?.localization, isRTL)})`}</Label>
              <Input type="number" min="1" value={topupData.amount} onChange={e => setTopupData(d => ({ ...d, amount: e.target.value }))} />
              <div className="flex gap-2">
                {[20, 50, 100, 200].map(a => <button key={a} onClick={() => setTopupData(d => ({ ...d, amount: a }))} className="flex-1 py-1 text-xs border rounded hover:bg-sand">{a}</button>)}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTopupForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleTopup} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white">{isRTL ? 'شحن وطباعة' : 'Top up & print'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!stockDialog} onOpenChange={(open) => { if (!open) setStockDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {stockDialog?.mode === 'add'
                ? (isRTL ? 'إضافة كمية للمخزون' : 'Add stock quantity')
                : (isRTL ? 'تعديل المخزون' : 'Adjust stock')}
            </DialogTitle>
          </DialogHeader>
          {stockDialog?.item && (
            <div className="space-y-3">
              <div className="p-2 bg-sand rounded-lg">
                <p className="text-sm font-medium">{stockDialog.item.name_ar}</p>
                <p className="text-xs text-muted-foreground">{isRTL ? `المتاح حالياً: ${stockDialog.item.stock_qty ?? 0}` : `Currently available: ${stockDialog.item.stock_qty ?? 0}`}</p>
              </div>
              {stockDialog.mode === 'add' ? (
                <>
                  <div className="space-y-1">
                    <Label>{isRTL ? 'الكمية المضافة' : 'Quantity to add'}</Label>
                    <Input type="number" min="1" value={stockQty} onChange={e => setStockQty(e.target.value)} />
                    <div className="flex gap-2">
                      {[5, 10, 20, 50].map(n => (
                        <button key={n} type="button" onClick={() => setStockQty(n)} className="flex-1 py-1 text-xs border rounded hover:bg-sand">+{n}</button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>{isRTL ? 'ملاحظة (اختياري)' : 'Note (optional)'}</Label>
                    <Textarea rows={2} value={stockNote} onChange={e => setStockNote(e.target.value)} placeholder={isRTL ? 'مثلاً: توريد صباحي' : 'e.g. morning delivery'} />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label>{isRTL ? 'الكمية الجديدة' : 'New quantity'}</Label>
                    <Input type="number" min="0" value={stockQty} onChange={e => setStockQty(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>{isRTL ? 'سبب التعديل' : 'Reason'}</Label>
                    <Select value={stockReason} onValueChange={setStockReason}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ADJUST_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{isRTL ? r.ar : r.en}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>{isRTL ? 'تفاصيل' : 'Details'}</Label>
                    <Textarea rows={2} value={stockNote} onChange={e => setStockNote(e.target.value)} />
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockDialog(null)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleStockChange} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white">
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}