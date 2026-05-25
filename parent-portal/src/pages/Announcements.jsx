import React from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Bell } from 'lucide-react';

export default function Announcements() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">School Announcements</h1>
      <Card>
        <CardContent className="py-12 text-center">
          <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">School announcements and communications will appear here.</p>
          <p className="text-xs text-slate-400 mt-1">Stay tuned for updates from your school.</p>
        </CardContent>
      </Card>
    </div>
  );
}
