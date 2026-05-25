import React from 'react';
import { Card, CardContent } from '../components/ui/card';
import { MessageSquare } from 'lucide-react';

export default function Messages() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Messages</h1>
      <Card>
        <CardContent className="py-12 text-center">
          <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Direct messaging with teachers will be available here.</p>
          <p className="text-xs text-slate-400 mt-1">This feature is coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}
