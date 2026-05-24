import React from 'react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { 
  Check, 
  CreditCard, 
  Download, 
  Printer, 
  Eye,
  MoreVertical,
  Mail
} from 'lucide-react';
import { useLanguage } from '../LanguageContext';

export default function BillActions({ 
  bill, 
  vendor: _vendor,
  onApprove, 
  onPay, 
  onView,
  onDownload,
  onPrint,
  onEmail
}) {
  const { isRTL } = useLanguage();

  // Quick action buttons for common operations
  const QuickActions = () => (
    <div className="flex gap-1">
      {bill.status === 'pending' && (
        <Button size="sm" variant="ghost" onClick={() => onApprove(bill)} className="text-emerald-600">
          <Check className="w-4 h-4" />
        </Button>
      )}
      {(bill.status === 'approved' || bill.status === 'partial') && (
        <Button size="sm" onClick={() => onPay(bill)} className="bg-blue-600 hover:bg-blue-700">
          <CreditCard className="w-4 h-4 me-1" />
          {isRTL ? 'دفع' : 'Pay'}
        </Button>
      )}
    </div>
  );

  // More actions dropdown
  const MoreActions = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost">
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={isRTL ? 'start' : 'end'}>
        <DropdownMenuItem onClick={() => onView(bill)}>
          <Eye className="w-4 h-4 me-2" />
          {isRTL ? 'عرض' : 'View'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDownload(bill)}>
          <Download className="w-4 h-4 me-2" />
          {isRTL ? 'تنزيل' : 'Download'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPrint(bill)}>
          <Printer className="w-4 h-4 me-2" />
          {isRTL ? 'طباعة' : 'Print'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onEmail(bill)}>
          <Mail className="w-4 h-4 me-2" />
          {isRTL ? 'بريد إلكتروني' : 'Email'}
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