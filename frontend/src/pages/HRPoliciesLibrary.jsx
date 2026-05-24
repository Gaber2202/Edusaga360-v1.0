import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery } from '../api/supabaseClient';
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
import { Plus, Search, FileText, Eye, Edit2, Loader2, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { POLICY_CATEGORIES, POLICY_TEMPLATES } from '../components/policies/policyTemplates';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function HRPoliciesLibrary() {
  const { t: _t, isRTL, language: _language } = useLanguage();
  const { selectedBranchId } = useBranch();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, _setViewMode] = useState('grid');
  const [initializing, setInitializing] = useState(false);

  const { data: policies = [], isLoading: _isLoading } = useQuery({
    queryKey: ['hrPolicies', tenantId, selectedBranchId],
    queryFn: () => {
      const filter = tenantFilter();
      if (selectedBranchId) filter.branch_id = selectedBranchId;
      return tenantQuery('hr_policys').select('*').match(filter);
    },
    enabled: hasTenantAccess,
  });

  const getCategoryLabel = (categoryKey) => {
    return isRTL ? POLICY_CATEGORIES[categoryKey]?.ar : POLICY_CATEGORIES[categoryKey]?.en;
  };

  const filteredPolicies = policies.filter(policy => {
    const matchesSearch = isRTL 
      ? policy.title_ar?.toLowerCase().includes(searchTerm.toLowerCase())
      : policy.title_en?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = selectedCategory === 'all' || policy.category === selectedCategory;
    const matchesStatus = statusFilter === 'all' || policy.status === statusFilter;
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const stats = {
    total: policies.length,
    draft: policies.filter(p => p.status === 'draft').length,
    published: policies.filter(p => p.status === 'published').length,
    pending: policies.filter(p => p.status === 'under_review').length
  };

  const handleInitializeTemplates = async () => {
    setInitializing(true);
    try {
      const tenantIdForCreate = getTenantIdForCreate();
      const templatesToCreate = POLICY_TEMPLATES.map((template, idx) => ({
        ...template,
        policy_code: `POL-${Date.now().toString(36).toUpperCase()}-${idx}`,
        tenant_id: tenantIdForCreate,
        branch_id: selectedBranchId,
        is_template: true,
        status: 'published',
        current_version: 'v1.0',
        owner_id: 'system',
        owner_name: 'System'
      }));

      // Use sequential create() — the tenant proxy injects tenant_id on .create
      // but does NOT wrap .bulkCreate, so records would be saved un-scoped.
      for (const tpl of templatesToCreate) {
        await tenantQuery('hr_policys').insert(tpl);
      }
      queryClient.invalidateQueries({ queryKey: ['hrPolicies'] });
      toast.success(isRTL ? 'تم تحميل المكتبة' : 'Templates loaded successfully');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'خطأ في التحميل' : 'Error loading templates');
    } finally {
      setInitializing(false);
    }
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

      {/* Dashboard Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card className="p-3 bg-gradient-to-br from-blue-50 to-blue-100">
          <p className="text-xs text-slate-600 mb-1">{isRTL ? 'إجمالي' : 'Total'}</p>
          <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
        </Card>
        <Card className="p-3 bg-gradient-to-br from-yellow-50 to-yellow-100">
          <p className="text-xs text-slate-600 mb-1">{isRTL ? 'مسودات' : 'Drafts'}</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.draft}</p>
        </Card>
        <Card className="p-3 bg-gradient-to-br from-emerald-50 to-emerald-100">
          <p className="text-xs text-slate-600 mb-1">{isRTL ? 'منشورة' : 'Published'}</p>
          <p className="text-2xl font-bold text-emerald-600">{stats.published}</p>
        </Card>
        <Card className="p-3 bg-gradient-to-br from-orange-50 to-orange-100">
          <p className="text-xs text-slate-600 mb-1">{isRTL ? 'قيد المراجعة' : 'Pending'}</p>
          <p className="text-2xl font-bold text-orange-600">{stats.pending}</p>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card className="p-3 space-y-3">
        <div className="flex flex-col md:flex-row gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
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
              {Object.entries(POLICY_CATEGORIES).map(([key, value]) => (
                <SelectItem key={key} value={key} className="text-sm">
                  {isRTL ? value.ar : value.en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 h-8 text-sm">
              <SelectValue placeholder={isRTL ? 'الحالة' : 'Status'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isRTL ? 'جميع' : 'All'}</SelectItem>
              <SelectItem value="draft">{isRTL ? 'مسودة' : 'Draft'}</SelectItem>
              <SelectItem value="under_review">{isRTL ? 'قيد المراجعة' : 'Review'}</SelectItem>
              <SelectItem value="approved">{isRTL ? 'معتمدة' : 'Approved'}</SelectItem>
              <SelectItem value="published">{isRTL ? 'منشورة' : 'Published'}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {policies.length === 0 && (
          <div className="text-center py-4">
            <Button onClick={handleInitializeTemplates} disabled={initializing} className="bg-blue-600 hover:bg-blue-700 h-8 text-sm">
              {initializing && <Loader2 className="w-3 h-3 animate-spin me-2" />}
              {isRTL ? 'تحميل' : 'Initialize'}
            </Button>
          </div>
        )}
      </Card>

      {/* Policies Grid */}
      <div className={`grid ${viewMode === 'list' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6'} gap-2`}>
        {filteredPolicies.map(policy => (
          <Card key={policy.id} className="p-2 hover:shadow-md transition-all flex flex-col h-full">
            <div className="space-y-1.5 flex-1 flex flex-col">
              <div className="flex items-start justify-between gap-1">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-xs line-clamp-2 leading-tight">
                    {isRTL ? policy.title_ar : policy.title_en}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                    {getCategoryLabel(policy.category)}
                  </p>
                </div>
              </div>

              <div className="flex gap-1 flex-wrap">
                <Badge className={`text-xs py-0 h-5 ${
                  policy.status === 'published' ? 'bg-emerald-100 text-emerald-800' :
                  policy.status === 'under_review' ? 'bg-orange-100 text-orange-800' :
                  'bg-slate-100 text-slate-800'
                }`}>
                  {policy.status === 'published' ? 'Pub' :
                   policy.status === 'under_review' ? 'Rev' :
                   'Draft'}
                </Badge>
                {policy.is_template && <Badge variant="secondary" className="text-xs py-0 h-5">Tmpl</Badge>}
              </div>

              <div className="flex gap-0.5 mt-auto pt-1.5">
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-6 w-6 p-0 flex items-center justify-center"
                  onClick={() => navigate(createPageUrl('PolicyEditor') + `?id=${policy.id}&mode=view`)}
                  title={isRTL ? 'عرض' : 'View'}
                >
                  <Eye className="w-3 h-3" />
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-6 w-6 p-0 flex items-center justify-center"
                  onClick={() => {
                    const content = isRTL ? policy.body_ar : policy.body_en;
                    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${policy.policy_code}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  title={isRTL ? 'تحميل' : 'Download'}
                >
                  <FileDown className="w-3 h-3" />
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-6 w-6 p-0 flex items-center justify-center"
                  onClick={() => navigate(createPageUrl('PolicyEditor') + `?id=${policy.id}&mode=edit`)}
                  title={isRTL ? 'تعديل' : 'Edit'}
                >
                  <Edit2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredPolicies.length === 0 && policies.length > 0 && (
        <div className="text-center py-8">
          <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">{isRTL ? 'لا توجد سياسات' : 'No policies found'}</p>
        </div>
      )}
    </div>
  );
}