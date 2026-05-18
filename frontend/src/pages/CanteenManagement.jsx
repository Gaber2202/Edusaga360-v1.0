import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useTenantFilter } from '../hooks/useTenantFilter';
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
import { ShoppingCart, Plus, Search, AlertTriangle, Wallet, UtensilsCrossed, CheckCircle, Coffee, Scan } from 'lucide-react';
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

const BLANK_ITEM = { name_ar: '', name_en: '', category: 'main', price: 0, calories: 0, allergens: [], is_halal: true, is_prohibited: false, is_available: true };

export default function CanteenManagement() {
  const { isRTL } = useLanguage();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('dashboard');
  const [showItemForm, setShowItemForm] = useState(false);
  const [showTopupForm, setShowTopupForm] = useState(false);
  const [itemForm, setItemForm] = useState(BLANK_ITEM);
  const [editingItem, setEditingItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [topupData, setTopupData] = useState({ student_id: '', student_name: '', amount: 50 });
  const [studentSearch, setStudentSearch] = useState('');

  const { data: menuItems = [], isLoading: _menuLoading } = useQuery({
    queryKey: ['canteenMenu', tenantId],
    queryFn: () => tenantQuery('canteen_menu_items').select('*').match(tenantFilter()),
    enabled: hasTenantAccess,
  });

  const { data: wallets = [] } = useQuery({
    queryKey: ['canteenWallets', tenantId],
    queryFn: () => tenantQuery('canteen_wallets').select('*').match(tenantFilter()),
    enabled: hasTenantAccess,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['canteenTransactions', tenantId],
    queryFn: () => tenantQuery('canteen_transactions').select('*').match(tenantFilter(), '-created_date'),
    enabled: hasTenantAccess,
  });

  const { data: students = [] } = useQuery({
    queryKey: ['students', tenantId],
    queryFn: () => tenantQuery('students').select('*').match(tenantFilter({ status: 'active' })),
    enabled: hasTenantAccess,
  });

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayTxns = transactions.filter(t => t.transaction_date === today && t.transaction_type === 'purchase');
  const todayRevenue = todayTxns.reduce((s, t) => s + (t.amount || 0), 0);
  const lowBalanceWallets = wallets.filter(w => w.balance < 20).length;
  const zeroBalanceWallets = wallets.filter(w => w.balance <= 0).length;
  const prohibitedCount = menuItems.filter(m => m.is_prohibited).length;

  const filteredMenu = menuItems.filter(m => {
    const q = search.toLowerCase();
    return !q || m.name_ar?.includes(search) || m.name_en?.toLowerCase().includes(q);
  });

  const filteredStudents = students.filter(s => {
    const q = studentSearch.toLowerCase();
    return !q || s.name_ar?.includes(studentSearch) || s.name_en?.toLowerCase().includes(q);
  });

  const handleSaveItem = async () => {
    if (!itemForm.name_ar) return toast.error(isRTL ? 'أدخل اسم الصنف' : 'Enter item name');
    setSaving(true);
    try {
      const tid = getTenantIdForCreate();
      if (editingItem) {
        await tenantQuery('canteen_menu_items').update(itemForm);
      } else {
        await tenantQuery('canteen_menu_items').insert({ ...itemForm, ...(tid && { tenant_id: tid }) });
      }
      queryClient.invalidateQueries({ queryKey: ['canteenMenu'] });
      setShowItemForm(false); setItemForm(BLANK_ITEM); setEditingItem(null);
      toast.success(isRTL ? 'تم الحفظ' : 'Saved');
    } finally { setSaving(false); }
  };

  const handleTopup = async () => {
    if (!topupData.student_id || topupData.amount <= 0) return toast.error(isRTL ? 'بيانات غير صحيحة' : 'Invalid data');
    setSaving(true);
    try {
      const tid = getTenantIdForCreate();
      const existingWallet = wallets.find(w => w.student_id === topupData.student_id);
      const newBalance = (existingWallet?.balance || 0) + parseFloat(topupData.amount);
      if (existingWallet) {
        await tenantQuery('canteen_wallets').update({ balance: newBalance, last_transaction_date: today });
      } else {
        const student = students.find(s => s.id === topupData.student_id);
        await tenantQuery('canteen_wallets').insert({ ...(tid && { tenant_id: tid }), student_id: topupData.student_id, student_name: student?.name_ar, grade: student?.grade, balance: parseFloat(topupData.amount), is_active: true });
      }
      await tenantQuery('canteen_transactions').insert({
        ...(tid && { tenant_id: tid }),
        student_id: topupData.student_id, student_name: topupData.student_name,
        transaction_type: 'topup', amount: parseFloat(topupData.amount),
        balance_before: existingWallet?.balance || 0, balance_after: newBalance,
        payment_method: 'cash', transaction_date: today, transaction_time: format(new Date(), 'HH:mm'),
      });
      queryClient.invalidateQueries({ queryKey: ['canteenWallets', 'canteenTransactions'] });
      setShowTopupForm(false); setTopupData({ student_id: '', student_name: '', amount: 50 }); setStudentSearch('');
      toast.success(isRTL ? `تم إضافة ${topupData.amount} ر.س` : `Topped up ${topupData.amount} SAR`);
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
          <h1 className="text-xl font-bold text-slate-800">{isRTL ? 'إدارة المقصف' : 'Canteen Management'}</h1>
          <p className="text-sm text-slate-500">{isRTL ? 'المحفظة الرقمية، القائمة، والمبيعات' : 'Digital wallet, menu management & sales'}</p>
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title={isRTL ? 'إيراد اليوم' : "Today's Revenue"} value={`${todayRevenue} SAR`} icon={ShoppingCart} iconClassName="bg-orange-50" />
        <StatCard title={isRTL ? 'رصيد منخفض' : 'Low Balance'} value={lowBalanceWallets} icon={AlertTriangle} iconClassName="bg-amber-50" />
        <StatCard title={isRTL ? 'رصيد صفر' : 'Zero Balance'} value={zeroBalanceWallets} icon={AlertTriangle} iconClassName="bg-red-50" />
        <StatCard title={isRTL ? 'أصناف ممنوعة' : 'Prohibited Items'} value={prohibitedCount} icon={UtensilsCrossed} iconClassName="bg-red-50" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white border">
          <TabsTrigger value="pos"><Scan className="w-4 h-4 me-1 text-orange-500" />{isRTL ? 'نقطة البيع' : 'Quick POS'}</TabsTrigger>
          <TabsTrigger value="dashboard"><ShoppingCart className="w-4 h-4 me-1" />{isRTL ? 'لوحة التحكم' : 'Dashboard'}</TabsTrigger>
          <TabsTrigger value="menu"><UtensilsCrossed className="w-4 h-4 me-1" />{isRTL ? 'قائمة الطعام' : 'Menu'}</TabsTrigger>
          <TabsTrigger value="wallets"><Wallet className="w-4 h-4 me-1" />{isRTL ? 'المحافظ' : 'Wallets'}</TabsTrigger>
          <TabsTrigger value="transactions"><Coffee className="w-4 h-4 me-1" />{isRTL ? 'المعاملات' : 'Transactions'}</TabsTrigger>
        </TabsList>

        {/* QUICK POS */}
        <TabsContent value="pos" className="mt-4">
          <div className="max-w-md mx-auto bg-white border rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Scan className="w-5 h-5 text-orange-500" />
              <h2 className="font-semibold text-slate-700">{isRTL ? 'دفع سريع — أقل من 3 ثوانٍ' : 'Quick Pay — Under 3 Seconds'}</h2>
            </div>
            <QuickPOS
              students={students}
              wallets={wallets}
              menuItems={menuItems}
              getTenantIdForCreate={getTenantIdForCreate}
              onTransaction={() => queryClient.invalidateQueries({ queryKey: ['canteenWallets', 'canteenTransactions'] })}
            />
          </div>
        </TabsContent>

        {/* DASHBOARD */}
        <TabsContent value="dashboard" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">{isRTL ? 'أكثر الأصناف طلباً اليوم' : "Today's Top Items"}</CardTitle></CardHeader>
              <CardContent>
                {todayTxns.length === 0 ? <p className="text-slate-400 text-sm text-center py-6">{isRTL ? 'لا مبيعات اليوم' : 'No sales today'}</p> : (
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
                      <p className="text-xs text-slate-400">{w.grade}</p>
                    </div>
                    <span className={`text-sm font-bold ${w.balance <= 0 ? 'text-red-600' : 'text-amber-600'}`}>{w.balance} SAR</span>
                  </div>
                ))}
                {wallets.filter(w => w.balance < 20).length === 0 && <p className="text-slate-400 text-sm text-center py-6">{isRTL ? 'جميع الأرصدة جيدة' : 'All balances are good'}</p>}
              </CardContent>
            </Card>
          </div>

          {/* Allergen compliance alert */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">{isRTL ? 'متطلبات وزارة التعليم السعودية للمقصف' : 'Saudi MOE Canteen Compliance'}</p>
              <p className="text-xs text-amber-700 mt-0.5">{isRTL ? 'جميع الأصناف يجب أن تكون حلال. يُمنع بيع مشروبات الطاقة والأصناف عالية السكر.' : 'All items must be Halal certified. Energy drinks and high-sugar items are prohibited by MOE regulations.'}</p>
            </div>
          </div>
        </TabsContent>

        {/* MENU */}
        <TabsContent value="menu" className="mt-4 space-y-4">
          <div className="relative max-w-72">
            <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
            <Input placeholder={isRTL ? 'بحث...' : 'Search...'} value={search} onChange={e => setSearch(e.target.value)} className={`${isRTL ? 'pr-9' : 'pl-9'} bg-white h-9`} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMenu.map(item => (
              <Card key={item.id} className={item.is_prohibited ? 'border-red-300 opacity-70' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-slate-800">{item.name_ar}</p>
                      {item.name_en && <p className="text-xs text-slate-400">{item.name_en}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-orange-600">{item.price} SAR</p>
                      {item.calories && <p className="text-xs text-slate-400">{item.calories} cal</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${item.is_halal ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {item.is_halal ? '✓ Halal' : '✗ Not Halal'}
                    </span>
                    {item.is_prohibited && <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">⚠ Prohibited</span>}
                    <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{CATEGORIES.find(c => c.value === item.category)?.[isRTL ? 'ar' : 'en']}</span>
                  </div>
                  {item.allergens?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {item.allergens.map(a => <span key={a} className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{a}</span>)}
                    </div>
                  )}
                  <Button size="sm" variant="ghost" className="w-full h-7 text-xs mt-1" onClick={() => { setEditingItem(item); setItemForm({ ...item }); setShowItemForm(true); }}>
                    {isRTL ? 'تعديل' : 'Edit'}
                  </Button>
                </CardContent>
              </Card>
            ))}
            {filteredMenu.length === 0 && (
              <div className="col-span-3 text-center py-12 text-slate-400">{isRTL ? 'لا توجد أصناف' : 'No menu items'}</div>
            )}
          </div>
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
                      <TableCell className="text-sm text-slate-500">{w.grade}</TableCell>
                      <TableCell className="text-end">
                        <span className={`font-bold ${w.balance <= 0 ? 'text-red-600' : w.balance < 20 ? 'text-amber-600' : 'text-green-600'}`}>{w.balance} SAR</span>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">{w.daily_limit ? `${w.daily_limit} SAR` : '—'}</TableCell>
                      <TableCell className="text-xs text-slate-400">{w.last_transaction_date || '—'}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setTopupData({ student_id: w.student_id, student_name: w.student_name, amount: 50 }); setStudentSearch(w.student_name); setShowTopupForm(true); }}>
                          <Wallet className="w-3 h-3 me-1" />{isRTL ? 'شحن' : 'Top Up'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {wallets.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-10 text-slate-400">{isRTL ? 'لا محافظ' : 'No wallets'}</TableCell></TableRow>}
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
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.transaction_type === 'topup' ? 'bg-green-100 text-green-700' : t.transaction_type === 'purchase' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                          {t.transaction_type}
                        </span>
                      </TableCell>
                      <TableCell className={`text-end font-semibold ${t.transaction_type === 'purchase' ? 'text-red-600' : 'text-green-600'}`}>
                        {t.transaction_type === 'purchase' ? '-' : '+'}{t.amount} SAR
                      </TableCell>
                      <TableCell className="text-end text-sm">{t.balance_after?.toFixed(2)} SAR</TableCell>
                      <TableCell className="text-xs text-slate-400">{t.transaction_date} {t.transaction_time}</TableCell>
                    </TableRow>
                  ))}
                  {transactions.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-10 text-slate-400">{isRTL ? 'لا معاملات' : 'No transactions'}</TableCell></TableRow>}
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
              <div className="space-y-1"><Label>{isRTL ? 'السعر (ر.س)' : 'Price (SAR)'}</Label><Input type="number" value={itemForm.price} onChange={e => setItemForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))} /></div>
              <div className="space-y-1"><Label>{isRTL ? 'السعرات الحرارية' : 'Calories'}</Label><Input type="number" value={itemForm.calories} onChange={e => setItemForm(f => ({ ...f, calories: parseInt(e.target.value) || 0 }))} /></div>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'مسببات الحساسية' : 'Allergens'}</Label>
              <div className="flex flex-wrap gap-2">
                {ALLERGENS.map(a => (
                  <button key={a} onClick={() => toggleAllergen(a)} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${itemForm.allergens?.includes(a) ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-300'}`}>{a}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2"><Switch checked={itemForm.is_halal} onCheckedChange={v => setItemForm(f => ({ ...f, is_halal: v }))} /><Label>{isRTL ? 'حلال' : 'Halal'}</Label></div>
              <div className="flex items-center gap-2"><Switch checked={itemForm.is_prohibited} onCheckedChange={v => setItemForm(f => ({ ...f, is_prohibited: v }))} /><Label className="text-red-600">{isRTL ? 'ممنوع (MOE)' : 'Prohibited (MOE)'}</Label></div>
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
                        <button key={s.id} onClick={() => { setTopupData(d => ({ ...d, student_id: s.id, student_name: s.name_ar })); setStudentSearch(s.name_ar); }} className="w-full text-start px-3 py-2 hover:bg-slate-50 text-sm border-b last:border-0">{s.name_ar} — {s.grade}</button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium">{topupData.student_name}</span>
                  <button onClick={() => { setTopupData(d => ({ ...d, student_id: '', student_name: '' })); setStudentSearch(''); }} className="text-xs text-slate-400 ms-auto">×</button>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'المبلغ (ر.س)' : 'Amount (SAR)'}</Label>
              <Input type="number" min="1" value={topupData.amount} onChange={e => setTopupData(d => ({ ...d, amount: e.target.value }))} />
              <div className="flex gap-2">
                {[20, 50, 100, 200].map(a => <button key={a} onClick={() => setTopupData(d => ({ ...d, amount: a }))} className="flex-1 py-1 text-xs border rounded hover:bg-slate-50">{a}</button>)}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTopupForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleTopup} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white">{isRTL ? 'شحن' : 'Top Up'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}