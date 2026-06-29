import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { toast } from 'sonner';
import {
  Plus,
  Edit2,
  Trash2,
  Loader2,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { useTenantFilter } from '../../hooks/useTenantFilter';

export default function SalaryComponents() {
  const { isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const { tenantId } = useTenantFilter();

  const [activeTab, setActiveTab] = useState('earning');
  const [showDialog, setShowDialog] = useState(false);
  const [editingComponent, setEditingComponent] = useState(null);
  const [processing, setProcessing] = useState(false);

  const [form, setForm] = useState({
    component_code: '',
    name_ar: '',
    name_en: '',
    component_type: 'earning',
    category: 'allowance',
    calculation_type: 'fixed',
    percentage_value: 0,
    default_amount: 0,
    is_taxable: false,
    affects_gosi: false,
    is_recurring: true,
    gl_account_code: '',
    display_order: 0
  });

  const { data: components = [], isLoading: _isLoading } = useQuery({
    queryKey: ['salaryComponents', tenantId],
    queryFn: () => fetchData(tenantQuery('salary_components').select('*').order('display_order')),
  });

  const earnings = components.filter(c => c.component_type === 'earning');
  const deductions = components.filter(c => c.component_type === 'deduction');

  const handleOpenDialog = (component = null) => {
    if (component) {
      setEditingComponent(component);
      setForm({
        component_code: component.component_code,
        name_ar: component.name_ar,
        name_en: component.name_en || '',
        component_type: component.component_type,
        category: component.category,
        calculation_type: component.calculation_type,
        percentage_value: component.percentage_value || 0,
        default_amount: component.default_amount || 0,
        is_taxable: component.is_taxable || false,
        affects_gosi: component.affects_gosi || false,
        is_recurring: component.is_recurring !== false,
        gl_account_code: component.gl_account_code || '',
        display_order: component.display_order || 0
      });
    } else {
      setEditingComponent(null);
      setForm({
        component_code: '',
        name_ar: '',
        name_en: '',
        component_type: activeTab,
        category: activeTab === 'earning' ? 'allowance' : 'gosi',
        calculation_type: 'fixed',
        percentage_value: 0,
        default_amount: 0,
        is_taxable: false,
        affects_gosi: false,
        is_recurring: true,
        gl_account_code: '',
        display_order: 0
      });
    }
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.component_code || !form.name_ar) {
      toast.error(isRTL ? 'يرجى ملء الحقول المطلوبة' : 'Please fill required fields');
      return;
    }

    setProcessing(true);
    try {
      if (editingComponent) {
        await tenantQuery('salary_components').update({ ...form, is_active: true });
        toast.success(isRTL ? 'تم التحديث بنجاح' : 'Updated successfully');
      } else {
        await tenantQuery('salary_components').insert({ ...form, is_active: true });
        toast.success(isRTL ? 'تم الإنشاء بنجاح' : 'Created successfully');
      }
      queryClient.invalidateQueries({ queryKey: ['salaryComponents'] });
      setShowDialog(false);
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (component) => {
    if (!confirm(isRTL ? 'هل تريد حذف هذا العنصر؟' : 'Delete this component?')) return;
    
    try {
      await tenantQuery('salary_components').delete().eq('id', component.id);
      queryClient.invalidateQueries({ queryKey: ['salaryComponents'] });
      toast.success(isRTL ? 'تم الحذف' : 'Deleted');
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const categoryLabels = {
    basic: { ar: 'راتب أساسي', en: 'Basic Salary' },
    allowance: { ar: 'بدل', en: 'Allowance' },
    bonus: { ar: 'مكافأة', en: 'Bonus' },
    overtime: { ar: 'عمل إضافي', en: 'Overtime' },
    gosi: { ar: 'تأمينات', en: 'GOSI' },
    loan: { ar: 'قرض', en: 'Loan' },
    tuition: { ar: 'رسوم دراسية', en: 'Tuition' },
    absence: { ar: 'غياب', en: 'Absence' },
    penalty: { ar: 'جزاء', en: 'Penalty' },
    other: { ar: 'أخرى', en: 'Other' }
  };

  const calculationLabels = {
    fixed: { ar: 'ثابت', en: 'Fixed' },
    percentage_basic: { ar: 'نسبة من الأساسي', en: '% of Basic' },
    percentage_gross: { ar: 'نسبة من الإجمالي', en: '% of Gross' },
    formula: { ar: 'معادلة', en: 'Formula' },
    manual: { ar: 'يدوي', en: 'Manual' }
  };

  const renderTable = (data) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{isRTL ? 'الكود' : 'Code'}</TableHead>
          <TableHead>{isRTL ? 'الاسم' : 'Name'}</TableHead>
          <TableHead>{isRTL ? 'الفئة' : 'Category'}</TableHead>
          <TableHead>{isRTL ? 'طريقة الحساب' : 'Calculation'}</TableHead>
          <TableHead>{isRTL ? 'القيمة' : 'Value'}</TableHead>
          <TableHead>{isRTL ? 'التأمينات' : 'GOSI'}</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
              {isRTL ? 'لا توجد عناصر' : 'No components'}
            </TableCell>
          </TableRow>
        ) : (
          data.map(comp => (
            <TableRow key={comp.id}>
              <TableCell className="font-medium">{comp.component_code}</TableCell>
              <TableCell>
                <div>
                  <p>{comp.name_ar}</p>
                  {comp.name_en && <p className="text-xs text-muted-foreground">{comp.name_en}</p>}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">
                  {isRTL ? categoryLabels[comp.category]?.ar : categoryLabels[comp.category]?.en}
                </Badge>
              </TableCell>
              <TableCell>
                {isRTL ? calculationLabels[comp.calculation_type]?.ar : calculationLabels[comp.calculation_type]?.en}
              </TableCell>
              <TableCell>
                {comp.calculation_type === 'fixed' 
                  ? comp.default_amount?.toLocaleString()
                  : comp.calculation_type.includes('percentage') 
                    ? `${comp.percentage_value}%`
                    : '-'
                }
              </TableCell>
              <TableCell>
                {comp.affects_gosi ? (
                  <Badge className="bg-emerald-100 text-emerald-700">{isRTL ? 'نعم' : 'Yes'}</Badge>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => handleOpenDialog(comp)}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(comp)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">{isRTL ? 'عناصر الراتب' : 'Salary Components'}</h2>
          <p className="text-sm text-muted-foreground">{isRTL ? 'إدارة المكتسبات والاستقطاعات' : 'Manage earnings and deductions'}</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="w-4 h-4 me-2" />
          {isRTL ? 'عنصر جديد' : 'New Component'}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="earning" className="gap-2">
            <TrendingUp className="w-4 h-4" />
            {isRTL ? 'المكتسبات' : 'Earnings'} ({earnings.length})
          </TabsTrigger>
          <TabsTrigger value="deduction" className="gap-2">
            <TrendingDown className="w-4 h-4" />
            {isRTL ? 'الاستقطاعات' : 'Deductions'} ({deductions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="earning" className="mt-4">
          <Card>{renderTable(earnings)}</Card>
        </TabsContent>

        <TabsContent value="deduction" className="mt-4">
          <Card>{renderTable(deductions)}</Card>
        </TabsContent>
      </Tabs>

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingComponent 
                ? (isRTL ? 'تعديل عنصر الراتب' : 'Edit Salary Component')
                : (isRTL ? 'عنصر راتب جديد' : 'New Salary Component')
              }
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'الكود' : 'Code'}</Label>
                <Input 
                  value={form.component_code}
                  onChange={(e) => setForm({...form, component_code: e.target.value})}
                  placeholder="e.g., BASIC, HOUSING"
                />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'النوع' : 'Type'}</Label>
                <Select value={form.component_type} onValueChange={(v) => setForm({...form, component_type: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="earning">{isRTL ? 'مكتسب' : 'Earning'}</SelectItem>
                    <SelectItem value="deduction">{isRTL ? 'استقطاع' : 'Deduction'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'الاسم بالعربي' : 'Name (Arabic)'}</Label>
              <Input 
                value={form.name_ar}
                onChange={(e) => setForm({...form, name_ar: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'الاسم بالإنجليزي' : 'Name (English)'}</Label>
              <Input 
                value={form.name_en}
                onChange={(e) => setForm({...form, name_en: e.target.value})}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'الفئة' : 'Category'}</Label>
                <Select value={form.category} onValueChange={(v) => setForm({...form, category: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(categoryLabels).map(([key, labels]) => (
                      <SelectItem key={key} value={key}>{isRTL ? labels.ar : labels.en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'طريقة الحساب' : 'Calculation'}</Label>
                <Select value={form.calculation_type} onValueChange={(v) => setForm({...form, calculation_type: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(calculationLabels).map(([key, labels]) => (
                      <SelectItem key={key} value={key}>{isRTL ? labels.ar : labels.en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.calculation_type === 'fixed' && (
              <div className="space-y-2">
                <Label>{isRTL ? 'القيمة الافتراضية' : 'Default Amount'}</Label>
                <Input 
                  type="number"
                  value={form.default_amount}
                  onChange={(e) => setForm({...form, default_amount: parseFloat(e.target.value) || 0})}
                />
              </div>
            )}

            {form.calculation_type.includes('percentage') && (
              <div className="space-y-2">
                <Label>{isRTL ? 'النسبة %' : 'Percentage %'}</Label>
                <Input 
                  type="number"
                  value={form.percentage_value}
                  onChange={(e) => setForm({...form, percentage_value: parseFloat(e.target.value) || 0})}
                />
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>{isRTL ? 'يؤثر على التأمينات' : 'Affects GOSI'}</Label>
                <Switch 
                  checked={form.affects_gosi}
                  onCheckedChange={(v) => setForm({...form, affects_gosi: v})}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>{isRTL ? 'متكرر شهرياً' : 'Recurring Monthly'}</Label>
                <Switch 
                  checked={form.is_recurring}
                  onCheckedChange={(v) => setForm({...form, is_recurring: v})}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleSave} disabled={processing}>
              {processing && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}