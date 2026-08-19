import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.js';
import { buildRequestContext } from '../lib/jurisdiction.js';
import { resolvePack } from '../packs/registry.js';
import {
  generateSlots,
  riyadhIso,
  slotEndFromStart,
  slotMinutesForStart,
} from '../lib/storeAvailability.js';

const BUCKET = 'tenant-files';
const SIGNED_URL_TTL = 60 * 60;
const MIN_TOPUP = 10;
const MAX_TOPUP = 2000;

export const ADMISSION_DOC_CHECKLIST = [
  { key: 'birth_cert', en: 'Birth Certificate', ar: 'شهادة الميلاد' },
  { key: 'passport', en: 'Passport Copy', ar: 'نسخة جواز السفر' },
  { key: 'iqama', en: 'Iqama Copy', ar: 'نسخة الإقامة' },
  { key: 'prev_reports', en: 'Report Cards (Last 2 Years)', ar: 'كشف الدرجات (آخر سنتين)' },
  { key: 'transfer_cert', en: 'Transfer Certificate', ar: 'شهادة الانتقال' },
  { key: 'vaccination', en: 'Vaccination Record', ar: 'سجل التطعيمات' },
  { key: 'medical', en: 'Medical Fitness Certificate', ar: 'شهادة اللياقة الطبية' },
  { key: 'parent_id', en: 'Parent ID', ar: 'هوية ولي الأمر' },
  { key: 'photos', en: 'Passport Photos (2×)', ar: 'صور شخصية (2×)' },
];

type InvoiceRow = Record<string, unknown>;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function vatFromNet(net: number, rate = 0.15): { vat: number; gross: number } {
  const vat = round2(net * rate);
  return { vat, gross: round2(net + vat) };
}

async function loadStudent(
  client: SupabaseClient,
  tenantId: string,
  studentId: string,
): Promise<{ id: string; name_en: string; name_ar: string; grade: string | null; branch_id: string | null; guardian_id: string | null; application_id: string | null } | null> {
  const { data } = await client
    .from('students')
    .select('id, name_en, name_ar, grade, branch_id, guardian_id, application_id')
    .eq('tenant_id', tenantId)
    .eq('id', studentId)
    .maybeSingle();
  return data as {
    id: string;
    name_en: string;
    name_ar: string;
    grade: string | null;
    branch_id: string | null;
    guardian_id: string | null;
    application_id: string | null;
  } | null;
}

async function nextInvoiceNumber(tenantId: string, prefix: string): Promise<string> {
  const stamp = Date.now().toString(36).toUpperCase();
  return `${prefix}-${stamp}`;
}

async function createCommerceInvoice(opts: {
  tenantId: string;
  branchId: string | null;
  studentId: string;
  studentName: string;
  guardianId: string | null;
  buyerName: string;
  currencyCode: string;
  source: 'canteen_topup' | 'store';
  descriptionEn: string;
  descriptionAr: string;
  taxCode: string;
  netAmount: number;
  metadata: Record<string, unknown>;
}): Promise<InvoiceRow> {
  const { vat, gross } = vatFromNet(opts.netAmount);
  const today = new Date().toISOString().split('T')[0];
  const prefix = opts.source === 'canteen_topup' ? 'CNT' : 'STR';
  const invoiceNumber = await nextInvoiceNumber(opts.tenantId, prefix);

  const row = {
    tenant_id: opts.tenantId,
    branch_id: opts.branchId,
    student_id: opts.studentId,
    student_name: opts.studentName,
    guardian_id: opts.guardianId,
    buyer_name: opts.buyerName,
    currency_code: opts.currencyCode,
    document_type: 'invoice',
    invoice_type: 'simplified',
    zatca_invoice_type: 'simplified',
    source: opts.source,
    metadata: opts.metadata,
    invoice_number: invoiceNumber,
    date: today,
    issue_date: today,
    supply_date: today,
    due_date: today,
    subtotal: opts.netAmount,
    discount_amount: 0,
    vat_amount: vat,
    total_amount: gross,
    paid_amount: 0,
    status: 'issued',
    items: [{
      category_code: opts.taxCode,
      description_en: opts.descriptionEn,
      description_ar: opts.descriptionAr,
      quantity: 1,
      unit_amount: opts.netAmount,
      unit_price_net: opts.netAmount,
      subtotal: opts.netAmount,
      vat_rate: 0.15,
      vat_amount: vat,
      vat_category: 'standard',
      vat_category_code: 'S',
      discount: 0,
    }],
  };

  const { data, error } = await supabase.from('invoices').insert(row).select('*').single();
  if (error) throw new Error(error.message);
  return data as InvoiceRow;
}

