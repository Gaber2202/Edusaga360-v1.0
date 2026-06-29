import React, { useEffect, useState } from 'react';
import { supabase, callApi } from '../api/supabaseClient';
import { isPlatformOwner } from '../lib/authHelpers';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Loader2, Database, ShieldAlert, Sparkles, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Super-admin tool to seed a complete set of demo data into a chosen tenant.
 * Seeding only — no deletion.
 */
export default function DemoDataSeed() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const me = await supabase.auth.getUser().then(r => r.data?.user);
        setUser(me);
        if (isPlatformOwner(me)) {
          const all = await supabase.from('tenants').select('*').order('created_at', { ascending: false }).limit();
          setTenants(all || []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSeed = async () => {
    if (!selectedTenantId) {
      toast.error('اختر مؤسسة أولاً');
      return;
    }
    setSeeding(true);
    setLastResult(null);
    try {
      const res = await callApi('/api/functions/seedDemoData', { tenant_id: selectedTenantId });
      if (res.data?.success) {
        setLastResult(res.data.counts || {});
        toast.success('تم زرع البيانات التجريبية');
      } else {
        toast.error(res.data?.error || 'فشل زرع البيانات');
      }
    } catch (e) {
      toast.error(e.message || 'فشل زرع البيانات');
    } finally {
      setSeeding(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isPlatformOwner(user)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-3">
            <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto" />
            <h2 className="text-lg font-bold">مخصص لمشرف المنصة فقط</h2>
            <p className="text-sm text-muted-foreground">هذه الصفحة متاحة لمشرف المنصة (Super Admin) فقط.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedTenant = tenants.find(t => t.id === selectedTenantId);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-najdi-50 flex items-center justify-center">
          <Database className="w-6 h-6 text-najdi-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">زرع البيانات التجريبية</h1>
          <p className="text-sm text-muted-foreground">اختر مؤسسة ثم اضغط زرع لإضافة بيانات شاملة (طلاب، موظفين، فواتير، حضور...).</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">اختيار المؤسسة المستهدفة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
            <SelectTrigger>
              <SelectValue placeholder="اختر مؤسسة..." />
            </SelectTrigger>
            <SelectContent>
              {tenants.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name_ar || t.name_en} {t.tenant_code ? `(${t.tenant_code})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedTenant && (
            <div className="rounded-lg border border-border bg-sand p-3 text-sm text-ink space-y-1">
              <div><span className="text-muted-foreground">الكود:</span> {selectedTenant.tenant_code || '—'}</div>
              <div><span className="text-muted-foreground">الحالة:</span> <Badge variant="outline">{selectedTenant.status || '—'}</Badge></div>
            </div>
          )}

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <strong>تنبيه:</strong> سيتم إضافة بيانات جديدة فقط — لن يتم حذف أو تعديل أي بيانات موجودة. الزرع آمن للتشغيل المتكرر.
          </div>

          <Button onClick={handleSeed} disabled={seeding || !selectedTenantId} className="w-full bg-najdi-700 hover:bg-najdi-900">
            {seeding ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> جاري الزرع...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> زرع البيانات التجريبية</>
            )}
          </Button>
        </CardContent>
      </Card>

      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              تمت العملية بنجاح
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(lastResult).length === 0 ? (
              <p className="text-sm text-muted-foreground">لم يتم زرع سجلات جديدة (البيانات موجودة بالفعل لهذه المؤسسة).</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(lastResult).map(([key, count]) => (
                  <div key={key} className="rounded-lg border border-border p-3 text-center">
                    <div className="text-2xl font-bold text-najdi-700">{count}</div>
                    <div className="text-xs text-muted-foreground mt-1">{key}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}