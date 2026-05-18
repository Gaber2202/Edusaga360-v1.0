import React from 'react';
import { Button } from './button';
import { useLanguage } from '../LanguageContext';

export default function PageHeader({ 
  title, 
  subtitle, 
  action,
  actionLabel,
  actionIcon: ActionIcon,
  onAction,
  variant = 'primary',
  children 
}) {
  const { isRTL } = useLanguage();
  
  const buttonStyles = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm',
    secondary: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm'
  };
  
  return (
    <div className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-semibold text-slate-900 mb-2">{title}</h1>
          {subtitle && (
            <p className="text-sm text-slate-600">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {children}
          {action && typeof action === 'object' && action.label ? (
            <Button 
              onClick={action.onClick}
              variant={action.variant || 'default'}
              className="transition-all duration-200"
            >
              {action.icon && <action.icon className={`w-4 h-4 ${isRTL ? 'ml-2' : 'mr-2'}`} />}
              {action.label}
            </Button>
          ) : (action || actionLabel) && (
            <Button 
              onClick={onAction}
              className={`${buttonStyles[variant]} transition-all duration-200`}
            >
              {ActionIcon && <ActionIcon className={`w-4 h-4 ${isRTL ? 'ml-2' : 'mr-2'}`} />}
              {actionLabel || action}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}