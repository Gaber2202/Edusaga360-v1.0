import React from 'react';
import { Card, CardContent } from '../components/ui/card';
import { ClipboardCheck } from 'lucide-react';

export default function Attendance() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Attendance Records</h1>
      <Card>
        <CardContent className="py-12 text-center">
          <ClipboardCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Attendance records for your children will appear here.</p>
          <p className="text-xs text-slate-400 mt-1">Data will be available once the school records attendance.</p>
        </CardContent>
      </Card>
    </div>
  );
}
