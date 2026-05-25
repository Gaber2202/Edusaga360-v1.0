import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { Button } from '../components/ui/button';
import BulkInvoiceGeneration from '../components/fees/BulkInvoiceGeneration';
import InvoiceForm from '../components/fees/InvoiceForm';
import PaymentForm from '../components/fees/PaymentForm';
import FeesInvoiceList from '../components/fees/FeesInvoiceList';
import FeesDashboard from '../components/fees/FeesDashboard';
import FeesArrearsView from '../components/fees/FeesArrearsView';
import FeesVATReport from '../components/fees/FeesVATReport';
import { Plus, Layers, BarChart3, List, AlertTriangle, Receipt } from 'lucide-react';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function Fees() {
  const { isRTL } = useLanguage();
  const { userRole, user } = useRole();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();

  const [viewMode, setViewMode] = useState('invoices'); // invoices | dashboard | arrears | vat
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showBulkGeneration, setShowBulkGeneration] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices', tenantId],
    queryFn: () => fetchData(tenantQuery('invoices').select('*').match(tenantFilter(), '-created_date')),
    enabled: hasTenantAccess,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['payments', tenantId],
    queryFn: () => fetchData(tenantQuery('payments').select('*').match(tenantFilter(), '-created_date')),
    enabled: hasTenantAccess,
  });

  const { data: allPaymentLogs = [] } = useQuery({
    queryKey: ['allPaymentLogs', tenantId],
    queryFn: () => fetchData(tenantQuery('invoice_payment_logs').select('*').match(tenantFilter(), '-payment_date')),
    enabled: hasTenantAccess,
  });

  // Role-based invoice access
  const accessibleInvoices = React.useMemo(() => {
    if (userRole === 'parent') {
      const linkedStudentIds = user?.linked_student_ids || [];
      return invoices.filter(inv => linkedStudentIds.includes(inv.student_id));
    }
    return invoices;
  }, [invoices, userRole, user]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['payments'] });
  };

  const canCreate = ['admin', 'finance', 'accountant'].includes(userRole);

  const tabs = [
    { id: 'invoices', ar: 'الفواتير', en: 'Invoices', icon: List },
    { id: 'dashboard', ar: 'لوحة التحكم', en: 'Dashboard', icon: BarChart3 },
    { id: 'arrears', ar: 'المتأخرات', en: 'Arrears', icon: AlertTriangle },
    { id: 'vat', ar: 'تقرير الضريبة', en: 'VAT Report', icon: Receipt },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{isRTL ? 'الرسوم والفواتير' : 'Fees & Billing'}</h1>
          <p className="text-sm text-slate-500">{isRTL ? 'إدارة شاملة للرسوم والتحصيل والتقارير المالية' : 'Complete fee management, collections & financial reporting'}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canCreate && (
            <>
              <Button onClick={() => { setSelectedInvoice(null); setShowInvoiceForm(true); }} className="bg-blue-600 hover:bg-blue-700 text-white h-9">
                <Plus className="w-4 h-4 me-1" />
                {isRTL ? 'فاتورة جديدة' : 'New Invoice'}
              </Button>
              <Button variant="outline" onClick={() => setShowBulkGeneration(true)} className="h-9 gap-1.5">
                <Layers className="w-4 h-4" />
                {isRTL ? 'جماعية' : 'Bulk'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit flex-wrap">
        {tabs.map(tab => (
          <Button
            key={tab.id}
            size="sm"
            variant={viewMode === tab.id ? 'default' : 'ghost'}
            onClick={() => setViewMode(tab.id)}
            className={`h-8 px-3 gap-1.5 ${viewMode === tab.id ? '' : 'hover:bg-slate-200'}`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">{isRTL ? tab.ar : tab.en}</span>
          </Button>
        ))}
      </div>

      {/* Views */}
      {viewMode === 'invoices' && (
        <FeesInvoiceList
          invoices={accessibleInvoices}
          paymentLogs={allPaymentLogs}
          loading={isLoading}
          userRole={userRole}
          isRTL={isRTL}
          onRecordPayment={(inv) => { setSelectedInvoice(inv); setShowPaymentForm(true); }}
          onEditInvoice={(inv) => { setSelectedInvoice(inv); setShowInvoiceForm(true); }}
          onRefresh={handleRefresh}
        />
      )}

      {viewMode === 'dashboard' && (
        <FeesDashboard invoices={accessibleInvoices} payments={payments} isRTL={isRTL} />
      )}

      {viewMode === 'arrears' && (
        <FeesArrearsView
          invoices={accessibleInvoices}
          isRTL={isRTL}
          userRole={userRole}
          onRecordPayment={(inv) => { setSelectedInvoice(inv); setShowPaymentForm(true); }}
        />
      )}

      {viewMode === 'vat' && (
        <FeesVATReport invoices={accessibleInvoices} payments={payments} isRTL={isRTL} />
      )}

      {/* Dialogs */}
      <InvoiceForm
        open={showInvoiceForm}
        onClose={() => { setShowInvoiceForm(false); setSelectedInvoice(null); }}
        onSuccess={handleRefresh}
        invoice={selectedInvoice}
      />
      <PaymentForm
        open={showPaymentForm}
        onClose={() => { setShowPaymentForm(false); setSelectedInvoice(null); }}
        onSuccess={handleRefresh}
        invoice={selectedInvoice}
      />
      <BulkInvoiceGeneration
        open={showBulkGeneration}
        onClose={() => setShowBulkGeneration(false)}
      />
    </div>
  );
}