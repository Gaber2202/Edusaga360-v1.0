import React from 'react';
import { useLanguage } from '../LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';
import { TrendingDown, AlertTriangle, CheckCircle } from 'lucide-react';

export default function AssetLifecycleTracker({ asset }) {
  const { t, isRTL } = useLanguage();

  if (!asset) return null;

  const acquisitionCost = asset.acquisition_cost || 0;
  const accumulatedDep = asset.accumulated_depreciation || 0;
  const nbv = asset.net_book_value || acquisitionCost;
  const salvageValue = asset.salvage_value || 0;
  
  const depreciableAmount = acquisitionCost - salvageValue;
  const depreciationProgress = depreciableAmount > 0 
    ? ((accumulatedDep / depreciableAmount) * 100).toFixed(1)
    : 0;

  const usefulLifeMonths = (asset.useful_life_years || 0) * 12;
  const monthsSinceAcquisition = asset.acquisition_date 
    ? Math.floor((new Date() - new Date(asset.acquisition_date)) / (1000 * 60 * 60 * 24 * 30))
    : 0;
  
  const ageProgress = usefulLifeMonths > 0 
    ? ((monthsSinceAcquisition / usefulLifeMonths) * 100).toFixed(1)
    : 0;

  const getLifecycleStatus = () => {
    if (ageProgress >= 100) return { label: isRTL ? 'منتهي العمر' : 'Fully Depreciated', color: 'text-muted-foreground', icon: CheckCircle };
    if (ageProgress >= 75) return { label: isRTL ? 'قرب النهاية' : 'Near End of Life', color: 'text-orange-600', icon: AlertTriangle };
    if (ageProgress >= 50) return { label: isRTL ? 'منتصف العمر' : 'Mid-Life', color: 'text-najdi-700', icon: TrendingDown };
    return { label: isRTL ? 'جديد' : 'New', color: 'text-emerald-600', icon: CheckCircle };
  };

  const lifecycleStatus = getLifecycleStatus();
  const StatusIcon = lifecycleStatus.icon;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{isRTL ? 'دورة حياة الأصل' : 'Asset Lifecycle'}</span>
          <Badge className="flex items-center gap-1">
            <StatusIcon className="w-3 h-3" />
            {lifecycleStatus.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Age Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{isRTL ? 'عمر الأصل' : 'Asset Age'}</span>
            <span className="font-medium">{ageProgress}%</span>
          </div>
          <Progress value={parseFloat(ageProgress)} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{monthsSinceAcquisition} {isRTL ? 'شهر' : 'months'}</span>
            <span>{usefulLifeMonths} {isRTL ? 'شهر (كامل)' : 'months (total)'}</span>
          </div>
        </div>

        {/* Depreciation Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{isRTL ? 'الإهلاك المتراكم' : 'Depreciation Progress'}</span>
            <span className="font-medium">{depreciationProgress}%</span>
          </div>
          <Progress value={parseFloat(depreciationProgress)} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{accumulatedDep.toLocaleString()} {t('sar')}</span>
            <span>{depreciableAmount.toLocaleString()} {t('sar')}</span>
          </div>
        </div>

        {/* Value Summary */}
        <div className="bg-sand rounded-lg p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{isRTL ? 'القيمة الأصلية' : 'Original Cost'}:</span>
            <span className="font-semibold">{acquisitionCost.toLocaleString()} {t('sar')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{isRTL ? 'الإهلاك المتراكم' : 'Accumulated Dep.'}:</span>
            <span className="font-semibold text-red-600">-{accumulatedDep.toLocaleString()} {t('sar')}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-2">
            <span className="text-ink font-medium">{isRTL ? 'صافي القيمة الدفترية' : 'Net Book Value'}:</span>
            <span className="font-bold text-ink">{nbv.toLocaleString()} {t('sar')}</span>
          </div>
        </div>

        {/* Alerts */}
        {ageProgress >= 90 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900">
              <p className="font-medium">{isRTL ? 'قرب انتهاء العمر الإنتاجي' : 'Near End of Useful Life'}</p>
              <p className="mt-1">{isRTL ? 'يجب التخطيط للاستبدال' : 'Consider planning for replacement'}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}