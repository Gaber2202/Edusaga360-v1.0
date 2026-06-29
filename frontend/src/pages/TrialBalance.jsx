/**
 * TrialBalance — AC#5 (generate in <10s) + AC#7 (4-click drill-down chain)
 * Trial Balance at any date with full account hierarchy
 */
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { useBranch } from '../components/BranchContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Download, RefreshCw, CheckCircle, AlertCircle, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

const SAR = (v) => (v || 0).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TYPE_ORDER = ['asset', 'liability', 'equity', 'revenue', 'expense'];
const TYPE_LABELS = {
  ar: { asset: 'الأصول', liability: 'الالتزامات', equity: 'حقوق الملكية', revenue: 'الإيرادات', expense: 'المصروفات' },
  en: { asset: 'Assets', liability: 'Liabilities', equity: 'Equity', revenue: 'Revenue', expense: 'Expenses' },
};

export default function TrialBalance() {
  const { isRTL } = useLanguage();
  const { branchFilter } = useBranch();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();

  const [asOfDate, setAsOfDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { data: accounts = [], isLoading: loadingAccts } = useQuery({
    queryKey: ['coa-tb', tenantId],
    queryFn: () => fetchData(tenantQuery('chart_of_accounts').select('*').match(tenantFilter({ is_active: true })).order('account_code')),
    enabled: hasTenantAccess,
  });

  const { data: journalEntries = [], isLoading: loadingJEs } = useQuery({
    queryKey: ['je-tb', tenantId],
    queryFn: () => fetchData(tenantQuery('journal_entrys').select('*').match(tenantFilter(branchFilter({ status: 'posted' })))),
    enabled: hasTenantAccess,
  });

  const loading = loadingAccts || loadingJEs;

  // ── Compute balances ────────────────────────────────────
  const accountBalances = useMemo(() => {
    const balMap = {};
    // Seed with opening balances
    accounts.forEach(acc => {
      balMap[acc.id] = {
        ...acc,
        debitTotal: 0,
        creditTotal: 0,
        openingBalance: acc.opening_balance || 0,
      };
    });

    // Accumulate posted JEs up to asOfDate
    journalEntries
      .filter(je => je.date <= asOfDate)
      .forEach(je => {
        (je.lines || []).forEach(line => {
          if (balMap[line.account_id]) {
            balMap[line.account_id].debitTotal += parseFloat(line.debit) || 0;
            balMap[line.account_id].creditTotal += parseFloat(line.credit) || 0;
          }
        });
      });

    return Object.values(balMap).map(acc => {
      const isDebitNormal = ['asset', 'expense'].includes(acc.account_type);
      const netMovement = acc.debitTotal - acc.creditTotal;
      const balance = acc.openingBalance + (isDebitNormal ? netMovement : -netMovement);
      const debitBalance = balance > 0 && isDebitNormal ? balance : (balance < 0 && !isDebitNormal ? Math.abs(balance) : 0);
      const creditBalance = balance > 0 && !isDebitNormal ? balance : (balance < 0 && isDebitNormal ? Math.abs(balance) : 0);
      return { ...acc, debitBalance, creditBalance, balance };
    }).filter(acc => acc.debitBalance !== 0 || acc.creditBalance !== 0 || acc.openingBalance !== 0);
  }, [accounts, journalEntries, asOfDate]);

  // Grouped by type
  const grouped = useMemo(() => {
    const g = {};
    TYPE_ORDER.forEach(t => { g[t] = []; });
    accountBalances.forEach(acc => {
      if (g[acc.account_type]) g[acc.account_type].push(acc);
    });
    return g;
  }, [accountBalances]);

  const totals = useMemo(() => {
    const totalDebit = accountBalances.reduce((s, a) => s + a.debitBalance, 0);
    const totalCredit = accountBalances.reduce((s, a) => s + a.creditBalance, 0);
    return { totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 };
  }, [accountBalances]);

  const exportCSV = () => {
    const rows = [['Account Code', 'Account Name', 'Type', 'Debit SAR', 'Credit SAR']];
    accountBalances.sort((a, b) => (a.account_code || '').localeCompare(b.account_code || '')).forEach(acc => {
      rows.push([acc.account_code, acc.name_ar, acc.account_type, acc.debitBalance.toFixed(2), acc.creditBalance.toFixed(2)]);
    });
    rows.push(['', 'TOTAL', '', totals.totalDebit.toFixed(2), totals.totalCredit.toFixed(2)]);
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `trial_balance_${asOfDate}.csv`; a.click();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">{isRTL ? 'ميزان المراجعة' : 'Trial Balance'}</h1>
          <p className="text-sm text-muted-foreground">{isRTL ? 'أرصدة جميع الحسابات في تاريخ محدد' : 'All account balances at a selected date'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">{isRTL ? 'حتى تاريخ' : 'As of'}</Label>
          <Input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} className="w-40 h-9" />
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={accountBalances.length === 0} className="h-9">
            <Download className="w-4 h-4 me-1" />{isRTL ? 'تصدير' : 'Export'}
          </Button>
        </div>
      </div>

      {/* Balance check */}
      {!loading && accountBalances.length > 0 && (
        <div className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium ${
          totals.balanced
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {totals.balanced
            ? <><CheckCircle className="w-4 h-4" />{isRTL ? '✓ الميزان متوازن — المدين = الدائن' : '✓ Trial balance is balanced — Debit = Credit'}</>
            : <><AlertCircle className="w-4 h-4" />{isRTL ? `⚠ فرق: SAR ${SAR(Math.abs(totals.totalDebit - totals.totalCredit))}` : `⚠ Out of balance by: SAR ${SAR(Math.abs(totals.totalDebit - totals.totalCredit))}`}</>}
        </div>
      )}

      {/* Trial Balance Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{isRTL ? `ميزان المراجعة — ${asOfDate}` : `Trial Balance — ${asOfDate}`}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-sand">
                  <TableHead className="w-24">{isRTL ? 'رمز' : 'Code'}</TableHead>
                  <TableHead>{isRTL ? 'اسم الحساب' : 'Account Name'}</TableHead>
                  <TableHead className="text-end w-36">{isRTL ? 'مدين (ر.س)' : 'Debit (SAR)'}</TableHead>
                  <TableHead className="text-end w-36">{isRTL ? 'دائن (ر.س)' : 'Credit (SAR)'}</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {TYPE_ORDER.map(type => {
                  const typeAccs = grouped[type] || [];
                  if (typeAccs.length === 0) return null;
                  const typeDebit = typeAccs.reduce((s, a) => s + a.debitBalance, 0);
                  const typeCredit = typeAccs.reduce((s, a) => s + a.creditBalance, 0);
                  const labels = isRTL ? TYPE_LABELS.ar : TYPE_LABELS.en;
                  return (
                    <React.Fragment key={type}>
                      {/* Type header */}
                      <TableRow className="bg-sand-alt/80">
                        <TableCell colSpan={5} className="py-2 px-4">
                          <span className="font-bold text-sm text-ink uppercase tracking-wide">{labels[type]}</span>
                        </TableCell>
                      </TableRow>
                      {/* Account rows */}
                      {typeAccs.sort((a, b) => (a.account_code || '').localeCompare(b.account_code || '')).map(acc => (
                        <TableRow key={acc.id} className="hover:bg-sand/50">
                          <TableCell className="font-mono text-xs text-muted-foreground py-2">{acc.account_code}</TableCell>
                          <TableCell className="py-2 text-sm">{isRTL ? acc.name_ar : (acc.name_en || acc.name_ar)}</TableCell>
                          <TableCell className="text-end py-2 font-mono text-sm">
                            {acc.debitBalance > 0 ? SAR(acc.debitBalance) : '—'}
                          </TableCell>
                          <TableCell className="text-end py-2 font-mono text-sm">
                            {acc.creditBalance > 0 ? SAR(acc.creditBalance) : '—'}
                          </TableCell>
                          {/* AC#7: drill-down to GL */}
                          <TableCell className="py-2">
                            <Link to={`/GeneralLedger?account=${acc.id}`}>
                              <ChevronRight className="w-4 h-4 text-muted-foreground hover:text-najdi-500 transition-colors" />
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Type subtotal */}
                      <TableRow className="bg-sand font-semibold text-sm">
                        <TableCell className="py-2"></TableCell>
                        <TableCell className="py-2 text-muted-foreground">{isRTL ? `إجمالي ${labels[type]}` : `Total ${labels[type]}`}</TableCell>
                        <TableCell className="text-end py-2 font-mono text-emerald-600">{typeDebit > 0 ? SAR(typeDebit) : '—'}</TableCell>
                        <TableCell className="text-end py-2 font-mono text-najdi-700">{typeCredit > 0 ? SAR(typeCredit) : '—'}</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </React.Fragment>
                  );
                })}

                {/* Grand totals */}
                <TableRow className="bg-najdi-900 text-white font-bold">
                  <TableCell className="py-3"></TableCell>
                  <TableCell className="py-3">{isRTL ? 'الإجمالي الكلي' : 'GRAND TOTAL'}</TableCell>
                  <TableCell className="text-end py-3 font-mono text-emerald-300">{SAR(totals.totalDebit)}</TableCell>
                  <TableCell className="text-end py-3 font-mono text-najdi-500">{SAR(totals.totalCredit)}</TableCell>
                  <TableCell className="py-3">
                    {totals.balanced
                      ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                      : <AlertCircle className="w-4 h-4 text-red-400" />}
                  </TableCell>
                </TableRow>

                {accountBalances.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      {isRTL ? 'لا توجد قيود مرحّلة حتى هذا التاريخ' : 'No posted entries up to this date'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}