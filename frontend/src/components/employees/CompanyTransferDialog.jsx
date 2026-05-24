import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';
import { Loader2, ArrowRight } from 'lucide-react';
import { logAuditEvent } from '../AuditService';

export default function CompanyTransferDialog({ open, onClose, employee, companies }) {
  const { isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    transfer_type: 'visa_company',
    to_company_id: '',
    effective_date: new Date().toISOString().split('T')[0],
    reason: ''
  });

  const handleTransfer = async () => {
    if (!formData.to_company_id || !formData.reason) {
      toast.error(isRTL ? 'يرجى ملء جميع الحقول' : 'Please fill all required fields');
      return;
    }

    setSaving(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const fromCompanyId = formData.transfer_type === 'visa_company' 
        ? employee.visa_company_id 
        : employee.employing_company_id;
      
      const fromCompany = companies.find(c => c.id === fromCompanyId);
      const toCompany = companies.find(c => c.id === formData.to_company_id);

      // Create transfer record
      await tenantQuery('employee_company_transfers').insert({
        employee_id: employee.id,
        employee_name: employee.name_ar,
        from_company_id: fromCompanyId,
        from_company_name: isRTL ? fromCompany?.name_ar : fromCompany?.name_en,
        to_company_id: formData.to_company_id,
        to_company_name: isRTL ? toCompany?.name_ar : toCompany?.name_en,
        transfer_type: formData.transfer_type,
        effective_date: formData.effective_date,
        reason: formData.reason,
        approval_status: 'approved',
        approved_by: user.email,
        approved_date: new Date().toISOString(),
        created_by: user.email
      });

      // Update employee record
      const updateData = formData.transfer_type === 'visa_company'
        ? { visa_company_id: formData.to_company_id }
        : { employing_company_id: formData.to_company_id };
      
      await tenantQuery('employees').update(updateData);

      // Log audit
      await logAuditEvent({
        action: 'EMPLOYEE_COMPANY_TRANSFER',
        entityType: 'Employee',
        entityId: employee.id,
        oldValues: { [formData.transfer_type]: fromCompanyId },
        newValues: { [formData.transfer_type]: formData.to_company_id }
      });

      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success(isRTL ? 'تم النقل بنجاح' : 'Transfer completed successfully');
      onClose();
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isRTL ? 'نقل شركة الإقامة' : 'Transfer Visa Company'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-slate-50 p-3 rounded-lg">
            <p className="text-sm text-slate-600 mb-1">{isRTL ? 'الموظف' : 'Employee'}</p>
            <p className="font-medium">{employee?.name_ar}</p>
          </div>

          <div className="space-y-2">
            <Label>{isRTL ? 'نوع النقل' : 'Transfer Type'}</Label>
            <Select value={formData.transfer_type} onValueChange={(v) => setFormData({...formData, transfer_type: v})}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="visa_company">{isRTL ? 'شركة الإقامة' : 'Visa Company'}</SelectItem>
                <SelectItem value="employing_company">{isRTL ? 'الشركة المشغلة' : 'Employing Company'}</SelectItem>
                <SelectItem value="both">{isRTL ? 'كلاهما' : 'Both'}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{isRTL ? 'الشركة الجديدة' : 'New Company'} *</Label>
            <Select value={formData.to_company_id} onValueChange={(v) => setFormData({...formData, to_company_id: v})}>
              <SelectTrigger>
                <SelectValue placeholder={isRTL ? 'اختر الشركة' : 'Select company'} />
              </SelectTrigger>
              <SelectContent>
                {companies.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {isRTL ? c.name_ar : c.name_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{isRTL ? 'تاريخ السريان' : 'Effective Date'} *</Label>
            <Input 
              type="date" 
              value={formData.effective_date} 
              onChange={(e) => setFormData({...formData, effective_date: e.target.value})} 
            />
          </div>

          <div className="space-y-2">
            <Label>{isRTL ? 'السبب' : 'Reason'} *</Label>
            <Textarea 
              value={formData.reason} 
              onChange={(e) => setFormData({...formData, reason: e.target.value})}
              rows={3}
              placeholder={isRTL ? 'سبب النقل' : 'Reason for transfer'}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {isRTL ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button onClick={handleTransfer} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
            <ArrowRight className="w-4 h-4 me-2" />
            {isRTL ? 'تنفيذ النقل' : 'Execute Transfer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}