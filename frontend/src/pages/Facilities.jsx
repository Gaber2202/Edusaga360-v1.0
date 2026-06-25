import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import DataTable from '../components/ui/DataTable';
import StatCard from '../components/ui/StatCard';
import { 
  Building, Wrench, Plus, Search, Package, AlertTriangle,
  CheckCircle, Clock, Thermometer, Zap, Droplets, Settings
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function Facilities() {
  const { t: _t, isRTL } = useLanguage();
  const { selectedBranch: _selectedBranch, selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate: _getTenantIdForCreate } = useTenantFilter();
  
  const [activeTab, setActiveTab] = useState('workorders');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showNewWorkOrder, setShowNewWorkOrder] = useState(false);
  const [showNewAsset, setShowNewAsset] = useState(false);
  
  const { data: workOrders = [], isLoading: workOrdersLoading } = useQuery({
    queryKey: ['workOrders', tenantId, selectedBranchId],
    queryFn: async () => {
      const { data = [], error } = await tenantQuery('work_orders').select('*').match(tenantFilter(branchFilter())).order('created_at', { ascending: false });
      if (error) throw error;
      return filterByBranch(data);
    },
    enabled: hasTenantAccess,
  });

  const { data: facilityAssets = [], isLoading: assetsLoading } = useQuery({
    queryKey: ['facilityAssets', tenantId, selectedBranchId],
    queryFn: async () => {
      const { data = [], error } = await tenantQuery('facility_assets').select('*').match(tenantFilter(branchFilter())).order('created_at', { ascending: false });
      if (error) throw error;
      return filterByBranch(data);
    },
    enabled: hasTenantAccess,
  });

  const { data: spareParts = [], isLoading: partsLoading } = useQuery({
    queryKey: ['spareParts', tenantId, selectedBranchId],
    queryFn: async () => {
      const { data = [], error } = await tenantQuery('spare_parts').select('*').match(tenantFilter(branchFilter())).order('created_at', { ascending: false });
      if (error) throw error;
      return filterByBranch(data);
    },
    enabled: hasTenantAccess,
  });

  const { data: contractors = [] } = useQuery({
    queryKey: ['contractors', tenantId],
    queryFn: () => fetchData(tenantQuery('contractors').select('*').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchData(tenantQuery('branches').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  // Stats
  const openWorkOrders = workOrders.filter(w => w.status === 'pending' || w.status === 'scheduled').length;
  const inProgressWorkOrders = workOrders.filter(w => w.status === 'in_progress').length;
  const completedThisMonth = workOrders.filter(w => 
    w.status === 'completed' && 
    w.completed_date &&
    new Date(w.completed_date).getMonth() === new Date().getMonth()
  ).length;
  const lowStockParts = spareParts.filter(p => p.quantity_on_hand <= p.reorder_level).length;

  const filteredWorkOrders = workOrders.filter(wo => {
    const matchesSearch = !searchTerm || 
      wo.work_order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wo.asset_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || wo.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredAssets = facilityAssets.filter(asset => {
    return !searchTerm || 
      asset.asset_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.asset_name_ar?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const workOrderColumns = [
    { key: 'work_order_number', label: isRTL ? 'رقم الأمر' : 'WO #' },
    { key: 'work_order_type', label: isRTL ? 'النوع' : 'Type', render: (_, row) => {
      const colors = { preventive: 'bg-blue-100', corrective: 'bg-yellow-100', emergency: 'bg-red-100' };
      return <Badge className={colors[row.work_order_type]}>{row.work_order_type}</Badge>;
    }},
    { key: 'asset_name', label: isRTL ? 'الأصل' : 'Asset' },
    { key: 'location', label: isRTL ? 'الموقع' : 'Location' },
    { key: 'priority', label: isRTL ? 'الأولوية' : 'Priority', render: (_, row) => {
      const colors = { low: 'bg-gray-100', medium: 'bg-blue-100', high: 'bg-orange-100', critical: 'bg-red-100' };
      return <Badge className={colors[row.priority]}>{row.priority}</Badge>;
    }},
    { key: 'status', label: isRTL ? 'الحالة' : 'Status', render: (_, row) => {
      const colors = { 
        pending: 'bg-gray-100', 
        scheduled: 'bg-blue-100',
        in_progress: 'bg-yellow-100',
        completed: 'bg-green-100',
        on_hold: 'bg-purple-100'
      };
      return <Badge className={colors[row.status] || 'bg-gray-100'}>{row.status}</Badge>;
    }},
    { key: 'scheduled_date', label: isRTL ? 'الموعد' : 'Scheduled', render: (val) => val ? format(new Date(val), 'yyyy-MM-dd') : '-' },
    { key: 'total_cost', label: isRTL ? 'التكلفة' : 'Cost', render: (val) => val ? `${val.toLocaleString()} SAR` : '-' }
  ];

  const assetColumns = [
    { key: 'asset_code', label: isRTL ? 'الرمز' : 'Code' },
    { key: 'asset_name_ar', label: isRTL ? 'الاسم' : 'Name' },
    { key: 'asset_category', label: isRTL ? 'الفئة' : 'Category', render: (_, row) => {
      const icons = { hvac: Thermometer, electrical: Zap, plumbing: Droplets, building: Building };
      const Icon = icons[row.asset_category] || Settings;
      return <span className="flex items-center gap-1"><Icon className="h-4 w-4" />{row.asset_category}</span>;
    }},
    { key: 'location', label: isRTL ? 'الموقع' : 'Location' },
    { key: 'condition', label: isRTL ? 'الحالة' : 'Condition', render: (_, row) => {
      const colors = { excellent: 'bg-green-100', good: 'bg-blue-100', fair: 'bg-yellow-100', poor: 'bg-orange-100', critical: 'bg-red-100' };
      return <Badge className={colors[row.condition]}>{row.condition}</Badge>;
    }},
    { key: 'status', label: isRTL ? 'التشغيل' : 'Status', render: (_, row) => {
      const colors = { operational: 'bg-green-100', under_maintenance: 'bg-yellow-100', out_of_service: 'bg-red-100' };
      return <Badge className={colors[row.status]}>{row.status}</Badge>;
    }},
    { key: 'next_maintenance_date', label: isRTL ? 'الصيانة القادمة' : 'Next Maintenance', render: (val) => val ? format(new Date(val), 'yyyy-MM-dd') : '-' }
  ];

  const sparePartColumns = [
    { key: 'part_code', label: isRTL ? 'الرمز' : 'Code' },
    { key: 'part_name_ar', label: isRTL ? 'الاسم' : 'Name' },
    { key: 'category', label: isRTL ? 'الفئة' : 'Category' },
    { key: 'quantity_on_hand', label: isRTL ? 'الكمية' : 'Qty', render: (val, row) => {
      const isLow = val <= row.reorder_level;
      return <span className={isLow ? 'text-red-600 font-bold' : ''}>{val}</span>;
    }},
    { key: 'reorder_level', label: isRTL ? 'حد الطلب' : 'Reorder Level' },
    { key: 'unit_cost', label: isRTL ? 'السعر' : 'Unit Cost', render: (val) => val ? `${val} SAR` : '-' }
  ];

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={isRTL ? 'أوامر عمل معلقة' : 'Pending Work Orders'}
          value={openWorkOrders}
          icon={Wrench}
          iconClassName="bg-blue-50"
        />
        <StatCard
          title={isRTL ? 'قيد التنفيذ' : 'In Progress'}
          value={inProgressWorkOrders}
          icon={Clock}
          iconClassName="bg-yellow-50"
        />
        <StatCard
          title={isRTL ? 'مكتمل هذا الشهر' : 'Completed This Month'}
          value={completedThisMonth}
          icon={CheckCircle}
          iconClassName="bg-green-50"
        />
        <StatCard
          title={isRTL ? 'قطع منخفضة المخزون' : 'Low Stock Parts'}
          value={lowStockParts}
          icon={AlertTriangle}
          iconClassName="bg-red-50"
        />
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>{isRTL ? 'إدارة المرافق والصيانة' : 'Facilities & Maintenance'}</CardTitle>
            <div className="flex gap-2">
              <WorkOrderDialog 
                open={showNewWorkOrder} 
                onOpenChange={setShowNewWorkOrder}
                branches={branches}
                facilityAssets={facilityAssets}
                contractors={contractors}
                isRTL={isRTL}
              />
              <FacilityAssetDialog
                open={showNewAsset}
                onOpenChange={setShowNewAsset}
                branches={branches}
                isRTL={isRTL}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="workorders">
                <Wrench className="h-4 w-4 mr-2" />
                {isRTL ? 'أوامر العمل' : 'Work Orders'}
              </TabsTrigger>
              <TabsTrigger value="assets">
                <Building className="h-4 w-4 mr-2" />
                {isRTL ? 'الأصول' : 'Assets'}
              </TabsTrigger>
              <TabsTrigger value="parts">
                <Package className="h-4 w-4 mr-2" />
                {isRTL ? 'قطع الغيار' : 'Spare Parts'}
              </TabsTrigger>
            </TabsList>

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
              {activeTab === 'workorders' && (
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder={isRTL ? 'الحالة' : 'Status'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{isRTL ? 'الكل' : 'All'}</SelectItem>
                    <SelectItem value="pending">{isRTL ? 'معلق' : 'Pending'}</SelectItem>
                    <SelectItem value="scheduled">{isRTL ? 'مجدول' : 'Scheduled'}</SelectItem>
                    <SelectItem value="in_progress">{isRTL ? 'قيد التنفيذ' : 'In Progress'}</SelectItem>
                    <SelectItem value="completed">{isRTL ? 'مكتمل' : 'Completed'}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <TabsContent value="workorders">
              <DataTable
                columns={workOrderColumns}
                data={filteredWorkOrders}
                isLoading={workOrdersLoading}
                emptyMessage={isRTL ? 'لا توجد أوامر عمل' : 'No work orders found'}
              />
            </TabsContent>

            <TabsContent value="assets">
              <DataTable
                columns={assetColumns}
                data={filteredAssets}
                isLoading={assetsLoading}
                emptyMessage={isRTL ? 'لا توجد أصول' : 'No assets found'}
              />
            </TabsContent>

            <TabsContent value="parts">
              <DataTable
                columns={sparePartColumns}
                data={spareParts}
                isLoading={partsLoading}
                emptyMessage={isRTL ? 'لا توجد قطع غيار' : 'No spare parts found'}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function WorkOrderDialog({ open, onOpenChange, branches, facilityAssets, contractors: _contractors, isRTL }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    work_order_type: 'corrective',
    facility_asset_id: '',
    branch_id: '',
    location: '',
    problem_description: '',
    priority: 'medium',
    scheduled_date: ''
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const woNumber = `WO-${Date.now().toString().slice(-6)}`;
      const asset = facilityAssets.find(a => a.id === data.facility_asset_id);
      return tenantQuery('work_orders').insert({
        ...data,
        work_order_number: woNumber,
        asset_name: asset?.asset_name_ar || '',
        reported_date: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workOrders'] });
      toast.success(isRTL ? 'تم إنشاء أمر العمل' : 'Work order created');
      onOpenChange(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-2" />{isRTL ? 'أمر عمل جديد' : 'New Work Order'}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isRTL ? 'إنشاء أمر عمل' : 'Create Work Order'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{isRTL ? 'النوع' : 'Type'}</Label>
              <Select value={formData.work_order_type} onValueChange={(v) => setFormData({ ...formData, work_order_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="preventive">{isRTL ? 'وقائية' : 'Preventive'}</SelectItem>
                  <SelectItem value="corrective">{isRTL ? 'تصحيحية' : 'Corrective'}</SelectItem>
                  <SelectItem value="emergency">{isRTL ? 'طارئة' : 'Emergency'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isRTL ? 'الأولوية' : 'Priority'}</Label>
              <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{isRTL ? 'منخفضة' : 'Low'}</SelectItem>
                  <SelectItem value="medium">{isRTL ? 'متوسطة' : 'Medium'}</SelectItem>
                  <SelectItem value="high">{isRTL ? 'عالية' : 'High'}</SelectItem>
                  <SelectItem value="critical">{isRTL ? 'حرجة' : 'Critical'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{isRTL ? 'الفرع' : 'Branch'}</Label>
              <Select value={formData.branch_id} onValueChange={(v) => setFormData({ ...formData, branch_id: v })}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                <SelectContent>
                  {branches.map(b => <SelectItem key={b.id} value={b.id}>{isRTL ? b.name_ar : b.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isRTL ? 'الأصل' : 'Asset'}</Label>
              <Select value={formData.facility_asset_id} onValueChange={(v) => setFormData({ ...formData, facility_asset_id: v })}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                <SelectContent>
                  {facilityAssets.filter(a => !formData.branch_id || a.branch_id === formData.branch_id).map(a => 
                    <SelectItem key={a.id} value={a.id}>{a.asset_name_ar}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>{isRTL ? 'الموقع' : 'Location'}</Label>
            <Input value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} />
          </div>
          <div>
            <Label>{isRTL ? 'وصف المشكلة' : 'Problem Description'}</Label>
            <Textarea value={formData.problem_description} onChange={(e) => setFormData({ ...formData, problem_description: e.target.value })} rows={3} />
          </div>
          <div>
            <Label>{isRTL ? 'تاريخ الجدولة' : 'Scheduled Date'}</Label>
            <Input type="date" value={formData.scheduled_date} onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={() => createMutation.mutate(formData)} disabled={!formData.branch_id || !formData.problem_description}>
              {isRTL ? 'إنشاء' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FacilityAssetDialog({ open, onOpenChange, branches, isRTL }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    asset_code: '',
    asset_name_ar: '',
    asset_name_en: '',
    asset_category: 'hvac',
    branch_id: '',
    location: '',
    condition: 'good',
    status: 'operational'
  });

  const createMutation = useMutation({
    mutationFn: (data) => tenantQuery('facility_assets').insert(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilityAssets'] });
      toast.success(isRTL ? 'تم إضافة الأصل' : 'Asset added');
      onOpenChange(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline"><Building className="h-4 w-4 mr-2" />{isRTL ? 'أصل جديد' : 'New Asset'}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isRTL ? 'إضافة أصل مرفق' : 'Add Facility Asset'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{isRTL ? 'الرمز' : 'Code'}</Label>
              <Input value={formData.asset_code} onChange={(e) => setFormData({ ...formData, asset_code: e.target.value })} />
            </div>
            <div>
              <Label>{isRTL ? 'الفئة' : 'Category'}</Label>
              <Select value={formData.asset_category} onValueChange={(v) => setFormData({ ...formData, asset_category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="building">{isRTL ? 'مبنى' : 'Building'}</SelectItem>
                  <SelectItem value="classroom">{isRTL ? 'فصل دراسي' : 'Classroom'}</SelectItem>
                  <SelectItem value="hvac">{isRTL ? 'تكييف' : 'HVAC'}</SelectItem>
                  <SelectItem value="electrical">{isRTL ? 'كهرباء' : 'Electrical'}</SelectItem>
                  <SelectItem value="plumbing">{isRTL ? 'سباكة' : 'Plumbing'}</SelectItem>
                  <SelectItem value="generator">{isRTL ? 'مولد' : 'Generator'}</SelectItem>
                  <SelectItem value="elevator">{isRTL ? 'مصعد' : 'Elevator'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{isRTL ? 'الاسم بالعربي' : 'Name (Arabic)'}</Label>
              <Input value={formData.asset_name_ar} onChange={(e) => setFormData({ ...formData, asset_name_ar: e.target.value })} />
            </div>
            <div>
              <Label>{isRTL ? 'الاسم بالإنجليزي' : 'Name (English)'}</Label>
              <Input value={formData.asset_name_en} onChange={(e) => setFormData({ ...formData, asset_name_en: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{isRTL ? 'الفرع' : 'Branch'}</Label>
              <Select value={formData.branch_id} onValueChange={(v) => setFormData({ ...formData, branch_id: v })}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                <SelectContent>
                  {branches.map(b => <SelectItem key={b.id} value={b.id}>{isRTL ? b.name_ar : b.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isRTL ? 'الموقع' : 'Location'}</Label>
              <Input value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={() => createMutation.mutate(formData)} disabled={!formData.asset_code || !formData.asset_name_ar || !formData.branch_id}>
              {isRTL ? 'إضافة' : 'Add'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}