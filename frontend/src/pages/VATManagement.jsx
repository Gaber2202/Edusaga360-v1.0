import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { formatCurrency, getCurrencySymbol } from '../lib/localization';
import { useBranch } from '../components/BranchContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import StatCard from '../components/ui/StatCard';
import { Plus, Download, FileText, TrendingUp, TrendingDown, Loader2, Send, CheckCircle } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { toast } from 'sonner';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { useTenant } from '../components/TenantContext';
import { useJurisdictionFeatures } from '../components/JurisdictionFeatureContext';
import { getVatRate } from '../lib/vatRate';
import { EINVOICING_FEATURES } from '../lib/jurisdictionFeatures.js';

export default function VATManagement() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter, branches: _branches } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();
  const { tenant } = useTenant();
  const { isFeatureEnabled } = useJurisdictionFeatures();
  const eInvoicingEnabled = isFeatureEnabled(EINVOICING_FEATURES[0]);
  const VAT_RATE = getVatRate(tenant);
  const vatPct = (VAT_RATE * 100).toFixed(0);

  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState(false);

  const [formData, setFormData] = useState({
    period_start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    period_end: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
    adjustments: 0,
    adjustment_reason: '',
    notes: ''
  });

  const { data: vatReturns = [], isLoading } = useQuery({
    queryKey: ['vatReturns', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('vat_returns').select('*').match(tenantFilter(branchFilter())).order('created_at', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('invoices').select('*').match(tenantFilter(branchFilter({ status: 'paid' })))),
    enabled: hasTenantAccess,
  });

  const { data: bills = [] } = useQuery({
    queryKey: ['apBills', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('ap_bills').select('*').match(tenantFilter(branchFilter()))),
    enabled: hasTenantAccess,
  });

  const filteredReturns = filterByBranch(vatReturns).filter(r => 
    statusFilter === 'all' || r.status === statusFilter
  );

  const calculateVAT = async () => {
    setCalculating(true);
    try {
      const periodStart = new Date(formData.period_start);
      const periodEnd = new Date(formData.period_end);

      // Calculate Sales VAT (Output VAT)
      const periodInvoices = invoices.filter(inv => {
        const invDate = new Date(inv.issue_date);
        return invDate >= periodStart && invDate <= periodEnd;
      });

      const totalSales = periodInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
      const vatOnSales = totalSales * VAT_RATE;

      // Calculate Purchase VAT (Input VAT)
      const periodBills = bills.filter(bill => {
        const billDate = new Date(bill.bill_date);
        return billDate >= periodStart && billDate <= periodEnd;
      });

      const totalPurchases = periodBills.reduce((sum, bill) => sum + (bill.total_amount || 0), 0);
      const vatOnPurchases = totalPurchases * VAT_RATE;

      // Net VAT
      const netVAT = vatOnSales - vatOnPurchases + (parseFloat(formData.adjustments) || 0);

      setFormData(prev => ({
        ...prev,
        total_sales: totalSales,
        total_purchases: totalPurchases,
        vat_on_sales: vatOnSales,
        vat_on_purchases: vatOnPurchases,
        vat_payable: netVAT > 0 ? netVAT : 0,
        vat_refundable: netVAT < 0 ? Math.abs(netVAT) : 0
      }));

      toast.success(isRTL ? 'تم حساب ضريبة القيمة المضافة' : 'VAT calculated');
    } catch (error) {
      console.error('Error calculating VAT:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setCalculating(false);
    }
  };

  const handleSave = async () => {
    if (!formData.vat_on_sales && !formData.vat_on_purchases) {
      toast.error(isRTL ? 'يرجى حساب الضريبة أولاً' : 'Please calculate VAT first');
      return;
    }

    setSaving(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const returnNumber = `VAT-${format(new Date(formData.period_start), 'yyyyMM')}-${Date.now().toString(36).toUpperCase()}`;

      const tid = getTenantIdForCreate();
      const data = {
        ...(tid && { tenant_id: tid }),
        return_number: returnNumber,
        branch_id: selectedBranchId || 'all',
        company_id: user.company_id,
        period_start: formData.period_start,
        period_end: formData.period_end,
        total_sales: formData.total_sales,
        total_purchases: formData.total_purchases,
        vat_on_sales: formData.vat_on_sales,
        vat_on_purchases: formData.vat_on_purchases,
        vat_payable: formData.vat_payable,
        vat_refundable: formData.vat_refundable,
        adjustments: formData.adjustments,
        adjustment_reason: formData.adjustment_reason,
        notes: formData.notes,
        status: 'draft'
      };

      const created = await tenantQuery('vat_returns').insert(data);
      await logAuditEvent({ action: AuditActions.CREATE, entityType: 'VATReturn', entityId: created.id, newValues: data });

      queryClient.invalidateQueries({ queryKey: ['vatReturns'] });
      setShowForm(false);
      resetForm();
      toast.success(isRTL ? 'تم إنشاء الإقرار الضريبي' : 'VAT return created');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitToZATCA = async (vatReturn) => {
    try {
      await tenantQuery('vat_returns').update({
        status: 'submitted',
        submitted_date: new Date().toISOString(),
        submitted_by: (await supabase.auth.getUser().then(r => r.data?.user)).email,
        zatca_reference: `ZATCA-${Date.now()}`
      });
      await logAuditEvent({ action: 'SUBMIT', entityType: 'VATReturn', entityId: vatReturn.id });
      queryClient.invalidateQueries({ queryKey: ['vatReturns'] });
      toast.success(isRTL ? 'تم رفع الإقرار إلى الهيئة' : 'Submitted to Tax Authority');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  };

  const exportVATReturn = (vatReturn) => {
    const headers = ['Description', `Amount (${getCurrencySymbol(tenant?.localization, isRTL)})`];
    const rows = [
      ['VAT Period', `${format(new Date(vatReturn.period_start), 'dd/MM/yyyy')} - ${format(new Date(vatReturn.period_end), 'dd/MM/yyyy')}`],
      ['Total Sales', vatReturn.total_sales?.toLocaleString()],
      [`VAT on Sales (${vatPct}%)`, vatReturn.vat_on_sales?.toLocaleString()],
      ['Total Purchases', vatReturn.total_purchases?.toLocaleString()],
      [`VAT on Purchases (${vatPct}%)`, vatReturn.vat_on_purchases?.toLocaleString()],
      ['Adjustments', vatReturn.adjustments?.toLocaleString()],
      ['VAT Payable', vatReturn.vat_payable?.toLocaleString()],
      ['VAT Refundable', vatReturn.vat_refundable?.toLocaleString()]
    ];
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vat_return_${vatReturn.return_number}.csv`;
    link.click();
    toast.success(isRTL ? 'تم التصدير' : 'Exported');
  };

  const resetForm = () => {
    setFormData({
      period_start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
      period_end: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
      adjustments: 0,
      adjustment_reason: '',
      notes: ''
    });
  };

  // Stats from all returns
  const stats = React.useMemo(() => {
    const branchReturns = filterByBranch(vatReturns);
    const totalPayable = branchReturns.filter(r => r.status !== 'draft').reduce((sum, r) => sum + (r.vat_payable || 0), 0);
    const totalRefundable = branchReturns.filter(r => r.status !== 'draft').reduce((sum, r) => sum + (r.vat_refundable || 0), 0);
    const pending = branchReturns.filter(r => r.status === 'draft').length;
    const submitted = branchReturns.filter(r => r.status === 'submitted' || r.status === 'accepted').length;
    
    return { totalPayable, totalRefundable, pending, submitted };
  }, [vatReturns, filterByBranch]);

  const columns = [
    { header: isRTL ? 'رقم الإقرار' : 'Return #', cell: (row) => <span className="font-mono text-sm">{row.return_number}</span> },
    { header: isRTL ? 'الفترة' : 'Period', cell: (row) => `${format(new Date(row.period_start), 'dd/MM/yyyy')} - ${format(new Date(row.period_end), 'dd/MM/yyyy')}` },
    { header: isRTL ? 'ض.ق.م المبيعات' : 'VAT on Sales', cell: (row) => <span className="text-emerald-600">{formatCurrency(row.vat_on_sales, tenant?.localization, isRTL)}</span> },
    { header: isRTL ? 'ض.ق.م المشتريات' : 'VAT on Purchases', cell: (row) => <span className="text-najdi-700">{formatCurrency(row.vat_on_purchases, tenant?.localization, isRTL)}</span> },
    { header: isRTL ? 'المستحق للهيئة' : 'Payable', cell: (row) => row.vat_payable > 0 ? <span className="font-semibold text-red-600">{formatCurrency(row.vat_payable, tenant?.localization, isRTL)}</span> : '-' },
    { header: isRTL ? 'المسترد' : 'Refundable', cell: (row) => row.vat_refundable > 0 ? <span className="font-semibold text-emerald-600">{formatCurrency(row.vat_refundable, tenant?.localization, isRTL)}</span> : '-' },
    { header: t('status'), cell: (row) => <StatusBadge status={row.status} /> },
    { header: t('actions'), cell: (row) => (
      <div className="flex gap-1">
        {eInvoicingEnabled && row.status === 'draft' && (
          <Button size="sm" variant="ghost" onClick={() => handleSubmitToZATCA(row)} className="text-najdi-700">
            <Send className="w-4 h-4 me-1" /> {isRTL ? 'رفع' : 'Submit'}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => exportVATReturn(row)}>
          <Download className="w-4 h-4" />
        </Button>
      </div>
    )}
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'إدارة ضريبة القيمة المضافة' : 'VAT Management'}
        subtitle={isRTL ? `إقرارات ضريبة القيمة المضافة (${vatPct}٪)` : `VAT Returns (${vatPct}% Rate)`}
        action
        actionLabel={isRTL ? 'إقرار جديد' : 'New Return'}
        actionIcon={Plus}
        onAction={() => { resetForm(); setShowForm(true); }}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard 
          title={isRTL ? 'المستحق للهيئة' : 'Total Payable'} 
          value={`${stats.totalPayable.toLocaleString()}`} 
          icon={TrendingUp} 
          iconClassName="bg-red-50" 
        />
        <StatCard 
          title={isRTL ? 'إجمالي المسترد' : 'Total Refundable'} 
          value={`${stats.totalRefundable.toLocaleString()}`} 
          icon={TrendingDown} 
          iconClassName="bg-emerald-50" 
        />
        <StatCard 
          title={isRTL ? 'المسودات' : 'Draft Returns'} 
          value={stats.pending} 
          icon={FileText} 
          iconClassName="bg-amber-50" 
        />
        <StatCard 
          title={isRTL ? 'المرفوعة' : 'Submitted'} 
          value={stats.submitted} 
          icon={CheckCircle} 
          iconClassName="bg-najdi-50" 
        />
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="bg-white border">
          <TabsTrigger value="all">{t('all')}</TabsTrigger>
          <TabsTrigger value="draft">{t('draft')}</TabsTrigger>
          <TabsTrigger value="submitted">{isRTL ? 'مرفوع' : 'Submitted'}</TabsTrigger>
          <TabsTrigger value="accepted">{isRTL ? 'مقبول' : 'Accepted'}</TabsTrigger>
          <TabsTrigger value="paid">{t('paid')}</TabsTrigger>
        </TabsList>
      </Tabs>

      <DataTable columns={columns} data={filteredReturns} loading={isLoading} emptyMessage={t('noData')} />

      {/* VAT Return Form */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'إقرار ضريبة القيمة المضافة' : 'VAT Return'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Period Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'بداية الفترة' : 'Period Start'} *</Label>
                <Input 
                  type="date" 
                  value={formData.period_start} 
                  onChange={(e) => setFormData(p => ({...p, period_start: e.target.value}))} 
                />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'نهاية الفترة' : 'Period End'} *</Label>
                <Input 
                  type="date" 
                  value={formData.period_end} 
                  onChange={(e) => setFormData(p => ({...p, period_end: e.target.value}))} 
                />
              </div>
            </div>

            <Button onClick={calculateVAT} disabled={calculating} className="w-full gap-2">
              {calculating && <Loader2 className="w-4 h-4 animate-spin" />}
              {isRTL ? 'حساب ضريبة القيمة المضافة' : 'Calculate VAT'}
            </Button>

            {/* VAT Calculation Results */}
            {formData.vat_on_sales !== undefined && (
              <Card className="bg-sand border-border">
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-muted-foreground">{isRTL ? 'إجمالي المبيعات (قبل الضريبة)' : 'Total Sales (Pre-VAT)'}</span>
                    <span className="font-semibold">{formatCurrency(formData.total_sales, tenant?.localization, isRTL)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-emerald-700 font-medium">{isRTL ? `ضريبة المبيعات (${vatPct}٪)` : `VAT on Sales (${vatPct}%)`}</span>
                    <span className="font-semibold text-emerald-600">{formatCurrency(formData.vat_on_sales, tenant?.localization, isRTL)}</span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b pt-2">
                    <span className="text-muted-foreground">{isRTL ? 'إجمالي المشتريات (قبل الضريبة)' : 'Total Purchases (Pre-VAT)'}</span>
                    <span className="font-semibold">{formatCurrency(formData.total_purchases, tenant?.localization, isRTL)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-najdi-900 font-medium">{isRTL ? `ضريبة المشتريات (${vatPct}٪)` : `VAT on Purchases (${vatPct}%)`}</span>
                    <span className="font-semibold text-najdi-700">{formatCurrency(formData.vat_on_purchases, tenant?.localization, isRTL)}</span>
                  </div>

                  <div className="flex justify-between items-center pt-3 border-t-2">
                    {formData.vat_payable > 0 ? (
                      <>
                        <span className="text-red-800 font-bold">{isRTL ? 'المستحق للهيئة' : 'VAT Payable'}</span>
                        <span className="font-bold text-red-600 text-lg">{formatCurrency(formData.vat_payable, tenant?.localization, isRTL)}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-emerald-800 font-bold">{isRTL ? 'المسترد من الهيئة' : 'VAT Refundable'}</span>
                        <span className="font-bold text-emerald-600 text-lg">{formatCurrency(formData.vat_refundable, tenant?.localization, isRTL)}</span>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Adjustments */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'التعديلات' : 'Adjustments'}</Label>
                <Input 
                  type="number" 
                  step="0.01"
                  value={formData.adjustments} 
                  onChange={(e) => setFormData(p => ({...p, adjustments: parseFloat(e.target.value) || 0}))} 
                />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'سبب التعديل' : 'Adjustment Reason'}</Label>
                <Input 
                  value={formData.adjustment_reason} 
                  onChange={(e) => setFormData(p => ({...p, adjustment_reason: e.target.value}))} 
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('notes')}</Label>
              <Textarea 
                value={formData.notes} 
                onChange={(e) => setFormData(p => ({...p, notes: e.target.value}))} 
                rows={2}
              />
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