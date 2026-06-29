import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import PageHeader from '../components/ui/PageHeader';
import { Plus, Copy, Loader2, Edit2, Send, ClipboardCheck } from 'lucide-react';
import { logAuditEvent } from '../components/AuditService';
import SendIntakeLink from '../components/intake/SendIntakeLink';
import DocumentVerificationQueue from '../components/intake/DocumentVerificationQueue';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function ParentIntakeManagement() {
  const { t: _t, isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();

  const [activeTab, setActiveTab] = useState('links');
  const [showForm, setShowForm] = useState(false);
  const [editingLink, setEditingLink] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(null);

  // Count pending verifications for badge
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['pendingVerificationsCount', tenantId],
    queryFn: async () => {
      const data = await fetchData(
        tenantQuery('applications')
          .select('id', { count: 'exact', head: true })
          .match(tenantFilter({ document_status: 'pending_physical_verification' }))
      );
      return data?.length || 0;
    },
    enabled: hasTenantAccess,
  });

  const [formData, setFormData] = useState({
    name_ar: '',
    name_en: '',
    academic_year: '',
    branch_id: '',
    allowed_grades: [],
    is_active: true,
    expires_date: ''
  });

  const { data: links = [], isLoading } = useQuery({
    queryKey: ['parentIntakeLinks', tenantId],
    queryFn: () => fetchData(tenantQuery('parent_intake_links').select('*').match(tenantFilter()).order('created_at', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchData(tenantQuery('branches').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const { data: academicYears = [] } = useQuery({
    queryKey: ['academicYears', tenantId],
    queryFn: () => fetchData(tenantQuery('academic_years').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const handleSave = async () => {
    if (!formData.name_ar || !formData.academic_year || !formData.branch_id) {
      toast.error(isRTL ? 'يرجى ملء الحقول المطلوبة' : 'Please fill required fields');
      return;
    }

    setSaving(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const linkCode = editingLink?.link_code || `INTAKE-${Date.now().toString(36).toUpperCase()}`;
      const baseUrl = window.location.origin;
      const linkUrl = `${baseUrl}/#/ParentIntake?code=${linkCode}`;

      const data = {
        ...formData,
        link_code: linkCode,
        link_url: linkUrl,
        created_by: editingLink ? undefined : user.email,
        created_at: editingLink ? undefined : new Date().toISOString()
      };

      if (editingLink) {
        await tenantQuery('parent_intake_links').update(data);
        await logAuditEvent({ action: 'UPDATE', entityType: 'ParentIntakeLink', entityId: editingLink.id });
        toast.success(isRTL ? 'تم التحديث' : 'Link updated');
      } else {
        const created = await tenantQuery('parent_intake_links').insert(data);
        await logAuditEvent({ action: 'CREATE', entityType: 'ParentIntakeLink', entityId: created.id });
        toast.success(isRTL ? 'تم الإنشاء' : 'Link created');
      }

      queryClient.invalidateQueries({ queryKey: ['parentIntakeLinks'] });
      setShowForm(false);
      setEditingLink(null);
      setFormData({
        name_ar: '', name_en: '', academic_year: '', branch_id: '',
        allowed_grades: [], is_active: true, expires_date: ''
      });
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const copyLink = (link) => {
    navigator.clipboard.writeText(link.link_url);
    toast.success(isRTL ? 'تم النسخ' : 'Copied to clipboard');
  };

  const toggleActive = async (link) => {
    try {
      await tenantQuery('parent_intake_links').update({ is_active: !link.is_active });
      queryClient.invalidateQueries({ queryKey: ['parentIntakeLinks'] });
      toast.success(isRTL ? 'تم التحديث' : 'Updated');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'إدارة تسجيل أولياء الأمور' : 'Parent Intake Management'}
        subtitle={isRTL ? 'إدارة روابط التسجيل والتحقق من المستندات' : 'Manage intake links and document verification'}
        action={activeTab === 'links'}
        actionLabel={isRTL ? 'رابط جديد' : 'New Link'}
        actionIcon={Plus}
        onAction={() => setShowForm(true)}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="links">
            {isRTL ? 'الروابط' : 'Links'}
          </TabsTrigger>
          <TabsTrigger value="verification" className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4" />
            {isRTL ? 'التحقق من المستندات' : 'Doc Verification'}
            {pendingCount > 0 && (
              <Badge className="bg-amber-500 text-white text-xs px-1.5 py-0 min-w-[1.25rem] h-5">{pendingCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="verification" className="mt-4">
          <DocumentVerificationQueue />
        </TabsContent>

        <TabsContent value="links" className="mt-4">
      <Card>
        <div className="overflow-x-auto" dir={isRTL ? 'rtl' : 'ltr'}>
          <Table className="table-fixed w-full">
            <TableHeader>
              <TableRow>
                <TableHead style={{ width: '25%' }}>{isRTL ? 'الاسم' : 'Name'}</TableHead>
                <TableHead style={{ width: '15%' }}>{isRTL ? 'العام الدراسي' : 'Academic Year'}</TableHead>
                <TableHead style={{ width: '20%' }}>{isRTL ? 'الفرع' : 'Branch'}</TableHead>
                <TableHead style={{ width: '12%', textAlign: 'center' }}>{isRTL ? 'الطلبات' : 'Submissions'}</TableHead>
                <TableHead style={{ width: '12%', textAlign: 'center' }}>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                <TableHead style={{ width: '16%', textAlign: 'center' }}></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8" style={{ textAlign: 'center' }}>
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : links.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground" style={{ textAlign: 'center' }}>
                  {isRTL ? 'لا توجد روابط' : 'No links found'}
                </TableCell>
              </TableRow>
            ) : (
              links.map(link => (
                <TableRow key={link.id}>
                  <TableCell style={{ width: '25%' }}>
                    <div>
                      <p className="font-medium">{isRTL ? link.name_ar : link.name_en}</p>
                      <p className="text-xs text-muted-foreground font-mono" dir="ltr">{link.link_code}</p>
                    </div>
                  </TableCell>
                  <TableCell style={{ width: '15%' }}>{link.academic_year}</TableCell>
                  <TableCell style={{ width: '20%' }}>
                    {branches.find(b => b.id === link.branch_id)?.[isRTL ? 'name_ar' : 'name_en']}
                  </TableCell>
                  <TableCell style={{ width: '12%', textAlign: 'center' }}>
                    <Badge variant="outline">{link.submission_count || 0}</Badge>
                  </TableCell>
                  <TableCell style={{ width: '12%', textAlign: 'center' }}>
                    <Switch 
                      checked={link.is_active} 
                      onCheckedChange={() => toggleActive(link)}
                    />
                  </TableCell>
                  <TableCell style={{ width: '16%', textAlign: 'center' }}>
                    <div className="flex gap-2 justify-center">
                      <Button variant="ghost" size="sm" onClick={() => setShowSendDialog(link)}>
                        <Send className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => copyLink(link)}>
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingLink(link)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          </Table>
        </div>
      </Card>

      {/* Form Dialog */}
      <Dialog open={showForm || !!editingLink} onOpenChange={(open) => {
        if (!open) {
          setShowForm(false);
          setEditingLink(null);
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingLink ? (isRTL ? 'تعديل الرابط' : 'Edit Link') : (isRTL ? 'رابط جديد' : 'New Link')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'} *</Label>
                <Input value={formData.name_ar} onChange={(e) => setFormData({...formData, name_ar: e.target.value})} />
              </div>
              <div>
                <Label>{isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'}</Label>
                <Input value={formData.name_en} onChange={(e) => setFormData({...formData, name_en: e.target.value})} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isRTL ? 'العام الدراسي' : 'Academic Year'} *</Label>
                <Select value={formData.academic_year} onValueChange={(v) => setFormData({...formData, academic_year: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {academicYears.map(year => (
                      <SelectItem key={year.id} value={year.name}>
                        {isRTL ? year.name_ar || year.name : year.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{isRTL ? 'الفرع' : 'Branch'} *</Label>
                <Select value={formData.branch_id} onValueChange={(v) => setFormData({...formData, branch_id: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        {isRTL ? b.name_ar : b.name_en || b.name_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>{isRTL ? 'تاريخ الانتهاء' : 'Expiry Date'}</Label>
              <Input type="date" value={formData.expires_date} onChange={(e) => setFormData({...formData, expires_date: e.target.value})} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowForm(false);
              setEditingLink(null);
            }}>
              {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Link Dialog */}
      {showSendDialog && (
        <SendIntakeLink 
          intakeLink={showSendDialog} 
          open={!!showSendDialog} 
          onOpenChange={(open) => !open && setShowSendDialog(null)} 
        />
      )}
        </TabsContent>
      </Tabs>
    </div>
  );
}