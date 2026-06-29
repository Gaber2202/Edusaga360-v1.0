import React from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Settings } from 'lucide-react';

export default function AdminSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Settings</h1>
        <p className="text-sm text-muted-foreground">Platform-wide configuration</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold text-ink mb-3">Platform Settings</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Platform Name</span>
                <span className="font-medium">EduSaga 360</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Support Email</span>
                <span className="font-medium">info@edusaga360.com</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Default Language</span>
                <span className="font-medium">Arabic / English</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Trial Duration</span>
                <span className="font-medium">14 days</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold text-ink mb-3">Integration Status</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Supabase</span>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Connected</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Email Service</span>
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pending Setup</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Payment Gateway</span>
                <span className="text-xs bg-sand-alt text-muted-foreground px-2 py-0.5 rounded-full">Not Configured</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">File Storage</span>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Supabase Storage</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-5 text-center text-muted-foreground">
          <Settings className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm">Advanced settings management will be available in a future update.</p>
        </CardContent>
      </Card>
    </div>
  );
}
