import React from 'react';
import { useLanguage } from '../LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { DollarSign, Heart, TrendingDown, Calendar } from 'lucide-react';
import { format } from 'date-fns';

export default function CompensationTab({ employee }) {
  const { t, isRTL } = useLanguage();
  const comp = employee?.compensation || {};
  const salary = comp.salary_structure || {};
  const benefits = comp.benefits || {};
  const deductions = comp.deductions || {};

  const totalAllowances = (salary.allowances || []).reduce((sum, a) => sum + (a.amount || 0), 0);
  const totalDeductions = (deductions.other_deductions || []).reduce((sum, d) => sum + (d.amount || 0), 0);
  const grossSalary = (salary.basic_salary || 0) + totalAllowances;

  return (
    <div className="space-y-6">
      {/* Header with Dates */}
      {(comp.effective_start_date || comp.effective_end_date) && (
        <Card className="bg-najdi-50 border-najdi-100">
          <CardContent className="pt-6 flex items-center gap-4">
            <Calendar className="w-5 h-5 text-najdi-700 flex-shrink-0" />
            <div className="text-sm">
              <span className="text-ink">{isRTL ? 'فعال من' : 'Effective from'} </span>
              <span className="font-medium">{comp.effective_start_date ? format(new Date(comp.effective_start_date), 'dd MMM yyyy') : '-'}</span>
              {comp.effective_end_date && (
                <>
                  <span className="text-ink"> {isRTL ? 'إلى' : 'to'} </span>
                  <span className="font-medium">{format(new Date(comp.effective_end_date), 'dd MMM yyyy')}</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Salary Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">{isRTL ? 'الراتب الأساسي' : 'Basic Salary'}</div>
            <div className="text-xl font-semibold text-ink">{(salary.basic_salary || 0).toLocaleString()} {t('sar')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">{isRTL ? 'البدلات' : 'Allowances'}</div>
            <div className="text-xl font-semibold text-emerald-600">{totalAllowances.toLocaleString()} {t('sar')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">{isRTL ? 'الراتب الإجمالي' : 'Gross Salary'}</div>
            <div className="text-xl font-semibold text-najdi-700">{grossSalary.toLocaleString()} {t('sar')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">{isRTL ? 'الخصومات' : 'Deductions'}</div>
            <div className="text-xl font-semibold text-red-600">{totalDeductions.toLocaleString()} {t('sar')}</div>
          </CardContent>
        </Card>
      </div>

      {/* Salary Structure Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            {isRTL ? 'هيكل الراتب' : 'Salary Structure'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-sand p-3 rounded-lg">
            <p className="text-sm text-muted-foreground">{isRTL ? 'الراتب الأساسي' : 'Basic Salary'}</p>
            <p className="text-lg font-semibold">{(salary.basic_salary || 0).toLocaleString()} {t('sar')}</p>
          </div>

          {salary.allowances && salary.allowances.length > 0 && (
            <div>
              <h4 className="font-medium text-sm mb-2">{isRTL ? 'البدلات' : 'Allowances'}</h4>
              <div className="space-y-2">
                {salary.allowances.map((allow, idx) => (
                  <div key={idx} className="flex justify-between text-sm p-2 bg-sand rounded">
                    <span>{allow.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{allow.amount.toLocaleString()} {t('sar')}</span>
                      {allow.taxable && <Badge className="text-xs">{isRTL ? 'ضريبة' : 'Taxable'}</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Benefits */}
      {(benefits.medical_insurance || benefits.school_fees_benefit || benefits.other_benefits?.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="w-5 h-5" />
              {isRTL ? 'المزايا' : 'Benefits'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {benefits.medical_insurance && (
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{isRTL ? 'التأمين الطبي' : 'Medical Insurance'}</span>
                  <Badge className="bg-emerald-100 text-emerald-700">{benefits.medical_coverage_type === 'family' ? (isRTL ? 'العائلة' : 'Family') : (isRTL ? 'الموظف' : 'Employee')}</Badge>
                </div>
                {benefits.medical_provider && (
                  <p className="text-xs text-muted-foreground mt-1">{isRTL ? 'المزود' : 'Provider'}: {benefits.medical_provider}</p>
                )}
              </div>
            )}

            {benefits.school_fees_benefit && (
              <div className="p-3 bg-najdi-50 rounded-lg border border-najdi-100">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{isRTL ? 'مزية رسوم المدرسة' : 'School Fees Benefit'}</span>
                  <span className="font-semibold text-najdi-700">
                    {benefits.school_fees_discount_type === 'percentage' ? `${benefits.school_fees_value}%` : `${benefits.school_fees_value.toLocaleString()} ${t('sar')}`}
                  </span>
                </div>
              </div>
            )}

            {benefits.other_benefits && benefits.other_benefits.length > 0 && (
              <div>
                <h4 className="font-medium text-sm mb-2">{isRTL ? 'مزايا أخرى' : 'Other Benefits'}</h4>
                <div className="space-y-2">
                  {benefits.other_benefits.map((benefit, idx) => (
                    <div key={idx} className="p-2 bg-sand rounded text-sm">
                      <div className="flex justify-between">
                        <span>{benefit.name}</span>
                        <span className="text-muted-foreground">{benefit.value}</span>
                      </div>
                      {benefit.effective_date && (
                        <p className="text-xs text-muted-foreground mt-1">{isRTL ? 'من' : 'From'} {format(new Date(benefit.effective_date), 'dd MMM yyyy')}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Deductions */}
      {(deductions.gosi_applicable || deductions.other_deductions?.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5" />
              {isRTL ? 'الخصومات' : 'Deductions'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {deductions.gosi_applicable && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <span className="font-medium text-sm">{isRTL ? 'التأمينات الاجتماعية (GOSI)' : 'GOSI'}</span>
              </div>
            )}

            {deductions.other_deductions && deductions.other_deductions.length > 0 && (
              <div>
                <h4 className="font-medium text-sm mb-2">{isRTL ? 'خصومات أخرى' : 'Other Deductions'}</h4>
                <div className="space-y-2">
                  {deductions.other_deductions.map((ded, idx) => (
                    <div key={idx} className="flex justify-between text-sm p-2 bg-sand rounded">
                      <span>{ded.name}</span>
                      <span className="font-medium text-red-600">{ded.amount.toLocaleString()} {t('sar')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!comp.salary_structure && !benefits.medical_insurance && !deductions.other_deductions && (
        <Card className="bg-sand border-dashed">
          <CardContent className="pt-6 text-center text-muted-foreground text-sm">
            {isRTL ? 'لم يتم إضافة بيانات التعويضات والمزايا بعد' : 'No compensation data added yet'}
          </CardContent>
        </Card>
      )}
    </div>
  );
}