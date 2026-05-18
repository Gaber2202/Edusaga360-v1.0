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
  Send, 
  FileText, 
  Download, 
  Printer, 
  Eye,
  MoreVertical,
  Mail
} from 'lucide-react';
import { useLanguage } from '../LanguageContext';

export default function POActions({ 
  po, 
  vendor: _vendor,
  onApprove, 
  onSend, 
  onCreateBill,
  onView,
  onDownload,
  onPrint,
  onEmail
}) {
  const { isRTL } = useLanguage();

  const QuickActions = () => (
    <div className="flex gap-1">
      {po.status === 'draft' && (
        <Button size="sm" variant="ghost" onClick={() => onApprove(po)} className="text-emerald-600">
          <Check className="w-4 h-4" />
        </Button>
      )}
      {po.status === 'approved' && (
        <Button size="sm" variant="ghost" onClick={() => onSend(po)} className="text-blue-600">
          <Send className="w-4 h-4" />
        </Button>
      )}
      {(po.status === 'sent' || po.status === 'received') && !po.bill_id && (
        <Button size="sm" onClick={() => onCreateBill(po)} className="bg-purple-600 hover:bg-purple-700">
          <FileText className="w-4 h-4 me-1" />
          {isRTL ? 'فاتورة' : 'Bill'}
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
        <DropdownMenuItem onClick={() => onView(po)}>
          <Eye className="w-4 h-4 me-2" />
          {isRTL ? 'عرض' : 'View'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDownload(po)}>
          <Download className="w-4 h-4 me-2" />
          {isRTL ? 'تنزيل PDF' : 'Download PDF'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPrint(po)}>
          <Printer className="w-4 h-4 me-2" />
          {isRTL ? 'طباعة' : 'Print'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onEmail(po)}>
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