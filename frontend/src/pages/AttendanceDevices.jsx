import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData, callApi, uploadFileApi } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { 
  Plus, Search, RefreshCw, Wifi, WifiOff, Upload, 
  Download, Loader2, Settings, Clock, Activity
} from 'lucide-react';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function AttendanceDevices() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter, branches } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();

  const [activeTab, setActiveTab] = useState('devices');
  const [showDeviceForm, setShowDeviceForm] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);

  const [deviceForm, setDeviceForm] = useState({
    device_code: '',
    device_name: '',
    branch_id: '',
    device_type: 'biometric',
    serial_number: '',
    ip_address: '',
    location: '',
    timezone: 'Asia/Riyadh',
    integration_method: 'file_upload',
    api_endpoint: '',
    api_key: '',
    is_active: true
  });

  const { data: devices = [], isLoading: loadingDevices } = useQuery({
    queryKey: ['attendanceDevices', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('attendance_devices').select('*').match(tenantFilter(branchFilter())).order('created_at', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const { data: punchLogs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ['punchLogs', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('punch_logs').select('*').match(tenantFilter(branchFilter())).order('punch_time', { ascending: false }).limit(100)),
    enabled: hasTenantAccess,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', tenantId],
    queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const filteredDevices = filterByBranch(devices).filter(d => 
    d.device_name?.toLowerCase().includes(search.toLowerCase()) ||
    d.device_code?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSaveDevice = async () => {
    if (!deviceForm.device_code || !deviceForm.device_name) {
      toast.error(isRTL ? 'يرجى إدخال البيانات المطلوبة' : 'Please fill required fields');
      return;
    }

    setSaving(true);
    try {
      const data = {
        ...deviceForm,
        branch_id: deviceForm.branch_id || selectedBranchId
      };

      if (editingDevice?.id) {
        await tenantQuery('attendance_devices').update(data);
        await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'AttendanceDevice', entityId: editingDevice.id, oldValues: editingDevice, newValues: data });
      } else {
        const created = await tenantQuery('attendance_devices').insert(data);
        await logAuditEvent({ action: AuditActions.CREATE, entityType: 'AttendanceDevice', entityId: created.id, newValues: data });
      }

      queryClient.invalidateQueries({ queryKey: ['attendanceDevices'] });
      setShowDeviceForm(false);
      resetDeviceForm();
      toast.success(isRTL ? 'تم الحفظ بنجاح' : 'Saved successfully');
    } catch (error) {
      console.error(error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncDevice = async (device) => {
    setSyncing(true);
    try {
      // Simulate sync - in real implementation, this would call the device API
      await tenantQuery('attendance_devices').update({
        last_sync_date: new Date().toISOString(),
        last_sync_status: 'success'
      });
      
      await logAuditEvent({ action: 'SYNC', entityType: 'AttendanceDevice', entityId: device.id, newValues: { synced: true } });
      queryClient.invalidateQueries({ queryKey: ['attendanceDevices'] });
      toast.success(isRTL ? 'تمت المزامنة بنجاح' : 'Sync completed');
    } catch (error) {
      await tenantQuery('attendance_devices').update({
        last_sync_status: 'failed',
        sync_error: error.message
      });
      toast.error(isRTL ? 'فشلت المزامنة' : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleFileUpload = async () => {
    if (!uploadFile) {
      toast.error(isRTL ? 'يرجى اختيار ملف' : 'Please select a file');
      return;
    }

    setSaving(true);
    try {
      // Upload and parse file
      const uploadResult = await uploadFileApi(uploadFile);
      const file_url = uploadResult.signedUrl || uploadResult.path;

      // Extract data from CSV
      const result = await callApi('/api/files/extract-data', {
        file_url,
        json_schema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              employee_badge_id: { type: "string" },
              punch_time: { type: "string" },
              punch_type: { type: "string" }
            }
          }
        }
      });

      if (result.status === 'success' && result.output) {
        const syncBatchId = `BATCH-${Date.now().toString(36).toUpperCase()}`;
        const punchData = result.output.map(row => ({
          device_id: 'manual_upload',
          employee_badge_id: row.employee_badge_id,
          punch_time: row.punch_time,
          punch_type: row.punch_type || 'in',
          branch_id: selectedBranchId,
          sync_batch_id: syncBatchId,
          processed: false
        }));

        await supabase.PunchLog.bulkCreate(punchData);
        queryClient.invalidateQueries({ queryKey: ['punchLogs'] });
        toast.success(isRTL ? `تم استيراد ${punchData.length} سجل` : `Imported ${punchData.length} records`);
      } else {
        toast.error(isRTL ? 'فشل تحليل الملف' : 'Failed to parse file');
      }

      setShowUploadDialog(false);
      setUploadFile(null);
    } catch (error) {
      console.error(error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleProcessLogs = async () => {
    setSaving(true);
    try {
      const unprocessedLogs = punchLogs.filter(l => !l.processed);
      let processedCount = 0;

      for (const log of unprocessedLogs) {
        // Find employee by badge ID
        const employee = employees.find(e => e.employee_id === log.employee_badge_id || e.badge_id === log.employee_badge_id);
        
        if (employee) {
          const punchDate = format(new Date(log.punch_time), 'yyyy-MM-dd');
          const punchTime = format(new Date(log.punch_time), 'HH:mm');

          // Check if attendance record exists for this day
          const { data: existingAttendance = [] } = await tenantQuery('employee_attendances').select('*').match({
            employee_id: employee.id,
            date: punchDate
          });

          if (existingAttendance.length > 0) {
            // Update existing record
            const updateData = log.punch_type === 'in' 
              ? { check_in: punchTime }
              : { check_out: punchTime };
            
            await tenantQuery('employee_attendances').update(updateData);
          } else {
            // Create new attendance record
            await tenantQuery('employee_attendances').insert({
              employee_id: employee.id,
              employee_name: employee.name_ar,
              date: punchDate,
              branch_id: log.branch_id || employee.branch_id,
              check_in: log.punch_type === 'in' ? punchTime : null,
              check_out: log.punch_type === 'out' ? punchTime : null,
              status: 'present'
            });
          }

          // Mark log as processed
          await tenantQuery('punch_logs').update({
            processed: true,
            processed_date: new Date().toISOString(),
            employee_id: employee.id,
            employee_name: employee.name_ar
          });

          processedCount++;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['punchLogs'] });
      queryClient.invalidateQueries({ queryKey: ['employeeAttendance'] });
      toast.success(isRTL ? `تمت معالجة ${processedCount} سجل` : `Processed ${processedCount} records`);
    } catch (error) {
      console.error(error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const resetDeviceForm = () => {
    setEditingDevice(null);
    setDeviceForm({
      device_code: '', device_name: '', branch_id: '', device_type: 'biometric',
      serial_number: '', ip_address: '', location: '', timezone: 'Asia/Riyadh',
      integration_method: 'file_upload', api_endpoint: '', api_key: '', is_active: true
    });
  };

  const deviceColumns = [
    { header: isRTL ? 'الكود' : 'Code', cell: (row) => <span className="font-mono text-sm">{row.device_code}</span> },
    { header: isRTL ? 'الاسم' : 'Name', cell: (row) => <span className="font-medium">{row.device_name}</span> },
    { header: isRTL ? 'النوع' : 'Type', cell: (row) => (
      <Badge variant="outline">{row.device_type}</Badge>
    )},
    { header: isRTL ? 'الموقع' : 'Location', accessorKey: 'location' },
    { header: isRTL ? 'طريقة التكامل' : 'Integration', cell: (row) => row.integration_method },
    { header: isRTL ? 'آخر مزامنة' : 'Last Sync', cell: (row) => (
      <div className="flex items-center gap-2">
        {row.last_sync_status === 'success' ? (
          <Wifi className="w-4 h-4 text-green-500" />
        ) : row.last_sync_status === 'failed' ? (
          <WifiOff className="w-4 h-4 text-red-500" />
        ) : (
          <Clock className="w-4 h-4 text-muted-foreground" />
        )}
        <span className="text-sm text-muted-foreground">
          {row.last_sync_date ? format(new Date(row.last_sync_date), 'dd/MM HH:mm') : '-'}
        </span>
      </div>
    )},
    { header: t('status'), cell: (row) => (
      <Badge variant={row.is_active ? 'default' : 'secondary'}>
        {row.is_active ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'غير نشط' : 'Inactive')}
      </Badge>
    )},
    { header: t('actions'), cell: (row) => (
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => { setEditingDevice(row); setDeviceForm(row); setShowDeviceForm(true); }}>
          <Settings className="w-4 h-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => handleSyncDevice(row)} disabled={syncing}>
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
        </Button>
      </div>
    )}
  ];

  const punchLogColumns = [
    { header: isRTL ? 'الموظف' : 'Employee', cell: (row) => row.employee_name || row.employee_badge_id },
    { header: isRTL ? 'الوقت' : 'Time', cell: (row) => format(new Date(row.punch_time), 'dd/MM/yyyy HH:mm') },
    { header: isRTL ? 'النوع' : 'Type', cell: (row) => (
      <Badge variant={row.punch_type === 'in' ? 'default' : 'secondary'}>
        {row.punch_type === 'in' ? (isRTL ? 'دخول' : 'In') : (isRTL ? 'خروج' : 'Out')}
      </Badge>
    )},
    { header: isRTL ? 'الحالة' : 'Status', cell: (row) => (
      <Badge variant={row.processed ? 'default' : 'outline'}>
        {row.processed ? (isRTL ? 'تمت المعالجة' : 'Processed') : (isRTL ? 'معلق' : 'Pending')}
      </Badge>
    )}
  ];

  const unprocessedCount = punchLogs.filter(l => !l.processed).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'أجهزة الحضور' : 'Attendance Devices'}
        subtitle={isRTL ? 'إدارة أجهزة البصمة وسجلات الحضور' : 'Manage biometric devices and punch logs'}
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-najdi-50 rounded-full flex items-center justify-center">
                <Activity className="w-5 h-5 text-najdi-700" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{isRTL ? 'الأجهزة' : 'Devices'}</p>
                <p className="text-2xl font-bold">{devices.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <Wifi className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{isRTL ? 'نشط' : 'Active'}</p>
                <p className="text-2xl font-bold">{devices.filter(d => d.is_active).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{isRTL ? 'سجلات معلقة' : 'Pending Logs'}</p>
                <p className="text-2xl font-bold">{unprocessedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <Download className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{isRTL ? 'إجمالي السجلات' : 'Total Logs'}</p>
                <p className="text-2xl font-bold">{punchLogs.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border">
          <TabsTrigger value="devices" className="gap-2">
            <Settings className="w-4 h-4" />
            {isRTL ? 'الأجهزة' : 'Devices'}
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <Clock className="w-4 h-4" />
            {isRTL ? 'سجلات البصمة' : 'Punch Logs'}
            {unprocessedCount > 0 && (
              <Badge variant="destructive" className="ms-2">{unprocessedCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="devices" className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
              <Input placeholder={isRTL ? 'بحث...' : 'Search...'} value={search} onChange={(e) => setSearch(e.target.value)} className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`} />
            </div>
            <Button onClick={() => { resetDeviceForm(); setShowDeviceForm(true); }} className="gap-2">
              <Plus className="w-4 h-4" />
              {isRTL ? 'إضافة جهاز' : 'Add Device'}
            </Button>
          </div>
          <DataTable columns={deviceColumns} data={filteredDevices} loading={loadingDevices} emptyMessage={t('noData')} />
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between gap-3">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowUploadDialog(true)} className="gap-2">
                <Upload className="w-4 h-4" />
                {isRTL ? 'استيراد ملف' : 'Import File'}
              </Button>
              {unprocessedCount > 0 && (
                <Button onClick={handleProcessLogs} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {isRTL ? `معالجة (${unprocessedCount})` : `Process (${unprocessedCount})`}
                </Button>
              )}
            </div>
          </div>
          <DataTable columns={punchLogColumns} data={punchLogs} loading={loadingLogs} emptyMessage={t('noData')} />
        </TabsContent>
      </Tabs>

      {/* Device Form Dialog */}
      <Dialog open={showDeviceForm} onOpenChange={setShowDeviceForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingDevice ? (isRTL ? 'تعديل الجهاز' : 'Edit Device') : (isRTL ? 'إضافة جهاز' : 'Add Device')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'كود الجهاز' : 'Device Code'} *</Label>
                <Input value={deviceForm.device_code} onChange={(e) => setDeviceForm(p => ({...p, device_code: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'اسم الجهاز' : 'Device Name'} *</Label>
                <Input value={deviceForm.device_name} onChange={(e) => setDeviceForm(p => ({...p, device_name: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'نوع الجهاز' : 'Device Type'}</Label>
                <Select value={deviceForm.device_type} onValueChange={(v) => setDeviceForm(p => ({...p, device_type: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="biometric">{isRTL ? 'بصمة' : 'Biometric'}</SelectItem>
                    <SelectItem value="card">{isRTL ? 'كرت' : 'Card'}</SelectItem>
                    <SelectItem value="mobile_app">{isRTL ? 'تطبيق جوال' : 'Mobile App'}</SelectItem>
                    <SelectItem value="web">{isRTL ? 'ويب' : 'Web'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الفرع' : 'Branch'}</Label>
                <Select value={deviceForm.branch_id} onValueChange={(v) => setDeviceForm(p => ({...p, branch_id: v}))}>
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                  <SelectContent>
                    {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name_ar}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الرقم التسلسلي' : 'Serial Number'}</Label>
                <Input value={deviceForm.serial_number} onChange={(e) => setDeviceForm(p => ({...p, serial_number: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'عنوان IP' : 'IP Address'}</Label>
                <Input value={deviceForm.ip_address} onChange={(e) => setDeviceForm(p => ({...p, ip_address: e.target.value}))} placeholder="192.168.1.100" />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الموقع' : 'Location'}</Label>
                <Input value={deviceForm.location} onChange={(e) => setDeviceForm(p => ({...p, location: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'طريقة التكامل' : 'Integration Method'}</Label>
                <Select value={deviceForm.integration_method} onValueChange={(v) => setDeviceForm(p => ({...p, integration_method: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="file_upload">{isRTL ? 'رفع ملف' : 'File Upload'}</SelectItem>
                    <SelectItem value="api">{isRTL ? 'API' : 'API'}</SelectItem>
                    <SelectItem value="webhook">{isRTL ? 'Webhook' : 'Webhook'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {deviceForm.integration_method === 'api' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{isRTL ? 'نقطة API' : 'API Endpoint'}</Label>
                  <Input value={deviceForm.api_endpoint} onChange={(e) => setDeviceForm(p => ({...p, api_endpoint: e.target.value}))} placeholder="https://..." />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'مفتاح API' : 'API Key'}</Label>
                  <Input type="password" value={deviceForm.api_key} onChange={(e) => setDeviceForm(p => ({...p, api_key: e.target.value}))} />
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={deviceForm.is_active} onChange={(e) => setDeviceForm(p => ({...p, is_active: e.target.checked}))} className="rounded" />
              <Label>{isRTL ? 'الجهاز نشط' : 'Device Active'}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeviceForm(false)}>{t('cancel')}</Button>
            <Button onClick={handleSaveDevice} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isRTL ? 'استيراد سجلات البصمة' : 'Import Punch Logs'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-sand rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">{isRTL ? 'صيغة الملف المطلوبة (CSV):' : 'Required file format (CSV):'}</p>
              <code className="text-xs bg-white p-2 rounded block">
                employee_badge_id, punch_time, punch_type<br/>
                EMP-001, 2024-01-15 08:00:00, in<br/>
                EMP-001, 2024-01-15 17:00:00, out
              </code>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'اختر ملف CSV' : 'Select CSV File'}</Label>
              <Input type="file" accept=".csv" onChange={(e) => setUploadFile(e.target.files[0])} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>{t('cancel')}</Button>
            <Button onClick={handleFileUpload} disabled={saving || !uploadFile}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              <Upload className="w-4 h-4 me-2" />
              {isRTL ? 'استيراد' : 'Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}