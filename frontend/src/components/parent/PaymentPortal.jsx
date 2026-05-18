import React, { useState, useEffect } from 'react';
import { tenantQuery } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useTenant } from '../TenantContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Loader2 } from 'lucide-react';

export default function PaymentPortal({ student }) {
  const { isRTL } = useLanguage();
  const { tenant } = useTenant();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!student?.id || !tenant?.id) return;

    const fetchInvoices = async () => {
      try {
        setLoading(true);
        const data = await tenantQuery('invoices').select('*').match({
          student_id: student.id,
          tenant_id: tenant.id
        });
        setInvoices(data || []);
      } catch (err) {
        console.error('Error fetching invoices:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchInvoices();
  }, [student?.id, tenant?.id]);

  if (!student) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-slate-600">
          {isRTL ? 'يرجى اختيار طالب' : 'Please select a student'}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{isRTL ? 'الفواتير والمدفوعات' : 'Invoices & Payments'}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
            </div>
          ) : invoices.length === 0 ? (
            <p className="text-center text-slate-600 py-4">
              {isRTL ? 'لا توجد فواتير' : 'No invoices'}
            </p>
          ) : (
            <div className="space-y-3">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{isRTL ? 'الفاتورة #' : 'Invoice #'}{invoice.invoice_number}</p>
                    <p className="text-sm text-slate-600">{invoice.academic_year}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{invoice.total_amount.toFixed(2)} SAR</p>
                    <Badge variant="outline" className="mt-1">
                      {isRTL 
                        ? invoice.status === 'paid' ? 'مدفوعة' : 
                          invoice.status === 'partial' ? 'جزئية' : 'معلقة'
                        : invoice.status === 'paid' ? 'Paid' : 
                          invoice.status === 'partial' ? 'Partial' : 'Pending'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}