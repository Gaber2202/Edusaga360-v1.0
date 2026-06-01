import React from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Settings } from 'lucide-react';

export default function AdminSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-sm text-slate-500">Platform-wide configuration</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold text-slate-800 mb-3">Platform Settings</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Platform Name</span>
                <span className="font-medium">EduSaga 360</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Support Email</span>
                <span className="font-medium">info@edusaga360.com</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Default Language</span>
                <span className="font-medium">Arabic / English</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Trial Duration</span>
                <span className="font-medium">14 days</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold text-slate-800 mb-3">Integration Status</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Supabase</span>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Connected</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Email Service</span>
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pending Setup</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Payment Gateway</span>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">Not Configured</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">File Storage</span>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Supabase Storage</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-5 text-center text-slate-500">
          <Settings className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm">Advanced settings management will be available in a future update.</p>
        </CardContent>
      </Card>
    </div>
  );
}
