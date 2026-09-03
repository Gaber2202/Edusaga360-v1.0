import React from 'react';
import { Sparkles } from 'lucide-react';

/**
 * Persistent banner for shared demo tenants (e.g. demo-ksa).
 * Demo data lives in an isolated tenant — never injected into production schools.
 */
export default function HRDemoTenantBanner({ isRTL, tenant }) {
  if (!tenant?.is_demo) return null;

  const isKsaDemo = tenant.slug === 'demo-ksa';
  const label = isRTL
    ? (isKsaDemo ? 'بيئة عرض KSA — تُعاد ضبطها ليلاً' : 'بيئة عرض — بيانات تجريبية')
    : (isKsaDemo ? 'KSA demo environment — resets nightly' : 'Demo environment — sample data');

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50/80 text-indigo-900 text-sm">
      <Sparkles className="w-4 h-4 flex-shrink-0 text-indigo-600" />
      <span>{label}</span>
      {tenant.name_en && (
        <span className="text-indigo-700/70 text-xs ms-auto hidden sm:inline">
          {tenant.name_en}
        </span>
      )}
    </div>
  );
}
