import React from 'react';
import { Card, CardContent } from '../components/ui/card';
import { FileText } from 'lucide-react';

export default function Homework() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Homework & Assignments</h1>
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Homework assignments will appear here.</p>
          <p className="text-xs text-slate-400 mt-1">Teachers will post assignments that you can view and track.</p>
        </CardContent>
      </Card>
    </div>
  );
}
