import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import PageHeader from '../components/ui/PageHeader';
import {
  Plus, Search, FileText, Loader2, Filter, PackagePlus, Save, X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getPolicyTemplatesForJurisdiction,
  getPolicyCategoriesForJurisdiction,
} from '../components/policies/policyTemplates';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { useTenant } from '../components/TenantContext';
import { useRole } from '../components/RoleContext';
import {
  statusBadgeLabel,
  selectMissingPolicyTemplates,
  groupPoliciesByCategory,
  buildTemplateInsertRows,
} from '../lib/hrPolicyHelpers';
import { downloadPolicyPdf } from '../lib/policyPdf';
import PolicyLibraryCard from '../components/policies/PolicyLibraryCard';
import { cn } from '../lib/utils';

export default function HRPoliciesLibrary() {
  const { isRTL } = useLanguage();
  const { tenant } = useTenant();
  const { user } = useRole();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();

  const jurisdictionCode = tenant?.jurisdiction_code || tenant?.country_code || 'SA';
  const categories = getPolicyCategoriesForJurisdiction(jurisdictionCode);
  const categoryKeys = Object.keys(categories);
  const packTemplates = getPolicyTemplatesForJurisdiction(jurisdictionCode);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pendingTemplates, setPendingTemplates] = useState([]);
  const [savingTemplates, setSavingTemplates] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  // Tenant-wide list (no branch filter) — branch filtering caused empty UI + duplicate packs
  const { data: policies = [], isLoading } = useQuery({
    enabled: hasTenantAccess,
    queryKey: ['hrPolicies', tenantId],
    queryFn: () =>
      fetchData(
        tenantQuery('hr_policys')
          .select('*')
          .match(tenantFilter())
          .order('category', { ascending: true })
          .order('title_en', { ascending: true }),
      ),
    initialData: [],
  });

  const getCategoryLabel = (categoryKey) => {
    if (categoryKey === 'uncategorized') {
      return isRTL ? 'غير مصنفة' : 'Uncategorized';
    }
    return isRTL ? categories[categoryKey]?.ar : categories[categoryKey]?.en;
  };

  const categoryCounts = useMemo(() => {
    const counts = { all: policies.length };
    for (const key of categoryKeys) counts[key] = 0;
    for (const p of policies) {
      const key = p.category && categories[p.category] ? p.category : 'uncategorized';
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [policies, categoryKeys, categories]);

  const statusCounts = useMemo(() => ({
    all: policies.length,
    draft: policies.filter((p) => p.status === 'draft').length,
    under_review: policies.filter((p) => p.status === 'under_review').length,
    approved: policies.filter((p) => p.status === 'approved').length,
    published: policies.filter((p) => p.status === 'published').length,
    archived: policies.filter((p) => p.status === 'archived').length,
  }), [policies]);

  const filteredPolicies = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return policies.filter((policy) => {
      const matchesSearch =
        !q ||
        policy.title_ar?.toLowerCase().includes(q) ||
        policy.title_en?.toLowerCase().includes(q) ||
        policy.policy_code?.toLowerCase().includes(q) ||
        policy.category?.toLowerCase().includes(q);

      const matchesCategory =
        selectedCategory === 'all' ||
        (selectedCategory === 'uncategorized'
          ? !policy.category || !categories[policy.category]
          : policy.category === selectedCategory);

      const matchesStatus = statusFilter === 'all' || policy.status === statusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [policies, searchTerm, selectedCategory, statusFilter, categories]);

  const filteredPending = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return pendingTemplates.filter((policy) => {
      const matchesSearch =
        !q ||
        policy.title_ar?.toLowerCase().includes(q) ||
        policy.title_en?.toLowerCase().includes(q) ||
        policy.category?.toLowerCase().includes(q);
      const matchesCategory =
        selectedCategory === 'all' ||
        (selectedCategory === 'uncategorized'
          ? !policy.category || !categories[policy.category]
          : policy.category === selectedCategory);
      const matchesStatus = statusFilter === 'all' || statusFilter === 'draft';
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [pendingTemplates, searchTerm, selectedCategory, statusFilter, categories]);

  const grouped = useMemo(() => {
    if (selectedCategory !== 'all') {
      return [{ category: selectedCategory, policies: filteredPolicies }];
    }
    return groupPoliciesByCategory(filteredPolicies, [
      ...categoryKeys,
      'uncategorized',
    ]);
  }, [filteredPolicies, selectedCategory, categoryKeys]);

  const groupedPending = useMemo(
    () => groupPoliciesByCategory(filteredPending, [...categoryKeys, 'uncategorized']),
    [filteredPending, categoryKeys],
  );

  const policiesPlusPending = useMemo(
    () => [...policies, ...pendingTemplates],
    [policies, pendingTemplates],
  );

  const missingTemplates = useMemo(
    () => selectMissingPolicyTemplates(packTemplates, policiesPlusPending, jurisdictionCode),
    [packTemplates, policiesPlusPending, jurisdictionCode],
  );

  const stats = {
    total: policies.length,
    draft: statusCounts.draft,
    published: statusCounts.published,
    pending: statusCounts.under_review,
    mandatory: policies.filter((p) => p.is_mandatory && p.status === 'published').length,
  };

  const handleInitializeTemplates = () => {
    const toStage = selectMissingPolicyTemplates(packTemplates, policiesPlusPending, jurisdictionCode);
    if (toStage.length === 0) {
      toast.info(
        isRTL
          ? 'جميع قوالب الحزمة موجودة بالفعل — لا تكرار'
          : 'All pack templates already exist — nothing to add',
      );
      return;
    }

    setPendingTemplates((prev) => [
      ...prev,
      ...toStage.map((template, idx) => ({
        ...template,
        // Local-only keys for preview cards until saved
        id: `pending-${Date.now()}-${idx}`,
        jurisdiction_code: jurisdictionCode,
        is_template: true,
        status: 'draft',
        is_mandatory: false,
        current_version: 'v1.0',
        policy_code: isRTL ? 'مسودة غير محفوظة' : 'Unsaved draft',
        effective_date: new Date().toISOString().split('T')[0],
        _pending: true,
      })),
    ]);
    toast.info(
      isRTL
        ? `تم تجهيز ${toStage.length} قالب — احفظها لإضافتها للمكتبة`
        : `Staged ${toStage.length} templates — save to add them to the library`,
    );
  };

  const handleDiscardPending = () => {
    setPendingTemplates([]);
    toast.info(isRTL ? 'تم تجاهل القوالب المعلّقة' : 'Discarded staged templates');
  };

  const handleSaveTemplates = async () => {
    if (savingTemplates || pendingTemplates.length === 0) return;

    setSavingTemplates(true);
    try {
      const tenantIdForCreate = getTenantIdForCreate();
      const ownerName = user?.full_name || user?.display_name || user?.email || 'System';
      const rows = buildTemplateInsertRows(pendingTemplates, {
        jurisdictionCode,
        tenantId: tenantIdForCreate,
        ownerId: user?.id || user?._appUserId || 'system',
        ownerName,
      });

      // Strip local-only preview fields before insert
      const payloads = rows.map(({ id, _pending, ...rest }) => rest);

      for (const tpl of payloads) {
        const { error } = await tenantQuery('hr_policys').insert(tpl);
        if (error) throw error;
      }

      setPendingTemplates([]);
      await queryClient.invalidateQueries({ queryKey: ['hrPolicies'] });
      toast.success(
        isRTL
          ? `تم حفظ ${payloads.length} قالب كمسودات`
          : `Saved ${payloads.length} templates as drafts`,
      );
    } catch (error) {
      console.error('Error:', error);
      toast.error(error?.message || (isRTL ? 'فشل حفظ القوالب' : 'Failed to save templates'));
    } finally {
      setSavingTemplates(false);
    }
  };

  const handleDelete = async (policy) => {
    if (
      !window.confirm(
        isRTL
          ? `حذف "${policy.title_ar || policy.title_en}"؟`
          : `Delete "${policy.title_en || policy.title_ar}"?`,
      )
    ) {
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

  const handleDownload = async (policy) => {
    setDownloadingId(policy.id);
    try {
      toast.info(isRTL ? 'جاري إنشاء PDF...' : 'Generating PDF...');
      await downloadPolicyPdf(policy, {
        isRTL,
        categoryLabel: getCategoryLabel(policy.category) || policy.category || '',
      });
      toast.success(isRTL ? 'تم تنزيل PDF' : 'PDF downloaded');
    } catch (error) {
      console.error(error);
      toast.error(error?.message || (isRTL ? 'فشل تنزيل PDF' : 'PDF download failed'));
    } finally {
      setDownloadingId(null);
    }
  };

  const categoryChipKeys = [
    'all',
    ...categoryKeys,
    ...(categoryCounts.uncategorized ? ['uncategorized'] : []),
  ];

  const statusChips = [
    { key: 'all', label: isRTL ? 'الكل' : 'All' },
    { key: 'draft', label: statusBadgeLabel('draft', isRTL) },
    { key: 'under_review', label: statusBadgeLabel('under_review', isRTL) },
    { key: 'approved', label: statusBadgeLabel('approved', isRTL) },
    { key: 'published', label: statusBadgeLabel('published', isRTL) },
    { key: 'archived', label: statusBadgeLabel('archived', isRTL) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={isRTL ? 'مكتبة سياسات الموارد البشرية' : 'HR Policies Library'}
        subtitle={
          isRTL
            ? 'تصفح حسب الفئة والحالة — إدارة السياسات والامتثال'
            : 'Browse by category and status — manage HR policies and compliance'
        }
        actionLabel={isRTL ? 'سياسة جديدة' : 'New Policy'}
        actionIcon={Plus}
        onAction={() => navigate(createPageUrl('PolicyEditor'))}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {[
          { label: isRTL ? 'إجمالي' : 'Total', value: stats.total, className: 'text-najdi-700' },
          { label: isRTL ? 'مسودات' : 'Drafts', value: stats.draft, className: 'text-yellow-600' },
          { label: isRTL ? 'منشورة' : 'Published', value: stats.published, className: 'text-emerald-600' },
          { label: isRTL ? 'قيد المراجعة' : 'Pending', value: stats.pending, className: 'text-orange-600' },
          { label: isRTL ? 'إلزامية' : 'Mandatory', value: stats.mandatory, className: 'text-ink' },
        ].map((s) => (
          <Card key={s.label} className="p-3 border-border/80">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className={cn('text-2xl font-bold', s.className)}>{s.value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-3 space-y-3 border-border/80">
        {/* Search + status select — pattern adapted from 21st search-with-category / notifications-filter */}
        <div className="flex flex-col md:flex-row gap-2">
          <div className="flex-1 relative">
            <Search
              className={cn(
                'absolute top-2.5 w-4 h-4 text-muted-foreground',
                isRTL ? 'right-3' : 'left-3',
              )}
            />
            <Input
              placeholder={isRTL ? 'ابحث بالعنوان أو الرمز أو الفئة...' : 'Search title, code, or category...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={cn('text-sm h-9', isRTL ? 'pr-10' : 'pl-10')}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-44 h-9 text-sm">
              <Filter className="w-3.5 h-3.5 me-1.5 text-muted-foreground" />
              <SelectValue placeholder={isRTL ? 'الحالة' : 'Status'} />
            </SelectTrigger>
            <SelectContent>
              {statusChips.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.label}
                  {s.key !== 'all' ? ` (${statusCounts[s.key] || 0})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="h-9 text-sm"
            disabled={missingTemplates.length === 0}
            onClick={handleInitializeTemplates}
            title={
              missingTemplates.length === 0
                ? (isRTL ? 'الحزمة مكتملة' : 'Pack already complete')
                : undefined
            }
          >
            <PackagePlus className="w-3.5 h-3.5 me-2" />
            {policies.length === 0 && pendingTemplates.length === 0
              ? (isRTL ? 'تحميل حزمة السياسات' : 'Initialize policy pack')
              : (isRTL
                ? `مزامنة الناقص (${missingTemplates.length})`
                : `Sync missing (${missingTemplates.length})`)}
          </Button>
          {pendingTemplates.length > 0 && (
            <>
              <Button
                className="h-9 text-sm bg-najdi-700 hover:bg-najdi-900"
                disabled={savingTemplates}
                onClick={handleSaveTemplates}
              >
                {savingTemplates ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin me-2" />
                ) : (
                  <Save className="w-3.5 h-3.5 me-2" />
                )}
                {isRTL
                  ? `حفظ القوالب (${pendingTemplates.length})`
                  : `Save templates (${pendingTemplates.length})`}
              </Button>
              <Button
                variant="ghost"
                className="h-9 text-sm"
                disabled={savingTemplates}
                onClick={handleDiscardPending}
              >
                <X className="w-3.5 h-3.5 me-1" />
                {isRTL ? 'تجاهل' : 'Discard'}
              </Button>
            </>
          )}
        </div>

        {/* Category chips with counts — adapted from 21st notifications-filter category row */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5">
          {categoryChipKeys.map((key) => {
            const label =
              key === 'all'
                ? (isRTL ? 'كل الفئات' : 'All categories')
                : getCategoryLabel(key);
            const count = categoryCounts[key] || 0;
            const active = selectedCategory === key;
            return (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={active ? 'secondary' : 'ghost'}
                className={cn(
                  'h-8 shrink-0 rounded-full border text-xs gap-1.5',
                  active
                    ? 'border-najdi-200 bg-najdi-50 text-najdi-900'
                    : 'border-transparent text-muted-foreground',
                )}
                onClick={() => setSelectedCategory(key)}
              >
                <span>{label}</span>
                <Badge
                  variant="secondary"
                  className={cn(
                    'h-5 min-w-5 px-1.5 text-[10px] font-semibold',
                    active ? 'bg-white text-najdi-900' : 'bg-muted',
                  )}
                >
                  {count}
                </Badge>
              </Button>
            );
          })}
        </div>

        {/* Status chip row */}
        <div className="flex flex-wrap gap-1.5">
          {statusChips.map((s) => {
            const active = statusFilter === s.key;
            const count = statusCounts[s.key] ?? 0;
            if (s.key !== 'all' && count === 0) return null;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setStatusFilter(s.key)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs border transition-colors',
                  active
                    ? 'bg-ink text-white border-ink'
                    : 'bg-background text-muted-foreground border-border hover:bg-muted/60',
                )}
              >
                {s.label}
                <span className={cn('tabular-nums', active ? 'opacity-80' : '')}>{count}</span>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          {isRTL
            ? `${filteredPolicies.length} من ${policies.length} سياسة · معلّق: ${pendingTemplates.length} · الحزمة: ${packTemplates.length} · الناقص: ${missingTemplates.length}`
            : `${filteredPolicies.length} of ${policies.length} policies · staged: ${pendingTemplates.length} · pack: ${packTemplates.length} · missing: ${missingTemplates.length}`}
        </p>
      </Card>

      {pendingTemplates.length > 0 && (
        <Card className="p-3 border-najdi-200 bg-najdi-50/40">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-najdi-900">
                {isRTL
                  ? `${pendingTemplates.length} قالب جاهز للحفظ`
                  : `${pendingTemplates.length} templates ready to save`}
              </p>
              <p className="text-xs text-muted-foreground">
                {isRTL
                  ? 'راجع القوالب أدناه ثم احفظها لإضافتها إلى المكتبة كمسودات'
                  : 'Review the staged templates below, then save to add them to the library as drafts'}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                variant="outline"
                className="h-9"
                disabled={savingTemplates}
                onClick={handleDiscardPending}
              >
                <X className="w-3.5 h-3.5 me-1.5" />
                {isRTL ? 'تجاهل' : 'Discard'}
              </Button>
              <Button
                className="h-9 bg-najdi-700 hover:bg-najdi-900"
                disabled={savingTemplates}
                onClick={handleSaveTemplates}
              >
                {savingTemplates ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin me-2" />
                ) : (
                  <Save className="w-3.5 h-3.5 me-2" />
                )}
                {isRTL ? 'حفظ القوالب' : 'Save templates'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredPolicies.length === 0 && pendingTemplates.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            {policies.length === 0
              ? (isRTL
                ? 'لا توجد سياسات. حمّل حزمة الولاية القضائية ثم احفظ القوالب.'
                : 'No policies yet. Initialize the jurisdiction pack, then save the templates.')
              : (isRTL ? 'لا نتائج لهذا التصفية' : 'No policies match these filters')}
          </p>
          {policies.length === 0 && (
            <Button
              onClick={handleInitializeTemplates}
              disabled={missingTemplates.length === 0}
              className="bg-najdi-700 hover:bg-najdi-900"
            >
              <PackagePlus className="w-4 h-4 me-2" />
              {isRTL ? 'تحميل حزمة السياسات' : 'Initialize policy pack'}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {filteredPending.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2 px-0.5">
                <h2 className="text-sm font-semibold text-najdi-900">
                  {isRTL ? 'قوالب معلّقة — غير محفوظة' : 'Staged templates — unsaved'}
                </h2>
                <Badge className="text-[10px] h-5 bg-najdi-100 text-najdi-900 border-najdi-200">
                  {filteredPending.length}
                </Badge>
              </div>
              {groupedPending.map(({ category, policies: rows }) => (
                <div key={`pending-${category}`} className="space-y-2">
                  <p className="text-xs text-muted-foreground px-0.5">
                    {getCategoryLabel(category) || category}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {rows.map((policy) => (
                      <PolicyLibraryCard
                        key={policy.id}
                        policy={policy}
                        isRTL={isRTL}
                        categoryLabel={getCategoryLabel(policy.category)}
                        deleting={false}
                        downloading={false}
                        onView={() =>
                          toast.info(
                            isRTL
                              ? 'احفظ القوالب أولاً ثم يمكنك العرض'
                              : 'Save templates first to view',
                          )
                        }
                        onEdit={() =>
                          toast.info(
                            isRTL
                              ? 'احفظ القوالب أولاً ثم يمكنك التعديل'
                              : 'Save templates first to edit',
                          )
                        }
                        onCompare={() =>
                          toast.info(
                            isRTL
                              ? 'احفظ القوالب أولاً'
                              : 'Save templates first',
                          )
                        }
                        onDownload={() => handleDownload(policy)}
                        onDelete={() =>
                          setPendingTemplates((prev) =>
                            prev.filter((p) => p.id !== policy.id),
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          {grouped.map(({ category, policies: rows }) => (
            <section key={category} className="space-y-2">
              <div className="flex items-center gap-2 px-0.5">
                <h2 className="text-sm font-semibold text-ink">
                  {getCategoryLabel(category) || category}
                </h2>
                <Badge variant="outline" className="text-[10px] h-5">
                  {rows.length}
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {rows.map((policy) => (
                  <PolicyLibraryCard
                    key={policy.id}
                    policy={policy}
                    isRTL={isRTL}
                    categoryLabel={getCategoryLabel(policy.category)}
                    deleting={deletingId === policy.id}
                    downloading={downloadingId === policy.id}
                    onView={() =>
                      navigate(createPageUrl('PolicyEditor') + `?id=${policy.id}&mode=view`)
                    }
                    onEdit={() =>
                      navigate(createPageUrl('PolicyEditor') + `?id=${policy.id}&mode=edit`)
                    }
                    onCompare={() =>
                      navigate(createPageUrl('PolicyEditor') + `?id=${policy.id}&mode=compare`)
                    }
                    onDownload={() => handleDownload(policy)}
                    onDelete={() => handleDelete(policy)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
