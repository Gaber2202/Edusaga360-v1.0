import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase, tenantQuery } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { sanitizeHtml } from '../lib/sanitize';
import { useBranch } from '../components/BranchContext';
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
import { Save, ArrowLeft, RotateCcw } from 'lucide-react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { toast } from 'sonner';
import { POLICY_CATEGORIES, COMPLIANCE_CHECKLIST_ITEMS } from '../components/policies/policyTemplates';
import { logAuditEvent } from '../components/AuditService';

const modules = {
  toolbar: [
    [{ 'header': [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    ['blockquote', 'code-block'],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    ['link'],
    ['clean']
  ],
};

export default function PolicyEditor() {
  const { t: _t, isRTL, language } = useLanguage();
  const { selectedBranchId } = useBranch();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const policyId = searchParams.get('id');
  const mode = searchParams.get('mode') || 'edit';
  const isEditing = !!policyId;
  const isViewMode = mode === 'view';
  const isCompareMode = mode === 'compare';

  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  
  const [formData, setFormData] = useState({
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
    compliance_tags: []
  });

  const { data: policy } = useQuery({
    queryKey: ['policy', policyId],
    queryFn: async () => {
      if (!policyId) return null;
      return await supabase.HRPolicy.get(policyId);
    },
    enabled: isEditing
  });

  const { data: policyVersions = [] } = useQuery({
    queryKey: ['policyVersions', policyId],
    queryFn: async () => {
      if (!policyId) return [];
      const { data = [] } = await tenantQuery('policy_versions').select('*').match({ policy_id: policyId });
      return data;
    },
    enabled: isCompareMode
  });

  React.useEffect(() => {
    if (policy) {
      setFormData({
        title_ar: policy.title_ar,
        title_en: policy.title_en,
        category: policy.category,
        description_ar: policy.description_ar || '',
        description_en: policy.description_en || '',
        body_ar: policy.body_ar,
        body_en: policy.body_en,
        scope_applies_to: policy.scope_applies_to || [],
        effective_date: policy.effective_date,
        tags: policy.tags?.join(', ') || '',
        status: policy.status,
        compliance_tags: policy.compliance_tags || []
      });
    }
  }, [policy]);

  const handleSave = async () => {
    if (!formData.title_ar || !formData.title_en || !formData.category || !formData.body_ar || !formData.body_en) {
      toast.error(isRTL ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }

    setSaving(true);
    try {
      const data = {
        ...formData,
        branch_id: selectedBranchId,
        tags: formData.tags.split(',').map(t => t.trim()).filter(t => t),
        owner_id: 'current_user',
        owner_name: 'Current User',
        current_version: 'v1.0',
        last_updated: new Date().toISOString(),
        policy_code: isEditing ? undefined : `POL-${Date.now().toString(36).toUpperCase()}`
      };

      if (isEditing) {
        await tenantQuery('hr_policys').update(data);
        await logAuditEvent({ action: 'UPDATE', entityType: 'HRPolicy', entityId: policyId, newValues: data });
        toast.success(isRTL ? 'تم التحديث' : 'Policy updated');
      } else {
        const created = await tenantQuery('hr_policys').insert(data);
        await logAuditEvent({ action: 'CREATE', entityType: 'HRPolicy', entityId: created.id, newValues: data });
        toast.success(isRTL ? 'تم الإنشاء' : 'Policy created');
      }

      queryClient.invalidateQueries({ queryKey: ['hrPolicies'] });
      window.history.back();
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={getTitle()}
        actionLabel={isRTL ? 'رجوع' : 'Back'}
        actionIcon={ArrowLeft}
        onAction={() => window.history.back()}
      />

      {isCompareMode && policyVersions.length < 2 && (
        <Card className="p-6 text-center">
          <p className="text-muted-foreground">{isRTL ? 'لا توجد إصدارات للمقارنة' : 'No versions available to compare'}</p>
        </Card>
      )}

      {isCompareMode && policyVersions.length >= 2 ? (
        <Card className="p-6">
          <h3 className="font-semibold mb-4">{isRTL ? 'مقارنة الإصدارات' : 'Version Comparison'}</h3>
          <div className="grid grid-cols-2 gap-6">
            {policyVersions.slice(0, 2).map((version, _idx) => (
              <div key={version.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <Badge>{version.version_number}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {version.created_at ? new Date(version.created_at).toLocaleDateString() : ''}
                  </span>
                </div>
                <h4 className="font-medium mb-2">{isRTL ? version.title_ar : version.title_en}</h4>
                <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(version[`body_${language}`]) }} />
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

        {/* General Tab */}
        <div className={activeTab === 'general' ? 'block space-y-4 mt-4' : 'hidden'}>
          <Card className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isRTL ? 'العنوان بالعربية' : 'Title (Arabic)'}</Label>
                <Input
                  value={formData.title_ar}
                  onChange={(e) => setFormData(p => ({...p, title_ar: e.target.value}))}
                  placeholder={isRTL ? 'العنوان بالعربية' : 'Arabic title'}
                  disabled={isViewMode}
                />
              </div>
              <div>
                <Label>{isRTL ? 'العنوان بالإنجليزية' : 'Title (English)'}</Label>
                <Input
                  value={formData.title_en}
                  onChange={(e) => setFormData(p => ({...p, title_en: e.target.value}))}
                  placeholder={isRTL ? 'English title' : 'English title'}
                  disabled={isViewMode}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isRTL ? 'الفئة' : 'Category'}</Label>
                <Select value={formData.category} onValueChange={(val) => setFormData(p => ({...p, category: val}))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(POLICY_CATEGORIES).map(([key, value]) => (
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
                  onChange={(e) => setFormData(p => ({...p, effective_date: e.target.value}))}
                />
              </div>
            </div>

            <div>
              <Label>{isRTL ? 'الوصف بالعربية' : 'Description (Arabic)'}</Label>
              <Textarea
                value={formData.description_ar}
                onChange={(e) => setFormData(p => ({...p, description_ar: e.target.value}))}
                placeholder={isRTL ? 'وصف مختصر' : 'Brief description'}
                rows={2}
              />
            </div>

            <div>
              <Label>{isRTL ? 'الوصف بالإنجليزية' : 'Description (English)'}</Label>
              <Textarea
                value={formData.description_en}
                onChange={(e) => setFormData(p => ({...p, description_en: e.target.value}))}
                placeholder={isRTL ? 'Brief description' : 'Brief description'}
                rows={2}
              />
            </div>

            <div>
              <Label>{isRTL ? 'ينطبق على' : 'Applies To'}</Label>
              <div className="space-y-2">
                {['teachers', 'admin', 'drivers', 'support', 'leadership', 'all'].map(scope => (
                  <label key={scope} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={formData.scope_applies_to.includes(scope)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setFormData(p => ({...p, scope_applies_to: [...p.scope_applies_to, scope]}));
                        } else {
                          setFormData(p => ({...p, scope_applies_to: p.scope_applies_to.filter(s => s !== scope)}));
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
                onChange={(e) => setFormData(p => ({...p, tags: e.target.value}))}
                placeholder="tag1, tag2, tag3"
              />
            </div>
          </Card>
        </div>

        {/* Content Tab */}
        <div className={activeTab === 'content' ? 'block space-y-4 mt-4' : 'hidden'}>
          <Card className="p-6 space-y-4">
            <div>
              <Label>{isRTL ? 'المحتوى بالعربية' : 'Content (Arabic)'}</Label>
              <ReactQuill
                theme="snow"
                value={formData.body_ar}
                onChange={(val) => setFormData(p => ({...p, body_ar: val}))}
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
                onChange={(val) => setFormData(p => ({...p, body_en: val}))}
                modules={isViewMode ? { toolbar: false } : modules}
                readOnly={isViewMode}
                style={{ height: '300px', marginBottom: '20px' }}
              />
            </div>
          </Card>
        </div>

        {/* Compliance Tab */}
        <div className={activeTab === 'compliance' ? 'block space-y-4 mt-4' : 'hidden'}>
          <Card className="p-6 space-y-4">
            <div>
              <h3 className="font-semibold mb-4">{isRTL ? 'قائمة فحص الامتثال' : 'Compliance Checklist'}</h3>
              <div className="space-y-2">
                {COMPLIANCE_CHECKLIST_ITEMS.map(item => (
                  <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={formData.compliance_tags.includes(item.key)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setFormData(p => ({...p, compliance_tags: [...p.compliance_tags, item.key]}));
                        } else {
                          setFormData(p => ({...p, compliance_tags: p.compliance_tags.filter(ct => ct !== item.key)}));
                        }
                      }}
                    />
                    <span className="text-sm">{isRTL ? item.ar : item.en}</span>
                  </label>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Preview Tab */}
        <div className={activeTab === 'preview' ? 'block space-y-4 mt-4' : 'hidden'}>
          <Card className="p-6 space-y-4">
            <div>
              <h2 className="text-2xl font-bold mb-4">{formData[`title_${language}`]}</h2>
              <p className="text-muted-foreground mb-4">{formData[`description_${language}`]}</p>
              <div 
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(formData[`body_${language}`]) }}
              />
            </div>
          </Card>
        </div>

        {/* Action Buttons */}
        {!isViewMode && !isCompareMode && (
          <div className="flex gap-3 justify-end sticky bottom-4 mt-6">
            <Button variant="outline" onClick={() => window.history.back()}>
              {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-najdi-700 hover:bg-najdi-900">
              {saving && <RotateCcw className="w-4 h-4 animate-spin me-2" />}
              <Save className="w-4 h-4 me-2" />
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </div>
        )}
        </Tabs>
      )}
    </div>
  );
}