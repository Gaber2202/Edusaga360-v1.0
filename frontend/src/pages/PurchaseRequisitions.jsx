import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
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
import PRActions from '../components/procurement/PRActions';
import jsPDF from 'jspdf';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function PurchaseRequisitions() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();

  const [showForm, setShowForm] = useState(false);
  const [editingPR, setEditingPR] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    required_date: '',
    purpose: '',
    notes: '',
    items: [{ description: '', quantity: 1, estimated_price: 0 }]
  });

  const { data: requisitions = [], isLoading } = useQuery({
    queryKey: ['purchaseRequisitions', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('purchase_requisitions').select('*').match(tenantFilter(branchFilter())).order('created_at', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const { data: _vendors = [] } = useQuery({
    queryKey: ['vendors', tenantId],
    queryFn: () => fetchData(tenantQuery('vendors').select('*').match(tenantFilter({ status: 'approved' }))),
    enabled: hasTenantAccess,
  });

  const filteredRequisitions = filterByBranch(requisitions).filter(pr => {
    const matchesSearch = pr.pr_number?.toLowerCase().includes(search.toLowerCase()) ||
      pr.purpose?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || pr.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const addItem = () => {
    setFormData(p => ({
      ...p,
      items: [...p.items, { description: '', quantity: 1, estimated_price: 0 }]
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

  const calculateTotal = () => {
    return formData.items.reduce((sum, item) => sum + (item.quantity * item.estimated_price), 0);
  };

  const handleSave = async () => {
    if (!formData.purpose || formData.items.length === 0) {
      toast.error(isRTL ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }

    setSaving(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const prNumber = `PR-${Date.now().toString(36).toUpperCase()}`;
      
      const tid = getTenantIdForCreate();
      const data = {
        ...(tid && { tenant_id: tid }),
        pr_number: prNumber,
        branch_id: selectedBranchId,
        request_date: format(new Date(), 'yyyy-MM-dd'),
        required_date: formData.required_date,
        purpose: formData.purpose,
        notes: formData.notes,
        items: formData.items.map((item, idx) => ({
          ...item,
          line_number: idx + 1,
          total: item.quantity * item.estimated_price
        })),
        total_estimated: calculateTotal(),
        status: 'pending',
        requested_by: user?.email
      };

      if (editingPR?.id) {
        await tenantQuery('purchase_requisitions').update(data);
        await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'PurchaseRequisition', entityId: editingPR.id, oldValues: editingPR, newValues: data });
      } else {
        const created = await tenantQuery('purchase_requisitions').insert(data);
        await logAuditEvent({ action: AuditActions.CREATE, entityType: 'PurchaseRequisition', entityId: created.id, newValues: data });
      }

      queryClient.invalidateQueries({ queryKey: ['purchaseRequisitions'] });
      setShowForm(false);
      resetForm();
      toast.success(isRTL ? 'تم الحفظ بنجاح' : 'Saved successfully');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (pr) => {
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      await tenantQuery('purchase_requisitions').update({
        status: 'approved',
        approved_by: user?.email,
        approved_date: format(new Date(), 'yyyy-MM-dd')
      });
      await logAuditEvent({ action: AuditActions.APPROVE, entityType: 'PurchaseRequisition', entityId: pr.id });
      queryClient.invalidateQueries({ queryKey: ['purchaseRequisitions'] });
      toast.success(isRTL ? 'تم الاعتماد' : 'Approved');
    } catch (error) {
      toast.error(isRTL ? `حدث خطأ: ${error.message}` : `Error: ${error.message}`);
    }
  };

  const handleReject = async (pr) => {
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      await tenantQuery('purchase_requisitions').update({
        status: 'rejected',
        rejected_by: user?.email,
        rejected_date: format(new Date(), 'yyyy-MM-dd')
      });
      await logAuditEvent({ action: AuditActions.REJECT, entityType: 'PurchaseRequisition', entityId: pr.id });
      queryClient.invalidateQueries({ queryKey: ['purchaseRequisitions'] });
      toast.success(isRTL ? 'تم الرفض' : 'Rejected');
    } catch (error) {
      toast.error(isRTL ? `حدث خطأ: ${error.message}` : `Error: ${error.message}`);
    }
  };

  const handleDownloadPR = (pr) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(isRTL ? 'طلب شراء' : 'Purchase Requisition', 20, 20);
    doc.setFontSize(12);
    doc.text(`${isRTL ? 'رقم الطلب' : 'PR #'}: ${pr.pr_number}`, 20, 35);
    doc.text(`${isRTL ? 'الغرض' : 'Purpose'}: ${pr.purpose}`, 20, 42);
    doc.setFontSize(11);
    let y = 55;
    pr.items?.forEach((item, idx) => {
      doc.text(`${idx + 1}. ${item.description} - ${item.quantity} x ${item.estimated_price}`, 20, y);
      y += 7;
    });
    doc.save(`PR_${pr.pr_number}.pdf`);
    toast.success(isRTL ? 'تم التنزيل' : 'Downloaded');
  };

  const handlePrintPR = (pr) => {
    const itemsHtml = pr.items?.map((item, idx) => 
      `<tr><td>${idx + 1}</td><td>${item.description}</td><td>${item.quantity}</td><td>${item.estimated_price}</td></tr>`
    ).join('');
    const printContent = `
      <html><head><title>PR ${pr.pr_number}</title>
      <style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px}</style>
      </head><body>
        <h1>${isRTL ? 'طلب شراء' : 'Purchase Requisition'}</h1>
        <p><strong>${isRTL ? 'رقم الطلب' : 'PR #'}:</strong> ${pr.pr_number}</p>
        <p><strong>${isRTL ? 'الغرض' : 'Purpose'}:</strong> ${pr.purpose}</p>
        <table><thead><tr><th>#</th><th>${isRTL ? 'الوصف' : 'Description'}</th><th>${isRTL ? 'الكمية' : 'Qty'}</th><th>${isRTL ? 'السعر' : 'Price'}</th></tr></thead>
        <tbody>${itemsHtml}</tbody></table>
      </body></html>
    `;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  const convertToPO = async (pr) => {
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const poNumber = `PO-${Date.now().toString(36).toUpperCase()}`;
      
      // Create Purchase Order
      const tid = getTenantIdForCreate();
      const po = await tenantQuery('purchase_orders').insert({
        ...(tid && { tenant_id: tid }),
        po_number: poNumber,
        pr_id: pr.id,
        pr_number: pr.pr_number,
        branch_id: pr.branch_id,
        vendor_id: '',
        order_date: format(new Date(), 'yyyy-MM-dd'),
        items: pr.items,
        subtotal: pr.total_estimated,
        vat_amount: pr.total_estimated * 0.15,
        total_amount: pr.total_estimated * 1.15,
        status: 'draft',
        created_by: user?.email
      });

      // Update PR status
      await tenantQuery('purchase_requisitions').update({
        status: 'converted',
        converted_po_id: po.id
      });

      await logAuditEvent({ action: 'CONVERT_TO_PO', entityType: 'PurchaseRequisition', entityId: pr.id, newValues: { po_id: po.id } });
      
      queryClient.invalidateQueries({ queryKey: ['purchaseRequisitions'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      toast.success(isRTL ? 'تم التحويل إلى أمر شراء' : 'Converted to Purchase Order');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  };

  const _handleEdit = (pr) => {
    setEditingPR(pr);
    // CRITICAL FIX: Properly load PR data for editing
    setFormData({
      required_date: pr.required_date || '',
      purpose: pr.purpose || '',
      notes: pr.notes || '',
      items: pr.items && pr.items.length > 0 ? pr.items : [{ description: '', quantity: 1, estimated_price: 0 }]
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setEditingPR(null);
    setFormData({
      required_date: '',
      purpose: '',
      notes: '',
      items: [{ description: '', quantity: 1, estimated_price: 0 }]
    });
  };

  const columns = [
    { header: isRTL ? 'رقم الطلب' : 'PR #', cell: (row) => <span className="font-mono text-sm">{row.pr_number}</span> },
    { header: isRTL ? 'الغرض' : 'Purpose', accessorKey: 'purpose' },
    { header: isRTL ? 'عدد البنود' : 'Items', cell: (row) => row.items?.length || 0 },
    { header: isRTL ? 'المبلغ التقديري' : 'Estimated', cell: (row) => <span className="font-semibold">{row.total_estimated?.toLocaleString()} {t('sar')}</span> },
    { header: t('date'), cell: (row) => row.request_date ? format(new Date(row.request_date), 'dd/MM/yyyy') : '-' },
    { header: t('status'), cell: (row) => <StatusBadge status={row.status} /> },
    { header: t('actions'), cell: (row) => (
      <PRActions
        pr={row}
        onApprove={handleApprove}
        onReject={handleReject}
        onConvert={convertToPO}
        onView={(_pr) => toast.info(isRTL ? 'قريباً' : 'Coming soon')}
        onDownload={handleDownloadPR}
        onPrint={handlePrintPR}
      />
    )}
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'طلبات الشراء' : 'Purchase Requisitions'}
        subtitle={isRTL ? 'إدارة طلبات الشراء الداخلية' : 'Manage internal purchase requests'}
        action
        actionLabel={isRTL ? 'طلب شراء جديد' : 'New Requisition'}
        actionIcon={Plus}
        onAction={() => { resetForm(); setShowForm(true); }}
      />

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="bg-white border">
          <TabsTrigger value="all">{t('all')}</TabsTrigger>
          <TabsTrigger value="pending">{t('pending')}</TabsTrigger>
          <TabsTrigger value="approved">{t('approved')}</TabsTrigger>
          <TabsTrigger value="converted">{isRTL ? 'محول' : 'Converted'}</TabsTrigger>
          <TabsTrigger value="rejected">{t('rejected')}</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="relative max-w-md">
        <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
        <Input placeholder={isRTL ? 'بحث...' : 'Search...'} value={search} onChange={(e) => setSearch(e.target.value)} className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`} />
      </div>

      <DataTable columns={columns} data={filteredRequisitions} loading={isLoading} emptyMessage={t('noData')} />

      {/* PR Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPR ? (isRTL ? 'تعديل طلب شراء' : 'Edit Requisition') : (isRTL ? 'طلب شراء جديد' : 'New Requisition')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ الحاجة' : 'Required Date'}</Label>
                <Input type="date" value={formData.required_date} onChange={(e) => setFormData(p => ({...p, required_date: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الغرض' : 'Purpose'} *</Label>
                <Input value={formData.purpose} onChange={(e) => setFormData(p => ({...p, purpose: e.target.value}))} />
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
                      <TableHead className="w-[120px]">{isRTL ? 'السعر التقديري' : 'Est. Price'}</TableHead>
                      <TableHead className="w-[100px]">{t('total')}</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formData.items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Input value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} placeholder={isRTL ? 'وصف البند' : 'Item description'} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" step="0.01" value={item.estimated_price} onChange={(e) => updateItem(idx, 'estimated_price', parseFloat(e.target.value) || 0)} />
                        </TableCell>
                        <TableCell className="font-medium">{(item.quantity * item.estimated_price).toLocaleString()}</TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => removeItem(idx)} disabled={formData.items.length === 1}>
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-slate-50 font-semibold">
                      <TableCell colSpan={3}>{t('total')}</TableCell>
                      <TableCell>{calculateTotal().toLocaleString()} {t('sar')}</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
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