export async function createCanteenTopupInvoice(opts: {
  tenantId: string;
  studentId: string;
  amount: number;
  parentEmail: string;
  parentName: string;
}): Promise<InvoiceRow> {
  if (opts.amount < MIN_TOPUP || opts.amount > MAX_TOPUP) {
    throw new Error(`Top-up amount must be between ${MIN_TOPUP} and ${MAX_TOPUP}`);
  }

  const student = await loadStudent(supabase, opts.tenantId, opts.studentId);
  if (!student) throw new Error('Student not found');

  const ctx = await buildRequestContext(supabase, opts.tenantId, student.branch_id ?? undefined);
  const pack = resolvePack(ctx);

  return createCommerceInvoice({
    tenantId: opts.tenantId,
    branchId: student.branch_id,
    studentId: student.id,
    studentName: student.name_en || student.name_ar,
    guardianId: student.guardian_id,
    buyerName: opts.parentName,
    currencyCode: pack.currencyCode,
    source: 'canteen_topup',
    descriptionEn: 'Canteen wallet top-up',
    descriptionAr: 'شحن محفظة المقصف',
    taxCode: 'MEALS',
    netAmount: round2(opts.amount),
    metadata: {
      canteen_topup_amount: opts.amount,
      parent_email: opts.parentEmail,
    },
  });
}

