import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { toast } from 'sonner';
import PageHeader from '../components/ui/PageHeader';
import { Plus, Edit2, Loader2 } from 'lucide-react';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function StudentTags() {
  const { t: _t, isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();

  const [showForm, setShowForm] = useState(false);
  const [editingTag, setEditingTag] = useState(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name_ar: '',
    name_en: '',
    category: 'custom',
    color: 'blue',
    auto_assign_rules: {
      from_parent_vip: false,
      from_referral_vip: false
    },
    is_active: true
  });

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['studentTags', tenantId],
    queryFn: () => tenantQuery('student_tags').select('*').match(tenantFilter(), '-created_date'),
    enabled: hasTenantAccess,
  });

  const handleEdit = (tag) => {
    setEditingTag(tag);
    // CRITICAL FIX: Properly load tag data for editing
    setFormData({
      name_ar: tag.name_ar || '',
      name_en: tag.name_en || '',
      category: tag.category || 'custom',
      color: tag.color || 'blue',
      auto_assign_rules: tag.auto_assign_rules || { from_parent_vip: false, from_referral_vip: false },
      is_active: tag.is_active !== false
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.name_ar || !formData.name_en) {
      toast.error(isRTL ? 'يرجى ملء الحقول المطلوبة' : 'Please fill required fields');
      return;
    }

    setSaving(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const data = {
        ...formData,
        tag_code: editingTag?.tag_code || `TAG-${Date.now().toString(36).toUpperCase()}`,
        created_by: editingTag ? undefined : user.email
      };

      if (editingTag) {
        await tenantQuery('student_tags').update(data);
        toast.success(isRTL ? 'تم التحديث' : 'Tag updated');
      } else {
        await tenantQuery('student_tags').insert(data);
        toast.success(isRTL ? 'تم الإنشاء' : 'Tag created');
      }

      queryClient.invalidateQueries({ queryKey: ['studentTags'] });
      setShowForm(false);
      setEditingTag(null);
      setFormData({
        name_ar: '', name_en: '', category: 'custom', color: 'blue',
        auto_assign_rules: { from_parent_vip: false, from_referral_vip: false },
        is_active: true
      });
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const colorOptions = [
    { value: 'blue', label: isRTL ? 'أزرق' : 'Blue', class: 'bg-blue-100 text-blue-700' },
    { value: 'green', label: isRTL ? 'أخضر' : 'Green', class: 'bg-emerald-100 text-emerald-700' },
    { value: 'purple', label: isRTL ? 'بنفسجي' : 'Purple', class: 'bg-purple-100 text-purple-700' },
    { value: 'amber', label: isRTL ? 'كهرماني' : 'Amber', class: 'bg-amber-100 text-amber-700' },
    { value: 'red', label: isRTL ? 'أحمر' : 'Red', class: 'bg-red-100 text-red-700' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'وسوم الطلاب' : 'Student Tags'}
        subtitle={isRTL ? 'إدارة الوسوم والعلامات للطلاب' : 'Manage student tags and labels'}
        action
        actionLabel={isRTL ? 'وسم جديد' : 'New Tag'}
        actionIcon={Plus}
        onAction={() => setShowForm(true)}
      />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isRTL ? 'الرمز' : 'Code'}</TableHead>
              <TableHead>{isRTL ? 'الاسم' : 'Name'}</TableHead>
              <TableHead>{isRTL ? 'الفئة' : 'Category'}</TableHead>
              <TableHead>{isRTL ? 'اللون' : 'Color'}</TableHead>
              <TableHead>{isRTL ? 'قواعد تلقائية' : 'Auto Rules'}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : (
              tags.map(tag => (
                <TableRow key={tag.id}>
                  <TableCell className="font-mono text-xs">{tag.tag_code}</TableCell>
                  <TableCell>
                    <Badge className={colorOptions.find(c => c.value === tag.color)?.class || 'bg-slate-100'}>
                      {isRTL ? tag.name_ar : tag.name_en}
                    </Badge>
                  </TableCell>
                  <TableCell>{tag.category}</TableCell>
                  <TableCell>
                    <div className={`w-4 h-4 rounded ${colorOptions.find(c => c.value === tag.color)?.class}`}></div>
                  </TableCell>
                  <TableCell>
                    {tag.auto_assign_rules?.from_parent_vip && (
                      <Badge variant="outline" className="text-xs">Parent VIP</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(tag)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Tag Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingTag ? (isRTL ? 'تعديل الوسم' : 'Edit Tag') : (isRTL ? 'وسم جديد' : 'New Tag')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'} *</Label>
                <Input value={formData.name_ar} onChange={(e) => setFormData({...formData, name_ar: e.target.value})} />
              </div>
              <div>
                <Label>{isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'} *</Label>
                <Input value={formData.name_en} onChange={(e) => setFormData({...formData, name_en: e.target.value})} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isRTL ? 'الفئة' : 'Category'}</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData({...formData, category: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vip">VIP</SelectItem>
                    <SelectItem value="scholarship">{isRTL ? 'منحة دراسية' : 'Scholarship'}</SelectItem>
                    <SelectItem value="special_care">{isRTL ? 'رعاية خاصة' : 'Special Care'}</SelectItem>
                    <SelectItem value="referral">{isRTL ? 'إحالة' : 'Referral'}</SelectItem>
                    <SelectItem value="custom">{isRTL ? 'مخصص' : 'Custom'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{isRTL ? 'اللون' : 'Color'}</Label>
                <Select value={formData.color} onValueChange={(v) => setFormData({...formData, color: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {colorOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t pt-4">
              <Label className="mb-3 block">{isRTL ? 'قواعد التخصيص التلقائي' : 'Auto-Assign Rules'}</Label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={formData.auto_assign_rules?.from_parent_vip}
                    onCheckedChange={(checked) => setFormData({
                      ...formData,
                      auto_assign_rules: {...formData.auto_assign_rules, from_parent_vip: checked}
                    })}
                  />
                  <span className="text-sm">{isRTL ? 'تطبيق تلقائيا للطلاب ذوي الآباء VIP' : 'Auto-apply to students with VIP parents'}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={formData.auto_assign_rules?.from_referral_vip}
                    onCheckedChange={(checked) => setFormData({
                      ...formData,
                      auto_assign_rules: {...formData.auto_assign_rules, from_referral_vip: checked}
                    })}
                  />
                  <span className="text-sm">{isRTL ? 'تطبيق تلقائيا للإحالات VIP' : 'Auto-apply to VIP referrals'}</span>
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}