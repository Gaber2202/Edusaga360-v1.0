import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import DataTable from '../components/ui/DataTable';
import { 
  FileText, Plus, Search, Eye, Edit, Trash2, Send,
  CheckCircle, Clock, Globe, Users
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function CMS() {
  const { isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showNewContent, setShowNewContent] = useState(false);
  const [editingContent, setEditingContent] = useState(null);
  
  const { data: contents = [], isLoading } = useQuery({
    queryKey: ['cmsContent', tenantId],
    queryFn: () => fetchData(tenantQuery('cms_contents').select('*').match(tenantFilter()).order('created_at', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => supabase.auth.getUser().then(r => r.data?.user)
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => tenantQuery('cms_contents').delete().eq('id', id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cmsContent'] });
      toast.success(isRTL ? 'تم الحذف' : 'Deleted successfully');
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) => tenantQuery('cms_contents').update({ 
      status,
      ...(status === 'published' && { publish_date: new Date().toISOString() })
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cmsContent'] });
      toast.success(isRTL ? 'تم التحديث' : 'Updated successfully');
    }
  });

  const filteredContent = contents.filter(content => {
    const matchesSearch = !searchTerm || 
      content.title_ar?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      content.title_en?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || content.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const contentColumns = [
    { key: 'content_type', label: isRTL ? 'النوع' : 'Type', render: (_, row) => (
      <Badge variant="outline">{row.content_type}</Badge>
    )},
    { key: 'title_ar', label: isRTL ? 'العنوان' : 'Title' },
    { key: 'category', label: isRTL ? 'الفئة' : 'Category' },
    { key: 'target_audience', label: isRTL ? 'الجمهور' : 'Audience', render: (_, row) => {
      const icons = { all: Globe, parents: Users, employees: Users };
      const Icon = icons[row.target_audience] || Globe;
      return <span className="flex items-center gap-1"><Icon className="h-4 w-4" />{row.target_audience}</span>;
    }},
    { key: 'status', label: isRTL ? 'الحالة' : 'Status', render: (_, row) => {
      const colors = { 
        draft: 'bg-gray-100', 
        pending_review: 'bg-yellow-100',
        approved: 'bg-blue-100',
        published: 'bg-green-100',
        archived: 'bg-red-100'
      };
      return <Badge className={colors[row.status]}>{row.status}</Badge>;
    }},
    { key: 'author', label: isRTL ? 'الكاتب' : 'Author' },
    { key: 'publish_date', label: isRTL ? 'تاريخ النشر' : 'Published', render: (val) => val ? format(new Date(val), 'yyyy-MM-dd') : '-' },
    { key: 'view_count', label: isRTL ? 'المشاهدات' : 'Views' },
    { key: 'actions', label: '', render: (_, row) => (
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" onClick={() => setEditingContent(row)}>
          <Edit className="h-4 w-4" />
        </Button>
        {row.status === 'draft' && (
          <Button variant="ghost" size="sm" onClick={() => updateStatusMutation.mutate({ id: row.id, status: 'pending_review' })}>
            <Send className="h-4 w-4" />
          </Button>
        )}
        {row.status === 'approved' && (
          <Button variant="ghost" size="sm" onClick={() => updateStatusMutation.mutate({ id: row.id, status: 'published' })}>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(row.id)}>
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
      </div>
    )}
  ];

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-sm text-gray-500">{isRTL ? 'إجمالي المحتوى' : 'Total Content'}</p>
                <p className="text-2xl font-bold">{contents.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-sm text-gray-500">{isRTL ? 'منشور' : 'Published'}</p>
                <p className="text-2xl font-bold">{contents.filter(c => c.status === 'published').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-sm text-gray-500">{isRTL ? 'قيد المراجعة' : 'Pending Review'}</p>
                <p className="text-2xl font-bold">{contents.filter(c => c.status === 'pending_review').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Eye className="h-8 w-8 text-purple-500" />
              <div>
                <p className="text-sm text-gray-500">{isRTL ? 'إجمالي المشاهدات' : 'Total Views'}</p>
                <p className="text-2xl font-bold">{contents.reduce((sum, c) => sum + (c.view_count || 0), 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>{isRTL ? 'إدارة المحتوى' : 'Content Management'}</CardTitle>
            <ContentDialog 
              open={showNewContent || !!editingContent} 
              onOpenChange={(open) => {
                setShowNewContent(open);
                if (!open) setEditingContent(null);
              }}
              content={editingContent}
              user={user}
              isRTL={isRTL}
            />
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={isRTL ? 'بحث...' : 'Search...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={isRTL ? 'الحالة' : 'Status'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isRTL ? 'الكل' : 'All'}</SelectItem>
                <SelectItem value="draft">{isRTL ? 'مسودة' : 'Draft'}</SelectItem>
                <SelectItem value="pending_review">{isRTL ? 'قيد المراجعة' : 'Pending Review'}</SelectItem>
                <SelectItem value="approved">{isRTL ? 'معتمد' : 'Approved'}</SelectItem>
                <SelectItem value="published">{isRTL ? 'منشور' : 'Published'}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DataTable
            columns={contentColumns}
            data={filteredContent}
            isLoading={isLoading}
            emptyMessage={isRTL ? 'لا يوجد محتوى' : 'No content found'}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ContentDialog({ open, onOpenChange, content, user, isRTL }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState(content || {
    content_type: 'article',
    title_ar: '',
    title_en: '',
    body_ar: '',
    body_en: '',
    category: '',
    target_audience: 'all',
    status: 'draft',
    is_featured: false
  });

  React.useEffect(() => {
    if (content) {
      setFormData(content);
    } else {
      setFormData({
        content_type: 'article',
        title_ar: '',
        title_en: '',
        body_ar: '',
        body_en: '',
        category: '',
        target_audience: 'all',
        status: 'draft',
        is_featured: false
      });
    }
  }, [content]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (content?.id) {
        return tenantQuery('cms_contents').update(data);
      }
      return tenantQuery('cms_contents').insert({
        ...data,
        author: user?.full_name || user?.email
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cmsContent'] });
      toast.success(isRTL ? 'تم الحفظ' : 'Saved successfully');
      onOpenChange(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-2" />{isRTL ? 'محتوى جديد' : 'New Content'}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{content ? (isRTL ? 'تعديل المحتوى' : 'Edit Content') : (isRTL ? 'إنشاء محتوى جديد' : 'Create New Content')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{isRTL ? 'النوع' : 'Type'}</Label>
              <Select value={formData.content_type} onValueChange={(v) => setFormData({ ...formData, content_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="page">{isRTL ? 'صفحة' : 'Page'}</SelectItem>
                  <SelectItem value="article">{isRTL ? 'مقال' : 'Article'}</SelectItem>
                  <SelectItem value="announcement">{isRTL ? 'إعلان' : 'Announcement'}</SelectItem>
                  <SelectItem value="faq">{isRTL ? 'سؤال شائع' : 'FAQ'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isRTL ? 'الجمهور المستهدف' : 'Target Audience'}</Label>
              <Select value={formData.target_audience} onValueChange={(v) => setFormData({ ...formData, target_audience: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isRTL ? 'الجميع' : 'All'}</SelectItem>
                  <SelectItem value="parents">{isRTL ? 'أولياء الأمور' : 'Parents'}</SelectItem>
                  <SelectItem value="employees">{isRTL ? 'الموظفين' : 'Employees'}</SelectItem>
                  <SelectItem value="students">{isRTL ? 'الطلاب' : 'Students'}</SelectItem>
                  <SelectItem value="public">{isRTL ? 'عام' : 'Public'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{isRTL ? 'العنوان بالعربي' : 'Title (Arabic)'}</Label>
              <Input value={formData.title_ar} onChange={(e) => setFormData({ ...formData, title_ar: e.target.value })} />
            </div>
            <div>
              <Label>{isRTL ? 'العنوان بالإنجليزي' : 'Title (English)'}</Label>
              <Input value={formData.title_en} onChange={(e) => setFormData({ ...formData, title_en: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>{isRTL ? 'الفئة' : 'Category'}</Label>
            <Input value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} />
          </div>
          <div>
            <Label>{isRTL ? 'المحتوى بالعربي' : 'Body (Arabic)'}</Label>
            <Textarea value={formData.body_ar} onChange={(e) => setFormData({ ...formData, body_ar: e.target.value })} rows={6} />
          </div>
          <div>
            <Label>{isRTL ? 'المحتوى بالإنجليزي' : 'Body (English)'}</Label>
            <Textarea value={formData.body_en} onChange={(e) => setFormData({ ...formData, body_en: e.target.value })} rows={6} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={() => saveMutation.mutate(formData)} disabled={!formData.title_ar || !formData.body_ar}>
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}