export async function fulfillPaidCommerceInvoice(
  client: SupabaseClient,
  invoice: InvoiceRow,
): Promise<void> {
  const source = String(invoice.source || 'tuition');
  if (source === 'tuition') return;

  const tenantId = invoice.tenant_id as string;
  const invoiceId = invoice.id as string;
  const studentId = invoice.student_id as string | undefined;
  if (!tenantId || !invoiceId || !studentId) return;

  if (source === 'canteen_topup') {
    const metadata = (invoice.metadata as Record<string, unknown>) || {};
    const amount = Number(metadata.canteen_topup_amount ?? invoice.subtotal ?? invoice.total_amount) || 0;
    const student = await loadStudent(client, tenantId, studentId);
    const { error } = await client.rpc('canteen_apply_txn', {
      p_tenant_id: tenantId,
      p_student_id: studentId,
      p_txn_type: 'topup',
      p_amount: amount,
      p_payment_method: 'online',
      p_invoice_id: invoiceId,
      p_student_name: student?.name_en || student?.name_ar || null,
      p_grade: student?.grade || null,
      p_items: [],
      p_notes: 'Parent portal top-up',
    });
    if (error) throw new Error(error.message);
    return;
  }

  if (source === 'store') {
    const { data: order } = await client
      .from('store_orders')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .eq('invoice_id', invoiceId)
      .maybeSingle();
    if (!order) return;
    if ((order as { status: string }).status === 'ready_for_collect' || (order as { status: string }).status === 'collected') return;

    const { data: lines } = await client
      .from('store_order_lines')
      .select('product_id, line_type, quantity')
      .eq('tenant_id', tenantId)
      .eq('order_id', (order as { id: string }).id);

    for (const line of lines ?? []) {
      if ((line as { line_type: string }).line_type !== 'purchase') continue;
      const productId = (line as { product_id: string }).product_id;
      const qty = Number((line as { quantity: number }).quantity) || 0;
      if (!productId || qty <= 0) continue;
      const { data: product } = await client
        .from('store_products')
        .select('stock_qty')
        .eq('tenant_id', tenantId)
        .eq('id', productId)
        .maybeSingle();
      if (!product) continue;
      const nextQty = Math.max(0, Number((product as { stock_qty: number }).stock_qty) - qty);
      await client
        .from('store_products')
        .update({ stock_qty: nextQty, updated_at: new Date().toISOString() })
        .eq('id', productId)
        .eq('tenant_id', tenantId);
    }

    await client
      .from('store_orders')
      .update({
        status: 'ready_for_collect',
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', (order as { id: string }).id)
      .eq('tenant_id', tenantId);

    await client
      .from('store_bookings')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('order_id', (order as { id: string }).id)
      .eq('status', 'held');
  }
}

function addCalendarDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

export async function resolveStoreProductImage(tenantId: string, imageUrl: string | null | undefined): Promise<string | null> {
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  try {
    return await signParentDocumentPath({ tenantId, studentId: tenantId, storagePath: imageUrl });
  } catch {
    return null;
  }
}

export async function listStoreCategories(tenantId: string): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await supabase
    .from('store_categories')
    .select('id, slug, name_en, name_ar, sort_order')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function listProductSlots(opts: {
  tenantId: string;
  productId: string;
  date: string;
}): Promise<ReturnType<typeof generateSlots>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.date)) throw new Error('Invalid date');

  const { data: product, error: prodErr } = await supabase
    .from('store_products')
    .select('id, is_active, is_bookable')
    .eq('tenant_id', opts.tenantId)
    .eq('id', opts.productId)
    .maybeSingle();
  if (prodErr) throw new Error(prodErr.message);
  if (!product || !(product as { is_active: boolean }).is_active) throw new Error('Product not found');
  if (!(product as { is_bookable?: boolean }).is_bookable) return [];

  const [{ data: hours }, { data: blackouts }, { data: bookings }] = await Promise.all([
    supabase
      .from('store_product_hours')
      .select('weekday, start_time, end_time, slot_minutes, capacity')
      .eq('tenant_id', opts.tenantId)
      .eq('product_id', opts.productId),
    supabase
      .from('store_product_blackouts')
      .select('start_date, end_date')
      .eq('tenant_id', opts.tenantId)
      .eq('product_id', opts.productId),
    supabase
      .from('store_bookings')
      .select('starts_at, ends_at, status')
      .eq('tenant_id', opts.tenantId)
      .eq('product_id', opts.productId)
      .in('status', ['held', 'confirmed'])
      .gte('starts_at', riyadhIso(opts.date, '00:00:00'))
      .lt('starts_at', riyadhIso(addCalendarDays(opts.date, 1), '00:00:00')),
  ]);

  return generateSlots({
    date: opts.date,
    hours: (hours ?? []) as Array<{ weekday: number; start_time: string; end_time: string; slot_minutes: number; capacity: number }>,
    blackouts: (blackouts ?? []) as Array<{ start_date: string; end_date: string }>,
    bookings: (bookings ?? []) as Array<{ starts_at: string; ends_at: string; status: string }>,
  });
}

