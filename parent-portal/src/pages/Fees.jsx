import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase, fetchData } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { downloadInvoicePdf } from '../lib/api';
import { invoiceBalance, displayStatus, STATUS_LABELS, STATUS_STYLES } from '../lib/invoiceStatus';
import { useLanguage } from '../lib/LanguageContext';
import { Card, CardContent } from '../components/ui/card';
import { CreditCard, Download, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const sar = (n) => `SAR ${(Number(n) || 0).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Fees() {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const tenantId = user?.tenant_id;
  const linkedIds = user?.linked_student_ids || [];
  const [downloading, setDownloading] = useState(null);

  const { data: students = [] } = useQuery({
    queryKey: ['parent-students', tenantId],
    queryFn: () => fetchData(
      supabase.from('students').select('id, name_en, name_ar, grade').eq('tenant_id', tenantId).in('id', linkedIds)
    ),
    enabled: !!tenantId && linkedIds.length > 0,
  });

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['parent-invoices', tenantId, linkedIds],
    queryFn: () => fetchData(
      supabase
        .from('invoices')
        .select('id, invoice_number, student_id, student_name, date, issue_date, due_date, total_amount, paid_amount, status, academic_year')
        .eq('tenant_id', tenantId)
        .in('student_id', linkedIds)
    ),
    enabled: !!tenantId && linkedIds.length > 0,
  });

  const nameFor = (inv) => {
    const s = students.find((st) => st.id === inv.student_id);
    return s?.name_en || s?.name_ar || inv.student_name || '—';
  };

  const sorted = [...invoices].sort((a, b) => (b.issue_date || b.date || '').localeCompare(a.issue_date || a.date || ''));
  const totalOutstanding = invoices.reduce((sum, inv) => {
    const st = displayStatus(inv);
    return st === 'cancelled' || st === 'paid' ? sum : sum + invoiceBalance(inv);
  }, 0);

  const handleDownload = async (inv) => {
    setDownloading(inv.id);
    try {
      await downloadInvoicePdf(inv.id, `invoice-${inv.invoice_number || inv.id}.pdf`);
    } catch (e) {
      toast.error(/authoriz/i.test(e?.message || '') ? t('notAuthorizedInvoice') : t('downloadError'));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-800">{t('feesBilling')}</h1>
        {invoices.length > 0 && (
          <div className="text-end">
            <p className="text-xs text-slate-500">{t('totalOutstanding')}</p>
            <p className={`text-lg font-bold ${totalOutstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>{sar(totalOutstanding)}</p>
          </div>
        )}
      </div>

      {isLoading ? (
        <Card><CardContent className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></CardContent></Card>
      ) : linkedIds.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">{t('noStudentsLinkedAccount')}</p>
            <p className="text-xs text-slate-400 mt-1">{t('contactSchoolLink')}</p>
          </CardContent>
        </Card>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CreditCard className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">{t('noInvoices')}</p>
            <p className="text-xs text-slate-400 mt-1">{t('invoicesWillAppear')}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('invoiceNo')}</th>
                  <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('student')}</th>
                  <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('due')}</th>
                  <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{t('total')}</th>
                  <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{t('balance')}</th>
                  <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('status')}</th>
                  <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{t('invoice')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((inv) => {
                  const st = displayStatus(inv);
                  const label = STATUS_LABELS[st]?.[lang] || STATUS_LABELS[st]?.en || st;
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-emerald-700 font-semibold">{inv.invoice_number || inv.id.slice(0, 8)}</td>
                      <td className="px-4 py-3 text-xs text-slate-700">{nameFor(inv)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{inv.due_date || '—'}</td>
                      <td className="px-4 py-3 text-end text-xs font-semibold text-slate-800">{sar(inv.total_amount)}</td>
                      <td className="px-4 py-3 text-end text-xs">
                        <span className={invoiceBalance(inv) > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>{sar(invoiceBalance(inv))}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[st]}`}>{label}</span>
                      </td>
                      <td className="px-4 py-3 text-end">
                        <button
                          type="button"
                          onClick={() => handleDownload(inv)}
                          disabled={downloading === inv.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          {downloading === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          PDF
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
