import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, callApi } from '../api/supabaseClient';
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

const USER_ROLES = [
  { id: 'admin', name_ar: 'مدير النظام', name_en: 'Admin' },
  { id: 'branch_manager', name_ar: 'مدير الفرع', name_en: 'Branch Manager' },
  { id: 'hr_admin', name_ar: 'مدير الموارد البشرية', name_en: 'HR Admin' },
  { id: 'hr_officer', name_ar: 'موظف موارد بشرية', name_en: 'HR Officer' },
  { id: 'finance', name_ar: 'مالية', name_en: 'Finance Officer' },
  { id: 'accountant', name_ar: 'محاسب', name_en: 'Accountant' },
  { id: 'admissions', name_ar: 'قبول وتسجيل', name_en: 'Admissions Officer' },
  { id: 'teacher', name_ar: 'معلم', name_en: 'Teacher' },
  { id: 'parent', name_ar: 'ولي أمر', name_en: 'Parent' },
];

export default function UserManagement() {
  const { t, isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, isPlatformOwner } = useTenantFilter();
  
  const [showInvite, setShowInvite] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [inviteData, setInviteData] = useState({
    email: '',
    role: 'teacher',
    branch_access: 'single',
    linked_student_ids: []
  });

  const [editData, setEditData] = useState({
    user_role: '',
    branch_id: '',
    status: 'active',
    linked_student_ids: []
  });


  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users', tenantId],
    queryFn: () => {
      // For tenant users, filter by tenant_id; platform owner sees all
      if (isPlatformOwner) return tenantQuery('users').select('*').order('-created_date');
      if (tenantId) return tenantQuery('users').select('*').match({ tenant_id: tenantId }, '-created_date');
      return [];
    },
    enabled: hasTenantAccess,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => tenantQuery('branchs').select('*').match(tenantFilter({ is_active: true })),
    enabled: hasTenantAccess,
  });

  const { data: students = [] } = useQuery({
    queryKey: ['students-for-linking', tenantId],
    queryFn: () => tenantQuery('students').select('*').match(tenantFilter({ status: 'active' })),
    enabled: hasTenantAccess,
  });

  const handleInvite = async () => {
    // Validate: linked_student_ids required only for parent
    if (inviteData.role === 'parent' && (!inviteData.linked_student_ids || inviteData.linked_student_ids.length === 0)) {
      toast.error(isRTL ? 'يجب ربط طالب واحد على الأقل لولي الأمر' : 'At least one linked student is required for parent role');
      return;
    }

    setInviting(true);
    try {
      // Platform role: 'admin' for admin/creator roles, 'user' for everything else
      const platformRole = (inviteData.role === 'admin' || inviteData.role === 'creator') ? 'admin' : 'user';
      await callApi('/api/auth/invite', { email: inviteData.email, role: platformRole });
      
      // Wait briefly for the user record to be created, then set app-level role
      // Retry a few times since the record may take a moment to appear
      let userRecord = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise(r => setTimeout(r, 1000));
        const allUsers = await tenantQuery('users').select('*').match({ email: inviteData.email });
        if (allUsers.length > 0) {
          userRecord = allUsers[0];
          break;
        }
      }

      if (userRecord) {
        const updatePayload = {
          user_role: inviteData.role,
          branch_id: inviteData.branch_access === 'single' ? branches[0]?.id : null,
          tenant_id: tenantId || undefined,
        };
        if (inviteData.role === 'parent') {
          updatePayload.linked_student_ids = inviteData.linked_student_ids;
        }
        await tenantQuery('users').update(updatePayload);
      } else {
        console.warn('User record not found after invite — user_role will be set on first login');
      }

      await logAuditEvent({ action: 'invite_user', entityType: 'User', entityId: inviteData.email, newValues: inviteData });
      
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowInvite(false);
      setInviteData({ email: '', role: 'teacher', branch_access: 'single', linked_student_ids: [] });
      toast.success(isRTL ? 'تم إرسال الدعوة بنجاح' : 'Invitation sent successfully');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setInviting(false);
    }
  };

  const handleUpdateUser = async () => {
    // Validate: linked_student_ids required only for parent
    if (editData.user_role === 'parent' && (!editData.linked_student_ids || editData.linked_student_ids.length === 0)) {
      toast.error(isRTL ? 'يجب ربط طالب واحد على الأقل لولي الأمر' : 'At least one linked student is required for parent role');
      return;
    }

    setSaving(true);
    try {
      const payload = { ...editData };
      // Clear linked_student_ids if not parent
      if (payload.user_role !== 'parent') {
        payload.linked_student_ids = [];
      }
      await tenantQuery('users').update(payload);
      await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'User', entityId: editingUser.id, oldValues: editingUser, newValues: payload });
      
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowEdit(false);
      toast.success(isRTL ? 'تم التحديث' : 'Updated');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const getRoleName = (roleCode) => {
    const role = USER_ROLES.find(r => r.id === roleCode);
    return role ? (isRTL ? role.name_ar : role.name_en) : roleCode;
  };

  const columns = [
    { header: isRTL ? 'الاسم' : 'Name', accessorKey: 'full_name' },
    { header: t('email'), accessorKey: 'email' },
    { header: isRTL ? 'الدور' : 'Role', cell: (row) => getRoleName(row.user_role || row.role) },
    { header: isRTL ? 'الفرع' : 'Branch', cell: (row) => {
      const branch = branches.find(b => b.id === row.branch_id);
      return branch ? (isRTL ? branch.name_ar : branch.name_en) : (isRTL ? 'جميع الفروع' : 'All Branches');
    }},
    { header: isRTL ? 'الطلاب المرتبطون' : 'Linked Students', cell: (row) => {
      if (row.user_role !== 'parent' && row.role !== 'parent') return '-';
      const ids = row.linked_student_ids || [];
      if (ids.length === 0) return <span className="text-slate-400">-</span>;
      return <Badge variant="secondary">{ids.length} {isRTL ? 'طالب' : 'student(s)'}</Badge>;
    }},
    { header: t('actions'), cell: (row) => (
      <Button size="sm" variant="ghost" onClick={() => { setEditingUser(row); setEditData({ user_role: row.user_role || row.role, branch_id: row.branch_id, status: 'active', linked_student_ids: row.linked_student_ids || [] }); setShowEdit(true); }}>
        <Edit2 className="w-4 h-4 me-1" /> {t('edit')}
      </Button>
    )}
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

      {/* Invite User Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'دعوة مستخدم جديد' : 'Invite New User'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('email')} *</Label>
              <Input type="email" value={inviteData.email} onChange={(e) => setInviteData(p => ({...p, email: e.target.value}))} placeholder="user@school.edu.sa" />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الدور' : 'Role'} *</Label>
              <Select value={inviteData.role} onValueChange={(v) => setInviteData(p => ({...p, role: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {USER_ROLES.map(r => <SelectItem key={r.id} value={r.id}>{isRTL ? r.name_ar : r.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'صلاحية الفروع' : 'Branch Access'}</Label>
              <Select value={inviteData.branch_access} onValueChange={(v) => setInviteData(p => ({...p, branch_access: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isRTL ? 'جميع الفروع' : 'All Branches'}</SelectItem>
                  <SelectItem value="single">{isRTL ? 'فرع واحد' : 'Single Branch'}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Linked Students — only for parent role */}
            {inviteData.role === 'parent' && (
              <LinkedStudentsPicker
                studentIds={inviteData.linked_student_ids}
                onChange={(ids) => setInviteData(p => ({...p, linked_student_ids: ids}))}
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

      {/* Edit User Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'تعديل المستخدم' : 'Edit User'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'الدور' : 'Role'}</Label>
              <Select value={editData.user_role} onValueChange={(v) => setEditData(p => ({...p, user_role: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {USER_ROLES.map(r => <SelectItem key={r.id} value={r.id}>{isRTL ? r.name_ar : r.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الفرع' : 'Branch'}</Label>
              <Select value={editData.branch_id || 'all'} onValueChange={(v) => setEditData(p => ({...p, branch_id: v === 'all' ? null : v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isRTL ? 'جميع الفروع' : 'All Branches'}</SelectItem>
                  {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Linked Students — only for parent role */}
            {editData.user_role === 'parent' && (
              <LinkedStudentsPicker
                studentIds={editData.linked_student_ids}
                onChange={(ids) => setEditData(p => ({...p, linked_student_ids: ids}))}
                students={students}
                isRTL={isRTL}
              />
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