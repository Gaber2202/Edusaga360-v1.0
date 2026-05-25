import React from 'react';
import { Card, CardContent } from '../components/ui/card';
import { CreditCard } from 'lucide-react';

export default function Fees() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Fees & Billing</h1>
      <Card>
        <CardContent className="py-12 text-center">
          <CreditCard className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Fee invoices and payment history will appear here.</p>
          <p className="text-xs text-slate-400 mt-1">Contact the school finance department for billing inquiries.</p>
        </CardContent>
      </Card>
    </div>
  );
}
