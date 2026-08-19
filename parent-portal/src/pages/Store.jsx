import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingBag, Loader2, AlertCircle, Trash2, Search, Minus, Plus,
  MapPin, CalendarClock, Package,
} from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../lib/LanguageContext';
import { useLinkedStudents, useParentScope } from '../lib/useParentData';
import { fetchParentList, createStoreOrder, fetchStoreSlots } from '../lib/parentApi';
import { fetchPaymentLink } from '../lib/api';
import { cn } from '../lib/utils';
import PageHeader from '../components/PageHeader';
import ChildPills from '../components/ChildPills';
import EmptyState from '../components/EmptyState';
import StatusPill from '../components/StatusPill';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

const FALLBACK_CATEGORIES = ['uniform', 'pool', 'playground', 'other'];
const sar = (n) => `SAR ${(Number(n) || 0).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function productName(product, isRTL) {
  return isRTL ? (product.name_ar || product.name_en) : (product.name_en || product.name_ar);
}

function productDescription(product, isRTL) {
  return isRTL ? (product.description_ar || product.description_en) : (product.description_en || product.description_ar);
}

function variantLabel(variant) {
  if (!variant) return '';
  return typeof variant === 'string' ? variant : (variant.label || '');
}

function slotLabel(value) {
  if (!value) return '';
  const text = String(value);
  return text.length >= 16 ? text.slice(11, 16) : text.replace('T', ' ').slice(0, 16);
}

function ProductSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-[color:var(--es-border)] bg-card shadow-card">
      <div className="h-44 animate-pulse bg-sand-alt" />
      <div className="space-y-3 p-4">
        <div className="h-3 w-20 animate-pulse rounded-full bg-sand-alt" />
        <div className="h-5 w-3/4 animate-pulse rounded-full bg-sand-alt" />
        <div className="h-4 w-full animate-pulse rounded-full bg-sand-alt" />
        <div className="h-10 w-full animate-pulse rounded-full bg-sand-alt" />
      </div>
    </div>
  );
}

function ProductCard({ product, categoryLabel, isRTL, t, onAdd }) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const [variant, setVariant] = useState(variants.length === 1 ? variantLabel(variants[0]) : '');
  const [imgFailed, setImgFailed] = useState(false);
  const modes = [];
  if (product.fulfillment_mode === 'purchase' || product.fulfillment_mode === 'both') modes.push('purchase');
  if (product.fulfillment_mode === 'rental' || product.fulfillment_mode === 'both') modes.push('rental');
  const stock = product.stock_qty == null ? null : Number(product.stock_qty);
  const outOfStock = stock === 0;
  const lowStock = stock != null && stock > 0 && stock <= 5;
  const name = productName(product, isRTL);
  const description = productDescription(product, isRTL);
  const needsVariant = variants.length > 1;

  const add = (lineType) => {
    if (needsVariant && !variant) {
      toast.error(t('selectVariantFirst'));
      return;
    }
    onAdd(product, lineType, variant || variantLabel(variants[0]) || null);
  };

  return (
    <Card className="group overflow-hidden transition-all duration-state ease-brand hover:-translate-y-0.5 hover:shadow-panel">
      <div className="relative h-44 overflow-hidden bg-sand-alt">
        {product.image_url && !imgFailed ? (
          <img
            src={product.image_url}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-500 ease-brand group-hover:scale-105"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ShoppingBag className="h-10 w-10 stroke-[1.25] opacity-40" />
          </div>
        )}
        <div className="absolute start-3 top-3 flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="bg-card/95 backdrop-blur-sm">{categoryLabel(product.category)}</Badge>
          {product.is_bookable ? <Badge variant="gold">{t('bookable')}</Badge> : null}
        </div>
        {outOfStock ? (
          <Badge variant="destructive" className="absolute end-3 top-3">{t('outOfStock')}</Badge>
        ) : lowStock ? (
          <Badge variant="warn" className="absolute end-3 top-3">{t('lowStock')}</Badge>
        ) : null}
      </div>
      <CardContent className="space-y-3 p-4">
        <div className="space-y-1">
          <p className="font-semibold leading-snug text-ink">{name}</p>
          {description ? (
            <p className="line-clamp-2 text-sm font-light text-muted-foreground">{description}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          {modes.includes('purchase') && product.price_purchase ? (
            <p className="es-metric text-lg text-forest-700">{sar(product.price_purchase)}</p>
          ) : null}
          {modes.includes('rental') && product.price_rental ? (
            <p className="text-sm text-muted-foreground">
              {t('rent')} {sar(product.price_rental)}
              {product.rental_unit ? ` / ${product.rental_unit}` : ''}
            </p>
          ) : null}
        </div>

        {variants.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('selectVariant')}</p>
            <div className="flex flex-wrap gap-1.5">
              {variants.map((item) => {
                const label = variantLabel(item);
                const selected = variant === label;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setVariant(label)}
                    className={cn(
                      'h-9 min-w-9 rounded-full border px-3 text-sm font-medium transition-colors duration-state',
                      selected
                        ? 'border-forest-700 bg-forest-700 text-[#F5F0E4]'
                        : 'border-[color:var(--es-border)] bg-card text-ink hover:border-forest-700',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          {modes.includes('purchase') && product.price_purchase ? (
            <Button type="button" size="sm" className="flex-1" disabled={outOfStock} onClick={() => add('purchase')}>
              <ShoppingBag />
              {t('purchase')}
            </Button>
          ) : null}
          {modes.includes('rental') && product.price_rental ? (
            <Button type="button" size="sm" variant={modes.includes('purchase') ? 'outline' : 'default'} className="flex-1" onClick={() => add('rental')}>
              <CalendarClock />
              {t('rent')}
            </Button>
          ) : null}
        </div>

        {product.collect_location ? (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t('collectFrom')} {product.collect_location}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CartPanel({ cart, cartTotal, t, busy, onQty, onRemove, onCheckout }) {
  if (cart.length === 0) {
    return (
      <Card className="lg:sticky lg:top-24">
        <CardContent className="p-6">
          <p className="mb-1 font-semibold text-ink">{t('cart')}</p>
          <EmptyState icon={ShoppingBag} title={t('cartEmpty')} description={t('cartEmptyHint')} />
        </CardContent>
      </Card>
    );
  }

  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <Card className="lg:sticky lg:top-24">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-ink">{t('cart')}</p>
          <Badge>{itemCount}</Badge>
        </div>
        <ul className="space-y-3">
          {cart.map((line) => (
            <li key={line.key} className="flex gap-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-sand-alt">
                {line.image_url ? (
                  <img src={line.image_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Package className="h-5 w-5" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{line.label}</p>
                <p className="text-xs text-muted-foreground">
                  {line.line_type === 'rental' ? t('rent') : t('purchase')}
                  {line.variant_label ? ` · ${line.variant_label}` : ''}
                  {line.slot_start ? ` · ${slotLabel(line.slot_start)}` : ''}
                </p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center rounded-full border border-[color:var(--es-border)]">
                    <button type="button" className="flex h-8 w-8 items-center justify-center" onClick={() => onQty(line.key, line.quantity - 1)} aria-label="-">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm tabular-nums">{line.quantity}</span>
                    <button type="button" className="flex h-8 w-8 items-center justify-center" onClick={() => onQty(line.key, line.quantity + 1)} aria-label="+">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-semibold tabular-nums">{sar(line.unitPrice * line.quantity)}</span>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => onRemove(line.key)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="space-y-3 border-t border-[color:var(--es-border)] pt-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('subtotal')}</span>
            <span className="es-metric text-lg">{sar(cartTotal)}</span>
          </div>
          <Button type="button" className="w-full" onClick={onCheckout} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <ShoppingBag />}
            {t('checkout')}
          </Button>
          <p className="text-center text-xs text-muted-foreground">{t('collectAtSchool')}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Store() {
  const { t, isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const { enabled } = useParentScope();
  const { data: students = [] } = useLinkedStudents();
  const [childId, setChildId] = useState(null);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('catalog');
  const [cart, setCart] = useState([]);
  const [busy, setBusy] = useState(false);
  const [slotProduct, setSlotProduct] = useState(null);
  const [slotType, setSlotType] = useState('rental');
  const [slotVariant, setSlotVariant] = useState(null);
  const [slotDate, setSlotDate] = useState(() => new Date().toISOString().slice(0, 10));
  const selectedId = childId || students[0]?.id;

  const { data: categoryRows = [] } = useQuery({
    queryKey: ['parent-store-categories'],
    queryFn: () => fetchParentList('/api/parent/store/categories'),
    enabled,
  });

  const categoryOptions = ['all', ...(categoryRows.length ? categoryRows.map((c) => c.slug) : FALLBACK_CATEGORIES)];

  const categoryLabel = (key) => {
    if (key === 'all') return isRTL ? 'الكل' : 'All';
    const row = categoryRows.find((c) => c.slug === key);
    if (row) return isRTL ? (row.name_ar || row.name_en) : (row.name_en || row.name_ar);
    const map = {
      uniform: t('categoryUniform'),
      pool: t('categoryPool'),
      playground: t('categoryPlayground'),
      other: t('categoryOther'),
    };
    return map[key] || key;
  };

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['parent-store-products', category],
    queryFn: () => fetchParentList('/api/parent/store/products', category === 'all' ? {} : { category }),
    enabled,
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['parent-store-orders', selectedId],
    queryFn: () => fetchParentList('/api/parent/store/orders', { student_id: selectedId }),
    enabled: enabled && !!selectedId,
  });

  const visibleProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((product) => {
      const hay = [product.name_en, product.name_ar, product.description_en, product.description_ar, product.sku]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [products, query]);

  const cartTotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    [cart],
  );
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  const { data: slots = [], isLoading: slotsLoading } = useQuery({
    queryKey: ['parent-store-slots', slotProduct?.id, slotDate],
    queryFn: () => fetchStoreSlots(slotProduct.id, slotDate),
    enabled: enabled && !!slotProduct?.id && !!slotDate,
  });

  const addToCart = (product, lineType, variant, slotStart) => {
    const unitPrice = lineType === 'rental' ? Number(product.price_rental) : Number(product.price_purchase);
    if (!unitPrice) return;
    const key = `${product.id}-${lineType}-${variant || 'default'}-${slotStart || 'none'}`;
    setCart((prev) => {
      const existing = prev.find((line) => line.key === key);
      if (existing) {
        return prev.map((line) => (
          line.key === key ? { ...line, quantity: Math.min(99, line.quantity + 1) } : line
        ));
      }
      return [
        ...prev,
        {
          key,
          product_id: product.id,
          line_type: lineType,
          quantity: 1,
          variant_label: variant || null,
          slot_start: slotStart || undefined,
          label: productName(product, isRTL),
          unitPrice,
          image_url: product.image_url || null,
        },
      ];
    });
    toast.success(t('addedToCart'));
  };

  const requestAdd = (product, lineType, variant) => {
    if (product.is_bookable) {
      setSlotProduct(product);
      setSlotType(lineType);
      setSlotVariant(variant || null);
      return;
    }
    addToCart(product, lineType, variant);
  };

  const setQty = (key, quantity) => {
    if (quantity < 1) {
      setCart((prev) => prev.filter((line) => line.key !== key));
      return;
    }
    setCart((prev) => prev.map((line) => (
      line.key === key ? { ...line, quantity: Math.min(99, quantity) } : line
    )));
  };

  const removeFromCart = (key) => setCart((prev) => prev.filter((line) => line.key !== key));

  const checkout = async () => {
    if (!selectedId || cart.length === 0) return;
    setBusy(true);
    try {
      const result = await createStoreOrder(selectedId, cart.map(({ product_id, line_type, quantity, variant_label, slot_start }) => ({
        product_id,
        line_type,
        quantity,
        variant_label: variant_label || undefined,
        slot_start: slot_start || undefined,
      })));
      const url = await fetchPaymentLink(result.invoice.id);
      window.open(url, '_blank', 'noopener,noreferrer');
      setCart([]);
      toast.success(t('collectAtSchool'));
      queryClient.invalidateQueries({ queryKey: ['parent-store-orders'] });
      queryClient.invalidateQueries({ queryKey: ['parent-store-products'] });
    } catch (error) {
      toast.error(error?.message || t('payError'));
    } finally {
      setBusy(false);
    }
  };

  const orderStatusLabel = (status) => {
    if (status === 'ready_for_collect') return t('orderReady');
    if (status === 'pending_payment') return t('orderPending');
    if (status === 'collected') return t('orderCollected');
    return status;
  };

  if (!enabled) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={t('parentPortalEyebrow')} title={t('store')} description={t('storeHint')} />
        <EmptyState icon={AlertCircle} title={t('noStudentsLinkedAccount')} description={t('contactSchoolLink')} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t('parentPortalEyebrow')} title={t('store')} description={t('storeHint')} />
      <ChildPills students={students} selectedId={childId} onChange={setChildId} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
          <TabsTrigger value="catalog" className="gap-2">
            {t('catalog')}
            {cartCount > 0 ? <span className="rounded-full bg-[#F5F0E4]/20 px-1.5 text-[11px] tabular-nums">{cartCount}</span> : null}
          </TabsTrigger>
          <TabsTrigger value="orders">{t('myOrders')}</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="mt-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchStore')}
                className="ps-10"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {categoryOptions.map((cat) => (
                <Button
                  key={cat}
                  type="button"
                  size="sm"
                  variant={category === cat ? 'default' : 'outline'}
                  className="shrink-0"
                  onClick={() => setCategory(cat)}
                >
                  {categoryLabel(cat)}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div>
              {isLoading ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => <ProductSkeleton key={i} />)}
                </div>
              ) : visibleProducts.length === 0 ? (
                <EmptyState icon={ShoppingBag} title={t('noStoreProducts')} />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {visibleProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      categoryLabel={categoryLabel}
                      isRTL={isRTL}
                      t={t}
                      onAdd={requestAdd}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="hidden lg:block">
              <CartPanel
                cart={cart}
                cartTotal={cartTotal}
                t={t}
                busy={busy}
                onQty={setQty}
                onRemove={removeFromCart}
                onCheckout={checkout}
              />
            </div>
          </div>

          {cart.length > 0 ? (
            <div id="store-cart" className="lg:hidden">
              <CartPanel
                cart={cart}
                cartTotal={cartTotal}
                t={t}
                busy={busy}
                onQty={setQty}
                onRemove={removeFromCart}
                onCheckout={checkout}
              />
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          {ordersLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-card bg-sand-alt" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <EmptyState icon={ShoppingBag} title={t('noStoreOrders')} />
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <Card key={order.id}>
                  <CardContent className="space-y-3 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-ink">{order.order_number}</p>
                        <p className="es-metric mt-0.5 text-lg">{sar(order.total_amount)}</p>
                      </div>
                      <StatusPill tone={order.status === 'ready_for_collect' ? 'success' : order.status === 'pending_payment' ? 'warn' : 'muted'}>
                        {orderStatusLabel(order.status)}
                      </StatusPill>
                    </div>
                    <ul className="space-y-1.5">
                      {(order.store_order_lines || []).map((line) => (
                        <li key={line.id} className="flex items-start justify-between gap-3 text-sm">
                          <span className="text-ink">
                            {isRTL ? (line.product_name_ar || line.product_name_en) : (line.product_name_en || line.product_name_ar)}
                            {line.slot_start ? ` · ${slotLabel(line.slot_start)}` : ''}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {line.quantity} × {sar(line.unit_price)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {order.status === 'pending_payment' && order.payment_link ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={async () => {
                          try {
                            const url = await fetchPaymentLink(order.invoice_id);
                            window.open(url, '_blank', 'noopener,noreferrer');
                          } catch (error) {
                            toast.error(error?.message || t('payError'));
                          }
                        }}
                      >
                        {t('payNow')}
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {cartCount > 0 && tab === 'catalog' ? (
        <div className="fixed inset-x-4 bottom-[4.75rem] z-20 lg:hidden">
          <button
            type="button"
            onClick={() => document.getElementById('store-cart')?.scrollIntoView({ behavior: 'smooth' })}
            className="flex w-full items-center justify-between rounded-full bg-forest-900 px-5 py-3 text-[#F5F0E4] shadow-panel"
          >
            <span className="text-sm font-medium">{t('cart')} · {cartCount}</span>
            <span className="es-metric text-base text-[#F5F0E4]">{sar(cartTotal)}</span>
          </button>
        </div>
      ) : null}

      <Dialog open={!!slotProduct} onOpenChange={(open) => { if (!open) { setSlotProduct(null); setSlotVariant(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pickSlot')}</DialogTitle>
          </DialogHeader>
          {slotProduct ? (
            <p className="text-sm text-muted-foreground">{productName(slotProduct, isRTL)}</p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="store-slot-date">{t('date')}</Label>
            <Input id="store-slot-date" type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slotsLoading ? (
              <div className="col-span-full flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-forest-700" />
              </div>
            ) : slots.filter((s) => s.available).length === 0 ? (
              <p className="col-span-full text-sm text-muted-foreground">{t('noSlots')}</p>
            ) : slots.map((slot) => (
              <Button
                key={slot.starts_at}
                type="button"
                size="sm"
                variant={slot.available ? 'outline' : 'secondary'}
                disabled={!slot.available}
                onClick={() => {
                  if (!slot.available || !slotProduct) return;
                  addToCart(slotProduct, slotType, slotVariant, slot.starts_at);
                  setSlotProduct(null);
                  setSlotVariant(null);
                }}
              >
                {slotLabel(slot.starts_at)}{slot.available ? '' : ` · ${t('slotTaken')}`}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setSlotProduct(null); setSlotVariant(null); }}>{isRTL ? 'إغلاق' : 'Close'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
