import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  CalendarDays, ImagePlus, Package, Plus, Search, Store, Trash2,
} from 'lucide-react';
import { tenantQuery, fetchData, uploadFileApi, getSignedUrlApi } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useTenant } from '../components/TenantContext';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { useTenantQuery } from '../hooks/useTenantQuery';
import { formatCurrency } from '../lib/localization';
import { generateSlots } from '../lib/storeAvailability';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Card, CardContent } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import StatCard from '../components/ui/StatCard';

const WEEKDAYS = [
  { value: 0, en: 'Sunday', ar: 'الأحد' },
  { value: 1, en: 'Monday', ar: 'الاثنين' },
  { value: 2, en: 'Tuesday', ar: 'الثلاثاء' },
  { value: 3, en: 'Wednesday', ar: 'الأربعاء' },
  { value: 4, en: 'Thursday', ar: 'الخميس' },
  { value: 5, en: 'Friday', ar: 'الجمعة' },
  { value: 6, en: 'Saturday', ar: 'السبت' },
];

const FULFILLMENT = [
  { value: 'purchase', en: 'Selling', ar: 'بيع' },
  { value: 'rental', en: 'Rental', ar: 'إيجار' },
  { value: 'both', en: 'Sell and rent', ar: 'بيع وإيجار' },
];

const RENTAL_UNITS = ['hour', 'day', 'term', 'season'];

function slugify(name) {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || `cat-${Date.now().toString(36)}`;
}

function blankHours() {
  return WEEKDAYS.map((day) => ({
    weekday: day.value,
    open: day.value !== 5,
    start_time: '16:00',
    end_time: '21:00',
    slot_minutes: 60,
    capacity: 1,
  }));
}

const BLANK_ITEM = {
  sku: '',
  name_en: '',
  name_ar: '',
  description_en: '',
  description_ar: '',
  category: 'other',
  fulfillment_mode: 'purchase',
  tax_code: 'UNIFORM',
  price_purchase: '',
  price_rental: '',
  rental_unit: 'hour',
  variants_text: '',
  stock_qty: 0,
  collect_location: '',
  image_url: '',
  is_active: true,
  is_bookable: false,
};

function productName(row, isRTL) {
  return isRTL ? (row.name_ar || row.name_en) : (row.name_en || row.name_ar);
}

function httpImage(url) {
  return /^https?:\/\//i.test(url || '');
}

