import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import PageHeader from '../components/ui/PageHeader';
import {
  Plus, Search, FileText, Eye, Edit2, Loader2, FileDown, Trash2, GitCompare,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getPolicyTemplatesForJurisdiction,
  getPolicyCategoriesForJurisdiction,
} from '../components/policies/policyTemplates';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { useTenant } from '../components/TenantContext';
import { useRole } from '../components/RoleContext';
import { statusBadgeLabel } from '../lib/hrPolicyHelpers';

export default function HRPoliciesLibrary() {
  const { isRTL } = useLanguage();
  const { selectedBranchId } = useBranch();
  const { tenant } = useTenant();
  const { user } = useRole();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();

  const jurisdictionCode = tenant?.jurisdiction_code || tenant?.country_code || 'SA';
  const categories = getPolicyCategoriesForJurisdiction(jurisdictionCode);
  const packTemplates = getPolicyTemplatesForJurisdiction(jurisdictionCode);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [initializing, setInitializing] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const { data: policies = [], isLoading } = useQuery({
    enabled: hasTenantAccess,
    queryKey: ['hrPolicies', tenantId, selectedBranchId],
    queryFn: () => {
      const filter = tenantFilter();
      if (selectedBranchId) filter.branch_id = selectedBranchId;
      return fetchData(tenantQuery('hr_policys').select('*').match(filter));
    },
    initialData: [],
  });

  const getCategoryLabel = (categoryKey) => {
    return isRTL ? categories[categoryKey]?.ar : categories[categoryKey]?.en;
  };

  const filteredPolicies = policies.filter((policy) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      !q ||
      policy.title_ar?.toLowerCase().includes(q) ||
      policy.title_en?.toLowerCase().includes(q) ||
      policy.policy_code?.toLowerCase().includes(q);

    const matchesCategory = selectedCategory === 'all' || policy.category === selectedCategory;
    const matchesStatus = statusFilter === 'all' || policy.status === statusFilter;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const stats = {
    total: policies.length,
    draft: policies.filter((p) => p.status === 'draft').length,
    published: policies.filter((p) => p.status === 'published').length,
    pending: policies.filter((p) => p.status === 'under_review').length,
    mandatory: policies.filter((p) => p.is_mandatory && p.status === 'published').length,
  };

  const handleInitializeTemplates = async () => {
    setInitializing(true);
    try {
      const tenantIdForCreate = getTenantIdForCreate();
      const ownerName = user?.full_name || user?.display_name || user?.email || 'System';
      const templatesToCreate = packTemplates.map((template, idx) => ({
        ...template,
        policy_code: `POL-${jurisdictionCode}-${Date.now().toString(36).toUpperCase()}-${idx}`,
        tenant_id: tenantIdForCreate,
        branch_id: selectedBranchId || null,
        jurisdiction_code: jurisdictionCode,
        is_template: true,
        // Draft-first: HR must explicitly publish before onboarding assignment
        status: 'draft',
        is_mandatory: false,
        current_version: 'v1.0',
        owner_id: user?.id || 'system',
        owner_name: ownerName,
        effective_date: new Date().toISOString().split('T')[0],
      }));

      for (const tpl of templatesToCreate) {
        const { error } = await tenantQuery('hr_policys').insert(tpl);
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ['hrPolicies'] });
      toast.success(
        isRTL
          ? `تم تحميل ${templatesToCreate.length} سياسة كمسودات — انشر الإلزامية للإلحاق`
          : `${templatesToCreate.length} policies loaded as drafts — publish mandatory ones for onboarding`,
      );
    } catch (error) {
      console.error('Error:', error);
      toast.error(error?.message || (isRTL ? 'خطأ في التحميل' : 'Error loading templates'));
    } finally {
      setInitializing(false);
    }
  };

  const handleDelete = async (policy) => {
    if (!window.confirm(isRTL ? `حذف "${policy.title_ar || policy.title_en}"؟` : `Delete "${policy.title_en || policy.title_ar}"?`)) {
      return;
    }
    setDeletingId(policy.id);
    try {
      const { error } = await tenantQuery('hr_policys').delete().eq('id', policy.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['hrPolicies'] });
      toast.success(isRTL ? 'تم الحذف' : 'Deleted');
    } catch (error) {
      toast.error(error?.message || (isRTL ? 'فشل الحذف' : 'Delete failed'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownload = (policy) => {
    const title = isRTL ? policy.title_ar : policy.title_en;
    const body = isRTL ? policy.body_ar : policy.body_en;
    // Strip basic HTML tags for readable plain-text export
    const plain = String(body || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
    const content = `${title}\n${'='.repeat(Math.min(title?.length || 10, 40))}\n\n${plain}\n`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${policy.policy_code || 'policy'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusClass = (status) => {
    if (status === 'published') return 'bg-emerald-100 text-emerald-800';
    if (status === 'under_review') return 'bg-orange-100 text-orange-800';
    if (status === 'approved') return 'bg-najdi-50 text-najdi-900';
    if (status === 'archived') return 'bg-sand-alt text-muted-foreground';
    return 'bg-sand-alt text-ink';
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={isRTL ? 'مكتبة سياسات الموارد البشرية' : 'HR Policies Library'}
        subtitle={isRTL ? 'إدارة وتطوير سياسات الموارد البشرية والامتثال' : 'Manage and develop HR policies and compliance'}
        actionLabel={isRTL ? 'سياسة جديدة' : 'New Policy'}
        actionIcon={Plus}
        onAction={() => navigate(createPageUrl('PolicyEditor'))}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground mb-1">{isRTL ? 'إجمالي' : 'Total'}</p>
          <p className="text-2xl font-bold text-najdi-700">{stats.total}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground mb-1">{isRTL ? 'مسودات' : 'Drafts'}</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.draft}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground mb-1">{isRTL ? 'منشورة' : 'Published'}</p>
          <p className="text-2xl font-bold text-emerald-600">{stats.published}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground mb-1">{isRTL ? 'قيد المراجعة' : 'Pending'}</p>
          <p className="text-2xl font-bold text-orange-600">{stats.pending}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground mb-1">{isRTL ? 'إلزامية' : 'Mandatory'}</p>
          <p className="text-2xl font-bold text-ink">{stats.mandatory}</p>
        </Card>
      </div>

      <Card className="p-3 space-y-3">
        <div className="flex flex-col md:flex-row gap-2">
          <div className="flex-1 relative">
            <Search className={`absolute top-2.5 w-4 h-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
            <Input
              placeholder={isRTL ? 'ابحث...' : 'Search...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`text-sm h-8 ${isRTL ? 'pr-10' : 'pl-10'}`}
            />
          </div>

          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-40 h-8 text-sm">
              <SelectValue placeholder={isRTL ? 'الفئة' : 'Category'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isRTL ? 'جميع الفئات' : 'All'}</SelectItem>
              {Object.entries(categories).map(([key, value]) => (
                <SelectItem key={key} value={key} className="text-sm">
                  {isRTL ? value.ar : value.en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue placeholder={isRTL ? 'الحالة' : 'Status'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isRTL ? 'جميع' : 'All'}</SelectItem>
              <SelectItem value="draft">{isRTL ? 'مسودة' : 'Draft'}</SelectItem>
              <SelectItem value="under_review">{isRTL ? 'قيد المراجعة' : 'Review'}</SelectItem>
              <SelectItem value="approved">{isRTL ? 'معتمدة' : 'Approved'}</SelectItem>
              <SelectItem value="published">{isRTL ? 'منشورة' : 'Published'}</SelectItem>
              <SelectItem value="archived">{isRTL ? 'مؤرشفة' : 'Archived'}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {policies.length === 0 && !isLoading && (
          <div className="text-center py-4 space-y-2">
            <p className="text-sm text-muted-foreground">
              {isRTL
                ? 'لا توجد سياسات. حمّل حزمة الولاية القضائية كمسودات.'
                : 'No policies yet. Load the jurisdiction pack as drafts.'}
            </p>
            <Button
              onClick={handleInitializeTemplates}
              disabled={initializing}
              className="bg-najdi-700 hover:bg-najdi-900 h-8 text-sm"
            >
              {initializing && <Loader2 className="w-3 h-3 animate-spin me-2" />}
              {isRTL ? 'تحميل حزمة السياسات' : 'Initialize policy pack'}
            </Button>
          </div>
        )}
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {filteredPolicies.map((policy) => (
            <Card key={policy.id} className="p-2 hover:shadow-md transition-all flex flex-col h-full">
              <div className="space-y-1.5 flex-1 flex flex-col">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-xs line-clamp-2 leading-tight">
                    {isRTL ? policy.title_ar : policy.title_en}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                    {getCategoryLabel(policy.category)}
                  </p>
                </div>

                <div className="flex gap-1 flex-wrap">
                  <Badge className={`text-xs py-0 h-5 ${statusClass(policy.status)}`}>
                    {statusBadgeLabel(policy.status, isRTL)}
                  </Badge>
                  {policy.is_template && (
                    <Badge variant="secondary" className="text-xs py-0 h-5">
                      {isRTL ? 'قالب' : 'Tmpl'}
                    </Badge>
                  )}
                  {policy.is_mandatory && (
                    <Badge variant="outline" className="text-xs py-0 h-5">
                      {isRTL ? 'إلزامي' : 'Req'}
                    </Badge>
                  )}
                </div>

                <div className="flex gap-0.5 mt-auto pt-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() =>
                      navigate(createPageUrl('PolicyEditor') + `?id=${policy.id}&mode=view`)
                    }
                    title={isRTL ? 'عرض' : 'View'}
                  >
                    <Eye className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => handleDownload(policy)}
                    title={isRTL ? 'تحميل' : 'Download'}
                  >
                    <FileDown className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() =>
                      navigate(createPageUrl('PolicyEditor') + `?id=${policy.id}&mode=edit`)
                    }
                    title={isRTL ? 'تعديل' : 'Edit'}
                  >
                    <Edit2 className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() =>
                      navigate(createPageUrl('PolicyEditor') + `?id=${policy.id}&mode=compare`)
                    }
                    title={isRTL ? 'مقارنة' : 'Compare'}
                  >
                    <GitCompare className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-destructive"
                    disabled={deletingId === policy.id}
                    onClick={() => handleDelete(policy)}
                    title={isRTL ? 'حذف' : 'Delete'}
                  >
                    {deletingId === policy.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && filteredPolicies.length === 0 && policies.length > 0 && (
        <div className="text-center py-8">
          <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {isRTL ? 'لا توجد سياسات' : 'No policies found'}
          </p>
        </div>
      )}
    </div>
  );
}
