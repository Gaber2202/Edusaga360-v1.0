import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import { Plus, Settings, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '../components/ui/switch';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function GradeConfiguration() {
  const { t, isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  
  const [showForm, setShowForm] = useState(false);
  const [editingGrade, setEditingGrade] = useState(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    grade_code: '',
    name_ar: '',
    name_en: '',
    display_order: 0,
    level_category: 'primary',
    is_active: true
  });

  const { data: grades = [], isLoading } = useQuery({
    queryKey: ['grades', tenantId],
    queryFn: async () => {
      const { data = [] } = await tenantQuery('grades').select('*').match(tenantFilter());
      return data.sort((a, b) => a.display_order - b.display_order);
    },
    enabled: hasTenantAccess,
  });

  const handleEdit = (grade) => {
    setEditingGrade(grade);
    setFormData({
      grade_code: grade.grade_code,
      name_ar: grade.name_ar,
      name_en: grade.name_en,
      display_order: grade.display_order,
      level_category: grade.level_category,
      is_active: grade.is_active
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.grade_code || !formData.name_ar || !formData.name_en) {
      toast.error(isRTL ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }

    setSaving(true);
    try {
      if (editingGrade) {
        await tenantQuery('grades').update(formData);
        toast.success(isRTL ? 'تم تحديث الصف بنجاح' : 'Grade updated successfully');
      } else {
        await tenantQuery('grades').insert(formData);
        toast.success(isRTL ? 'تم إنشاء الصف بنجاح' : 'Grade created successfully');
      }
      
      queryClient.invalidateQueries({ queryKey: ['grades'] });
      setShowForm(false);
      setEditingGrade(null);
      setFormData({ grade_code: '', name_ar: '', name_en: '', display_order: 0, level_category: 'primary', is_active: true });
    } catch (error) {
      console.error('Error saving grade:', error);
      toast.error(isRTL ? 'حدث خطأ: ' + error.message : 'Error: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (grade) => {
    try {
      await tenantQuery('grades').update({ is_active: !grade.is_active });
      queryClient.invalidateQueries({ queryKey: ['grades'] });
      toast.success(isRTL ? 'تم تحديث حالة الصف' : 'Grade status updated');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  };

  const columns = [
    { 
      header: t('gradeCode'), 
      width: '15%',
      cell: (row) => <span className="font-mono">{row.grade_code}</span>
    },
    { 
      header: isRTL ? 'الاسم بالعربي' : 'Name (Arabic)', 
      width: '25%',
      accessorKey: 'name_ar'
    },
    { 
      header: isRTL ? 'الاسم بالإنجليزي' : 'Name (English)', 
      width: '25%',
      accessorKey: 'name_en'
    },
    { 
      header: t('displayOrder'), 
      width: '10%',
      align: 'center',
      accessorKey: 'display_order'
    },
    { 
      header: t('levelCategory'), 
      width: '15%',
      cell: (row) => <span>{t(row.level_category)}</span>
    },
    { 
      header: t('status'), 
      width: '10%',
      align: 'center',
      cell: (row) => (
        <Switch 
          checked={row.is_active} 
          onCheckedChange={() => handleToggleActive(row)}
        />
      )
    },
    { 
      header: t('actions'), 
      width: '10%',
      align: 'center',
      cell: (row) => (
        <Button size="sm" variant="ghost" onClick={() => handleEdit(row)}>
          <Settings className="w-4 h-4" />
        </Button>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('gradeConfiguration')}
        subtitle={isRTL ? 'إدارة الصفوف الدراسية' : 'Manage educational grades'}
        action
        actionLabel={t('newGrade')}
        actionIcon={Plus}
        onAction={() => {
          setEditingGrade(null);
          setFormData({ grade_code: '', name_ar: '', name_en: '', display_order: grades.length + 1, level_category: 'primary', is_active: true });
          setShowForm(true);
        }}
      />

      <DataTable columns={columns} data={grades} loading={isLoading} emptyMessage={t('noData')} />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGrade ? t('editGrade') : t('newGrade')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('gradeCode')} *</Label>
              <Input 
                value={formData.grade_code} 
                onChange={(e) => setFormData(p => ({...p, grade_code: e.target.value.toUpperCase()}))}
                placeholder="KG1, G1, G2..."
              />
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'الاسم بالعربي' : 'Name (Arabic)'} *</Label>
              <Input 
                value={formData.name_ar} 
                onChange={(e) => setFormData(p => ({...p, name_ar: e.target.value}))}
                placeholder="روضة ١، الصف الأول..."
              />
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'الاسم بالإنجليزي' : 'Name (English)'} *</Label>
              <Input 
                value={formData.name_en} 
                onChange={(e) => setFormData(p => ({...p, name_en: e.target.value}))}
                placeholder="KG 1, Grade 1..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('displayOrder')} *</Label>
                <Input 
                  type="number" 
                  value={formData.display_order} 
                  onChange={(e) => setFormData(p => ({...p, display_order: parseInt(e.target.value) || 0}))}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('levelCategory')}</Label>
                <Select value={formData.level_category} onValueChange={(v) => setFormData(p => ({...p, level_category: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kindergarten">{t('kindergarten')}</SelectItem>
                    <SelectItem value="primary">{t('primary')}</SelectItem>
                    <SelectItem value="intermediate">{t('intermediate')}</SelectItem>
                    <SelectItem value="secondary">{t('secondary')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch 
                checked={formData.is_active} 
                onCheckedChange={(checked) => setFormData(p => ({...p, is_active: checked}))}
              />
              <Label>{t('active')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{t('cancel')}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}