export default function StoreManagement() {
  const { isRTL } = useLanguage();
  const { tenant } = useTenant();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('catalog');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [showItem, setShowItem] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK_ITEM);
  const [hours, setHours] = useState(blankHours());
  const [blackoutDate, setBlackoutDate] = useState('');
  const [blackoutReason, setBlackoutReason] = useState('');
  const [previewDate, setPreviewDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [previewUrl, setPreviewUrl] = useState('');
  const [catForm, setCatForm] = useState({ name_en: '', name_ar: '' });

  const { data: products = [] } = useTenantQuery(
    ['storeProducts', tenantId],
    () => fetchData(tenantQuery('store_products').select('*').match(tenantFilter()).order('name_en', { ascending: true })),
    { enabled: hasTenantAccess },
  );
  const { data: categories = [] } = useTenantQuery(
    ['storeCategories', tenantId],
    () => fetchData(tenantQuery('store_categories').select('*').match(tenantFilter()).order('sort_order', { ascending: true })),
    { enabled: hasTenantAccess },
  );
  const { data: allHours = [] } = useTenantQuery(
    ['storeHours', tenantId],
    () => fetchData(tenantQuery('store_product_hours').select('*').match(tenantFilter())),
    { enabled: hasTenantAccess },
  );
  const { data: allBlackouts = [] } = useTenantQuery(
    ['storeBlackouts', tenantId],
    () => fetchData(tenantQuery('store_product_blackouts').select('*').match(tenantFilter()).order('start_date', { ascending: true })),
    { enabled: hasTenantAccess },
  );
  const { data: bookings = [] } = useTenantQuery(
    ['storeBookings', tenantId],
    () => fetchData(tenantQuery('store_bookings').select('*').match(tenantFilter()).order('starts_at', { ascending: false }).limit(400)),
    { enabled: hasTenantAccess },
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['storeProducts'] });
    queryClient.invalidateQueries({ queryKey: ['storeCategories'] });
    queryClient.invalidateQueries({ queryKey: ['storeHours'] });
    queryClient.invalidateQueries({ queryKey: ['storeBlackouts'] });
    queryClient.invalidateQueries({ queryKey: ['storeBookings'] });
  };

  const categoryLabel = (slug) => {
    const row = categories.find((c) => c.slug === slug);
    if (!row) return slug;
    return isRTL ? (row.name_ar || row.name_en) : (row.name_en || row.name_ar);
  };

  const filtered = products.filter((row) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [row.name_en, row.name_ar, row.sku, row.category].some((v) => String(v || '').toLowerCase().includes(q));
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...BLANK_ITEM, category: categories[0]?.slug || 'other' });
    setHours(blankHours());
    setPreviewUrl('');
    setShowItem(true);
  };

  const openEdit = async (row) => {
    setEditing(row);
    setForm({
      sku: row.sku || '',
      name_en: row.name_en || '',
      name_ar: row.name_ar || '',
      description_en: row.description_en || '',
      description_ar: row.description_ar || '',
      category: row.category || 'other',
      fulfillment_mode: row.fulfillment_mode || 'purchase',
      tax_code: row.tax_code || 'UNIFORM',
      price_purchase: row.price_purchase ?? '',
      price_rental: row.price_rental ?? '',
      rental_unit: row.rental_unit || 'hour',
      variants_text: Array.isArray(row.variants) ? row.variants.map((v) => v.label || v).join(', ') : '',
      stock_qty: row.stock_qty ?? 0,
      collect_location: row.collect_location || '',
      image_url: row.image_url || '',
      is_active: row.is_active !== false,
      is_bookable: Boolean(row.is_bookable),
    });
    const existing = allHours.filter((h) => h.product_id === row.id);
    setHours(WEEKDAYS.map((day) => {
      const match = existing.find((h) => Number(h.weekday) === day.value);
      return {
        weekday: day.value,
        open: Boolean(match),
        start_time: match ? String(match.start_time).slice(0, 5) : '16:00',
        end_time: match ? String(match.end_time).slice(0, 5) : '21:00',
        slot_minutes: match?.slot_minutes || 60,
        capacity: match?.capacity || 1,
      };
    }));
    setPreviewUrl('');
    if (row.image_url && !httpImage(row.image_url)) {
      try { setPreviewUrl(await getSignedUrlApi(row.image_url)); } catch { /* ignore */ }
    } else if (httpImage(row.image_url)) {
      setPreviewUrl(row.image_url);
    }
    setShowItem(true);
  };

  const saveHours = async (productId) => {
    await tenantQuery('store_product_hours').delete().eq('product_id', productId);
    const rows = hours.filter((h) => h.open).map((h) => ({
      product_id: productId,
      weekday: h.weekday,
      start_time: h.start_time.length === 5 ? `${h.start_time}:00` : h.start_time,
      end_time: h.end_time.length === 5 ? `${h.end_time}:00` : h.end_time,
      slot_minutes: Number(h.slot_minutes) || 60,
      capacity: Math.max(1, Number(h.capacity) || 1),
    }));
    if (rows.length) {
      const { error } = await tenantQuery('store_product_hours').insert(rows);
      if (error) throw error;
    }
  };

  const handleSaveItem = async () => {
    if (!form.name_en && !form.name_ar) {
      return toast.error(isRTL ? 'أدخل اسم المنتج' : 'Enter a product name');
    }
    setSaving(true);
    try {
      const payload = {
        sku: form.sku || null,
        name_en: form.name_en || form.name_ar,
        name_ar: form.name_ar || form.name_en,
        description_en: form.description_en || null,
        description_ar: form.description_ar || null,
        category: form.category || 'other',
        fulfillment_mode: form.fulfillment_mode,
        tax_code: form.tax_code || 'UNIFORM',
        price_purchase: form.fulfillment_mode === 'rental' ? null : (Number(form.price_purchase) || null),
        price_rental: form.fulfillment_mode === 'purchase' ? null : (Number(form.price_rental) || null),
        rental_unit: form.fulfillment_mode === 'purchase' ? null : (form.rental_unit || 'hour'),
        variants: form.variants_text.split(',').map((s) => s.trim()).filter(Boolean).map((label) => ({ label })),
        stock_qty: Math.max(0, parseInt(form.stock_qty, 10) || 0),
        collect_location: form.collect_location || null,
        image_url: form.image_url || null,
        is_active: form.is_active,
        is_bookable: form.is_bookable,
        updated_at: new Date().toISOString(),
      };
      let productId = editing?.id;
      if (editing) {
        const { error } = await tenantQuery('store_products').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await tenantQuery('store_products').insert(payload).select('id').single();
        if (error) throw error;
        productId = data.id;
      }
      if (form.is_bookable && productId) await saveHours(productId);
      refresh();
      setShowItem(false);
      toast.success(isRTL ? 'تم الحفظ' : 'Saved');
    } catch (err) {
      toast.error(err.message || (isRTL ? 'تعذر الحفظ' : 'Could not save'));
    } finally {
      setSaving(false);
    }
  };

  const handleImage = async (file) => {
    if (!file) return;
    try {
      const result = await uploadFileApi(file);
      const path = result.path || result.data?.path;
      if (!path) throw new Error('Upload failed');
      setForm((f) => ({ ...f, image_url: path }));
      setPreviewUrl(result.signedUrl || result.data?.signedUrl || previewUrl);
    } catch (err) {
      toast.error(err.message || (isRTL ? 'تعذر رفع الصورة' : 'Could not upload image'));
    }
  };

  const handleSaveCategory = async () => {
    if (!catForm.name_en && !catForm.name_ar) return;
    setSaving(true);
    try {
      const { error } = await tenantQuery('store_categories').insert({
        slug: slugify(catForm.name_en || catForm.name_ar),
        name_en: catForm.name_en || catForm.name_ar,
        name_ar: catForm.name_ar || catForm.name_en,
        sort_order: categories.length + 1,
        is_active: true,
      });
      if (error) throw error;
      setCatForm({ name_en: '', name_ar: '' });
      refresh();
      toast.success(isRTL ? 'تمت إضافة التصنيف' : 'Category added');
    } catch (err) {
      toast.error(err.message || (isRTL ? 'تعذر الحفظ' : 'Could not save'));
    } finally {
      setSaving(false);
    }
  };

  const addBlackout = async () => {
    if (!editing?.id || !blackoutDate) return;
    const { error } = await tenantQuery('store_product_blackouts').insert({
      product_id: editing.id,
      start_date: blackoutDate,
      end_date: blackoutDate,
      reason: blackoutReason || null,
    });
    if (error) return toast.error(error.message);
    setBlackoutDate('');
    setBlackoutReason('');
    refresh();
  };

  const removeBlackout = async (id) => {
    const { error } = await tenantQuery('store_product_blackouts').delete().eq('id', id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const itemBlackouts = editing ? allBlackouts.filter((b) => b.product_id === editing.id) : [];
  const previewSlots = useMemo(() => {
    if (!form.is_bookable) return [];
    return generateSlots({
      date: previewDate,
      hours: hours.filter((h) => h.open).map((h) => ({
        weekday: h.weekday,
        start_time: h.start_time,
        end_time: h.end_time,
        slot_minutes: h.slot_minutes,
        capacity: h.capacity,
      })),
      blackouts: itemBlackouts,
      bookings: editing ? bookings.filter((b) => b.product_id === editing.id) : [],
    });
  }, [form.is_bookable, previewDate, hours, itemBlackouts, bookings, editing]);

  const activeCount = products.filter((p) => p.is_active).length;
  const bookableCount = products.filter((p) => p.is_bookable).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">{isRTL ? 'المتجر المدرسي' : 'School store'}</h1>
          <p className="text-sm text-muted-foreground">
            {isRTL ? 'المنتجات والتصنيفات وتوفر الحجوزات' : 'Catalog, categories, and booking availability'}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 me-1" />
          {isRTL ? 'إضافة منتج' : 'Add item'}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard title={isRTL ? 'المنتجات' : 'Items'} value={products.length} icon={Store} />
        <StatCard title={isRTL ? 'نشط' : 'Active'} value={activeCount} icon={Package} />
        <StatCard title={isRTL ? 'قابل للحجز' : 'Bookable'} value={bookableCount} icon={CalendarDays} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white border">
          <TabsTrigger value="catalog">{isRTL ? 'المنتجات' : 'Catalog'}</TabsTrigger>
          <TabsTrigger value="categories">{isRTL ? 'التصنيفات' : 'Categories'}</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="mt-4 space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="ps-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={isRTL ? 'بحث' : 'Search'} />
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isRTL ? 'المنتج' : 'Item'}</TableHead>
                  <TableHead>{isRTL ? 'التصنيف' : 'Category'}</TableHead>
                  <TableHead>{isRTL ? 'النوع' : 'Type'}</TableHead>
                  <TableHead>{isRTL ? 'السعر' : 'Price'}</TableHead>
                  <TableHead>{isRTL ? 'المخزون' : 'Stock'}</TableHead>
                  <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer" onClick={() => openEdit(row)}>
                    <TableCell className="font-medium">{productName(row, isRTL)}</TableCell>
                    <TableCell>{categoryLabel(row.category)}</TableCell>
                    <TableCell>{FULFILLMENT.find((f) => f.value === row.fulfillment_mode)?.[isRTL ? 'ar' : 'en'] || row.fulfillment_mode}</TableCell>
                    <TableCell>
                      {row.price_purchase ? formatCurrency(row.price_purchase, tenant?.localization, isRTL) : ''}
                      {row.price_purchase && row.price_rental ? ' / ' : ''}
                      {row.price_rental ? `${formatCurrency(row.price_rental, tenant?.localization, isRTL)} ${isRTL ? 'إيجار' : 'rent'}` : ''}
                    </TableCell>
                    <TableCell>{row.is_bookable ? (isRTL ? 'حجز' : 'Booking') : row.stock_qty}</TableCell>
                    <TableCell>{row.is_active ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'مخفي' : 'Hidden')}</TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      {isRTL ? 'لا توجد منتجات' : 'No products yet'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4 flex flex-wrap gap-2 items-end">
              <div className="space-y-1">
                <Label>English</Label>
                <Input value={catForm.name_en} onChange={(e) => setCatForm((f) => ({ ...f, name_en: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>العربية</Label>
                <Input value={catForm.name_ar} onChange={(e) => setCatForm((f) => ({ ...f, name_ar: e.target.value }))} />
              </div>
              <Button onClick={handleSaveCategory} disabled={saving}>{isRTL ? 'إضافة' : 'Add'}</Button>
            </CardContent>
          </Card>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isRTL ? 'التصنيف' : 'Category'}</TableHead>
                  <TableHead>Slug</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{isRTL ? (row.name_ar || row.name_en) : (row.name_en || row.name_ar)}</TableCell>
                    <TableCell className="text-muted-foreground">{row.slug}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showItem} onOpenChange={setShowItem}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? (isRTL ? 'تعديل المنتج' : 'Edit item') : (isRTL ? 'منتج جديد' : 'New item')}</DialogTitle>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label>English</Label><Input value={form.name_en} onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))} /></div>
            <div className="space-y-1"><Label>العربية</Label><Input value={form.name_ar} onChange={(e) => setForm((f) => ({ ...f, name_ar: e.target.value }))} /></div>
            <div className="space-y-1"><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} /></div>
            <div className="space-y-1">
              <Label>{isRTL ? 'التصنيف' : 'Category'}</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.slug} value={c.slug}>{isRTL ? (c.name_ar || c.name_en) : (c.name_en || c.name_ar)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'النوع' : 'Type'}</Label>
              <Select value={form.fulfillment_mode} onValueChange={(v) => setForm((f) => ({ ...f, fulfillment_mode: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FULFILLMENT.map((f) => <SelectItem key={f.value} value={f.value}>{isRTL ? f.ar : f.en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.fulfillment_mode !== 'rental' && (
              <div className="space-y-1"><Label>{isRTL ? 'سعر البيع' : 'Sale price'}</Label><Input type="number" value={form.price_purchase} onChange={(e) => setForm((f) => ({ ...f, price_purchase: e.target.value }))} /></div>
            )}
            {form.fulfillment_mode !== 'purchase' && (
              <>
                <div className="space-y-1"><Label>{isRTL ? 'سعر الإيجار' : 'Rental price'}</Label><Input type="number" value={form.price_rental} onChange={(e) => setForm((f) => ({ ...f, price_rental: e.target.value }))} /></div>
                <div className="space-y-1">
                  <Label>{isRTL ? 'وحدة الإيجار' : 'Rental unit'}</Label>
                  <Select value={form.rental_unit} onValueChange={(v) => setForm((f) => ({ ...f, rental_unit: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RENTAL_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="space-y-1"><Label>{isRTL ? 'المخزون' : 'Stock'}</Label><Input type="number" value={form.stock_qty} onChange={(e) => setForm((f) => ({ ...f, stock_qty: e.target.value }))} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>{isRTL ? 'مكان الاستلام' : 'Collect location'}</Label><Input value={form.collect_location} onChange={(e) => setForm((f) => ({ ...f, collect_location: e.target.value }))} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>{isRTL ? 'المقاسات / الخيارات' : 'Variants'}</Label><Input value={form.variants_text} onChange={(e) => setForm((f) => ({ ...f, variants_text: e.target.value }))} placeholder="S, M, L" /></div>
            <div className="space-y-1 sm:col-span-2"><Label>{isRTL ? 'الوصف' : 'Description'}</Label><Textarea value={form.description_en} onChange={(e) => setForm((f) => ({ ...f, description_en: e.target.value }))} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} /><Label>{isRTL ? 'ظاهر للأهالي' : 'Visible to parents'}</Label></div>
            <div className="flex items-center gap-2"><Switch checked={form.is_bookable} onCheckedChange={(v) => setForm((f) => ({ ...f, is_bookable: v }))} /><Label>{isRTL ? 'قابل للحجز' : 'Bookable'}</Label></div>
            <div className="sm:col-span-2 space-y-2">
              <Label>{isRTL ? 'الصورة' : 'Image'}</Label>
              {(previewUrl || httpImage(form.image_url)) && (
                <img src={previewUrl || form.image_url} alt="" className="h-28 w-full rounded-lg object-cover" />
              )}
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <ImagePlus className="h-4 w-4" />
                <span>{isRTL ? 'رفع صورة' : 'Upload image'}</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImage(e.target.files?.[0])} />
              </label>
            </div>
          </div>

          {form.is_bookable && (
            <div className="mt-4 space-y-3 border-t pt-4">
              <p className="font-medium">{isRTL ? 'ساعات التوفر' : 'Availability hours'}</p>
              {hours.map((row) => {
                const label = WEEKDAYS.find((d) => d.value === row.weekday);
                return (
                  <div key={row.weekday} className="flex flex-wrap items-center gap-2 text-sm">
                    <Switch checked={row.open} onCheckedChange={(v) => setHours((list) => list.map((h) => h.weekday === row.weekday ? { ...h, open: v } : h))} />
                    <span className="w-24">{isRTL ? label?.ar : label?.en}</span>
                    <Input type="time" className="w-28" value={row.start_time} onChange={(e) => setHours((list) => list.map((h) => h.weekday === row.weekday ? { ...h, start_time: e.target.value } : h))} disabled={!row.open} />
                    <Input type="time" className="w-28" value={row.end_time} onChange={(e) => setHours((list) => list.map((h) => h.weekday === row.weekday ? { ...h, end_time: e.target.value } : h))} disabled={!row.open} />
                    <Select value={String(row.slot_minutes)} onValueChange={(v) => setHours((list) => list.map((h) => h.weekday === row.weekday ? { ...h, slot_minutes: Number(v) } : h))}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30m</SelectItem>
                        <SelectItem value="60">60m</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input type="number" className="w-20" value={row.capacity} onChange={(e) => setHours((list) => list.map((h) => h.weekday === row.weekday ? { ...h, capacity: e.target.value } : h))} />
                  </div>
                );
              })}
              {editing && (
                <div className="space-y-2">
                  <p className="font-medium">{isRTL ? 'أيام الإغلاق' : 'Blackout dates'}</p>
                  <div className="flex flex-wrap gap-2">
                    <Input type="date" value={blackoutDate} onChange={(e) => setBlackoutDate(e.target.value)} />
                    <Input placeholder={isRTL ? 'السبب' : 'Reason'} value={blackoutReason} onChange={(e) => setBlackoutReason(e.target.value)} />
                    <Button type="button" variant="outline" onClick={addBlackout}>{isRTL ? 'إضافة' : 'Add'}</Button>
                  </div>
                  {itemBlackouts.map((b) => (
                    <div key={b.id} className="flex items-center justify-between text-sm">
                      <span>{b.start_date}{b.reason ? ` · ${b.reason}` : ''}</span>
                      <Button size="icon" variant="ghost" onClick={() => removeBlackout(b.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <Label>{isRTL ? 'معاينة اليوم' : 'Preview day'}</Label>
                <Input type="date" value={previewDate} onChange={(e) => setPreviewDate(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  {previewSlots.map((slot) => (
                    <span key={slot.starts_at} className={`rounded-md border px-2 py-1 text-xs ${slot.available ? 'bg-emerald-50' : 'bg-sand-alt text-muted-foreground'}`}>
                      {String(slot.starts_at).slice(11, 16)} {slot.available ? '' : (isRTL ? 'محجوز' : 'taken')}
                    </span>
                  ))}
                  {previewSlots.length === 0 && <span className="text-xs text-muted-foreground">{isRTL ? 'لا توجد أوقات' : 'No slots this day'}</span>}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowItem(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSaveItem} disabled={saving}>{isRTL ? 'حفظ' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
