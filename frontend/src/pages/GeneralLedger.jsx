import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import { Download, FileText, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function GeneralLedger() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch: _filterByBranch, branchFilter } = useBranch();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();

  const [selectedAccount, setSelectedAccount] = useState('');
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  const { data: accounts = [], isLoading: _loadingAccounts } = useQuery({
    queryKey: ['chartOfAccounts', tenantId],
    queryFn: () => fetchData(tenantQuery('chart_of_accounts').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const { data: journalEntries = [], isLoading: _loadingEntries } = useQuery({
    queryKey: ['journalEntries', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('journal_entries').select('*').match(tenantFilter(branchFilter({ status: 'posted' })))),
    enabled: hasTenantAccess,
  });

  // Build ledger entries for selected account
  const ledgerEntries = React.useMemo(() => {
    if (!selectedAccount) return [];

    const entries = [];
    let runningBalance = 0;
    const account = accounts.find(a => a.id === selectedAccount);
    const isDebitNormal = ['asset', 'expense'].includes(account?.account_type);

    // Get opening balance
    runningBalance = account?.opening_balance || 0;

    // Filter and sort journal entries
    const relevantEntries = journalEntries
      .filter(je => {
        const jeDate = new Date(je.date);
        return jeDate >= new Date(dateFrom) && jeDate <= new Date(dateTo);
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Add opening balance entry
    entries.push({
      id: 'opening',
      date: dateFrom,
      reference: '',
      description: isRTL ? 'رصيد افتتاحي' : 'Opening Balance',
      debit: 0,
      credit: 0,
      balance: runningBalance,
      isOpening: true
    });

    // Process each journal entry
    relevantEntries.forEach(je => {
      je.lines?.forEach(line => {
        if (line.account_id === selectedAccount) {
          const debit = parseFloat(line.debit) || 0;
          const credit = parseFloat(line.credit) || 0;
          
          if (isDebitNormal) {
            runningBalance = runningBalance + debit - credit;
          } else {
            runningBalance = runningBalance - debit + credit;
          }

          entries.push({
            id: `${je.id}-${line.line_number}`,
            date: je.date,
            reference: je.journal_number,
            description: line.description || je.description,
            debit,
            credit,
            balance: runningBalance
          });
        }
      });
    });

    return entries;
  }, [selectedAccount, journalEntries, accounts, dateFrom, dateTo, isRTL]);

  // Calculate totals
  const totals = React.useMemo(() => {
    const filteredEntries = ledgerEntries.filter(e => !e.isOpening);
    const totalDebit = filteredEntries.reduce((sum, e) => sum + (e.debit || 0), 0);
    const totalCredit = filteredEntries.reduce((sum, e) => sum + (e.credit || 0), 0);
    const closingBalance = ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].balance : 0;
    const openingBalance = ledgerEntries.length > 0 ? ledgerEntries[0].balance : 0;
    
    return { totalDebit, totalCredit, openingBalance, closingBalance };
  }, [ledgerEntries]);

  const exportToCSV = () => {
    if (ledgerEntries.length === 0) return;
    
    const account = accounts.find(a => a.id === selectedAccount);
    const headers = ['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'];
    const rows = ledgerEntries.map(e => [
      e.date,
      e.reference,
      e.description,
      e.debit,
      e.credit,
      e.balance
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ledger_${account?.account_code}_${dateFrom}_${dateTo}.csv`;
    link.click();
  };

  const selectedAccountData = accounts.find(a => a.id === selectedAccount);

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'دفتر الأستاذ العام' : 'General Ledger'}
        subtitle={isRTL ? 'عرض حركات الحسابات' : 'View account transactions'}
      >
        <Button variant="outline" onClick={exportToCSV} disabled={ledgerEntries.length === 0} className="gap-2">
          <Download className="w-4 h-4" />
          {t('export')}
        </Button>
      </PageHeader>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>{isRTL ? 'الحساب' : 'Account'}</Label>
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger>
                  <SelectValue placeholder={isRTL ? 'اختر الحساب' : 'Select account'} />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map(acc => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.account_code} - {isRTL ? acc.name_ar : (acc.name_en || acc.name_ar)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'من تاريخ' : 'From Date'}</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'إلى تاريخ' : 'To Date'}</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedAccount && (
        <>
          {/* Account Info & Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              title={isRTL ? 'الرصيد الافتتاحي' : 'Opening Balance'}
              value={`${totals.openingBalance.toLocaleString()}`}
              icon={FileText}
              iconClassName="bg-sand-alt"
            />
            <StatCard
              title={isRTL ? 'إجمالي المدين' : 'Total Debit'}
              value={`${totals.totalDebit.toLocaleString()}`}
              icon={TrendingUp}
              iconClassName="bg-emerald-50"
            />
            <StatCard
              title={isRTL ? 'إجمالي الدائن' : 'Total Credit'}
              value={`${totals.totalCredit.toLocaleString()}`}
              icon={TrendingDown}
              iconClassName="bg-red-50"
            />
            <StatCard
              title={isRTL ? 'الرصيد الختامي' : 'Closing Balance'}
              value={`${totals.closingBalance.toLocaleString()}`}
              icon={DollarSign}
              iconClassName="bg-najdi-50"
            />
          </div>

          {/* Account Header */}
          <Card className="bg-sand">
            <CardContent className="py-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-muted-foreground">{isRTL ? 'رقم الحساب' : 'Account Code'}</p>
                  <p className="font-mono font-semibold">{selectedAccountData?.account_code}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{isRTL ? 'اسم الحساب' : 'Account Name'}</p>
                  <p className="font-semibold">{isRTL ? selectedAccountData?.name_ar : (selectedAccountData?.name_en || selectedAccountData?.name_ar)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{isRTL ? 'نوع الحساب' : 'Account Type'}</p>
                  <p className="font-medium capitalize">{selectedAccountData?.account_type}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{isRTL ? 'الطبيعة' : 'Normal Balance'}</p>
                  <p className="font-medium capitalize">{selectedAccountData?.normal_balance}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ledger Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{isRTL ? 'حركات الحساب' : 'Account Transactions'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-sand">
                      <TableHead>{t('date')}</TableHead>
                      <TableHead>{isRTL ? 'المرجع' : 'Reference'}</TableHead>
                      <TableHead>{t('description')}</TableHead>
                      <TableHead className="text-end">{t('debit')}</TableHead>
                      <TableHead className="text-end">{t('credit')}</TableHead>
                      <TableHead className="text-end">{isRTL ? 'الرصيد' : 'Balance'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledgerEntries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          {isRTL ? 'لا توجد حركات في هذه الفترة' : 'No transactions in this period'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      ledgerEntries.map(entry => (
                        <TableRow key={entry.id} className={entry.isOpening ? 'bg-najdi-50 font-medium' : ''}>
                          <TableCell>{entry.isOpening ? '-' : format(new Date(entry.date), 'dd/MM/yyyy')}</TableCell>
                          <TableCell className="font-mono text-sm">{entry.reference}</TableCell>
                          <TableCell>{entry.description}</TableCell>
                          <TableCell className="text-end">{entry.debit > 0 ? entry.debit.toLocaleString() : '-'}</TableCell>
                          <TableCell className="text-end">{entry.credit > 0 ? entry.credit.toLocaleString() : '-'}</TableCell>
                          <TableCell className={`text-end font-medium ${entry.balance < 0 ? 'text-red-600' : ''}`}>
                            {entry.balance.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                    {ledgerEntries.length > 0 && (
                      <TableRow className="bg-sand-alt font-semibold">
                        <TableCell colSpan={3}>{isRTL ? 'الإجمالي' : 'Total'}</TableCell>
                        <TableCell className="text-end">{totals.totalDebit.toLocaleString()}</TableCell>
                        <TableCell className="text-end">{totals.totalCredit.toLocaleString()}</TableCell>
                        <TableCell className="text-end">{totals.closingBalance.toLocaleString()}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!selectedAccount && (
        <Card className="bg-sand">
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">{isRTL ? 'اختر حساباً لعرض حركاته' : 'Select an account to view its transactions'}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}