import React from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Mail } from 'lucide-react';

const TEMPLATES = [
  { name: 'Trial Request Received', key: 'trial_request', status: 'active' },
  { name: 'Approval / Welcome', key: 'approval_welcome', status: 'active' },
  { name: 'Denial Notice', key: 'denial_notice', status: 'active' },
  { name: 'Onboarding Link', key: 'onboarding_link', status: 'active' },
  { name: 'Subscription Change Request', key: 'subscription_change', status: 'draft' },
  { name: 'Password Reset', key: 'password_reset', status: 'active' },
];

export default function EmailTemplates() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Email Templates</h1>
        <p className="text-sm text-muted-foreground">Manage transactional email templates</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {TEMPLATES.map(t => (
          <Card key={t.key} className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-najdi-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-najdi-700" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-ink">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">Template key: {t.key}</p>
                  <span className={`mt-2 inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
                    t.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-sand-alt text-muted-foreground'
                  }`}>{t.status}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-5 text-center text-muted-foreground">
          <p className="text-sm">Email template editor will be available in a future update.</p>
          <p className="text-xs text-muted-foreground mt-1">Templates are currently managed via the email service provider.</p>
        </CardContent>
      </Card>
    </div>
  );
}
