import React from 'react';
import { Card } from './card';
import { cn } from '../../lib/utils';

export default function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend, 
  trendUp,
  className,
  iconClassName 
}) {
  return (
    <Card className={cn(
      "p-5 bg-white border-0 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5",
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">{title}</p>
          <p className="text-2xl font-semibold text-slate-900 mb-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-slate-600">{subtitle}</p>
          )}
          {trend && (
            <p className={cn(
              "text-xs font-medium mt-1",
              trendUp ? "text-emerald-600" : "text-red-600"
            )}>
              {trendUp ? '↑' : '↓'} {trend}
            </p>
          )}
        </div>
        {Icon && (
          <div className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
            iconClassName || "bg-slate-50"
          )}>
            <Icon className="w-5 h-5 text-slate-600" />
          </div>
        )}
      </div>
    </Card>
  );
}