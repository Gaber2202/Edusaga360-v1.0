import React, { useState, useEffect } from 'react';
import { callApi } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { RefreshCw, TrendingUp, TrendingDown, Minus, Users, GraduationCap, Star, Clock, CreditCard, Shield } from 'lucide-react';
import { toast } from 'sonner';

const METRIC_CONFIG = {
  employee_count:      { label: { ar: 'عدد الموظفين',        en: 'Employees' },           icon: Users,         unit: '',     higherBetter: true  },
  student_count:       { label: { ar: 'عدد الطلاب',          en: 'Students' },             icon: GraduationCap, unit: '',     higherBetter: true  },
  saudi_pct:           { label: { ar: 'نسبة السعودة',         en: 'Saudization %' },        icon: Shield,        unit: '%',    higherBetter: true  },
  avg_attendance_rate: { label: { ar: 'معدل الحضور',          en: 'Attendance Rate' },       icon: Clock,         unit: '%',    higherBetter: true  },
  avg_late_rate:       { label: { ar: 'معدل التأخر',          en: 'Late Rate' },             icon: Clock,         unit: '%',    higherBetter: false },
  fee_collection_rate: { label: { ar: 'معدل تحصيل الرسوم',    en: 'Fee Collection Rate' },   icon: CreditCard,    unit: '%',    higherBetter: true  },
  avg_basic_salary:    { label: { ar: 'متوسط الراتب الأساسي',  en: 'Avg. Basic Salary' },     icon: Star,          unit: ' SAR', higherBetter: null  },
};

function PercentileBar({ pct }) {
  const color = pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : pct >= 25 ? 'bg-orange-400' : 'bg-red-400';
  return (
    <div className="w-full bg-sand-alt rounded-full h-2 mt-1">
      <div className={`${color} h-2 rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function TrendIcon({ value, avg, higherBetter }) {
  if (higherBetter === null) return <Minus className="w-4 h-4 text-muted-foreground" />;
  const better = higherBetter ? value >= avg : value <= avg;
  return better
    ? <TrendingUp  className="w-4 h-4 text-green-500" />
    : <TrendingDown className="w-4 h-4 text-red-400" />;
}

export default function BenchmarkDashboard() {
  const { isRTL } = useLanguage();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await callApi('/api/benchmarks', {}, { method: 'GET' });
      setData(res);
    } catch {
      toast.error(isRTL ? 'تعذّر تحميل بيانات المقارنة' : 'Failed to load benchmark data');
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    setLoading(true);
    try {
      await callApi('/api/benchmarks/snapshot', {});
      await load();
      toast.success(isRTL ? 'تم تحديث البيانات' : 'Snapshot refreshed');
    } catch {
      toast.error(isRTL ? 'فشل التحديث' : 'Refresh failed');
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{isRTL ? 'مقارنة الأداء — الشبكة' : 'School Network Benchmarks'}</h2>
          <p className="text-sm text-muted-foreground">
            {isRTL
              ? 'مقارنة أداء مدرستك مع المدارس الأخرى — البيانات مجهولة الهوية تماماً'
              : 'How your school compares to the network — all data fully anonymised'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {isRTL ? 'تحديث' : 'Refresh'}
        </Button>
      </div>

      {data?.note && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded-lg">
          {data.note}
        </div>
      )}

      {data && (
        <>
          <p className="text-xs text-muted-foreground">
            {isRTL
              ? `حجم الشبكة: ${data.pool_size} مدرسة · آخر تحديث: ${data.snapshot_date}`
              : `Network: ${data.pool_size} school${data.pool_size !== 1 ? 's' : ''} · Updated: ${data.snapshot_date}`}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(METRIC_CONFIG).map(([key, config]) => {
              const comp = data.comparison?.[key];
              if (!comp) return null;
              const Icon    = config.icon;
              const pctRank = comp.percentile;
              const label   = isRTL ? config.label.ar : config.label.en;
              const fmt     = v => config.unit === ' SAR'
                ? v.toLocaleString('en-SA', { maximumFractionDigits: 0 })
                : v.toFixed(config.unit === '%' ? 1 : 0);

              return (
                <Card key={key} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Icon className="w-4 h-4" />{label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-end justify-between mb-1">
                      <div>
                        <span className="text-2xl font-bold text-ink">
                          {fmt(comp.your_value)}{config.unit}
                        </span>
                        <p className="text-xs text-muted-foreground mt-0.5">{isRTL ? 'مدرستك' : 'Your school'}</p>
                      </div>
                      <div className="text-right">
                        <TrendIcon value={comp.your_value} avg={comp.network_avg} higherBetter={config.higherBetter} />
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {isRTL ? 'متوسط:' : 'Avg:'} {fmt(comp.network_avg)}{config.unit}
                        </p>
                      </div>
                    </div>

                    <PercentileBar pct={pctRank} />

                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-xs text-muted-foreground">
                        {isRTL ? `أفضل من ${pctRank}% من المدارس` : `Top ${100 - pctRank}% of schools`}
                      </span>
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                        pctRank >= 75 ? 'bg-green-100 text-green-700'
                          : pctRank >= 50 ? 'bg-amber-100 text-amber-700'
                          : pctRank >= 25 ? 'bg-orange-100 text-orange-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        P{pctRank}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {!data && !loading && (
        <div className="border-2 border-dashed border-border rounded-xl p-10 text-center text-muted-foreground">
          <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{isRTL ? 'اضغط تحديث لحساب موقع مدرستك في الشبكة' : 'Click Refresh to compute your school\'s position in the network'}</p>
        </div>
      )}
    </div>
  );
}
