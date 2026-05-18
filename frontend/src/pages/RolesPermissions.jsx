import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, Loader2, AlertTriangle, Crown, TestTube } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';

export default function RolesPermissions() {
  const { t: _t, isRTL } = useLanguage();
  const { isCreator, userRole: _userRole } = useRole();
  const queryClient = useQueryClient();

  const [showDialog, setShowDialog] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    role_code: '',
    name_ar: '',
    name_en: '',
    description_ar: '',
    description_en: '',
    module_access: {},
    action_permissions: {
      create: false,
      edit: false,
      delete: false,
      approve: false,
      export: false,
      send: false,
      post: false,
      reverse: false,
      view_salary_amounts: false,
      view_finance_amounts: false
    },
    data_scope: 'branch',
    is_trial: false
  });

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => tenantQuery('roles').select('*').order(),
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

  const modules = [
    { key: 'dashboard', label_ar: 'لوحة التحكم', label_en: 'Dashboard' },
    { key: 'admissions', label_ar: 'القبول', label_en: 'Admissions' },
    { key: 'students', label_ar: 'الطلاب', label_en: 'Students' },
    { key: 'student_attendance', label_ar: 'حضور الطلاب', label_en: 'Student Attendance' },
    { key: 'fees', label_ar: 'الرسوم', label_en: 'Fees' },
    { key: 'finance', label_ar: 'المالية', label_en: 'Finance' },
    { key: 'procurement', label_ar: 'المشتريات', label_en: 'Procurement' },
    { key: 'assets', label_ar: 'الأصول', label_en: 'Assets' },
    { key: 'hr', label_ar: 'الموارد البشرية', label_en: 'HR' },
    { key: 'employees', label_ar: 'الموظفون', label_en: 'Employees' },
    { key: 'payroll', label_ar: 'الرواتب', label_en: 'Payroll' },
    { key: 'reports', label_ar: 'التقارير', label_en: 'Reports' },
    { key: 'settings', label_ar: 'الإعدادات', label_en: 'Settings' },
  ];

  const handleOpenDialog = (role = null) => {
    if (role) {
      setEditingRole(role);
      setForm({
        role_code: role.role_code,
        name_ar: role.name_ar,
        name_en: role.name_en,
        description_ar: role.description_ar || '',
        description_en: role.description_en || '',
        module_access: role.module_access || {},
        action_permissions: role.action_permissions || {},
        data_scope: role.data_scope || 'branch',
        is_trial: role.is_trial || false
      });
    } else {
      setEditingRole(null);
      setForm({
        role_code: '',
        name_ar: '',
        name_en: '',
        description_ar: '',
        description_en: '',
        module_access: {},
        action_permissions: {
          create: false,
          edit: false,
          delete: false,
          approve: false,
          export: false,
          send: false,
          post: false,
          reverse: false,
          view_salary_amounts: false,
          view_finance_amounts: false
        },
        data_scope: 'branch',
        is_trial: false
      });
    }
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.role_code || !form.name_ar || !form.name_en) {
      toast.error(isRTL ? 'يرجى ملء الحقول المطلوبة' : 'Please fill required fields');
      return;
    }

    setSaving(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      
      if (editingRole) {
        await tenantQuery('roles').update({
          ...form,
          last_modified_by: user.email,
          last_modified_date: new Date().toISOString()
        });

        // Audit log
        await tenantQuery('audit_logs').insert({
          action: 'UPDATE_ROLE',
          entity_type: 'Role',
          entity_id: editingRole.id,
          user_email: user.email,
          details: `Updated role: ${form.name_en}`
        });

        toast.success(isRTL ? 'تم التحديث بنجاح' : 'Updated successfully');
      } else {
        const newRole = await tenantQuery('roles').insert({
          ...form,
          is_system_role: false,
          is_active: true,
          created_by: user.email
        });

        await tenantQuery('audit_logs').insert({
          action: 'CREATE_ROLE',
          entity_type: 'Role',
          entity_id: newRole.id,
          user_email: user.email,
          details: `Created role: ${form.name_en}`
        });

        toast.success(isRTL ? 'تم الإنشاء بنجاح' : 'Created successfully');
      }

      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setShowDialog(false);
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (role) => {
    if (role.is_system_role || role.is_creator_role) {
      toast.error(isRTL ? 'لا يمكن حذف دور النظام' : 'Cannot delete system role');
      return;
    }

    if (!confirm(isRTL ? 'هل تريد حذف هذا الدور؟' : 'Delete this role?')) return;

    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      await tenantQuery('roles').delete().eq('id', role.id);

      await tenantQuery('audit_logs').insert({
        action: 'DELETE_ROLE',
        entity_type: 'Role',
        entity_id: role.id,
        user_email: user.email,
        details: `Deleted role: ${role.name_en}`
      });

      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success(isRTL ? 'تم الحذف' : 'Deleted');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  };

  const toggleModule = (moduleKey) => {
    setForm(prev => ({
      ...prev,
      module_access: {
        ...prev.module_access,
        [moduleKey]: !prev.module_access[moduleKey]
      }
    }));
  };

  const toggleAction = (actionKey) => {
    setForm(prev => ({
      ...prev,
      action_permissions: {
        ...prev.action_permissions,
        [actionKey]: !prev.action_permissions[actionKey]
      }
    }));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'الأدوار والصلاحيات' : 'Roles & Permissions'}
        subtitle={isRTL ? 'إدارة الأدوار وصلاحيات الوصول' : 'Manage roles and access permissions'}
        action={{
          label: isRTL ? 'دور جديد' : 'New Role',
          icon: Plus,
          onClick: () => handleOpenDialog()
        }}
      />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isRTL ? 'الكود' : 'Code'}</TableHead>
              <TableHead>{isRTL ? 'الاسم' : 'Name'}</TableHead>
              <TableHead>{isRTL ? 'الوصف' : 'Description'}</TableHead>
              <TableHead>{isRTL ? 'نطاق البيانات' : 'Data Scope'}</TableHead>
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
            ) : roles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-slate-400">
                  {isRTL ? 'لا توجد أدوار' : 'No roles found'}
                </TableCell>
              </TableRow>
            ) : (
              roles.map(role => (
                <TableRow key={role.id}>
                  <TableCell className="font-mono">{role.role_code}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {role.is_creator_role && <Crown className="w-4 h-4 text-amber-500" />}
                      {role.is_trial && <TestTube className="w-4 h-4 text-blue-500" />}
                      <span className="font-medium">{isRTL ? role.name_ar : role.name_en}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {isRTL ? role.description_ar : role.description_en}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{role.data_scope}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={role.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}>
                      {role.is_active ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'غير نشط' : 'Inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => handleOpenDialog(role)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      {!role.is_system_role && !role.is_creator_role && (
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(role)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Role Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRole 
                ? (isRTL ? 'تعديل الدور' : 'Edit Role')
                : (isRTL ? 'دور جديد' : 'New Role')}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="basic" className="mt-4">
            <TabsList>
              <TabsTrigger value="basic">{isRTL ? 'المعلومات الأساسية' : 'Basic Info'}</TabsTrigger>
              <TabsTrigger value="modules">{isRTL ? 'الوحدات' : 'Modules'}</TabsTrigger>
              <TabsTrigger value="actions">{isRTL ? 'الإجراءات' : 'Actions'}</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{isRTL ? 'الكود' : 'Code'} *</Label>
                  <Input 
                    value={form.role_code}
                    onChange={(e) => setForm({...form, role_code: e.target.value})}
                    placeholder="e.g., ceo, cfo, hr_head"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'نطاق البيانات' : 'Data Scope'}</Label>
                  <select
                    className="w-full border rounded-md px-3 py-2"
                    value={form.data_scope}
                    onChange={(e) => setForm({...form, data_scope: e.target.value})}
                  >
                    <option value="all">{isRTL ? 'الكل' : 'All'}</option>
                    <option value="company">{isRTL ? 'الشركة' : 'Company'}</option>
                    <option value="branch">{isRTL ? 'الفرع' : 'Branch'}</option>
                    <option value="department">{isRTL ? 'القسم' : 'Department'}</option>
                    <option value="own">{isRTL ? 'الخاص فقط' : 'Own Only'}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{isRTL ? 'الاسم بالعربي' : 'Name (Arabic)'} *</Label>
                  <Input 
                    value={form.name_ar}
                    onChange={(e) => setForm({...form, name_ar: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'الاسم بالإنجليزي' : 'Name (English)'} *</Label>
                  <Input 
                    value={form.name_en}
                    onChange={(e) => setForm({...form, name_en: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{isRTL ? 'الوصف بالعربي' : 'Description (Arabic)'}</Label>
                  <Textarea 
                    value={form.description_ar}
                    onChange={(e) => setForm({...form, description_ar: e.target.value})}
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'الوصف بالإنجليزي' : 'Description (English)'}</Label>
                  <Textarea 
                    value={form.description_en}
                    onChange={(e) => setForm({...form, description_en: e.target.value})}
                    rows={2}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <Label>{isRTL ? 'دور تجريبي (للعرض)' : 'Trial Role (Demo)'}</Label>
                <Switch 
                  checked={form.is_trial}
                  onCheckedChange={(v) => setForm({...form, is_trial: v})}
                />
              </div>
            </TabsContent>

            <TabsContent value="modules" className="mt-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {modules.map(module => (
                  <div key={module.key} className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50">
                    <span className="text-sm font-medium">
                      {isRTL ? module.label_ar : module.label_en}
                    </span>
                    <Switch 
                      checked={form.module_access[module.key] || false}
                      onCheckedChange={() => toggleModule(module.key)}
                    />
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="actions" className="mt-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'create', label_ar: 'إنشاء', label_en: 'Create' },
                  { key: 'edit', label_ar: 'تعديل', label_en: 'Edit' },
                  { key: 'delete', label_ar: 'حذف', label_en: 'Delete' },
                  { key: 'approve', label_ar: 'اعتماد', label_en: 'Approve' },
                  { key: 'export', label_ar: 'تصدير', label_en: 'Export' },
                  { key: 'send', label_ar: 'إرسال', label_en: 'Send' },
                  { key: 'post', label_ar: 'ترحيل', label_en: 'Post' },
                  { key: 'reverse', label_ar: 'عكس قيد', label_en: 'Reverse' },
                  { key: 'view_salary_amounts', label_ar: 'عرض مبالغ الرواتب', label_en: 'View Salary Amounts' },
                  { key: 'view_finance_amounts', label_ar: 'عرض المبالغ المالية', label_en: 'View Finance Amounts' },
                ].map(action => (
                  <div key={action.key} className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50">
                    <span className="text-sm font-medium">
                      {isRTL ? action.label_ar : action.label_en}
                    </span>
                    <Switch 
                      checked={form.action_permissions[action.key] || false}
                      onCheckedChange={() => toggleAction(action.key)}
                    />
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
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