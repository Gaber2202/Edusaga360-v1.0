import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import PageHeader from '../components/ui/PageHeader';
import { toast } from 'sonner';
import {
  Plus,
  Shield,
  Loader2,
  Trash2,
  Edit2,
  Search,
  CheckSquare,
  Square,
  Sparkles,
  Crown,
} from 'lucide-react';
import {
  ROLE_MODULES,
  ROLE_MODULE_GROUPS,
  ROLE_ACTIONS,
  ROLE_PRESETS,
  makeEmptyForm,
  formFromRole,
  applyPreset,
  setAllModules,
  setAllActions,
  setGroupModules,
  toggleModule,
  toggleAction,
  isRoleEditable,
  summarizeForm,
} from '../lib/rolePermissions';

export default function RoleManagement() {
  const { t, isRTL } = useLanguage();
  const { hasPermission } = useRole();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();

  const [showForm, setShowForm] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [saving, setSaving] = useState(false);
  const [moduleSearch, setModuleSearch] = useState('');
  const [form, setForm] = useState(makeEmptyForm());

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles', tenantId],
    queryFn: () => fetchData(tenantQuery('roles').select('*').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const canManage = hasPermission('manage_users') || hasPermission('all');

  // Audit-log writes must never fail the primary CRUD op. If the Role.create/
  // update/delete already succeeded, an audit-log failure should be logged and
  // swallowed — otherwise the catch block misreports the outer op as failed,
  // leaves the dialog open, skips cache invalidation, and can trigger duplicate
  // submissions on retry.
  const writeAuditLog = async (payload) => {
    try {
      await tenantQuery('audit_logs').insert(payload);
    } catch (err) {
      console.warn('AuditLog write failed (ignored):', err);
    }
  };

  const filteredModules = useMemo(() => {
    const q = moduleSearch.trim().toLowerCase();
    if (!q) return ROLE_MODULES;
    return ROLE_MODULES.filter(
      (m) =>
        m.nameEn.toLowerCase().includes(q) ||
        m.nameAr.includes(moduleSearch.trim()) ||
        m.key.includes(q),
    );
  }, [moduleSearch]);

  const resetForm = () => {
    setEditingRole(null);
    setForm(makeEmptyForm());
    setModuleSearch('');
  };

  const openCreate = () => {
    if (!canManage) return;
    resetForm();
    setShowForm(true);
  };

  const openEdit = (role) => {
    if (!canManage) return;
    if (!isRoleEditable(role)) {
      toast.error(
        isRTL ? 'لا يمكن تعديل أدوار النظام' : 'System roles cannot be edited',
      );
      return;
    }
    setEditingRole(role);
    setForm(formFromRole(role));
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!canManage) {
      toast.error(
        isRTL ? 'ليست لديك صلاحية' : 'You do not have permission',
      );
      return;
    }
    if (!form.role_code.trim() || !form.name_ar.trim() || !form.name_en.trim()) {
      toast.error(
        isRTL ? 'يرجى ملء الحقول المطلوبة' : 'Please fill required fields',
      );
      return;
    }

    setSaving(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const payload = {
        role_code: form.role_code.trim(),
        name_ar: form.name_ar.trim(),
        name_en: form.name_en.trim(),
        description_ar: form.description_ar,
        description_en: form.description_en,
        module_access: form.module_access,
        action_permissions: form.action_permissions,
        data_scope: form.data_scope,
        is_trial: form.is_trial,
      };

      if (editingRole?.id) {
        await tenantQuery('roles').update({
          ...payload,
          last_modified_by: user.email,
          last_modified_date: new Date().toISOString(),
        });
        await writeAuditLog({
          action: 'UPDATE_ROLE',
          entity_type: 'Role',
          entity_id: editingRole.id,
          user_email: user.email,
          details: `Updated role: ${payload.name_en}`,
        });
        toast.success(isRTL ? 'تم التحديث بنجاح' : 'Updated successfully');
      } else {
        const created = await tenantQuery('roles').insert({
          ...payload,
          is_system_role: false,
          is_active: true,
          created_by: user.email,
        });
        await writeAuditLog({
          action: 'CREATE_ROLE',
          entity_type: 'Role',
          entity_id: created.id,
          user_email: user.email,
          details: `Created role: ${payload.name_en}`,
        });
        toast.success(isRTL ? 'تم الإنشاء بنجاح' : 'Created successfully');
      }

      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setShowForm(false);
      resetForm();
    } catch (error) {
      console.error('Error saving role:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (role, e) => {
    e?.stopPropagation?.();
    if (!canManage) return;
    if (!isRoleEditable(role)) {
      toast.error(
        isRTL ? 'لا يمكن حذف أدوار النظام' : 'System roles cannot be deleted',
      );
      return;
    }
    const confirmMsg = isRTL
      ? `حذف الدور "${role.name_ar || role.name_en}"؟`
      : `Delete role "${role.name_en || role.name_ar}"?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      await tenantQuery('roles').delete().eq('id', role.id);
      await writeAuditLog({
        action: 'DELETE_ROLE',
        entity_type: 'Role',
        entity_id: role.id,
        user_email: user.email,
        details: `Deleted role: ${role.name_en || role.name_ar}`,
      });
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success(isRTL ? 'تم الحذف' : 'Deleted');
    } catch (error) {
      console.error('Error deleting role:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  };

  const { enabledModules, enabledActions } = summarizeForm(form);

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'إدارة الأدوار' : 'Role Management'}
        subtitle={
          isRTL
            ? 'إنشاء أدوار مخصصة وتعيين الصلاحيات على مستوى الوحدة والعملية'
            : 'Build custom roles and assign permissions at the module and action level'
        }
        action={
          canManage
            ? {
                label: isRTL ? 'دور جديد' : 'New Role',
                icon: Plus,
                onClick: openCreate,
              }
            : undefined
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : roles.length === 0 ? (
        <Card className="p-12 text-center text-slate-500">
          {isRTL ? 'لا توجد أدوار بعد' : 'No roles yet'}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map((role) => {
            const editable = isRoleEditable(role);
            const mods = Object.entries(role.module_access || {}).filter(([, v]) => v).length;
            const acts = Object.entries(role.action_permissions || {}).filter(
              ([, v]) => v,
            ).length;
            return (
              <Card
                key={role.id}
                className={`p-5 transition-shadow ${
                  editable && canManage
                    ? 'hover:shadow-lg cursor-pointer'
                    : 'opacity-90'
                }`}
                onClick={() =>
                  editable && canManage ? openEdit(role) : undefined
                }
              >
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    {role.is_creator_role ? (
                      <Crown className="w-5 h-5 text-amber-500" />
                    ) : (
                      <Shield className="w-5 h-5 text-slate-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900 truncate">
                        {isRTL ? role.name_ar : role.name_en}
                      </h3>
                      {role.is_system_role && (
                        <Badge variant="secondary" className="text-xs">
                          {isRTL ? 'نظام' : 'System'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono truncate">
                      {role.role_code}
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      {isRTL
                        ? `${mods} وحدة • ${acts} صلاحية`
                        : `${mods} modules • ${acts} actions`}
                    </p>
                  </div>
                  {canManage && editable && (
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(role);
                        }}
                        aria-label={isRTL ? 'تعديل' : 'Edit'}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => handleDelete(role, e)}
                        aria-label={isRTL ? 'حذف' : 'Delete'}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRole
                ? isRTL
                  ? 'تعديل الدور'
                  : 'Edit Role'
                : isRTL
                  ? 'دور جديد'
                  : 'New Role'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Identity */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  {isRTL ? 'رمز الدور' : 'Role Code'} <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={form.role_code}
                  onChange={(e) => setForm((p) => ({ ...p, role_code: e.target.value }))}
                  placeholder="e.g. hr_officer"
                  disabled={!!editingRole}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'نطاق البيانات' : 'Data Scope'}</Label>
                <Select
                  value={form.data_scope}
                  onValueChange={(v) => setForm((p) => ({ ...p, data_scope: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="branch">
                      {isRTL ? 'فرع واحد' : 'Single Branch'}
                    </SelectItem>
                    <SelectItem value="tenant">
                      {isRTL ? 'كل الفروع' : 'All Branches (Tenant)'}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>
                  {isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'}{' '}
                  <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={form.name_ar}
                  onChange={(e) => setForm((p) => ({ ...p, name_ar: e.target.value }))}
                  dir="rtl"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  {isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'}{' '}
                  <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={form.name_en}
                  onChange={(e) => setForm((p) => ({ ...p, name_en: e.target.value }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{isRTL ? 'الوصف' : 'Description'}</Label>
                <Textarea
                  rows={2}
                  value={isRTL ? form.description_ar : form.description_en}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      [isRTL ? 'description_ar' : 'description_en']: e.target.value,
                    }))
                  }
                  dir={isRTL ? 'rtl' : 'ltr'}
                />
              </div>
            </div>

            {/* Presets */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <Label className="mb-0">
                  {isRTL ? 'قوالب جاهزة' : 'Starting Presets'}
                </Label>
              </div>
              <div className="flex flex-wrap gap-2">
                {ROLE_PRESETS.map((p) => (
                  <Button
                    key={p.key}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setForm((f) => applyPreset(f, p.key))}
                    title={isRTL ? p.descriptionAr : p.descriptionEn}
                  >
                    {isRTL ? p.nameAr : p.nameEn}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setForm((f) => ({
                      ...setAllActions(setAllModules(f, false), false),
                    }))
                  }
                >
                  {isRTL ? 'مسح الكل' : 'Clear All'}
                </Button>
              </div>
            </div>

            {/* Permissions tabs */}
            <Tabs defaultValue="modules">
              <TabsList>
                <TabsTrigger value="modules">
                  {isRTL ? 'الوحدات' : 'Modules'} ({enabledModules.length})
                </TabsTrigger>
                <TabsTrigger value="actions">
                  {isRTL ? 'الصلاحيات' : 'Actions'} ({enabledActions.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="modules" className="space-y-3 pt-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 absolute top-2.5 start-2.5 text-slate-400 pointer-events-none" />
                    <Input
                      value={moduleSearch}
                      onChange={(e) => setModuleSearch(e.target.value)}
                      placeholder={isRTL ? 'بحث عن وحدة…' : 'Search modules…'}
                      className="ps-8"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setForm((f) => setAllModules(f, true))}
                  >
                    <CheckSquare className="w-4 h-4 me-1" />
                    {isRTL ? 'حدد الكل' : 'Select All'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setForm((f) => setAllModules(f, false))}
                  >
                    <Square className="w-4 h-4 me-1" />
                    {isRTL ? 'امسح الكل' : 'Clear All'}
                  </Button>
                </div>

                {ROLE_MODULE_GROUPS.map((group) => {
                  const groupModules = filteredModules.filter((m) => m.group === group.key);
                  if (groupModules.length === 0) return null;
                  const allOn = groupModules.every((m) => form.module_access[m.key]);
                  return (
                    <div key={group.key} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-sm text-slate-700">
                          {isRTL ? group.nameAr : group.nameEn}
                        </h4>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setForm((f) => setGroupModules(f, group.key, !allOn))}
                          >
                            {allOn
                              ? isRTL
                                ? 'إلغاء المجموعة'
                                : 'Clear Group'
                              : isRTL
                                ? 'تحديد المجموعة'
                                : 'Select Group'}
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {groupModules.map((m) => (
                          <label
                            key={m.key}
                            className="flex items-center gap-2 text-sm cursor-pointer select-none p-2 rounded hover:bg-slate-50"
                          >
                            <Checkbox
                              checked={!!form.module_access[m.key]}
                              onCheckedChange={() => setForm((f) => toggleModule(f, m.key))}
                            />
                            <span>{isRTL ? m.nameAr : m.nameEn}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </TabsContent>

              <TabsContent value="actions" className="space-y-3 pt-3">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setForm((f) => setAllActions(f, true))}
                  >
                    <CheckSquare className="w-4 h-4 me-1" />
                    {isRTL ? 'حدد الكل' : 'Select All'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setForm((f) => setAllActions(f, false))}
                  >
                    <Square className="w-4 h-4 me-1" />
                    {isRTL ? 'امسح الكل' : 'Clear All'}
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isRTL ? 'الصلاحية' : 'Action'}</TableHead>
                      <TableHead className="text-end w-24">
                        {isRTL ? 'مسموح' : 'Granted'}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ROLE_ACTIONS.map((a) => (
                      <TableRow key={a.key}>
                        <TableCell>
                          <div className="font-medium">
                            {isRTL ? a.nameAr : a.nameEn}
                          </div>
                          <div className="text-xs text-slate-400 font-mono">{a.key}</div>
                        </TableCell>
                        <TableCell className="text-end">
                          <Checkbox
                            checked={!!form.action_permissions[a.key]}
                            onCheckedChange={() => setForm((f) => toggleAction(f, a.key))}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              {t('cancel') || (isRTL ? 'إلغاء' : 'Cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                saving || !form.role_code.trim() || !form.name_ar.trim() || !form.name_en.trim()
              }
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {t('save') || (isRTL ? 'حفظ' : 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
