import React from 'react';
import { Link } from 'react-router-dom';
import { Users, UserPlus, Building2, ArrowRight } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

/**
 * Shown when a tenant has no active employees — avoids the "SAR 0.00 / Unknown 100%"
 * broken-demo appearance on empty tenants.
 */
export default function HRDashboardEmptyState({ isRTL }) {
  const tt = (ar, en) => (isRTL ? ar : en);

  return (
    <Card className="border-dashed border-2 border-border/80 bg-sand-alt/20">
      <CardContent className="py-12 px-6 text-center max-w-lg mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-najdi-50 flex items-center justify-center mx-auto mb-4">
          <Users className="w-7 h-7 text-najdi-900" />
        </div>
        <h2 className="text-lg font-semibold text-ink">
          {tt('ابدأ ببناء سجل الموظفين', 'Build your workforce record')}
        </h2>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          {tt(
            'لوحة الموارد البشرية تعرض مؤشرات الامتثال والرواتب والسعودة فور توفر بيانات الموظفين. أضف موظفيك أو استورد قائمة CSV للبدء.',
            'HR compliance, payroll, and nationalization KPIs appear once employee records exist. Add staff or import a CSV roster to get started.',
          )}
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center mt-6">
          <Link to="/Employees">
            <Button className="gap-2 w-full sm:w-auto">
              <UserPlus className="w-4 h-4" />
              {tt('إضافة موظفين', 'Add employees')}
            </Button>
          </Link>
          <Link to="/Branches">
            <Button variant="outline" className="gap-2 w-full sm:w-auto">
              <Building2 className="w-4 h-4" />
              {tt('إعداد الفروع', 'Set up branches')}
            </Button>
          </Link>
        </div>
        <p className="text-xs text-muted-foreground mt-6 flex items-center justify-center gap-1">
          <ArrowRight className="w-3 h-3" />
          {tt('تلميح: أكمل الجنسية والعقد لكل موظف لتفعيل مؤشرات الامتثال', 'Tip: complete nationality and contract data per employee to unlock compliance KPIs')}
        </p>
      </CardContent>
    </Card>
  );
}
