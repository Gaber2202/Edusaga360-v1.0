import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { toast } from 'sonner';
import { Plus, Edit2, Loader2, Tag } from 'lucide-react';
import { logAuditEvent } from '../AuditService';
import { useTenantFilter } from '../../hooks/useTenantFilter';

export default function FeeTypeManager({ open, onClose }) {
  const { t: _t, isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const { tenantId } = useTenantFilter();
  const [showForm, setShowForm] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    type_code: '',
    name_ar: '',
    name_en: '',
    is_active: true,
    display_order: 0
  });

  const { data: feeTypes = [], isLoading } = useQuery({
    queryKey: ['feeTypes', tenantId],
    queryFn: () => tenantQuery('fee_types').select('*').order('display_order'),
  });

  const handleSave = async () => {
    if (!formData.type_code || !formData.name_ar || !formData.name_en) {
      toast.error(isRTL ? 'يرجى ملء الحقول المطلوبة' : 'Please fill required fields');
      return;
    }

    setSaving(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const data = {
        ...formData,
        created_by: editingType ? undefined : user.email
      };

      if (editingType) {
        await tenantQuery('fee_types').update(data);
        await logAuditEvent('fee_type_updated', 'FeeType', editingType.id, user.email, { 
          old: editingType, 
          new: data 
        });
        toast.success(isRTL ? 'تم التحديث' : 'Fee type updated');
      } else {
        const result = await tenantQuery('fee_types').insert(data);
        await logAuditEvent('fee_type_created', 'FeeType', result.id, user.email, data);
        toast.success(isRTL ? 'تم الإنشاء' : 'Fee type created');
      }

      queryClient.invalidateQueries({ queryKey: ['feeTypes'] });
      setShowForm(false);
      setEditingType(null);
      setFormData({ type_code: '', name_ar: '', name_en: '', is_active: true, display_order: 0 });
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (feeType) => {
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      await tenantQuery('fee_types').update({ is_active: !feeType.is_active });
      await logAuditEvent('fee_type_toggled', 'FeeType', feeType.id, user.email, { 
        is_active: !feeType.is_active 
      });
      queryClient.invalidateQueries({ queryKey: ['feeTypes'] });
      toast.success(isRTL ? 'تم التحديث' : 'Updated');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="w-5 h-5" />
            {isRTL ? 'إدارة أنواع الرسوم' : 'Manage Fee Types'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowForm(true)} size="sm">
              <Plus className="w-4 h-4 me-2" />
              {isRTL ? 'نوع جديد' : 'New Type'}
            </Button>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isRTL ? 'الرمز' : 'Code'}</TableHead>
                  <TableHead>{isRTL ? 'الاسم بالعربي' : 'Arabic Name'}</TableHead>
                  <TableHead>{isRTL ? 'الاسم بالإنجليزي' : 'English Name'}</TableHead>
                  <TableHead>{isRTL ? 'افتراضي' : 'System'}</TableHead>
                  <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
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
                  feeTypes.map(type => (
                    <TableRow key={type.id}>
                      <TableCell className="font-mono text-sm">{type.type_code}</TableCell>
                      <TableCell>{type.name_ar}</TableCell>
                      <TableCell>{type.name_en}</TableCell>
                      <TableCell>
                        {type.is_system_default && (
                          <Badge variant="outline" className="text-xs">
                            {isRTL ? 'نظام' : 'System'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={type.is_active}
                          onCheckedChange={() => handleToggleActive(type)}
                        />
                      </TableCell>
                      <TableCell>
                        {!type.is_system_default && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => {
                              setEditingType(type);
                              setFormData(type);
                              setShowForm(true);
                            }}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </div>

        {/* Add/Edit Form */}
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingType ? (isRTL ? 'تعديل نوع الرسوم' : 'Edit Fee Type') : (isRTL ? 'نوع رسوم جديد' : 'New Fee Type')}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <Label>{isRTL ? 'رمز النوع' : 'Type Code'} *</Label>
                <Input 
                  value={formData.type_code} 
                  onChange={(e) => setFormData({...formData, type_code: e.target.value.toUpperCase()})}
                  placeholder="EXAM_FEE"
                  disabled={editingType}
                />
              </div>
              <div>
                <Label>{isRTL ? 'الاسم بالعربي' : 'Arabic Name'} *</Label>
                <Input 
                  value={formData.name_ar} 
                  onChange={(e) => setFormData({...formData, name_ar: e.target.value})}
                  placeholder="رسوم الاختبارات"
                />
              </div>
              <div>
                <Label>{isRTL ? 'الاسم بالإنجليزي' : 'English Name'} *</Label>
                <Input 
                  value={formData.name_en} 
                  onChange={(e) => setFormData({...formData, name_en: e.target.value})}
                  placeholder="Examination Fee"
                />
              </div>
              <div>
                <Label>{isRTL ? 'الترتيب' : 'Display Order'}</Label>
                <Input 
                  type="number"
                  value={formData.display_order} 
                  onChange={(e) => setFormData({...formData, display_order: parseInt(e.target.value) || 0})}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                {isRTL ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                {isRTL ? 'حفظ' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}