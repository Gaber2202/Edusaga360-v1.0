import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { sanitizeHtml } from '../lib/sanitize';
import { useBranch } from '../components/BranchContext';
import { useTenant } from '../components/TenantContext';
import { useRole } from '../components/RoleContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import PageHeader from '../components/ui/PageHeader';
import { Save, ArrowLeft, RotateCcw, Loader2 } from 'lucide-react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { toast } from 'sonner';
import {
  getPolicyCategoriesForJurisdiction,
  getComplianceChecklistForJurisdiction,
} from '../components/policies/policyTemplates';
import { logAuditEvent } from '../components/AuditService';
import { createPageUrl } from '../utils';
import {
  POLICY_STATUSES,
  buildPolicyPayload,
  buildVersionSnapshot,
} from '../lib/hrPolicyHelpers';

const modules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    ['blockquote', 'code-block'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link'],
    ['clean'],
  ],
};

const emptyForm = {
  title_ar: '',
  title_en: '',
  category: '',
  description_ar: '',
  description_en: '',
  body_ar: '',
  body_en: '',
  scope_applies_to: [],
  effective_date: new Date().toISOString().split('T')[0],
  tags: '',
  status: 'draft',
  compliance_tags: [],
  is_mandatory: false,
  jurisdiction_code: null,
  current_version: 'v1.0',
};

