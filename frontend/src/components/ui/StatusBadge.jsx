import React from 'react';
import { useLanguage } from '../LanguageContext';
import { CheckCircle, XCircle, Clock, AlertCircle, Circle } from 'lucide-react';

const statusConfig = {
  // Student Status
  active: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle },
  inactive: { bg: 'bg-sand', text: 'text-muted-foreground', border: 'border-border', icon: Circle },
  transferred: { bg: 'bg-najdi-50', text: 'text-najdi-900', border: 'border-najdi-100', icon: Circle },
  graduated: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: CheckCircle },
  withdrawn: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', icon: XCircle },
  
  // Application Status
  submitted: { bg: 'bg-najdi-50', text: 'text-najdi-900', border: 'border-najdi-100', icon: Circle },
  under_review: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: Clock },
  waitlist: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', icon: Clock },
  accepted: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle },
  rejected: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', icon: XCircle },
  enrolled: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', icon: CheckCircle },
  
  // Attendance
  present: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle },
  absent: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', icon: XCircle },
  late: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: AlertCircle },
  excused: { bg: 'bg-najdi-50', text: 'text-najdi-900', border: 'border-najdi-100', icon: Circle },
  
  // Payment Status
  paid: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle },
  unpaid: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', icon: XCircle },
  partial: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: Clock },
  overdue: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: AlertCircle },
  
  // General
  draft: { bg: 'bg-sand', text: 'text-muted-foreground', border: 'border-border', icon: Circle },
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: Clock },
  approved: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle },
  posted: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', icon: CheckCircle },
  issued: { bg: 'bg-najdi-50', text: 'text-najdi-900', border: 'border-najdi-100', icon: Circle },
  cancelled: { bg: 'bg-sand', text: 'text-muted-foreground', border: 'border-border', icon: XCircle },
};

export default function StatusBadge({ status, className = '', showIcon = true }) {
  const { t } = useLanguage();
  const config = statusConfig[status] || { bg: 'bg-sand', text: 'text-muted-foreground', border: 'border-border', icon: Circle };
  const Icon = config.icon;
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border} ${className}`}>
      {showIcon && <Icon className="w-3.5 h-3.5" />}
      {t(status) || status}
    </span>
  );
}