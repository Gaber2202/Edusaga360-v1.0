import React from 'react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { 
  Check, 
  X, 
  ArrowRight, 
  Download, 
  Printer, 
  Eye,
  MoreVertical
} from 'lucide-react';
import { useLanguage } from '../LanguageContext';

export default function PRActions({ 
  pr, 
  onApprove, 
  onReject,
  onConvert,
  onView,
  onDownload,
  onPrint
}) {
  const { isRTL } = useLanguage();

  const QuickActions = () => (
    <div className="flex gap-1">
      {pr.status === 'pending' && (
        <>
          <Button size="sm" variant="ghost" onClick={() => onApprove(pr)} className="text-emerald-600">
            <Check className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onReject(pr)} className="text-red-600">
            <X className="w-4 h-4" />
          </Button>
        </>
      )}
      {pr.status === 'approved' && (
        <Button size="sm" onClick={() => onConvert(pr)} className="bg-blue-600 hover:bg-blue-700">
          <ArrowRight className="w-4 h-4 me-1" />
          {isRTL ? 'أمر شراء' : 'PO'}
        </Button>
      )}
    </div>
  );

  const MoreActions = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost">
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={isRTL ? 'start' : 'end'}>
        <DropdownMenuItem onClick={() => onView(pr)}>
          <Eye className="w-4 h-4 me-2" />
          {isRTL ? 'عرض' : 'View'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDownload(pr)}>
          <Download className="w-4 h-4 me-2" />
          {isRTL ? 'تنزيل' : 'Download'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPrint(pr)}>
          <Printer className="w-4 h-4 me-2" />
          {isRTL ? 'طباعة' : 'Print'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="flex items-center gap-1">
      <QuickActions />
      <MoreActions />
    </div>
  );
}