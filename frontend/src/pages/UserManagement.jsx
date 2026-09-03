import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData, callApi } from '../api/supabaseClient';
import { fetchRoles } from '../api/roles';
import { useLanguage } from '../components/LanguageContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import { Badge } from '../components/ui/badge';
import { UserPlus, Mail, Loader2, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import LinkedStudentsPicker from '../components/users/LinkedStudentsPicker';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { resolveEmployeeForUser, userIdForEmployeeLink } from '../lib/employeeLink';

function userDisplayName(user) {
  if (!user) return '';
  return (
    user.full_name
    || user.name
    || [user.first_name, user.last_name].filter(Boolean).join(' ')
    || user.email
    || ''
  );
}

function personLabel(person, isRTL) {
  if (!person) return '';
  const name = isRTL
    ? (person.name_ar || person.name_en || person.name)
    : (person.name_en || person.name_ar || person.name);
  return name || person.email || '';
}

async function assertQuery(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

const emptyInvite = {
  name: '',
  email: '',
  role: 'teacher',
  branch_access: 'single',
  linked_student_ids: [],
};

export default function UserManagement() {
  const { t, isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();

  const [showInvite, setShowInvite] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [inviteData, setInviteData] = useState(emptyInvite);

  const [editData, setEditData] = useState({
    name: '',
    name_ar: '',
    phone: '',
    user_role: '',
    branch_id: '',
    status: 'active',
    linked_student_ids: [],
    employee_id: '',
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users', tenantId],
    queryFn: () => fetchData(tenantQuery('users').select('*').order('created_at', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchData(tenantQuery('branches').select('*').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const { data: students = [] } = useQuery({
    queryKey: ['students', tenantId],
    queryFn: () => fetchData(tenantQuery('students').select('*').match(tenantFilter()).order('created_at', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', 'user-link', tenantId],
    queryFn: () => fetchData(
      tenantQuery('employees')
        .select('id, employee_id, name_ar, name_en, email, status, job_title, user_id')
        .match(tenantFilter())
        .order('created_at', { ascending: false }),
    ),
    enabled: hasTenantAccess,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['roles', tenantId],
    queryFn: () => fetchRoles(),
    enabled: hasTenantAccess,
  });

  const assignableRoles = roles.filter((r) => r.is_assignable !== false && r.role_code !== 'creator');

  const openEdit = (row) => {
    const linked = resolveEmployeeForUser(employees, row);
    setEditingUser(row);
    setEditData({
      name: userDisplayName(row) === row.email ? '' : userDisplayName(row),
      name_ar: row.name_ar || '',
      phone: row.phone || '',
      user_role: row.user_role || row.role || '',
      branch_id: row.branch_id || '',
      status: row.status || 'active',
      linked_student_ids: row.linked_student_ids || [],
      employee_id: linked?.id || '',
    });
    setShowEdit(true);
  };

  const handleInvite = async () => {
    if (inviteData.role === 'parent' && (!inviteData.linked_student_ids || inviteData.linked_student_ids.length === 0)) {
      toast.error(isRTL ? 'يجب ربط طالب واحد على الأقل لولي الأمر' : 'At least one linked student is required for parent role');
      return;
    }

    if (!inviteData.email) {
      toast.error(isRTL ? 'البريد الإلكتروني مطلوب' : 'Email is required');
      return;
    }

    setInviting(true);
    try {
      await callApi('/api/tenant-users/request', {
        name: inviteData.name || inviteData.email,
        email: inviteData.email,
        requested_role: inviteData.role,
      });

      await logAuditEvent({ action: 'request_user', entityType: 'User', entityId: inviteData.email, newValues: inviteData });

      queryClient.invalidateQueries({ queryKey: ['user-requests'] });
      setShowInvite(false);
      setInviteData(emptyInvite);
      toast.success(isRTL
        ? 'تم إرسال الطلب. ستتم مراجعته من قبل الإدارة وإشعار المستخدم عند الموافقة.'
        : 'Request submitted. It will be reviewed by the platform and the user notified on approval.');
    } catch (error) {
      console.error('Error:', error);
      const code = error?.body?.error;
      if (code === 'LIMIT_REACHED') {
        toast.error(isRTL
          ? 'وصلت إلى الحد الأقصى لعدد المستخدمين في الفترة التجريبية. يرجى الترقية.'
          : (error.message || 'User limit reached for your trial plan.'));
      } else if (code === 'DUPLICATE') {
        toast.error(isRTL ? 'يوجد طلب معلق لهذا البريد بالفعل' : 'A pending request already exists for this email');
      } else {
        toast.error(error.message || (isRTL ? 'حدث خطأ' : 'Error occurred'));
      }
    } finally {
      setInviting(false);
    }
  };

  const handleUpdateUser = async () => {
    if (editData.user_role === 'parent' && (!editData.linked_student_ids || editData.linked_student_ids.length === 0)) {
      toast.error(isRTL ? 'يجب ربط طالب واحد على الأقل لولي الأمر' : 'At least one linked student is required for parent role');
      return;
    }

    setSaving(true);
    try {
      const isParent = editData.user_role === 'parent';
      const payload = {
        name: editData.name.trim() || editingUser.email,
        name_ar: editData.name_ar.trim() || null,
        phone: editData.phone.trim() || null,
        user_role: editData.user_role,
        branch_id: editData.branch_id || null,
        status: editData.status || 'active',
        linked_student_ids: isParent ? (editData.linked_student_ids || []) : [],
      };
      if (Object.prototype.hasOwnProperty.call(editingUser, 'full_name')) {
        payload.full_name = payload.name;
      }

      await assertQuery(tenantQuery('users').update(payload).eq('id', editingUser.id));

      const previous = resolveEmployeeForUser(employees, editingUser);
      const nextEmployeeId = isParent ? '' : editData.employee_id;

      if (previous && previous.id !== nextEmployeeId) {
        await assertQuery(tenantQuery('employees').update({ user_id: null }).eq('id', previous.id));
      }
      if (nextEmployeeId) {
        const target = employees.find((e) => e.id === nextEmployeeId);
        const linkId = userIdForEmployeeLink({ ...editingUser, _appUserId: editingUser.id });
        if (target && target.user_id !== linkId) {
          await assertQuery(
            tenantQuery('employees')
              .update({ user_id: linkId })
              .eq('id', nextEmployeeId),
          );
        }
      }

      await logAuditEvent({
        action: AuditActions.UPDATE,
        entityType: 'User',
        entityId: editingUser.id,
        oldValues: editingUser,
        newValues: { ...payload, employee_id: nextEmployeeId || null },
      });

      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setShowEdit(false);
      toast.success(isRTL ? 'تم التحديث' : 'Updated');
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.message || (isRTL ? 'حدث خطأ' : 'Error occurred'));
    } finally {
      setSaving(false);
    }
  };

  const getRoleName = (roleCode) => {
    const role = roles.find((r) => r.role_code === roleCode);
    if (!role) return roleCode;
    return isRTL ? (role.name_ar || role.name_en) : (role.name_en || role.name_ar);
  };

  const relatedLabel = (row) => {
    const role = row.user_role || row.role;
    if (role === 'parent') {
      const ids = row.linked_student_ids || [];
      if (ids.length === 0) return <span className="text-muted-foreground">-</span>;
      const names = ids
        .map((id) => personLabel(students.find((s) => s.id === id), isRTL))
        .filter(Boolean);
      if (names.length === 0) {
        return <Badge variant="secondary">{ids.length} {isRTL ? 'طالب' : 'student(s)'}</Badge>;
      }
      return (
        <span className="text-sm">
          {names.slice(0, 2).join(', ')}
          {names.length > 2 ? ` +${names.length - 2}` : ''}
        </span>
      );
    }
    const emp = resolveEmployeeForUser(employees, row);
    if (!emp) return <span className="text-muted-foreground">-</span>;
    const code = emp.employee_id ? ` (${emp.employee_id})` : '';
    return <span className="text-sm">{personLabel(emp, isRTL)}{code}</span>;
  };

  const selectableEmployees = employees.filter((e) => {
    if (e.status && e.status !== 'active' && e.id !== editData.employee_id) return false;
    if (!e.user_id) return true;
    return editingUser && e.user_id === editingUser.id;
  });

  const columns = [
    {
      header: isRTL ? 'الاسم' : 'Name',
      cell: (row) => userDisplayName(row) || '—',
    },
    { header: t('email'), accessorKey: 'email' },
    { header: isRTL ? 'الدور' : 'Role', cell: (row) => getRoleName(row.user_role || row.role) },
    {
      header: isRTL ? 'الفرع' : 'Branch',
      cell: (row) => {
        const branch = branches.find((b) => b.id === row.branch_id);
        return branch ? (isRTL ? branch.name_ar : branch.name_en) : (isRTL ? 'جميع الفروع' : 'All Branches');
      },
    },
    {
      header: isRTL ? 'مرتبط بـ' : 'Linked to',
      cell: (row) => relatedLabel(row),
    },
    {
      header: t('actions'),
      cell: (row) => (
        <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
          <Edit2 className="w-4 h-4 me-1" /> {t('edit')}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'إدارة المستخدمين' : 'User Management'}
        subtitle={isRTL ? 'إدارة المستخدمين والصلاحيات' : 'Manage users and permissions'}
        action
        actionLabel={isRTL ? 'دعوة مستخدم' : 'Invite User'}
        actionIcon={UserPlus}
        onAction={() => setShowInvite(true)}
      />

      <DataTable columns={columns} data={users} loading={isLoading} emptyMessage={t('noData')} />

      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'دعوة مستخدم جديد' : 'Invite New User'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
              {isRTL
                ? 'سيتم إرسال هذا الطلب للمراجعة من قبل إدارة المنصة. في الفترة التجريبية يُسمح بحد أقصى 3 مستخدمين لكل مدرسة.'
                : 'This request will be reviewed by the platform team. During the trial each school is limited to 3 users.'}
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الاسم' : 'Full Name'}</Label>
              <Input value={inviteData.name} onChange={(e) => setInviteData((p) => ({ ...p, name: e.target.value }))} placeholder={isRTL ? 'اسم المستخدم' : 'User full name'} />
            </div>
            <div className="space-y-2">
              <Label>{t('email')} *</Label>
              <Input type="email" value={inviteData.email} onChange={(e) => setInviteData((p) => ({ ...p, email: e.target.value }))} placeholder="user@school.edu.sa" />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الدور' : 'Role'} *</Label>
              <Select value={inviteData.role} onValueChange={(v) => setInviteData((p) => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((r) => (
                    <SelectItem key={r.role_code} value={r.role_code}>
                      {isRTL ? (r.name_ar || r.name_en) : (r.name_en || r.name_ar)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'صلاحية الفروع' : 'Branch Access'}</Label>
              <Select value={inviteData.branch_access} onValueChange={(v) => setInviteData((p) => ({ ...p, branch_access: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isRTL ? 'جميع الفروع' : 'All Branches'}</SelectItem>
                  <SelectItem value="single">{isRTL ? 'فرع واحد' : 'Single Branch'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {inviteData.role === 'parent' && (
              <LinkedStudentsPicker
                studentIds={inviteData.linked_student_ids}
                onChange={(ids) => setInviteData((p) => ({ ...p, linked_student_ids: ids }))}
                students={students}
                isRTL={isRTL}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvite(false)}>{t('cancel')}</Button>
            <Button onClick={handleInvite} disabled={inviting || !inviteData.email}>
              {inviting && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              <Mail className="w-4 h-4 me-2" />
              {isRTL ? 'إرسال الدعوة' : 'Send Invitation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'تعديل المستخدم' : 'Edit User'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {editingUser && (
              <div className="rounded-lg bg-sand p-3 text-sm">
                <p className="font-medium">{userDisplayName(editingUser) || '—'}</p>
                <p className="text-xs text-muted-foreground">{editingUser.email}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'الاسم (إنجليزي)' : 'Full name'}</Label>
                <Input
                  value={editData.name}
                  onChange={(e) => setEditData((p) => ({ ...p, name: e.target.value }))}
                  placeholder={isRTL ? 'الاسم' : 'Full name'}
                />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'}</Label>
                <Input
                  value={editData.name_ar}
                  onChange={(e) => setEditData((p) => ({ ...p, name_ar: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('email')}</Label>
                <Input value={editingUser?.email || ''} disabled />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الجوال' : 'Phone'}</Label>
                <Input
                  value={editData.phone}
                  onChange={(e) => setEditData((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="+9665..."
                />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الدور' : 'Role'}</Label>
                <Select value={editData.user_role} onValueChange={(v) => setEditData((p) => ({ ...p, user_role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {roles.filter((r) => r.role_code !== 'creator').map((r) => (
                      <SelectItem key={r.role_code} value={r.role_code}>
                        {isRTL ? (r.name_ar || r.name_en) : (r.name_en || r.name_ar)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الحالة' : 'Status'}</Label>
                <Select value={editData.status} onValueChange={(v) => setEditData((p) => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{isRTL ? 'نشط' : 'Active'}</SelectItem>
                    <SelectItem value="inactive">{isRTL ? 'غير نشط' : 'Inactive'}</SelectItem>
                    <SelectItem value="suspended">{isRTL ? 'موقوف' : 'Suspended'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{isRTL ? 'الفرع' : 'Branch'}</Label>
                <Select value={editData.branch_id || 'all'} onValueChange={(v) => setEditData((p) => ({ ...p, branch_id: v === 'all' ? '' : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{isRTL ? 'جميع الفروع' : 'All Branches'}</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{isRTL ? (b.name_ar || b.name_en) : (b.name_en || b.name_ar)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {editData.user_role === 'parent' ? (
              <LinkedStudentsPicker
                studentIds={editData.linked_student_ids}
                onChange={(ids) => setEditData((p) => ({ ...p, linked_student_ids: ids }))}
                students={students}
                isRTL={isRTL}
              />
            ) : (
              <div className="space-y-2">
                <Label>{isRTL ? 'الموظف المرتبط' : 'Linked staff'}</Label>
                <Select
                  value={editData.employee_id || 'none'}
                  onValueChange={(v) => setEditData((p) => ({ ...p, employee_id: v === 'none' ? '' : v }))}
                >
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر موظفاً' : 'Select staff member'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isRTL ? 'غير مرتبط' : 'Not linked'}</SelectItem>
                    {selectableEmployees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {personLabel(emp, isRTL)}
                        {emp.employee_id ? ` (${emp.employee_id})` : ''}
                        {emp.job_title ? ` — ${emp.job_title}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {isRTL
                    ? 'اربط حساب الدخول بسجل الموظف في الموارد البشرية.'
                    : 'Link this login to the HR employee record.'}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>{t('cancel')}</Button>
            <Button onClick={handleUpdateUser} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