export async function createStoreOrder(opts: {
  tenantId: string;
  studentId: string;
  parentUserId: string;
  parentEmail: string;
  parentName: string;
  lines: Array<{ product_id: string; line_type: 'purchase' | 'rental'; quantity: number; variant_label?: string; slot_start?: string }>;
}): Promise<{ order: Record<string, unknown>; invoice: InvoiceRow; payment_link: string }> {
  if (!opts.lines.length) throw new Error('Cart is empty');

  const student = await loadStudent(supabase, opts.tenantId, opts.studentId);
  if (!student) throw new Error('Student not found');

  const productIds = [...new Set(opts.lines.map((l) => l.product_id))];
  const { data: products, error: prodErr } = await supabase
    .from('store_products')
    .select('*')
    .eq('tenant_id', opts.tenantId)
    .in('id', productIds)
    .eq('is_active', true);
  if (prodErr) throw new Error(prodErr.message);

  const productMap = new Map((products ?? []).map((p) => [p.id as string, p as Record<string, unknown>]));
  const { data: hoursRows } = await supabase
    .from('store_product_hours')
    .select('product_id, weekday, start_time, end_time, slot_minutes, capacity')
    .eq('tenant_id', opts.tenantId)
    .in('product_id', productIds);
  const hoursByProduct = new Map<string, Array<Record<string, unknown>>>();
  for (const row of hoursRows ?? []) {
    const pid = (row as { product_id: string }).product_id;
    const list = hoursByProduct.get(pid) ?? [];
    list.push(row as Record<string, unknown>);
    hoursByProduct.set(pid, list);
  }

  let subtotal = 0;
  const orderLines: Array<Record<string, unknown>> = [];
  const slotReservations: Array<{ product_id: string; starts_at: string; ends_at: string }> = [];
  let primaryTaxCode = 'UNIFORM';
  let collectLocation: string | null = null;

  for (const line of opts.lines) {
    const product = productMap.get(line.product_id);
    if (!product) throw new Error('Product not found or unavailable');
    const mode = String(product.fulfillment_mode);
    if (line.line_type === 'rental' && mode === 'purchase') throw new Error('Product is purchase-only');
    if (line.line_type === 'purchase' && mode === 'rental') throw new Error('Product is rental-only');

    const unitPrice = line.line_type === 'rental'
      ? Number(product.price_rental)
      : Number(product.price_purchase);
    if (!unitPrice || unitPrice <= 0) throw new Error('Product price unavailable');

    const bookable = Boolean(product.is_bookable);
    const qty = bookable ? 1 : Math.max(1, Math.min(99, line.quantity || 1));
    if (!bookable && Number(product.stock_qty) < qty) throw new Error('Insufficient stock');

    let slotStart: string | null = null;
    let slotEnd: string | null = null;
    if (bookable) {
      if (!line.slot_start) throw new Error('A time slot is required for this item');
      const hours = hoursByProduct.get(line.product_id) ?? [];
      const minutes = slotMinutesForStart(
        hours as Array<{ weekday: number; slot_minutes?: number }>,
        line.slot_start,
      );
      slotStart = line.slot_start;
      slotEnd = slotEndFromStart(line.slot_start, minutes);
      if (!slotEnd) throw new Error('Invalid time slot');
      const date = line.slot_start.slice(0, 10);
      const generated = generateSlots({
        date,
        hours: hours as Array<{ weekday: number; start_time: string; end_time: string; slot_minutes: number; capacity: number }>,
        blackouts: [],
        bookings: [],
      });
      const allowed = generated.some((slot) => Date.parse(slot.starts_at) === Date.parse(slotStart as string));
      if (!allowed) throw new Error('That time is outside opening hours');
      slotReservations.push({ product_id: line.product_id, starts_at: slotStart, ends_at: slotEnd });
    }

    const lineTotal = round2(unitPrice * qty);
    subtotal += lineTotal;
    primaryTaxCode = String(product.tax_code || 'UNIFORM');
    collectLocation = collectLocation || (product.collect_location as string | null);

    orderLines.push({
      product_id: product.id,
      line_type: line.line_type,
      product_name_en: product.name_en,
      product_name_ar: product.name_ar,
      variant_label: line.variant_label || null,
      quantity: qty,
      unit_price: unitPrice,
      line_total: lineTotal,
      tax_code: product.tax_code || 'UNIFORM',
      slot_start: slotStart,
      slot_end: slotEnd,
    });
  }

  subtotal = round2(subtotal);
  const { vat, gross } = vatFromNet(subtotal);
  const ctx = await buildRequestContext(supabase, opts.tenantId, student.branch_id ?? undefined);
  const pack = resolvePack(ctx);
  const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;

  const { data: order, error: orderErr } = await supabase
    .from('store_orders')
    .insert({
      tenant_id: opts.tenantId,
      branch_id: student.branch_id,
      student_id: student.id,
      parent_user_id: opts.parentUserId,
      parent_email: opts.parentEmail,
      order_number: orderNumber,
      status: 'pending_payment',
      subtotal,
      vat_amount: vat,
      total_amount: gross,
      currency_code: pack.currencyCode,
      collect_location: collectLocation,
    })
    .select('*')
    .single();
  if (orderErr) throw new Error(orderErr.message);

  const lineRows = orderLines.map((line) => ({
    tenant_id: opts.tenantId,
    order_id: (order as { id: string }).id,
    ...line,
  }));
  const { error: linesErr } = await supabase.from('store_order_lines').insert(lineRows);
  if (linesErr) throw new Error(linesErr.message);

  for (const slot of slotReservations) {
    const { error: slotErr } = await supabase.rpc('store_reserve_slot', {
      p_tenant_id: opts.tenantId,
      p_product_id: slot.product_id,
      p_starts_at: slot.starts_at,
      p_ends_at: slot.ends_at,
      p_order_id: (order as { id: string }).id,
      p_student_id: student.id,
      p_kind: 'booking',
      p_status: 'held',
    });
    if (slotErr) {
      await supabase
        .from('store_orders')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', (order as { id: string }).id)
        .eq('tenant_id', opts.tenantId);
      await supabase
        .from('store_bookings')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('order_id', (order as { id: string }).id)
        .eq('tenant_id', opts.tenantId);
      const msg = slotErr.message || '';
      throw new Error(msg.includes('slot_unavailable') ? 'That time slot is no longer available' : msg || 'Could not reserve slot');
    }
  }

  const invoice = await createCommerceInvoice({
    tenantId: opts.tenantId,
    branchId: student.branch_id,
    studentId: student.id,
    studentName: student.name_en || student.name_ar,
    guardianId: student.guardian_id,
    buyerName: opts.parentName,
    currencyCode: pack.currencyCode,
    source: 'store',
    descriptionEn: `School store order ${orderNumber}`,
    descriptionAr: `طلب المتجر المدرسي ${orderNumber}`,
    taxCode: primaryTaxCode,
    netAmount: subtotal,
    metadata: { store_order_id: (order as { id: string }).id, order_number: orderNumber },
  });

  await supabase
    .from('store_orders')
    .update({ invoice_id: invoice.id, updated_at: new Date().toISOString() })
    .eq('id', (order as { id: string }).id)
    .eq('tenant_id', opts.tenantId);

  return {
    order: order as Record<string, unknown>,
    invoice,
    payment_link: `/api/invoices/${invoice.id}/payment-link`,
  };
}

