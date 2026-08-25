/**
 * SCRUM-124: Leave approval chain config (default manager → HR when empty).
 */
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { callApi, tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useTenantFilter } from '../../hooks/useTenantFilter';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Loader2, Save, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const ROLES = [
  { value: 'direct_manager', labelEn: 'Direct manager', labelAr: 'المدير المباشر' },
  { value: 'hr_manager', labelEn: 'HR manager', labelAr: 'مدير الموارد البشرية' },
  { value: 'branch_manager', labelEn: 'Branch manager', labelAr: 'مدير الفرع' },
  { value: 'ceo', labelEn: 'CEO', labelAr: 'الرئيس التنفيذي' },
];

export default function LeaveApprovalChainConfig() {
  const { isRTL } = useLanguage();
  const { tenantId, hasTenantAccess, tenantFilter } = useTenantFilter();
  const qc = useQueryClient();
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [level1, setLevel1] = useState('direct_manager');
  const [level2, setLevel2] = useState('hr_manager');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const { data: leaveTypes = [] } = useQuery({
    enabled: hasTenantAccess,
    queryKey: ['leaveTypes', tenantId],
    queryFn: () => fetchData(tenantQuery('leave_types').select('*').match(tenantFilter())),
  });

  const { data: chains = [], isLoading } = useQuery({
    enabled: hasTenantAccess,
    queryKey: ['leaveChains', tenantId],
    queryFn: () => callApi('/api/leave/chains', null, { method: 'GET' }),
  });

  const chainList = Array.isArray(chains) ? chains : chains?.chains || [];

  const handleSave = async () => {
    if (!leaveTypeId) {
      toast.error(isRTL ? 'اختر نوع الإجازة' : 'Select a leave type');
      return;
    }
    setSaving(true);
    try {
      await callApi('/api/leave/chains', {
        leave_type_id: leaveTypeId,
        levels: [
          { level: 1, approver_role: level1 },
          { level: 2, approver_role: level2 },
        ],
      }, { method: 'POST' });
      qc.invalidateQueries({ queryKey: ['leaveChains'] });
      toast.success(isRTL ? 'تم حفظ سلسلة الموافقة' : 'Approval chain saved');
    } catch (err) {
      console.error(err);
      toast.error(isRTL ? 'فشل الحفظ' : 'Failed to save chain');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncEntitlements = async () => {
    setSyncing(true);
    try {
      const result = await callApi('/api/leave/entitlements/sync', {}, { method: 'POST' });
      toast.success(
        isRTL
          ? `تمت مزامنة الاستحقاقات (${result?.updated ?? 0})`
          : `Entitlements synced (${result?.updated ?? 0})`,
      );
      qc.invalidateQueries({ queryKey: ['leaveTypes'] });
      qc.invalidateQueries({ queryKey: ['leaveBalances'] });
    } catch (err) {
      console.error(err);
      toast.error(isRTL ? 'فشلت المزامنة' : 'Entitlement sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card className="p-4 space-y-4 border border-border/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-sm">
            {isRTL ? 'سلسلة موافقات الإجازة' : 'Leave approval chain'}
          </h3>
          <p className="text-xs text-muted-foreground">
            {isRTL
              ? 'الافتراضي: المدير المباشر ← الموارد البشرية'
              : 'Default when empty: Direct manager → HR'}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={handleSyncEntitlements} disabled={syncing}>
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span className="ms-2">{isRTL ? 'مزامنة الاستحقاقات' : 'Sync pack entitlements'}</span>
        </Button>
      </div>

      {isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <div className="text-xs text-muted-foreground space-y-1">
          {chainList.length === 0 ? (
            <p>{isRTL ? 'لا توجد سلاسل مخصصة — يُستخدم الافتراضي.' : 'No custom chains — using default.'}</p>
          ) : (
            chainList.slice(0, 8).map((c) => (
              <p key={`${c.leave_type_id}-${c.level}`}>
                {c.leave_type_id?.slice(0, 8)}… L{c.level}: {c.approver_role}
              </p>
            ))
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <p className="text-xs mb-1">{isRTL ? 'نوع الإجازة' : 'Leave type'}</p>
          <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
            <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
            <SelectContent>
              {leaveTypes.map((lt) => (
                <SelectItem key={lt.id} value={lt.id}>{isRTL ? lt.name_ar || lt.name : lt.name_en || lt.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-xs mb-1">{isRTL ? 'المستوى 1' : 'Level 1'}</p>
          <Select value={level1} onValueChange={setLevel1}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{isRTL ? r.labelAr : r.labelEn}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-xs mb-1">{isRTL ? 'المستوى 2' : 'Level 2'}</p>
          <Select value={level2} onValueChange={setLevel2}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{isRTL ? r.labelAr : r.labelEn}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button size="sm" onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        <span className="ms-2">{isRTL ? 'حفظ السلسلة' : 'Save chain'}</span>
      </Button>
    </Card>
  );
}
