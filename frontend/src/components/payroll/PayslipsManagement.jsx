import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData, callApi } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useBranch } from '../BranchContext';
import { useRole } from '../RoleContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { 
  FileText, 
  Mail, 
  MessageSquare, 
  MoreVertical, 
  Send,
  CheckCircle,
  XCircle,
  Clock,
  Settings
} from 'lucide-react';
import { toast } from 'sonner';
import PayslipViewer from './PayslipViewer';
import PayslipSettings from './PayslipSettings';

export default function PayslipsManagement() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const { user } = useRole();
  const queryClient = useQueryClient();

  const [selectedPayslips, setSelectedPayslips] = useState([]);
  const [periodFilter, setPeriodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [viewingPayslip, setViewingPayslip] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const { data: payslips = [], isLoading } = useQuery({
    queryKey: ['payslipLines', selectedBranchId],
    queryFn: async () => {
      const { data: all = [] } = await tenantQuery('payslip_lines').select('*').match(branchFilter()).order('created_at', { ascending: false });
      return filterByBranch(all);
    },
  });

  const { data: deliveries = [] } = useQuery({
    queryKey: ['payslipDeliveries'],
    queryFn: () => fetchData(tenantQuery('payslip_deliverys').select('*').order('created_at', { ascending: false })),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => fetchData(tenantQuery('employees').select('*').match({ status: 'active' })),
  });

  const sendPayslipMutation = useMutation({
    mutationFn: async ({ payslip, channel }) => {
      const employee = employees.find(e => e.id === payslip.employee_id);
      if (!employee) throw new Error('Employee not found');

      const delivery = await tenantQuery('payslip_deliverys').insert({
        payslip_id: payslip.id,
        employee_id: payslip.employee_id,
        employee_name: payslip.employee_name,
        payrun_id: payslip.payrun_id,
        period: payslip.period,
        delivery_channel: channel,
        sent_by: user?.full_name,
        sent_by_email: user?.email,
        is_automated: false,
        recipient_email: employee.email,
        recipient_whatsapp: employee.whatsapp_number
      });

      // Send via selected channel
      if (channel === 'email' || channel === 'both') {
        try {
          await callApi('/api/email/send', {
            to: employee.email,
            subject: isRTL 
              ? `قسيمة راتب - ${payslip.period}` 
              : `Payslip - ${payslip.period}`,
            body: isRTL
              ? `مرحباً ${employee.name_ar},\n\nقسيمة راتبك لشهر ${payslip.period} جاهزة.\n\nصافي الراتب: ${payslip.net_salary?.toLocaleString()} ريال`
              : `Dear ${employee.name_en || employee.name_ar},\n\nYour payslip for ${payslip.period} is ready.\n\nNet Salary: ${payslip.net_salary?.toLocaleString()} SAR`
          });
          
          await tenantQuery('payslip_deliverys').update({
            email_status: 'sent',
            email_sent_date: new Date().toISOString()
          });
        } catch (error) {
          await tenantQuery('payslip_deliverys').update({
            email_status: 'failed',
            email_error: error.message
          });
        }
      }

      if (channel === 'whatsapp' || channel === 'both') {
        await tenantQuery('payslip_deliverys').update({
          whatsapp_status: employee.whatsapp_number ? 'sent' : 'failed',
          whatsapp_sent_date: employee.whatsapp_number ? new Date().toISOString() : null,
          whatsapp_error: employee.whatsapp_number ? null : 'No WhatsApp number'
        });
      }

      return delivery;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payslipDeliveries'] });
      toast.success(isRTL ? 'تم إرسال القسيمة' : 'Payslip sent');
    },
    onError: () => {
      toast.error(isRTL ? 'فشل الإرسال' : 'Send failed');
    }
  });

  const bulkSendMutation = useMutation({
    mutationFn: async ({ payslips, channel }) => {
      for (const payslip of payslips) {
        await sendPayslipMutation.mutateAsync({ payslip, channel });
      }
    },
    onSuccess: () => {
      setSelectedPayslips([]);
      toast.success(isRTL ? 'تم الإرسال الجماعي' : 'Bulk send completed');
    }
  });

  const getDeliveryStatus = (payslipId) => {
    const delivery = deliveries.find(d => d.payslip_id === payslipId);
    if (!delivery) return { email: 'not_sent', whatsapp: 'not_sent' };
    return { 
      email: delivery.email_status, 
      whatsapp: delivery.whatsapp_status 
    };
  };

  const getStatusBadge = (status) => {
    const configs = {
      not_sent: { color: 'bg-sand-alt text-ink', icon: Clock, label: isRTL ? 'لم يُرسل' : 'Not Sent' },
      sent: { color: 'bg-najdi-50 text-najdi-900', icon: Send, label: isRTL ? 'تم الإرسال' : 'Sent' },
      delivered: { color: 'bg-green-100 text-green-700', icon: CheckCircle, label: isRTL ? 'تم التوصيل' : 'Delivered' },
      failed: { color: 'bg-red-100 text-red-700', icon: XCircle, label: isRTL ? 'فشل' : 'Failed' }
    };
    const config = configs[status] || configs.not_sent;
    const Icon = config.icon;
    return (
      <Badge variant="outline" className={config.color}>
        <Icon className="w-3 h-3 me-1" />
        {config.label}
      </Badge>
    );
  };

  const filteredPayslips = payslips.filter(p => {
    const matchesSearch = p.employee_name?.toLowerCase().includes(search.toLowerCase());
    const matchesPeriod = periodFilter === 'all' || p.period === periodFilter;
    const status = getDeliveryStatus(p.id);
    const matchesStatus = statusFilter === 'all' || 
      status.email === statusFilter || 
      status.whatsapp === statusFilter;
    return matchesSearch && matchesPeriod && matchesStatus;
  });

  const periods = [...new Set(payslips.map(p => p.period))].sort().reverse();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-ink">
            {isRTL ? 'قسائم الراتب' : 'Payslips'}
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            {isRTL ? 'إدارة وإرسال قسائم الرواتب' : 'Manage and send payslips'}
          </p>
        </div>
        <Button onClick={() => setShowSettings(true)} variant="outline">
          <Settings className="w-4 h-4 me-2" />
          {isRTL ? 'الإعدادات' : 'Settings'}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Input
              placeholder={isRTL ? 'بحث بالاسم...' : 'Search by name...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger>
                <SelectValue placeholder={isRTL ? 'الفترة' : 'Period'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isRTL ? 'كل الفترات' : 'All Periods'}</SelectItem>
                {periods.map(p => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder={isRTL ? 'الحالة' : 'Status'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isRTL ? 'كل الحالات' : 'All Status'}</SelectItem>
                <SelectItem value="not_sent">{isRTL ? 'لم يُرسل' : 'Not Sent'}</SelectItem>
                <SelectItem value="sent">{isRTL ? 'تم الإرسال' : 'Sent'}</SelectItem>
                <SelectItem value="delivered">{isRTL ? 'تم التوصيل' : 'Delivered'}</SelectItem>
                <SelectItem value="failed">{isRTL ? 'فشل' : 'Failed'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedPayslips.length > 0 && (
        <Card className="bg-sand border-border">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {selectedPayslips.length} {isRTL ? 'محدد' : 'selected'}
              </span>
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => bulkSendMutation.mutate({ 
                    payslips: filteredPayslips.filter(p => selectedPayslips.includes(p.id)), 
                    channel: 'email' 
                  })}
                  disabled={bulkSendMutation.isPending}
                >
                  <Mail className="w-4 h-4 me-2" />
                  {isRTL ? 'إرسال بريد إلكتروني' : 'Send Email'}
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => bulkSendMutation.mutate({ 
                    payslips: filteredPayslips.filter(p => selectedPayslips.includes(p.id)), 
                    channel: 'whatsapp' 
                  })}
                  disabled={bulkSendMutation.isPending}
                >
                  <MessageSquare className="w-4 h-4 me-2" />
                  {isRTL ? 'إرسال واتساب' : 'Send WhatsApp'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payslips Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedPayslips.length === filteredPayslips.length}
                  onCheckedChange={(checked) => {
                    setSelectedPayslips(checked ? filteredPayslips.map(p => p.id) : []);
                  }}
                />
              </TableHead>
              <TableHead>{isRTL ? 'الموظف' : 'Employee'}</TableHead>
              <TableHead>{isRTL ? 'الفترة' : 'Period'}</TableHead>
              <TableHead>{isRTL ? 'صافي الراتب' : 'Net Salary'}</TableHead>
              <TableHead>{isRTL ? 'البريد الإلكتروني' : 'Email Status'}</TableHead>
              <TableHead>{isRTL ? 'واتساب' : 'WhatsApp Status'}</TableHead>
              <TableHead>{isRTL ? 'الإجراءات' : 'Actions'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {isRTL ? 'جاري التحميل...' : 'Loading...'}
                </TableCell>
              </TableRow>
            ) : filteredPayslips.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {isRTL ? 'لا توجد قسائم' : 'No payslips found'}
                </TableCell>
              </TableRow>
            ) : (
              filteredPayslips.map((payslip) => {
                const status = getDeliveryStatus(payslip.id);
                return (
                  <TableRow key={payslip.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedPayslips.includes(payslip.id)}
                        onCheckedChange={(checked) => {
                          setSelectedPayslips(prev =>
                            checked ? [...prev, payslip.id] : prev.filter(id => id !== payslip.id)
                          );
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{payslip.employee_name}</TableCell>
                    <TableCell>{payslip.period}</TableCell>
                    <TableCell>{payslip.net_salary?.toLocaleString()} {t('sar')}</TableCell>
                    <TableCell>{getStatusBadge(status.email)}</TableCell>
                    <TableCell>{getStatusBadge(status.whatsapp)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align={isRTL ? 'start' : 'end'}>
                          <DropdownMenuItem onClick={() => setViewingPayslip(payslip)}>
                            <FileText className="w-4 h-4 me-2" />
                            {isRTL ? 'عرض' : 'View'}
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => sendPayslipMutation.mutate({ payslip, channel: 'email' })}
                          >
                            <Mail className="w-4 h-4 me-2" />
                            {isRTL ? 'إرسال بريد' : 'Send Email'}
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => sendPayslipMutation.mutate({ payslip, channel: 'whatsapp' })}
                          >
                            <MessageSquare className="w-4 h-4 me-2" />
                            {isRTL ? 'إرسال واتساب' : 'Send WhatsApp'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {viewingPayslip && (
        <PayslipViewer
          payslip={viewingPayslip}
          open={!!viewingPayslip}
          onClose={() => setViewingPayslip(null)}
        />
      )}

      {showSettings && (
        <PayslipSettings
          open={showSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}