export default function PolicyEditor() {
  const { isRTL, language } = useLanguage();
  const { selectedBranchId } = useBranch();
  const { tenant } = useTenant();
  const { user } = useRole();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const policyId = searchParams.get('id');
  const mode = searchParams.get('mode') || 'edit';
  const isEditing = !!policyId;
  const isViewMode = mode === 'view';
  const isCompareMode = mode === 'compare';

  const jurisdictionCode = tenant?.jurisdiction_code || tenant?.country_code || 'SA';
  const categories = getPolicyCategoriesForJurisdiction(jurisdictionCode);
  const complianceItems = getComplianceChecklistForJurisdiction(jurisdictionCode);

  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [formData, setFormData] = useState({
    ...emptyForm,
    jurisdiction_code: jurisdictionCode,
  });

  const {
    data: policy,
    isLoading: loadingPolicy,
    isError: policyError,
  } = useQuery({
    queryKey: ['policy', policyId],
    queryFn: async () => {
      if (!policyId) return null;
      const { data, error } = await tenantQuery('hr_policys')
        .select('*')
        .eq('id', policyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: isEditing,
  });

  const { data: policyVersions = [] } = useQuery({
    queryKey: ['policyVersions', policyId],
    queryFn: async () => {
      if (!policyId) return [];
      return fetchData(
        tenantQuery('policy_versions')
          .select('*')
          .match({ policy_id: policyId })
          .order('created_at', { ascending: false }),
      );
    },
    enabled: isEditing && isCompareMode,
    initialData: [],
  });

  React.useEffect(() => {
    if (!policy) return;
    setFormData({
      title_ar: policy.title_ar || '',
      title_en: policy.title_en || '',
      category: policy.category || '',
      description_ar: policy.description_ar || '',
      description_en: policy.description_en || '',
      body_ar: policy.body_ar || '',
      body_en: policy.body_en || '',
      scope_applies_to: policy.scope_applies_to || [],
      effective_date: policy.effective_date
        ? String(policy.effective_date).slice(0, 10)
        : new Date().toISOString().split('T')[0],
      tags: Array.isArray(policy.tags) ? policy.tags.join(', ') : '',
      status: policy.status || 'draft',
      compliance_tags: policy.compliance_tags || [],
      is_mandatory: !!policy.is_mandatory,
      jurisdiction_code: policy.jurisdiction_code || jurisdictionCode,
      current_version: policy.current_version || 'v1.0',
      owner_id: policy.owner_id,
      owner_name: policy.owner_name,
      branch_id: policy.branch_id,
    });
  }, [policy, jurisdictionCode]);

  const goBack = () => {
    navigate(createPageUrl('HRPoliciesLibrary'));
  };

  const handleSave = async () => {
    if (
      !formData.title_ar ||
      !formData.title_en ||
      !formData.category ||
      !formData.body_ar ||
      !formData.body_en
    ) {
      toast.error(isRTL ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }

    setSaving(true);
    try {
      const owner = {
        id: user?.id || user?.auth_id || null,
        name: user?.full_name || user?.display_name || user?.email || 'Unknown',
      };

      const payload = buildPolicyPayload(formData, {
        selectedBranchId,
        owner,
        isEditing,
        previousVersion: policy?.current_version || formData.current_version,
      });

      if (!isEditing) {
        payload.policy_code = `POL-${jurisdictionCode}-${Date.now().toString(36).toUpperCase()}`;
        payload.is_template = false;
        payload.jurisdiction_code = jurisdictionCode;
      }

      let savedId = policyId;

      if (isEditing) {
        const { error } = await tenantQuery('hr_policys')
          .update(payload)
          .eq('id', policyId);
        if (error) throw error;

        // Snapshot on publish/approve transitions
        if (payload.status === 'published' || payload.status === 'approved') {
          const snap = buildVersionSnapshot(
            { ...policy, ...payload, id: policyId },
            { versionNumber: payload.current_version, createdBy: owner.name },
          );
          const { error: verErr } = await tenantQuery('policy_versions').insert(snap);
          if (verErr) console.error('Version snapshot failed:', verErr);
        }

        await logAuditEvent({
          action: 'UPDATE',
          entityType: 'HRPolicy',
          entityId: policyId,
          newValues: payload,
        });
        toast.success(isRTL ? 'تم التحديث' : 'Policy updated');
      } else {
        const { data: created, error } = await tenantQuery('hr_policys')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        savedId = created?.id;
        await logAuditEvent({
          action: 'CREATE',
          entityType: 'HRPolicy',
          entityId: savedId,
          newValues: payload,
        });
        toast.success(isRTL ? 'تم الإنشاء' : 'Policy created');
      }

      queryClient.invalidateQueries({ queryKey: ['hrPolicies'] });
      queryClient.invalidateQueries({ queryKey: ['policy', savedId] });
      queryClient.invalidateQueries({ queryKey: ['policyVersions', savedId] });
      goBack();
    } catch (error) {
      console.error('Error:', error);
      toast.error(error?.message || (isRTL ? 'حدث خطأ' : 'Error occurred'));
    } finally {
      setSaving(false);
    }
  };

  const getTitle = () => {
    if (isCompareMode) return isRTL ? 'مقارنة الإصدارات' : 'Compare Versions';
    if (isViewMode) return isRTL ? 'عرض السياسة' : 'View Policy';
    if (isEditing) return isRTL ? 'تعديل السياسة' : 'Edit Policy';
    return isRTL ? 'سياسة جديدة' : 'New Policy';
  };

  if (isEditing && loadingPolicy) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isEditing && (policyError || !policy)) {
    return (
      <div className="space-y-4">
        <PageHeader
          title={isRTL ? 'السياسة غير موجودة' : 'Policy not found'}
          actionLabel={isRTL ? 'رجوع' : 'Back'}
          actionIcon={ArrowLeft}
          onAction={goBack}
        />
        <Card className="p-6 text-center text-muted-foreground">
          {isRTL ? 'تعذر تحميل هذه السياسة' : 'Could not load this policy'}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={getTitle()}
        actionLabel={isRTL ? 'رجوع' : 'Back'}
        actionIcon={ArrowLeft}
        onAction={goBack}
      />

      {isCompareMode && policyVersions.length < 2 && (
        <Card className="p-6 text-center">
          <p className="text-muted-foreground">
            {isRTL ? 'لا توجد إصدارات كافية للمقارنة' : 'No versions available to compare'}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {isRTL
              ? 'يتم حفظ إصدار عند الاعتماد أو النشر'
              : 'A version snapshot is saved when you approve or publish'}
          </p>
        </Card>
      )}

      {isCompareMode && policyVersions.length >= 2 ? (
        <Card className="p-6">
          <h3 className="font-semibold mb-4">{isRTL ? 'مقارنة الإصدارات' : 'Version Comparison'}</h3>
          <div className="grid grid-cols-2 gap-6">
            {policyVersions.slice(0, 2).map((version) => (
              <div key={version.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <Badge>{version.version_number}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {version.created_at ? new Date(version.created_at).toLocaleDateString() : ''}
                  </span>
                </div>
                <h4 className="font-medium mb-2">{isRTL ? version.title_ar : version.title_en}</h4>
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(version[`body_${language}`] || ''),
                  }}
                />
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general">{isRTL ? 'عام' : 'General'}</TabsTrigger>
            <TabsTrigger value="content">{isRTL ? 'المحتوى' : 'Content'}</TabsTrigger>
            <TabsTrigger value="compliance">{isRTL ? 'الامتثال' : 'Compliance'}</TabsTrigger>
            <TabsTrigger value="preview">{isRTL ? 'معاينة' : 'Preview'}</TabsTrigger>
          </TabsList>

          <div className={activeTab === 'general' ? 'block space-y-4 mt-4' : 'hidden'}>
            <Card className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{isRTL ? 'العنوان بالعربية' : 'Title (Arabic)'}</Label>
                  <Input
                    value={formData.title_ar}
                    onChange={(e) => setFormData((p) => ({ ...p, title_ar: e.target.value }))}
                    disabled={isViewMode}
                  />
                </div>
                <div>
                  <Label>{isRTL ? 'العنوان بالإنجليزية' : 'Title (English)'}</Label>
                  <Input
                    value={formData.title_en}
                    onChange={(e) => setFormData((p) => ({ ...p, title_en: e.target.value }))}
                    disabled={isViewMode}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{isRTL ? 'الفئة' : 'Category'}</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(val) => setFormData((p) => ({ ...p, category: val }))}
                    disabled={isViewMode}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(categories).map(([key, value]) => (
                        <SelectItem key={key} value={key}>
                          {isRTL ? value.ar : value.en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{isRTL ? 'تاريخ السريان' : 'Effective Date'}</Label>
                  <Input
                    type="date"
                    value={formData.effective_date}
                    onChange={(e) => setFormData((p) => ({ ...p, effective_date: e.target.value }))}
                    disabled={isViewMode}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{isRTL ? 'الحالة' : 'Status'}</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(val) => setFormData((p) => ({ ...p, status: val }))}
                    disabled={isViewMode}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POLICY_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s === 'draft' && (isRTL ? 'مسودة' : 'Draft')}
                          {s === 'under_review' && (isRTL ? 'قيد المراجعة' : 'Under Review')}
                          {s === 'approved' && (isRTL ? 'معتمدة' : 'Approved')}
                          {s === 'published' && (isRTL ? 'منشورة' : 'Published')}
                          {s === 'archived' && (isRTL ? 'مؤرشفة' : 'Archived')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={formData.is_mandatory}
                      onCheckedChange={(checked) =>
                        setFormData((p) => ({ ...p, is_mandatory: !!checked }))
                      }
                      disabled={isViewMode}
                    />
                    <span className="text-sm">
                      {isRTL ? 'إلزامية عند الإلحاق' : 'Mandatory for onboarding'}
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <Label>{isRTL ? 'الوصف بالعربية' : 'Description (Arabic)'}</Label>
                <Textarea
                  value={formData.description_ar}
                  onChange={(e) => setFormData((p) => ({ ...p, description_ar: e.target.value }))}
                  rows={2}
                  disabled={isViewMode}
                />
              </div>

              <div>
                <Label>{isRTL ? 'الوصف بالإنجليزية' : 'Description (English)'}</Label>
                <Textarea
                  value={formData.description_en}
                  onChange={(e) => setFormData((p) => ({ ...p, description_en: e.target.value }))}
                  rows={2}
                  disabled={isViewMode}
                />
              </div>

              <div>
                <Label>{isRTL ? 'ينطبق على' : 'Applies To'}</Label>
                <div className="space-y-2">
                  {['teachers', 'admin', 'drivers', 'support', 'leadership', 'all'].map((scope) => (
                    <label key={scope} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={formData.scope_applies_to.includes(scope)}
                        disabled={isViewMode}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFormData((p) => ({
                              ...p,
                              scope_applies_to: [...p.scope_applies_to, scope],
                            }));
                          } else {
                            setFormData((p) => ({
                              ...p,
                              scope_applies_to: p.scope_applies_to.filter((s) => s !== scope),
                            }));
                          }
                        }}
                      />
                      <span className="text-sm">{scope}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <Label>{isRTL ? 'الوسوم (مفصولة بفاصلة)' : 'Tags (comma separated)'}</Label>
                <Input
                  value={formData.tags}
                  onChange={(e) => setFormData((p) => ({ ...p, tags: e.target.value }))}
                  placeholder="tag1, tag2, tag3"
                  disabled={isViewMode}
                />
              </div>
            </Card>
          </div>

          <div className={activeTab === 'content' ? 'block space-y-4 mt-4' : 'hidden'}>
            <Card className="p-6 space-y-4">
              <div>
                <Label>{isRTL ? 'المحتوى بالعربية' : 'Content (Arabic)'}</Label>
                <ReactQuill
                  theme="snow"
                  value={formData.body_ar}
                  onChange={(val) => setFormData((p) => ({ ...p, body_ar: val }))}
                  modules={isViewMode ? { toolbar: false } : modules}
                  readOnly={isViewMode}
                  style={{ height: '300px', marginBottom: '20px' }}
                />
              </div>
              <div>
                <Label>{isRTL ? 'المحتوى بالإنجليزية' : 'Content (English)'}</Label>
                <ReactQuill
                  theme="snow"
                  value={formData.body_en}
                  onChange={(val) => setFormData((p) => ({ ...p, body_en: val }))}
                  modules={isViewMode ? { toolbar: false } : modules}
                  readOnly={isViewMode}
                  style={{ height: '300px', marginBottom: '20px' }}
                />
              </div>
            </Card>
          </div>

          <div className={activeTab === 'compliance' ? 'block space-y-4 mt-4' : 'hidden'}>
            <Card className="p-6 space-y-4">
              <h3 className="font-semibold mb-4">
                {isRTL ? 'قائمة فحص الامتثال' : 'Compliance Checklist'}
              </h3>
              <div className="space-y-2">
                {complianceItems.map((item) => (
                  <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={formData.compliance_tags.includes(item.key)}
                      disabled={isViewMode}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setFormData((p) => ({
                            ...p,
                            compliance_tags: [...p.compliance_tags, item.key],
                          }));
                        } else {
                          setFormData((p) => ({
                            ...p,
                            compliance_tags: p.compliance_tags.filter((ct) => ct !== item.key),
                          }));
                        }
                      }}
                    />
                    <span className="text-sm">{isRTL ? item.ar : item.en}</span>
                  </label>
                ))}
              </div>
            </Card>
          </div>

          <div className={activeTab === 'preview' ? 'block space-y-4 mt-4' : 'hidden'}>
            <Card className="p-6 space-y-4">
              <h2 className="text-2xl font-bold mb-4">{formData[`title_${language}`]}</h2>
              <p className="text-muted-foreground mb-4">{formData[`description_${language}`]}</p>
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html: sanitizeHtml(formData[`body_${language}`] || ''),
                }}
              />
            </Card>
          </div>

          {!isViewMode && !isCompareMode && (
            <div className="flex gap-3 justify-end sticky bottom-4 mt-6">
              <Button variant="outline" onClick={goBack}>
                {isRTL ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button onClick={handleSave} disabled={saving} className="bg-najdi-700 hover:bg-najdi-900">
                {saving ? (
                  <RotateCcw className="w-4 h-4 animate-spin me-2" />
                ) : (
                  <Save className="w-4 h-4 me-2" />
                )}
                {isRTL ? 'حفظ' : 'Save'}
              </Button>
            </div>
          )}
        </Tabs>
      )}
    </div>
  );
}
