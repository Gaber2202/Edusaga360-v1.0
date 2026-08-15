import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData, callApi } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import { Plus, TestTube, Loader2, Trash2, AlertTriangle, Mail } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';

export default function TrialUsers() {
  const { t: _t, isRTL } = useLanguage();
  const { isCreator } = useRole();
  const queryClient = useQueryClient();

  const [showDialog, setShowDialog] = useState(false);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    role_code: 'ceo',
    trial_days: 30
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data = [] } = await tenantQuery('users').select('*').order();
      return data;
    },
    enabled: isCreator()
  });

  const { data: _roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => fetchData(tenantQuery('roles').select('*').order()),
  });

  if (!isCreator()) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md border-red-200 bg-red-50">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-red-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-red-900">
              {isRTL ? 'وصول محظور' : 'Access Denied'}
            </h3>
            <p className="text-red-700 mt-2">
              {isRTL 
                ? 'هذه الصفحة متاحة فقط للمنشئ'
                : 'This page is only accessible to the Creator'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleCreateTrialUser = async () => {
    if (!form.email || !form.full_name) {
      toast.error(isRTL ? 'يرجى ملء جميع الحقول' : 'Please fill all fields');
      return;
    }

    setCreating(true);
    try {
      const expiryDate = addDays(new Date(), form.trial_days);
      
      // Invite user
      await callApi('/api/auth/invite', { email: form.email, role: 'user' });

      // Wait briefly for user creation
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update user with trial settings
      const { data: allUsers = [] } = await tenantQuery('users').select('*').order();
      const newUser = allUsers.find(u => u.email === form.email);

      if (newUser) {
        await supabase.from('users').update({
          full_name: form.full_name,
          user_role: form.role_code,
          is_trial_user: true,
          trial_expires_date: format(expiryDate, 'yyyy-MM-dd')
        }).eq('id', newUser.id);

        // Audit log
        const currentUser = await supabase.auth.getUser().then(r => r.data?.user);
        await tenantQuery('audit_logs').insert({
          action: 'CREATE_TRIAL_USER',
          entity_type: 'User',
          entity_id: newUser.id,
          user_email: currentUser.email,
          details: `Created trial user: ${form.email} (${form.role_code}) - expires ${format(expiryDate, 'dd/MM/yyyy')}`
        });
      }

      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowDialog(false);
      setForm({
        full_name: '',
        email: '',
        role_code: 'ceo',
        trial_days: 30
      });
      
      toast.success(isRTL ? 'تم إنشاء المستخدم التجريبي وإرسال دعوة' : 'Trial user created and invitation sent');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? `حدث خطأ: ${error.message}` : `Error: ${error.message}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (userId) => {
    if (!confirm(isRTL ? 'هل تريد حذف هذا المستخدم؟' : 'Delete this user?')) return;

    try {
      await supabase.from('users').delete().eq('id', userId);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(isRTL ? 'تم الحذف' : 'Deleted');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'المستخدمون التجريبيون' : 'Trial Users'}
        subtitle={isRTL ? 'إدارة حسابات العرض والاختبار' : 'Manage demo and test accounts'}
        action={{
          label: isRTL ? 'مستخدم تجريبي جديد' : 'New Trial User',
          icon: Plus,
          onClick: () => setShowDialog(true)
        }}
      />

      <Card className="bg-najdi-50 border-najdi-100">
        <CardContent className="p-4 flex items-start gap-3">
          <TestTube className="w-5 h-5 text-najdi-700 mt-0.5" />
          <div>
            <p className="font-medium text-najdi-900">
              {isRTL ? 'كيف تعمل الحسابات التجريبية؟' : 'How Trial Accounts Work'}
            </p>
            <p className="text-sm text-najdi-900 mt-1">
              {isRTL 
                ? 'يمكن للمستخدمين التجريبيين استكشاف النظام بأمان مع وصول محدود. لا يمكنهم حذف البيانات الأساسية. منحهم فترة صلاحية لضمان الأمان.'
                : 'Trial users can explore the system safely with restricted access. They cannot delete core data. Set expiry dates for security.'}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isRTL ? 'الاسم' : 'Name'}</TableHead>
              <TableHead>{isRTL ? 'البريد' : 'Email'}</TableHead>
              <TableHead>{isRTL ? 'الدور' : 'Role'}</TableHead>
              <TableHead>{isRTL ? 'تنتهي في' : 'Expires'}</TableHead>
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
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {isRTL ? 'لا يوجد مستخدمون تجريبيون' : 'No trial users found'}
                </TableCell>
              </TableRow>
            ) : (
              users.map(user => {
                const isExpired = user.trial_expires_date && new Date(user.trial_expires_date) < new Date();
                return (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.full_name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{user.user_role}</Badge>
                    </TableCell>
                    <TableCell>
                      {user.trial_expires_date ? format(new Date(user.trial_expires_date), 'dd/MM/yyyy') : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge className={isExpired ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}>
                        {isExpired ? (isRTL ? 'منتهي' : 'Expired') : (isRTL ? 'نشط' : 'Active')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(user.id)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TestTube className="w-5 h-5 text-najdi-700" />
              {isRTL ? 'إنشاء مستخدم تجريبي' : 'Create Trial User'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'الاسم الكامل' : 'Full Name'} *</Label>
              <Input 
                value={form.full_name}
                onChange={(e) => setForm({...form, full_name: e.target.value})}
                placeholder={isRTL ? 'أدخل الاسم' : 'Enter name'}
              />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'البريد الإلكتروني' : 'Email'} *</Label>
              <Input 
                type="email"
                value={form.email}
                onChange={(e) => setForm({...form, email: e.target.value})}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الدور' : 'Role'}</Label>
              <select
                className="w-full border rounded-md px-3 py-2"
                value={form.role_code}
                onChange={(e) => setForm({...form, role_code: e.target.value})}
              >
                <option value="ceo">{isRTL ? 'الرئيس التنفيذي (CEO)' : 'CEO'}</option>
                <option value="cfo">{isRTL ? 'المدير المالي (CFO)' : 'CFO'}</option>
                <option value="hr_head">{isRTL ? 'مدير الموارد البشرية' : 'HR Head'}</option>
                <option value="it_user">{isRTL ? 'مستخدم IT' : 'IT User'}</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'مدة الصلاحية (أيام)' : 'Trial Duration (Days)'}</Label>
              <Input 
                type="number"
                value={form.trial_days}
                onChange={(e) => setForm({...form, trial_days: parseInt(e.target.value) || 14})}
              />
              <p className="text-xs text-muted-foreground">
                {isRTL 
                  ? `الصلاحية حتى: ${format(addDays(new Date(), form.trial_days), 'dd/MM/yyyy')}`
                  : `Expires on: ${format(addDays(new Date(), form.trial_days), 'dd/MM/yyyy')}`}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleCreateTrialUser} disabled={creating} className="bg-najdi-700 hover:bg-najdi-900">
              {creating && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              <Mail className="w-4 h-4 me-2" />
              {isRTL ? 'إنشاء وإرسال دعوة' : 'Create & Send Invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}