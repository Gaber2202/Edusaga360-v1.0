import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase, fetchData } from '../lib/supabase';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Flag } from 'lucide-react';

const AVAILABLE_MODULES = [
  'admissions', 'students', 'hr', 'payroll', 'fees', 'finance',
  'procurement', 'assets', 'fleet', 'clinic', 'library', 'canteen',
  'crm', 'it_helpdesk', 'facilities', 'yamen_ai',
];

export default function FeatureFlags() {
  const { data: tenants = [] } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => fetchData(supabase.from('tenants').select('id, name_en, name_ar, enabled_modules, plan')),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Feature Flags</h1>
        <p className="text-sm text-muted-foreground">Control module access per tenant</p>
      </div>

      <Card>
        <CardContent className="p-5">
          <h3 className="font-semibold text-ink mb-4">Available Modules</h3>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_MODULES.map(m => (
              <Badge key={m} variant="outline" className="text-xs">{m.replace('_', ' ')}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {tenants.map(t => (
          <Card key={t.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Flag className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm text-ink">{t.name_en || t.name_ar}</p>
                    <p className="text-xs text-muted-foreground">Plan: {t.plan || 'trial'}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(t.enabled_modules && t.enabled_modules.length > 0 ? t.enabled_modules : AVAILABLE_MODULES).map(m => (
                  <span key={m} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                    {m.replace('_', ' ')}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-5 text-center text-muted-foreground">
          <p className="text-sm">Feature flag management UI coming soon. Currently managed via Supabase.</p>
        </CardContent>
      </Card>
    </div>
  );
}
