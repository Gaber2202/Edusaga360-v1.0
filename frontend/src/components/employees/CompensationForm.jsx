import React from 'react';
import { useLanguage } from '../LanguageContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Plus, Trash2 } from 'lucide-react';

export default function CompensationForm({ value = {}, onChange }) {
  const { t: _t, isRTL } = useLanguage();

  const compensation = value || {};

  const handleChange = (field, subField, val) => {
    const updated = { ...compensation };
    if (!updated[field]) updated[field] = {};
    updated[field][subField] = val;
    onChange(updated);
  };

  const handleNestedArrayChange = (field, section, index, prop, val) => {
    const updated = { ...compensation };
    if (!updated[field]) updated[field] = {};
    if (!updated[field][section]) updated[field][section] = [];
    if (!updated[field][section][index]) updated[field][section][index] = {};
    updated[field][section][index][prop] = val;
    onChange(updated);
  };

  const addArrayItem = (field, section) => {
    const updated = { ...compensation };
    if (!updated[field]) updated[field] = {};
    if (!updated[field][section]) updated[field][section] = [];
    updated[field][section].push({});
    onChange(updated);
  };

  const removeArrayItem = (field, section, index) => {
    const updated = { ...compensation };
    updated[field][section].splice(index, 1);
    onChange(updated);
  };

  const salaryStructure = compensation.salary_structure || {};
  const benefits = compensation.benefits || {};
  const deductions = compensation.deductions || {};
  const allowances = salaryStructure.allowances || [];
  const otherBenefits = benefits.other_benefits || [];
  const otherDeductions = deductions.other_deductions || [];

  return (
    <div className="space-y-6">
      {/* Effective Dates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{isRTL ? 'التواريخ الفعالة' : 'Effective Dates'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'تاريخ البداية' : 'Start Date'}</Label>
              <Input
                type="date"
                value={compensation.effective_start_date || ''}
                onChange={(e) => handleChange('', 'effective_start_date', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'تاريخ النهاية' : 'End Date'} ({isRTL ? 'اختياري' : 'Optional'})</Label>
              <Input
                type="date"
                value={compensation.effective_end_date || ''}
                onChange={(e) => handleChange('', 'effective_end_date', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Salary Structure */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{isRTL ? 'هيكل الراتب' : 'Salary Structure'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'الراتب الأساسي' : 'Basic Salary'} (SAR)</Label>
              <Input
                type="number"
                value={salaryStructure.basic_salary || 0}
                onChange={(e) => handleChange('salary_structure', 'basic_salary', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'تكرار الدفع' : 'Pay Frequency'}</Label>
              <Select value={salaryStructure.pay_frequency || 'monthly'} onValueChange={(v) => handleChange('salary_structure', 'pay_frequency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{isRTL ? 'شهري' : 'Monthly'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Allowances */}
          <div className="border-t pt-4 space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="font-medium text-sm">{isRTL ? 'البدلات' : 'Allowances'}</h4>
              <Button size="sm" variant="outline" onClick={() => addArrayItem('salary_structure', 'allowances')} className="gap-1">
                <Plus className="w-3 h-3" /> {isRTL ? 'إضافة' : 'Add'}
              </Button>
            </div>
            <div className="space-y-3">
              {allowances.map((allowance, idx) => (
                <div key={idx} className="p-3 bg-slate-50 rounded-lg space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder={isRTL ? 'اسم البدل' : 'Allowance Name'}
                      value={allowance.name || ''}
                      onChange={(e) => handleNestedArrayChange('salary_structure', 'allowances', idx, 'name', e.target.value)}
                    />
                    <Input
                      type="number"
                      placeholder={isRTL ? 'المبلغ' : 'Amount'}
                      value={allowance.amount || 0}
                      onChange={(e) => handleNestedArrayChange('salary_structure', 'allowances', idx, 'amount', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="flex gap-4 text-xs">
                    <label className="flex items-center gap-1">
                      <Checkbox checked={allowance.taxable || false} onCheckedChange={(c) => handleNestedArrayChange('salary_structure', 'allowances', idx, 'taxable', c)} />
                      {isRTL ? 'خاضع للضريبة' : 'Taxable'}
                    </label>
                    <label className="flex items-center gap-1">
                      <Checkbox checked={allowance.recurring !== false} onCheckedChange={(c) => handleNestedArrayChange('salary_structure', 'allowances', idx, 'recurring', c)} />
                      {isRTL ? 'متكرر' : 'Recurring'}
                    </label>
                    <Button size="sm" variant="ghost" onClick={() => removeArrayItem('salary_structure', 'allowances', idx)} className="text-red-600 ml-auto">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Benefits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{isRTL ? 'المزايا' : 'Benefits'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Medical Insurance */}
          <div className="p-3 bg-slate-50 rounded-lg space-y-2">
            <label className="flex items-center gap-2">
              <Checkbox checked={benefits.medical_insurance || false} onCheckedChange={(c) => handleChange('benefits', 'medical_insurance', c)} />
              <span className="text-sm font-medium">{isRTL ? 'التأمين الطبي' : 'Medical Insurance'}</span>
            </label>
            {benefits.medical_insurance && (
              <div className="space-y-2 mt-3 border-t pt-3">
                <Select value={benefits.medical_coverage_type || ''} onValueChange={(v) => handleChange('benefits', 'medical_coverage_type', v)}>
                  <SelectTrigger className="text-xs"><SelectValue placeholder={isRTL ? 'نوع التغطية' : 'Coverage Type'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">{isRTL ? 'الموظف' : 'Employee'}</SelectItem>
                    <SelectItem value="family">{isRTL ? 'العائلة' : 'Family'}</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder={isRTL ? 'اسم المزود' : 'Provider Name'}
                  value={benefits.medical_provider || ''}
                  onChange={(e) => handleChange('benefits', 'medical_provider', e.target.value)}
                  className="text-xs"
                />
              </div>
            )}
          </div>

          {/* School Fees Benefit */}
          <div className="p-3 bg-slate-50 rounded-lg space-y-2">
            <label className="flex items-center gap-2">
              <Checkbox checked={benefits.school_fees_benefit || false} onCheckedChange={(c) => handleChange('benefits', 'school_fees_benefit', c)} />
              <span className="text-sm font-medium">{isRTL ? 'مزية رسوم المدرسة' : 'School Fees Benefit'}</span>
            </label>
            {benefits.school_fees_benefit && (
              <div className="space-y-2 mt-3 border-t pt-3">
                <Select value={benefits.school_fees_discount_type || ''} onValueChange={(v) => handleChange('benefits', 'school_fees_discount_type', v)}>
                  <SelectTrigger className="text-xs"><SelectValue placeholder={isRTL ? 'نوع الخصم' : 'Discount Type'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">{isRTL ? 'نسبة مئوية' : 'Percentage'}</SelectItem>
                    <SelectItem value="fixed">{isRTL ? 'مبلغ ثابت' : 'Fixed Amount'}</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder={isRTL ? 'القيمة' : 'Value'}
                  value={benefits.school_fees_value || 0}
                  onChange={(e) => handleChange('benefits', 'school_fees_value', parseFloat(e.target.value) || 0)}
                  className="text-xs"
                />
              </div>
            )}
          </div>

          {/* Other Benefits */}
          <div className="border-t pt-4 space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="font-medium text-sm">{isRTL ? 'مزايا أخرى' : 'Other Benefits'}</h4>
              <Button size="sm" variant="outline" onClick={() => addArrayItem('benefits', 'other_benefits')} className="gap-1">
                <Plus className="w-3 h-3" /> {isRTL ? 'إضافة' : 'Add'}
              </Button>
            </div>
            <div className="space-y-3">
              {otherBenefits.map((benefit, idx) => (
                <div key={idx} className="p-3 bg-slate-50 rounded-lg space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder={isRTL ? 'اسم المزية' : 'Benefit Name'}
                      value={benefit.name || ''}
                      onChange={(e) => handleNestedArrayChange('benefits', 'other_benefits', idx, 'name', e.target.value)}
                    />
                    <Input
                      placeholder={isRTL ? 'القيمة' : 'Value'}
                      value={benefit.value || ''}
                      onChange={(e) => handleNestedArrayChange('benefits', 'other_benefits', idx, 'value', e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={benefit.effective_date || ''}
                      onChange={(e) => handleNestedArrayChange('benefits', 'other_benefits', idx, 'effective_date', e.target.value)}
                      className="text-xs flex-1"
                    />
                    <Button size="sm" variant="ghost" onClick={() => removeArrayItem('benefits', 'other_benefits', idx)} className="text-red-600">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Deductions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{isRTL ? 'الخصومات' : 'Deductions'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* GOSI */}
          <label className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
            <Checkbox checked={deductions.gosi_applicable !== false} onCheckedChange={(c) => handleChange('deductions', 'gosi_applicable', c)} />
            <span className="text-sm font-medium">{isRTL ? 'التأمينات الاجتماعية (GOSI)' : 'GOSI Applicable'}</span>
          </label>

          {/* Other Deductions */}
          <div className="border-t pt-4 space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="font-medium text-sm">{isRTL ? 'خصومات أخرى' : 'Other Deductions'}</h4>
              <Button size="sm" variant="outline" onClick={() => addArrayItem('deductions', 'other_deductions')} className="gap-1">
                <Plus className="w-3 h-3" /> {isRTL ? 'إضافة' : 'Add'}
              </Button>
            </div>
            <div className="space-y-3">
              {otherDeductions.map((deduction, idx) => (
                <div key={idx} className="p-3 bg-slate-50 rounded-lg space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder={isRTL ? 'اسم الخصم' : 'Deduction Name'}
                      value={deduction.name || ''}
                      onChange={(e) => handleNestedArrayChange('deductions', 'other_deductions', idx, 'name', e.target.value)}
                    />
                    <Input
                      type="number"
                      placeholder={isRTL ? 'المبلغ' : 'Amount'}
                      value={deduction.amount || 0}
                      onChange={(e) => handleNestedArrayChange('deductions', 'other_deductions', idx, 'amount', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="flex gap-4 text-xs">
                    <label className="flex items-center gap-1">
                      <Checkbox checked={deduction.recurring !== false} onCheckedChange={(c) => handleNestedArrayChange('deductions', 'other_deductions', idx, 'recurring', c)} />
                      {isRTL ? 'متكرر' : 'Recurring'}
                    </label>
                    <Button size="sm" variant="ghost" onClick={() => removeArrayItem('deductions', 'other_deductions', idx)} className="text-red-600 ml-auto">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}