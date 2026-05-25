import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import { 
  MessageSquare, 
  Mail, 
  Send,
  Search,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function Communications() {
  const { t, isRTL } = useLanguage();
  const { userRole: _userRole, user: _user } = useRole();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTab, setSelectedTab] = useState('history');

  const { data: communications = [], isLoading } = useQuery({
    queryKey: ['communications', tenantId],
    queryFn: () => fetchData(tenantQuery('communications').select('*').match(tenantFilter(), '-created_date')),
    enabled: hasTenantAccess,
  });

  const { data: _students = [] } = useQuery({
    queryKey: ['students', tenantId],
    queryFn: () => fetchData(tenantQuery('students').select('*').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const { data: _employees = [] } = useQuery({
    queryKey: ['employees', tenantId],
    queryFn: () => fetchData(tenantQuery('employees').select('*').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const { data: _guardians = [] } = useQuery({
    queryKey: ['guardians', tenantId],
    queryFn: () => fetchData(tenantQuery('guardians').select('*').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const filteredCommunications = communications.filter(comm => {
    const matchesSearch = 
      comm.recipient_name?.toLowerCase().includes(search.toLowerCase()) ||
      comm.subject?.toLowerCase().includes(search.toLowerCase());
    const matchesChannel = channelFilter === 'all' || comm.channel === channelFilter;
    const matchesStatus = statusFilter === 'all' || comm.status === statusFilter;
    
    return matchesSearch && matchesChannel && matchesStatus;
  });

  const stats = {
    total: communications.length,
    whatsapp: communications.filter(c => c.channel === 'whatsapp').length,
    email: communications.filter(c => c.channel === 'email').length,
    sms: communications.filter(c => c.channel === 'sms').length,
    sent: communications.filter(c => c.status === 'sent').length,
    failed: communications.filter(c => c.status === 'failed').length,
  };

  const columns = [
    {
      header: isRTL ? 'المستلم' : 'Recipient',
      cell: (row) => (
        <div>
          <p className="font-medium">{row.recipient_name}</p>
          <p className="text-sm text-slate-500">{t(row.recipient_type)}</p>
        </div>
      )
    },
    {
      header: isRTL ? 'القناة' : 'Channel',
      cell: (row) => (
        <div className="flex items-center gap-2">
          {row.channel === 'whatsapp' && <MessageSquare className="w-4 h-4 text-green-600" />}
          {row.channel === 'email' && <Mail className="w-4 h-4 text-blue-600" />}
          {row.channel === 'sms' && <Send className="w-4 h-4 text-purple-600" />}
          <span className="capitalize">{row.channel}</span>
        </div>
      )
    },
    {
      header: isRTL ? 'الموضوع' : 'Subject',
      cell: (row) => (
        <span className="text-slate-700">{row.subject}</span>
      )
    },
    {
      header: isRTL ? 'التاريخ' : 'Date',
      cell: (row) => (
        <span className="text-slate-600">
          {row.sent_date ? format(new Date(row.sent_date), 'dd/MM/yyyy HH:mm') : '-'}
        </span>
      )
    },
    {
      header: isRTL ? 'الحالة' : 'Status',
      cell: (row) => (
        <div className="flex items-center gap-2">
          {row.status === 'sent' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
          {row.status === 'failed' && <XCircle className="w-4 h-4 text-red-600" />}
          {row.status === 'pending' && <Clock className="w-4 h-4 text-amber-600" />}
          <StatusBadge status={row.status} />
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('communications')}
        subtitle={isRTL ? 'إدارة الاتصالات والإشعارات' : 'Manage communications and notifications'}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
            <div className="text-sm text-slate-600">{isRTL ? 'إجمالي الرسائل' : 'Total Messages'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-green-600" />
              <div className="text-2xl font-bold text-slate-900">{stats.whatsapp}</div>
            </div>
            <div className="text-sm text-slate-600">{isRTL ? 'واتساب' : 'WhatsApp'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-600" />
              <div className="text-2xl font-bold text-slate-900">{stats.email}</div>
            </div>
            <div className="text-sm text-slate-600">{isRTL ? 'بريد' : 'Email'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Send className="w-5 h-5 text-purple-600" />
              <div className="text-2xl font-bold text-slate-900">{stats.sms}</div>
            </div>
            <div className="text-sm text-slate-600">SMS</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <div className="text-2xl font-bold text-green-700">{stats.sent}</div>
            </div>
            <div className="text-sm text-slate-600">{isRTL ? 'مرسل' : 'Sent'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-600" />
              <div className="text-2xl font-bold text-red-700">{stats.failed}</div>
            </div>
            <div className="text-sm text-slate-600">{isRTL ? 'فشل' : 'Failed'}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="bg-white border">
          <TabsTrigger value="history">
            {isRTL ? 'السجل' : 'History'}
          </TabsTrigger>
          <TabsTrigger value="send">
            {isRTL ? 'إرسال جديد' : 'Send New'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
              <Input
                placeholder={isRTL ? 'بحث...' : 'Search...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`}
              />
            </div>
            
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-full sm:w-48 bg-white">
                <SelectValue placeholder={isRTL ? 'القناة' : 'Channel'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isRTL ? 'الكل' : 'All'}</SelectItem>
                <SelectItem value="whatsapp">{isRTL ? 'واتساب' : 'WhatsApp'}</SelectItem>
                <SelectItem value="email">{isRTL ? 'بريد' : 'Email'}</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48 bg-white">
                <SelectValue placeholder={isRTL ? 'الحالة' : 'Status'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isRTL ? 'الكل' : 'All'}</SelectItem>
                <SelectItem value="sent">{isRTL ? 'مرسل' : 'Sent'}</SelectItem>
                <SelectItem value="pending">{isRTL ? 'قيد الانتظار' : 'Pending'}</SelectItem>
                <SelectItem value="failed">{isRTL ? 'فشل' : 'Failed'}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Communications Table */}
          <DataTable
            columns={columns}
            data={filteredCommunications}
            loading={isLoading}
            emptyMessage={isRTL ? 'لا توجد رسائل' : 'No messages found'}
          />
        </TabsContent>

        <TabsContent value="send" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{isRTL ? 'إرسال رسالة جديدة' : 'Send New Message'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-slate-500">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                <p className="text-lg font-medium mb-2">
                  {isRTL ? 'استخدم أزرار واتساب' : 'Use WhatsApp Buttons'}
                </p>
                <p className="text-sm">
                  {isRTL 
                    ? 'يمكنك إرسال الرسائل مباشرة من صفحات الفواتير، كشوف الرواتب، والحضور'
                    : 'Send messages directly from Invoices, Payslips, and Attendance pages'}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}