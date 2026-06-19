import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Download, Eye, Mail, MessageSquare, Clock, CheckCircle, XCircle, Info } from 'lucide-react';
import { format } from 'date-fns';
import PayslipViewer from '../components/payroll/PayslipViewer';

export default function MyPayslips() {
  const { t, isRTL } = useLanguage();
  const { user } = useRole();
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const [viewingPayslip, setViewingPayslip] = useState(null);

  const { data: employee } = useQuery({
    queryKey: ['myEmployee', user?.email],
    queryFn: async () => {
      const { data: employees = [] } = await tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_date').match({ email: user?.email });
      return employees[0];
    },
    enabled: !!user?.email
  });

  const { data: payslips = [], isLoading } = useQuery({
    queryKey: ['myPayslips', employee?.id],
    queryFn: () => fetchData(tenantQuery('payslip_lines').select('*').match({ employee_id: employee?.id })),
    enabled: !!employee?.id
  });

  const { data: deliveries = [] } = useQuery({
    queryKey: ['myPayslipDeliveries', employee?.id],
    queryFn: () => fetchData(tenantQuery('payslip_deliverys').select('*').match({ employee_id: employee?.id })),
    enabled: !!employee?.id
  });

  const { data: securitySettings } = useQuery({
    queryKey: ['payslipSettings'],
    queryFn: async () => {
      const { data: all = [] } = await tenantQuery('payslip_settings').select('*').order();
      return all[0];
    },
  });

  const getDeliveryHistory = (payslipId) => {
    return deliveries.filter(d => d.payslip_id === payslipId);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'sent': return <Mail className="w-3 h-3 text-blue-600" />;
      case 'delivered': return <CheckCircle className="w-3 h-3 text-green-600" />;
      case 'failed': return <XCircle className="w-3 h-3 text-red-600" />;
      default: return <Clock className="w-3 h-3 text-slate-400" />;
    }
  };

  const filteredPayslips = payslips
    .filter(p => selectedPeriod === 'all' || p.period === selectedPeriod)
    .sort((a, b) => b.period.localeCompare(a.period));

  const periods = [...new Set(payslips.map(p => p.period))].sort().reverse();

  if (!employee) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-slate-500">
          {isRTL ? 'جاري التحميل...' : 'Loading...'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          {isRTL ? 'قسائم راتبي' : 'My Payslips'}
        </h1>
        <p className="text-slate-600 mt-2">
          {isRTL ? 'عرض وتحميل قسائم الراتب الخاصة بك' : 'View and download your payslips'}
        </p>
        
        {securitySettings?.pdf_password_enabled && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-900">
                  {isRTL ? 'ملفات PDF محمية بكلمة مرور' : 'Password-Protected PDFs'}
                </p>
                <p className="text-amber-700 mt-1">
                  {isRTL ? 'تلميح كلمة المرور: ' : 'Password Hint: '}
                  {isRTL ? securitySettings.password_hint_ar : securitySettings.password_hint_en}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="max-w-xs">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger>
                <SelectValue placeholder={isRTL ? 'اختر الفترة' : 'Select Period'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isRTL ? 'كل الفترات' : 'All Periods'}</SelectItem>
                {periods.map(p => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Payslips List */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isRTL ? 'الفترة' : 'Period'}</TableHead>
              <TableHead>{isRTL ? 'صافي الراتب' : 'Net Salary'}</TableHead>
              <TableHead>{isRTL ? 'تاريخ السداد' : 'Payment Date'}</TableHead>
              <TableHead>{isRTL ? 'حالة التوصيل' : 'Delivery Status'}</TableHead>
              <TableHead>{isRTL ? 'الإجراءات' : 'Actions'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  {isRTL ? 'جاري التحميل...' : 'Loading...'}
                </TableCell>
              </TableRow>
            ) : filteredPayslips.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                  {isRTL ? 'لا توجد قسائم' : 'No payslips found'}
                </TableCell>
              </TableRow>
            ) : (
              filteredPayslips.map((payslip) => {
                const deliveryHistory = getDeliveryHistory(payslip.id);
                const latestEmail = deliveryHistory.find(d => d.email_status !== 'not_sent');
                const latestWhatsApp = deliveryHistory.find(d => d.whatsapp_status !== 'not_sent');
                
                return (
                  <TableRow key={payslip.id}>
                    <TableCell className="font-medium">{payslip.period}</TableCell>
                    <TableCell className="text-emerald-600 font-semibold">
                      {payslip.net_salary?.toLocaleString()} {t('sar')}
                    </TableCell>
                    <TableCell>
                      {payslip.payment_date ? format(new Date(payslip.payment_date), 'dd/MM/yyyy') : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {latestEmail && (
                          <div className="flex items-center gap-1">
                            {getStatusIcon(latestEmail.email_status)}
                            <span className="text-xs text-slate-600">{isRTL ? 'بريد' : 'Email'}</span>
                          </div>
                        )}
                        {latestWhatsApp && (
                          <div className="flex items-center gap-1">
                            {getStatusIcon(latestWhatsApp.whatsapp_status)}
                            <span className="text-xs text-slate-600">{isRTL ? 'واتساب' : 'WhatsApp'}</span>
                          </div>
                        )}
                        {!latestEmail && !latestWhatsApp && (
                          <Badge variant="outline" className="text-slate-500">
                            {isRTL ? 'لم يُرسل' : 'Not Sent'}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setViewingPayslip(payslip)}
                        >
                          <Eye className="w-4 h-4 me-2" />
                          {isRTL ? 'عرض' : 'View'}
                        </Button>
                        <Button size="sm" variant="outline">
                          <Download className="w-4 h-4 me-2" />
                          {isRTL ? 'تحميل' : 'Download'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Delivery History */}
      {filteredPayslips.length > 0 && deliveries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{isRTL ? 'سجل التوصيل' : 'Delivery History'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {deliveries.slice(0, 5).map((delivery) => (
                <div key={delivery.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                  <div>
                    <p className="font-medium text-sm">{delivery.period}</p>
                    <div className="flex items-center gap-3 mt-1">
                      {delivery.email_status !== 'not_sent' && (
                        <div className="flex items-center gap-1 text-xs text-slate-600">
                          <Mail className="w-3 h-3" />
                          {delivery.email_status}
                        </div>
                      )}
                      {delivery.whatsapp_status !== 'not_sent' && (
                        <div className="flex items-center gap-1 text-xs text-slate-600">
                          <MessageSquare className="w-3 h-3" />
                          {delivery.whatsapp_status}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    {delivery.email_sent_date && format(new Date(delivery.email_sent_date), 'dd/MM/yyyy HH:mm')}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {viewingPayslip && (
        <PayslipViewer
          payslip={viewingPayslip}
          open={!!viewingPayslip}
          onClose={() => setViewingPayslip(null)}
        />
      )}
    </div>
  );
}