export async function signParentDocumentPath(opts: {
  tenantId: string;
  studentId: string;
  storagePath: string;
}): Promise<string> {
  if (!opts.storagePath || opts.storagePath.includes('..')) {
    throw new Error('Invalid document path');
  }
  if (!opts.storagePath.startsWith(`${opts.tenantId}/`)) {
    throw new Error('Not authorized for this document');
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(opts.storagePath, SIGNED_URL_TTL);
  if (error || !data?.signedUrl) throw new Error('Could not sign document URL');
  return data.signedUrl;
}

export function mapAdmissionDocuments(documents: unknown) {
  const uploaded = Array.isArray(documents) ? documents as Array<Record<string, unknown>> : [];
  return ADMISSION_DOC_CHECKLIST.map((doc) => {
    const match = uploaded.find((d) => d.type === doc.key || d.doc_code === doc.key);
    return {
      key: doc.key,
      label_en: doc.en,
      label_ar: doc.ar,
      uploaded: Boolean(match),
      name: (match?.name as string) || null,
      storage_path: (match?.path as string) || (match?.storage_path as string) || null,
      url: (match?.url as string) || null,
    };
  });
}

export async function findApplicationForStudent(opts: {
  tenantId: string;
  studentId: string;
  parentEmail: string;
}): Promise<Record<string, unknown> | null> {
  const student = await loadStudent(supabase, opts.tenantId, opts.studentId);
  if (!student) return null;

  if (student.application_id) {
    const { data } = await supabase
      .from('applications')
      .select('id, application_number, stage, decision, status, pipeline_stage, document_status, documents, missing_documents, submitted_at, created_at, student_name_en, student_name_ar, guardian_email')
      .eq('tenant_id', opts.tenantId)
      .eq('id', student.application_id)
      .maybeSingle();
    if (data) return data as Record<string, unknown>;
  }

  const nameEn = student.name_en?.trim();
  if (opts.parentEmail && nameEn) {
    const { data } = await supabase
      .from('applications')
      .select('id, application_number, stage, decision, status, pipeline_stage, document_status, documents, missing_documents, submitted_at, created_at, student_name_en, student_name_ar, guardian_email')
      .eq('tenant_id', opts.tenantId)
      .ilike('guardian_email', opts.parentEmail)
      .ilike('student_name_en', nameEn)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data as Record<string, unknown>;
  }

  return null;
}

export { MIN_TOPUP, MAX_TOPUP };
