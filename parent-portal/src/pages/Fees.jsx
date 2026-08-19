import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, Download, AlertCircle, Loader2, Receipt, FileText, ScrollText } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, fetchData } from '../lib/supabase';
import { downloadInvoicePdf, downloadReceiptPdf, fetchPaymentLink } from '../lib/api';
import { buildPaymentReceiptHtml, printPaymentReceipt } from '../lib/receiptReport';
import { invoiceBalance, displayStatus, STATUS_LABELS, STATUS_TONES } from '../lib/invoiceStatus';
import { applyInvoiceFilters, invoiceBreakdown, canPayInvoice } from '../lib/invoiceFilters';
import { presetRange } from '../lib/attendanceFilters';
import { useLanguage } from '../lib/LanguageContext';
import { useLinkedStudents, useParentScope } from '../lib/useParentData';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import ChildPills from '../components/ChildPills';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import LoadingCard from '../components/LoadingCard';
import StatusPill from '../components/StatusPill';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import InvoiceFilters from '../components/InvoiceFilters';
import { fetchParentList, signParentDocument } from '../lib/parentApi';

const sar = (n) => `SAR ${(Number(n) || 0).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const KPI_TONE = {
  outstanding: 'text-[#A8443A]',
  overdue: 'text-[#A8443A]',
  unpaid: 'text-[#D08A24]',
  paid: 'text-forest-700',
};

export default function Fees() {
  const { t, lang, isRTL } = useLanguage();
  const { tenantId, linkedIds, enabled } = useParentScope();
  const { data: students = [] } = useLinkedStudents();
  const [childId, setChildId] = useState(null);
  const [status, setStatus] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [tab, setTab] = useState('invoices');
  const studentIds = childId ? [childId] : linkedIds;
  const locale = lang === 'ar' ? 'ar-SA' : 'en-GB';

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['parent-invoices', tenantId, studentIds],
    queryFn: () => fetchData(
      supabase
        .from('invoices')
        .select('id, invoice_number, student_id, student_name, date, issue_date, due_date, total_amount, paid_amount, status, academic_year, document_type')
        .eq('tenant_id', tenantId)
        .in('student_id', studentIds)
        .order('due_date', { ascending: false })
    ),
    enabled,
  });

  const selectedStudentId = childId || linkedIds[0];

  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ['parent-payments', tenantId, studentIds],
    queryFn: () => fetchParentList('/api/parent/payments', selectedStudentId ? { student_id: selectedStudentId } : {}),
    enabled: enabled && tab === 'payments',
  });

  const { data: contracts = [], isLoading: contractsLoading } = useQuery({
    queryKey: ['parent-contracts', tenantId, studentIds],
    queryFn: () => fetchParentList('/api/parent/contracts', selectedStudentId ? { student_id: selectedStudentId } : {}),
    enabled: enabled && tab === 'contracts',
  });

  const { data: applications = [], isLoading: appsLoading } = useQuery({
    queryKey: ['parent-applications', tenantId, selectedStudentId],
    queryFn: () => fetchParentList('/api/parent/applications', { student_id: selectedStudentId }),
    enabled: enabled && tab === 'admission' && !!selectedStudentId,
  });

  const filtered = useMemo(
    () => applyInvoiceFilters(invoices, { status, from, to })
      .sort((a, b) => (b.issue_date || b.date || '').localeCompare(a.issue_date || a.date || '')),
    [invoices, status, from, to],
  );
  const breakdown = invoiceBreakdown(filtered);
  const allBills = useMemo(() => applyInvoiceFilters(invoices, { status: 'all' }), [invoices]);
  const headerOutstanding = invoiceBreakdown(allBills).outstanding;

  const nameFor = (inv) => {
    const student = students.find((row) => row.id === inv.student_id);
    return isRTL
      ? (student?.name_ar || student?.name_en || inv.student_name)
      : (student?.name_en || student?.name_ar || inv.student_name) || '—';
  };

  const formatDate = (value) => (
    value ? new Date(value).toLocaleDateString(locale) : '—'
  );

  const clearFilters = () => {
    setStatus('all');
    setFrom('');
    setTo('');
  };

  const withBusy = async (id, work) => {
    setBusyId(id);
    try {
      await work();
    } finally {
      setBusyId(null);
    }
  };

  const handleDownloadInvoice = (inv) => withBusy(inv.id, async () => {
    try {
      await downloadInvoicePdf(inv.id, `invoice-${inv.invoice_number || inv.id}.pdf`);
    } catch (error) {
      toast.error(/authoriz/i.test(error?.message || '') ? t('notAuthorizedInvoice') : t('downloadError'));
    }
  });

  const handleDownloadReceipt = (inv) => withBusy(inv.id, async () => {
    const openLocalReceipt = () => {
      printPaymentReceipt(buildPaymentReceiptHtml({
        invoiceNumber: inv.invoice_number || inv.id.slice(0, 8),
        studentName: nameFor(inv),
        paidAmount: inv.paid_amount || inv.total_amount,
        totalAmount: inv.total_amount,
        dueDate: formatDate(inv.due_date),
        paidDate: formatDate(inv.issue_date || inv.date),
        academicYear: inv.academic_year,
        generatedLabel: `${t('generatedOn')}: ${new Date().toLocaleString(locale)}`,
        isRTL,
        labels: {
          title: `${t('receipt')} / Payment Receipt`,
          school: t('parentPortal'),
          paid: t('paid'),
          receiptNo: t('receipt'),
          invoiceNo: t('invoiceNo'),
          student: t('student'),
          academicYear: t('academic'),
          due: t('due'),
          paidDate: t('date'),
          description: t('notes'),
          amount: t('total'),
          paymentFor: t('receipt'),
          total: t('total'),
          amountReceived: t('paid'),
        },
      }));
    };

    try {
      await downloadReceiptPdf(inv.id, `receipt-${inv.invoice_number || inv.id}.pdf`);
      toast.success(t('receiptDownloaded'));
    } catch (error) {
      if (/authoriz/i.test(error?.message || '')) {
        toast.error(t('notAuthorizedInvoice'));
        return;
      }
      openLocalReceipt();
    }
  });

  const handlePay = (inv) => withBusy(inv.id, async () => {
    try {
      const url = await fetchPaymentLink(inv.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(/authoriz/i.test(error?.message || '') ? t('notAuthorizedInvoice') : t('payError'));
    }
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('parentPortalEyebrow')}
        title={t('feesBilling')}
        description={t('feesPageHint')}
        action={allBills.length > 0 ? (
          <div className="text-end">
            <p className="es-eyebrow">{t('totalOutstanding')}</p>
            <p className={`es-metric mt-1 text-[32px] leading-none ${headerOutstanding > 0 ? 'text-[#A8443A]' : 'text-forest-700'}`}>
              {sar(headerOutstanding)}
            </p>
          </div>
        ) : null}
      />
      <ChildPills students={students} selectedId={childId} onChange={setChildId} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto w-full flex-wrap gap-1">
          <TabsTrigger value="invoices">{t('tabInvoices')}</TabsTrigger>
          <TabsTrigger value="payments">{t('tabPayments')}</TabsTrigger>
          <TabsTrigger value="contracts">{t('tabContracts')}</TabsTrigger>
          <TabsTrigger value="admission">{t('tabAdmissionDocs')}</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="space-y-6">
      {isLoading ? (
        <LoadingCard />
      ) : !enabled ? (
        <EmptyState
          icon={AlertCircle}
          title={t('noStudentsLinkedAccount')}
          description={t('contactSchoolLink')}
        />
      ) : allBills.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title={t('noInvoices')}
          description={t('invoicesWillAppear')}
        />
      ) : (
        <>
          <Card>
            <CardContent className="p-6">
              <InvoiceFilters
                status={status}
                from={from}
                to={to}
                onStatusChange={setStatus}
                onFromChange={setFrom}
                onToChange={setTo}
                onPreset={(preset) => {
                  const range = presetRange(preset);
                  setFrom(range.from);
                  setTo(range.to);
                }}
                onClear={clearFilters}
                resultCount={filtered.length}
              />
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className={`es-metric text-2xl ${KPI_TONE.outstanding}`}>{sar(breakdown.outstanding)}</p>
                <p className="mt-1 text-[13px] font-medium text-ink">{t('totalOutstanding')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className={`es-metric text-2xl ${KPI_TONE.unpaid}`}>{breakdown.unpaid + breakdown.partial}</p>
                <p className="mt-1 text-[13px] font-medium text-ink">{t('unpaid')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className={`es-metric text-2xl ${KPI_TONE.overdue}`}>{breakdown.overdue}</p>
                <p className="mt-1 text-[13px] font-medium text-ink">{t('overdue')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className={`es-metric text-2xl ${KPI_TONE.paid}`}>{breakdown.paid}</p>
                <p className="mt-1 text-[13px] font-medium text-ink">{t('paid')}</p>
              </CardContent>
            </Card>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title={t('noMatchingInvoices')}
              description={t('noMatchingInvoicesHint')}
              action={(
                <Button type="button" variant="outline" onClick={clearFilters}>
                  {t('clearFilters')}
                </Button>
              )}
            />
          ) : (
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <table className="es-table w-full">
                  <thead>
                    <tr>
                      <th>{t('invoiceNo')}</th>
                      <th>{t('student')}</th>
                      <th>{t('due')}</th>
                      <th className="text-end">{t('total')}</th>
                      <th className="text-end">{t('balance')}</th>
                      <th>{t('status')}</th>
                      <th className="text-end">{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((inv) => {
                      const display = displayStatus(inv);
                      const label = STATUS_LABELS[display]?.[lang] || STATUS_LABELS[display]?.en || display;
                      const balance = invoiceBalance(inv);
                      const busy = busyId === inv.id;
                      return (
                        <tr key={inv.id}>
                          <td className="font-medium text-primary">{inv.invoice_number || inv.id.slice(0, 8)}</td>
                          <td className="text-[13px]">{nameFor(inv)}</td>
                          <td className="text-[13px] text-muted-foreground">{formatDate(inv.due_date)}</td>
                          <td className="text-end tabular-nums">{sar(inv.total_amount)}</td>
                          <td className={`text-end tabular-nums ${balance > 0 ? 'font-semibold text-[#A8443A]' : 'text-forest-700'}`}>
                            {sar(balance)}
                          </td>
                          <td>
                            <StatusPill tone={STATUS_TONES[display] || 'muted'}>{label}</StatusPill>
                          </td>
                          <td className="text-end">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {canPayInvoice(inv) ? (
                                <Button type="button" size="sm" onClick={() => handlePay(inv)} disabled={busy}>
                                  {busy ? <Loader2 className="animate-spin" /> : <CreditCard />}
                                  {t('payNow')}
                                </Button>
                              ) : null}
                              {display === 'paid' ? (
                                <Button type="button" size="sm" onClick={() => handleDownloadReceipt(inv)} disabled={busy}>
                                  {busy ? <Loader2 className="animate-spin" /> : <Receipt />}
                                  {t('receipt')}
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleDownloadInvoice(inv)}
                                disabled={busy}
                              >
                                {busy ? <Loader2 className="animate-spin" /> : <Download />}
                                {t('invoice')}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
        </TabsContent>

        <TabsContent value="payments">
          {paymentsLoading ? <LoadingCard /> : payments.length === 0 ? (
            <EmptyState icon={Receipt} title={t('noPayments')} description={t('paymentHistory')} />
          ) : (
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <table className="es-table w-full">
                  <thead>
                    <tr>
                      <th>{t('date')}</th>
                      <th>{t('invoiceNo')}</th>
                      <th>{t('student')}</th>
                      <th>{t('status')}</th>
                      <th className="text-end">{t('total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id}>
                        <td>{formatDate(payment.date)}</td>
                        <td>{payment.invoice_number || '—'}</td>
                        <td>{payment.student_name || '—'}</td>
                        <td>{payment.status || '—'}</td>
                        <td className="text-end tabular-nums">{sar(payment.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="contracts">
          {contractsLoading ? <LoadingCard /> : contracts.length === 0 ? (
            <EmptyState icon={ScrollText} title={t('noContracts')} />
          ) : (
            <div className="space-y-3">
              {contracts.map((contract) => (
                <Card key={contract.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                    <div>
                      <p className="font-medium text-ink">{contract.template_name || t('contractStatus')}</p>
                      <p className="text-sm text-muted-foreground">{contract.template_type || contract.status}</p>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {contract.signed_at ? `${t('signedOn')}: ${formatDate(contract.signed_at)}` : contract.status}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="admission">
          {appsLoading ? <LoadingCard /> : applications.length === 0 ? (
            <EmptyState icon={FileText} title={t('noAdmissionDocs')} />
          ) : (
            applications.map((app) => (
              <Card key={app.id}>
                <CardContent className="space-y-4 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-ink">{app.application_number || app.id.slice(0, 8)}</p>
                    <StatusPill tone="muted">{app.stage || app.status}</StatusPill>
                  </div>
                  <p className="text-sm text-muted-foreground">{t('applicationStage')}: {app.document_status || app.stage}</p>
                  <div>
                    <p className="mb-2 font-medium text-ink">{t('documentChecklist')}</p>
                    <div className="space-y-2">
                      {(app.documents || []).map((doc) => (
                        <div key={doc.key} className="flex items-center justify-between rounded-lg bg-sand-alt px-3 py-2 text-sm">
                          <span>{isRTL ? doc.label_ar : doc.label_en}</span>
                          <div className="flex items-center gap-2">
                            <StatusPill tone={doc.uploaded ? 'success' : 'danger'}>
                              {doc.uploaded ? t('uploaded') : t('missing')}
                            </StatusPill>
                            {doc.storage_path ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  try {
                                    const url = await signParentDocument(selectedStudentId, doc.storage_path);
                                    window.open(url, '_blank', 'noopener,noreferrer');
                                  } catch (error) {
                                    toast.error(error?.message || t('downloadError'));
                                  }
                                }}
                              >
                                {t('viewDocument')}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
