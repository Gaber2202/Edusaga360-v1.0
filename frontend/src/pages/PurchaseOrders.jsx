import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import { Plus, Trash2, Loader2, Search } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import POActions from '../components/procurement/POActions';
import jsPDF from 'jspdf';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { useTenant } from '../components/TenantContext';
import { getVatRate } from '../lib/vatRate';

export default function PurchaseOrders() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();
  const { tenant } = useTenant();

  const [showForm, setShowForm] = useState(false);
  const [editingPO, setEditingPO] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    vendor_id: '',
    delivery_date: '',
    payment_terms: 30,
    notes: '',
    items: [{ description: '', quantity: 1, unit_price: 0 }]
  });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['purchaseOrders', tenantId, selectedBranchId],
    queryFn: () => tenantQuery('purchase_orders').select('*').match(tenantFilter(branchFilter()), '-created_date'),
    enabled: hasTenantAccess,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors', tenantId],
    queryFn: () => tenantQuery('vendors').select('*').match(tenantFilter({ status: 'approved' })),
    enabled: hasTenantAccess,
  });

  const filteredOrders = filterByBranch(orders).filter(po => {
    const matchesSearch = po.po_number?.toLowerCase().includes(search.toLowerCase()) ||
      po.vendor_name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || po.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const addItem = () => {
    setFormData(p => ({
      ...p,
      items: [...p.items, { description: '', quantity: 1, unit_price: 0 }]
    }));
  };

  const removeItem = (index) => {
    setFormData(p => ({
      ...p,
      items: p.items.filter((_, i) => i !== index)
    }));
  };

  const updateItem = (index, field, value) => {
    setFormData(p => ({
      ...p,
      items: p.items.map((item, i) => i === index ? { ...item, [field]: value } : item)
    }));
  };

  const calculateTotals = () => {
    const subtotal = formData.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const vat = subtotal * getVatRate(tenant);
    const total = subtotal + vat;
    return { subtotal, vat, total };
  };

  const handleSave = async () => {
    if (!formData.vendor_id || formData.items.length === 0) {
      toast.error(isRTL ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }

    setSaving(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const vendor = vendors.find(v => v.id === formData.vendor_id);
      const { subtotal, vat, total } = calculateTotals();
      const poNumber = `PO-${Date.now().toString(36).toUpperCase()}`;
      
      const tid = getTenantIdForCreate();
      const data = {
        ...(tid && { tenant_id: tid }),
        po_number: poNumber,
        branch_id: selectedBranchId,
        vendor_id: formData.vendor_id,
        vendor_name: vendor?.name_ar,
        order_date: format(new Date(), 'yyyy-MM-dd'),
        delivery_date: formData.delivery_date,
        payment_terms: formData.payment_terms,
        notes: formData.notes,
        items: formData.items.map((item, idx) => ({
          ...item,
          line_number: idx + 1,
          total: item.quantity * item.unit_price
        })),
        subtotal,
        vat_amount: vat,
        total_amount: total,
        status: 'draft',
        created_by: user?.email
      };

      if (editingPO?.id) {
        await tenantQuery('purchase_orders').update(data);
        await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'PurchaseOrder', entityId: editingPO.id, oldValues: editingPO, newValues: data });
      } else {
        const created = await tenantQuery('purchase_orders').insert(data);
        await logAuditEvent({ action: AuditActions.CREATE, entityType: 'PurchaseOrder', entityId: created.id, newValues: data });
      }

      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      setShowForm(false);
      resetForm();
      toast.success(isRTL ? 'تم الحفظ بنجاح' : 'Saved successfully');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (po) => {
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      await tenantQuery('purchase_orders').update({
        status: 'approved',
        approved_by: user?.email,
        approved_date: format(new Date(), 'yyyy-MM-dd')
      });
      await logAuditEvent({ action: AuditActions.APPROVE, entityType: 'PurchaseOrder', entityId: po.id });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      toast.success(isRTL ? 'تم الاعتماد' : 'Approved');
    } catch (error) {
      toast.error(isRTL ? `حدث خطأ: ${error.message}` : `Error: ${error.message}`);
    }
  };

  const handleSendToVendor = async (po) => {
    try {
      await tenantQuery('purchase_orders').update({
        status: 'sent',
        sent_date: format(new Date(), 'yyyy-MM-dd')
      });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      toast.success(isRTL ? 'تم الإرسال للمورد' : 'Sent to vendor');
    } catch (error) {
      toast.error(isRTL ? `حدث خطأ: ${error.message}` : `Error: ${error.message}`);
    }
  };

  const handleDownloadPO = (po) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(isRTL ? 'أمر شراء' : 'Purchase Order', 20, 20);
    doc.setFontSize(12);
    doc.text(`${isRTL ? 'رقم الأمر' : 'PO #'}: ${po.po_number}`, 20, 35);
    doc.text(`${isRTL ? 'المورد' : 'Vendor'}: ${po.vendor_name}`, 20, 42);
    doc.text(`${isRTL ? 'التاريخ' : 'Date'}: ${format(new Date(po.order_date), 'dd/MM/yyyy')}`, 20, 49);
    doc.setFontSize(11);
    let y = 60;
    po.items?.forEach((item, idx) => {
      doc.text(`${idx + 1}. ${item.description} - ${item.quantity} x ${item.unit_price} = ${item.total}`, 20, y);
      y += 7;
    });
    y += 10;
    doc.text(`${t('total')}: ${po.total_amount?.toLocaleString()} SAR`, 20, y);
    doc.save(`PO_${po.po_number}.pdf`);
    toast.success(isRTL ? 'تم التنزيل' : 'Downloaded');
  };

  const handlePrintPO = (po) => {
    const itemsHtml = po.items?.map((item, idx) => 
      `<tr><td>${idx + 1}</td><td>${item.description}</td><td>${item.quantity}</td><td>${item.unit_price}</td><td>${item.total}</td></tr>`
    ).join('');
    const printContent = `
      <html><head><title>PO ${po.po_number}</title>
      <style>body{font-family:Arial,sans-serif;padding:20px}h1{color:#1e293b}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left}</style>
      </head><body>
        <h1>${isRTL ? 'أمر شراء' : 'Purchase Order'}</h1>
        <p><strong>${isRTL ? 'رقم الأمر' : 'PO #'}:</strong> ${po.po_number}</p>
        <p><strong>${isRTL ? 'المورد' : 'Vendor'}:</strong> ${po.vendor_name}</p>
        <p><strong>${isRTL ? 'التاريخ' : 'Date'}:</strong> ${format(new Date(po.order_date), 'dd/MM/yyyy')}</p>
        <table><thead><tr><th>#</th><th>${isRTL ? 'الوصف' : 'Description'}</th><th>${isRTL ? 'الكمية' : 'Qty'}</th><th>${isRTL ? 'السعر' : 'Price'}</th><th>${isRTL ? 'المجموع' : 'Total'}</th></tr></thead>
        <tbody>${itemsHtml}</tbody></table>
        <p style="margin-top:20px"><strong>${t('total')}: ${po.total_amount?.toLocaleString()} SAR</strong></p>
      </body></html>
    `;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  const handleEmailPO = (po) => {
    const vendor = vendors.find(v => v.id === po.vendor_id);
    if (!vendor?.email) {
      toast.error(isRTL ? 'بريد المورد غير متوفر' : 'Vendor email not available');
      return;
    }
    const subject = `Purchase Order ${po.po_number}`;
    const body = `Dear ${po.vendor_name},\n\nPlease find the Purchase Order ${po.po_number}\nTotal: ${po.total_amount?.toLocaleString()} SAR\n\nThank you.`;
    window.open(`mailto:${vendor.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  const createBill = async (po) => {
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const billNumber = `BILL-${Date.now().toString(36).toUpperCase()}`;
      
      // Create AP Bill
      const tid2 = getTenantIdForCreate();
      const bill = await tenantQuery('ap_bills').insert({
        ...(tid2 && { tenant_id: tid2 }),
        bill_number: billNumber,
        po_id: po.id,
        po_number: po.po_number,
        branch_id: po.branch_id,
        vendor_id: po.vendor_id,
        vendor_name: po.vendor_name,
        bill_date: format(new Date(), 'yyyy-MM-dd'),
        due_date: format(new Date(Date.now() + (po.payment_terms || 30) * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
        items: po.items,
        subtotal: po.subtotal,
        vat_amount: po.vat_amount,
        total_amount: po.total_amount,
        status: 'pending',
        created_by: user?.email
      });

      // Update PO status
      await tenantQuery('purchase_orders').update({
        status: 'billed',
        bill_id: bill.id
      });

      await logAuditEvent({ action: 'CREATE_BILL', entityType: 'PurchaseOrder', entityId: po.id, newValues: { bill_id: bill.id } });
      
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['apBills'] });
      toast.success(isRTL ? 'تم إنشاء الفاتورة' : 'Bill created');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  };

  const _handleEdit = (po) => {
    setEditingPO(po);
    // CRITICAL FIX: Properly load PO data for editing
    setFormData({
      vendor_id: po.vendor_id || '',
      delivery_date: po.delivery_date || '',
      payment_terms: po.payment_terms || 30,
      notes: po.notes || '',
      items: po.items && po.items.length > 0 ? po.items : [{ description: '', quantity: 1, unit_price: 0 }]
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setEditingPO(null);
    setFormData({
      vendor_id: '',
      delivery_date: '',
      payment_terms: 30,
      notes: '',
      items: [{ description: '', quantity: 1, unit_price: 0 }]
    });
  };

  const { subtotal, vat, total } = calculateTotals();

  const columns = [
    { header: isRTL ? 'رقم الأمر' : 'PO #', cell: (row) => <span className="font-mono text-sm">{row.po_number}</span> },
    { header: t('vendor'), accessorKey: 'vendor_name' },
    { header: isRTL ? 'عدد البنود' : 'Items', cell: (row) => row.items?.length || 0 },
    { header: t('total'), cell: (row) => <span className="font-semibold">{row.total_amount?.toLocaleString()} {t('sar')}</span> },
    { header: t('date'), cell: (row) => row.order_date ? format(new Date(row.order_date), 'dd/MM/yyyy') : '-' },
    { header: t('status'), cell: (row) => <StatusBadge status={row.status} /> },
    { header: t('actions'), cell: (row) => (
      <POActions
        po={row}
        vendor={vendors.find(v => v.id === row.vendor_id)}
        onApprove={handleApprove}
        onSend={handleSendToVendor}
        onCreateBill={createBill}
        onView={(_po) => toast.info(isRTL ? 'قريباً' : 'Coming soon')}
        onDownload={handleDownloadPO}
        onPrint={handlePrintPO}
        onEmail={handleEmailPO}
      />
    )}
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'أوامر الشراء' : 'Purchase Orders'}
        subtitle={isRTL ? 'إدارة أوامر الشراء' : 'Manage purchase orders'}
        action
        actionLabel={isRTL ? 'أمر شراء جديد' : 'New PO'}
        actionIcon={Plus}
        onAction={() => { resetForm(); setShowForm(true); }}
      />

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="bg-white border">
          <TabsTrigger value="all">{t('all')}</TabsTrigger>
          <TabsTrigger value="draft">{t('draft')}</TabsTrigger>
          <TabsTrigger value="approved">{t('approved')}</TabsTrigger>
          <TabsTrigger value="sent">{isRTL ? 'مرسل' : 'Sent'}</TabsTrigger>
          <TabsTrigger value="billed">{isRTL ? 'مفوتر' : 'Billed'}</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="relative max-w-md">
        <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
        <Input placeholder={isRTL ? 'بحث...' : 'Search...'} value={search} onChange={(e) => setSearch(e.target.value)} className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`} />
      </div>

      <DataTable columns={columns} data={filteredOrders} loading={isLoading} emptyMessage={t('noData')} />

      {/* PO Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPO ? (isRTL ? 'تعديل أمر شراء' : 'Edit PO') : (isRTL ? 'أمر شراء جديد' : 'New Purchase Order')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t('vendor')} *</Label>
                <Select value={formData.vendor_id} onValueChange={(v) => setFormData(p => ({...p, vendor_id: v}))}>
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر المورد' : 'Select vendor'} /></SelectTrigger>
                  <SelectContent>
                    {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name_ar}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ التسليم' : 'Delivery Date'}</Label>
                <Input type="date" value={formData.delivery_date} onChange={(e) => setFormData(p => ({...p, delivery_date: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'شروط الدفع (أيام)' : 'Payment Terms (days)'}</Label>
                <Input type="number" value={formData.payment_terms} onChange={(e) => setFormData(p => ({...p, payment_terms: parseInt(e.target.value) || 30}))} />
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>{isRTL ? 'البنود' : 'Items'}</Label>
                <Button size="sm" onClick={addItem}><Plus className="w-4 h-4 me-1" /> {isRTL ? 'إضافة بند' : 'Add Item'}</Button>
              </div>
              <div className="border rounded-lg overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>{isRTL ? 'الوصف' : 'Description'}</TableHead>
                      <TableHead className="w-[100px]">{t('quantity')}</TableHead>
                      <TableHead className="w-[120px]">{t('unitPrice')}</TableHead>
                      <TableHead className="w-[100px]">{t('total')}</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formData.items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Input value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" step="0.01" value={item.unit_price} onChange={(e) => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)} />
                        </TableCell>
                        <TableCell className="font-medium">{(item.quantity * item.unit_price).toLocaleString()}</TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => removeItem(idx)} disabled={formData.items.length === 1}>
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end">
                <div className="w-64 space-y-2 bg-slate-50 p-4 rounded-lg">
                  <div className="flex justify-between"><span>{t('subtotal')}</span><span>{subtotal.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>{t('vat')} (15%)</span><span>{vat.toLocaleString()}</span></div>
                  <div className="flex justify-between font-bold border-t pt-2"><span>{t('total')}</span><span>{total.toLocaleString()} {t('sar')}</span></div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('notes')}</Label>
              <Textarea value={formData.notes} onChange={(e) => setFormData(p => ({...p, notes: e.target.value}))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{t('cancel')}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}