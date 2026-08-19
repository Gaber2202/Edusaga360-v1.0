import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet, UtensilsCrossed, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../lib/LanguageContext';
import { useLinkedStudents, useParentScope } from '../lib/useParentData';
import { fetchParentApi, fetchParentList, createCanteenTopup, updateChildAllergens } from '../lib/parentApi';
import { CANTEEN_ALLERGENS } from '../lib/canteenAllergens';
import { fetchPaymentLink } from '../lib/api';
import PageHeader from '../components/PageHeader';
import ChildPills from '../components/ChildPills';
import EmptyState from '../components/EmptyState';
import LoadingCard from '../components/LoadingCard';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

const PRESETS = [25, 50, 100, 200];
const sar = (n) => `SAR ${(Number(n) || 0).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Canteen() {
  const { t, lang, isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const { enabled } = useParentScope();
  const { data: students = [] } = useLinkedStudents();
  const [childId, setChildId] = useState(null);
  const [amount, setAmount] = useState('50');
  const [busy, setBusy] = useState(false);
  const [allergens, setAllergens] = useState([]);
  const [savingAllergies, setSavingAllergies] = useState(false);
  const selectedId = childId || students[0]?.id;
  const locale = lang === 'ar' ? 'ar-SA' : 'en-GB';
  const selectedStudent = students.find((s) => s.id === selectedId);

  useEffect(() => {
    setAllergens(selectedStudent?.canteen_allergens || []);
  }, [selectedStudent?.id, JSON.stringify(selectedStudent?.canteen_allergens || [])]);

  const { data: wallet, isLoading: walletLoading } = useQuery({
    queryKey: ['parent-canteen-wallet', selectedId],
    queryFn: async () => {
      const payload = await fetchParentApi('/api/parent/canteen/wallet', { query: { student_id: selectedId } });
      return payload.data ?? { balance: 0, student_id: selectedId };
    },
    enabled: enabled && !!selectedId,
  });

  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: ['parent-canteen-tx', selectedId],
    queryFn: () => fetchParentList('/api/parent/canteen/transactions', { student_id: selectedId }),
    enabled: enabled && !!selectedId,
  });

  const balance = Number(wallet?.balance) || 0;
  const lowBalance = balance > 0 && balance < 20;

  const handleTopUp = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      const result = await createCanteenTopup(selectedId, Number(amount));
      const url = await fetchPaymentLink(result.invoice_id);
      window.open(url, '_blank', 'noopener,noreferrer');
      toast.success(t('topUpSuccess'));
      queryClient.invalidateQueries({ queryKey: ['parent-canteen-wallet'] });
      queryClient.invalidateQueries({ queryKey: ['parent-canteen-tx'] });
    } catch (error) {
      toast.error(error?.message || t('payError'));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAllergies = async () => {
    if (!selectedId) return;
    setSavingAllergies(true);
    try {
      await updateChildAllergens(selectedId, allergens);
      toast.success(t('canteenAllergiesSaved'));
      queryClient.invalidateQueries({ queryKey: ['parent-students'] });
    } catch (error) {
      toast.error(error?.message || t('payError'));
    } finally {
      setSavingAllergies(false);
    }
  };

  const toggleAllergen = (key) => {
    setAllergens((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  };

  const typeLabel = (type) => {
    if (type === 'topup') return isRTL ? 'شحن' : 'Top-up';
    if (type === 'purchase') return isRTL ? 'شراء' : 'Purchase';
    return type;
  };

  if (!enabled) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={t('parentPortalEyebrow')} title={t('canteen')} description={t('canteenTopUpHint')} />
        <EmptyState icon={AlertCircle} title={t('noStudentsLinkedAccount')} description={t('contactSchoolLink')} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t('parentPortalEyebrow')} title={t('canteen')} description={t('canteenTopUpHint')} />
      <ChildPills students={students} selectedId={childId} onChange={setChildId} />

      {walletLoading ? <LoadingCard /> : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-50 text-forest-700">
                  <Wallet className="h-6 w-6" />
                </div>
                <div>
                  <p className="es-eyebrow">{t('canteenBalance')}</p>
                  <p className={`es-metric text-3xl ${lowBalance ? 'text-[#A8443A]' : 'text-forest-700'}`}>{sar(balance)}</p>
                  {lowBalance ? <p className="text-sm text-[#A8443A]">{t('canteenLowBalance')}</p> : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((preset) => (
                  <Button key={preset} type="button" variant={amount === String(preset) ? 'default' : 'outline'} size="sm" onClick={() => setAmount(String(preset))}>
                    {sar(preset)}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-6">
              <p className="font-medium text-ink">{t('canteenTopUp')}</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input type="number" min={10} max={2000} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t('topUpAmount')} />
                <Button type="button" onClick={handleTopUp} disabled={busy || !selectedId}>
                  {busy ? <Loader2 className="animate-spin" /> : <UtensilsCrossed />}
                  {t('canteenTopUp')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-6">
              <div>
                <p className="font-medium text-ink">{t('canteenAllergies')}</p>
                <p className="text-sm text-muted-foreground mt-1">{t('canteenAllergiesHint')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {CANTEEN_ALLERGENS.map((key) => {
                  const on = allergens.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleAllergen(key)}
                      className={`h-11 px-4 rounded-full text-sm font-medium border touch-manipulation ${on ? 'bg-[#A8443A] text-white border-[#A8443A]' : 'bg-white text-ink'}`}
                    >
                      {t(`allergen${key.charAt(0).toUpperCase()}${key.slice(1)}`)}
                    </button>
                  );
                })}
              </div>
              <Button type="button" variant="outline" onClick={handleSaveAllergies} disabled={savingAllergies || !selectedId}>
                {savingAllergies ? <Loader2 className="animate-spin" /> : null}
                {t('saveAllergies')}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold text-ink">{t('canteenHistory')}</h2>
        {txLoading ? <LoadingCard /> : transactions.length === 0 ? (
          <EmptyState icon={UtensilsCrossed} title={t('noCanteenActivity')} />
        ) : (
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="es-table w-full">
                <thead>
                  <tr>
                    <th>{t('date')}</th>
                    <th>{t('status')}</th>
                    <th className="text-end">{t('total')}</th>
                    <th className="text-end">{t('balance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((row) => (
                    <tr key={row.id}>
                      <td>{row.transaction_date ? new Date(row.transaction_date).toLocaleDateString(locale) : '—'}</td>
                      <td>{typeLabel(row.transaction_type)}</td>
                      <td className="text-end tabular-nums">{sar(row.amount)}</td>
                      <td className="text-end tabular-nums">{sar(row.balance_after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
