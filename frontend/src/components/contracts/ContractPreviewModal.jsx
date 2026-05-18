import React, { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Download, X, FileText } from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { sanitizeHtml } from '../../lib/sanitize';
import { toast } from 'sonner';

function fillPlaceholders(content, data) {
  if (!content) return '';
  let filled = content;
  Object.entries(data || {}).forEach(([key, value]) => {
    filled = filled.replaceAll(`{{${key}}}`, value || `[${key}]`);
  });
  return filled;
}

export default function ContractPreviewModal({ open, onClose, template, previewData = {}, contract = null }) {
  const { isRTL } = useLanguage();
  const printRef = useRef();

  const contentAr = fillPlaceholders(template?.content_ar || contract?.generated_content_ar || '', previewData);
  const contentEn = fillPlaceholders(template?.content_en || contract?.generated_content_en || '', previewData);

  const handlePDFExport = async () => {
    try {
      const { jsPDF } = await import('jspdf');
      const { default: html2canvas } = await import('html2canvas');

      const element = printRef.current;
      if (!element) return;

      toast.info(isRTL ? 'جاري إنشاء PDF...' : 'Generating PDF...');

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      const pageHeight = pdf.internal.pageSize.getHeight();

      let yOffset = 0;
      while (yOffset < pdfHeight) {
        if (yOffset > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -yOffset, pdfWidth, pdfHeight);
        yOffset += pageHeight;
      }

      const filename = (isRTL ? template?.name_ar : template?.name_en) || 'contract';
      pdf.save(`${filename}.pdf`);
      toast.success(isRTL ? 'تم تصدير PDF' : 'PDF exported');
    } catch (err) {
      console.error(err);
      toast.error(isRTL ? 'فشل تصدير PDF' : 'PDF export failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {isRTL ? 'معاينة العقد' : 'Contract Preview'}
            </DialogTitle>
            {contract?.status && (
              <Badge className={
                contract.status === 'signed' ? 'bg-green-100 text-green-700' :
                contract.status === 'sent' ? 'bg-blue-100 text-blue-700' :
                'bg-slate-100 text-slate-700'
              }>
                {contract.status}
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* Preview Area */}
        <div className="flex-1 overflow-y-auto border rounded-lg bg-white">
          <div ref={printRef} className="p-8 min-h-[800px] bg-white text-slate-900" style={{ fontFamily: 'Arial, sans-serif' }}>
            {/* Header */}
            <div className="text-center border-b-2 border-slate-900 pb-4 mb-6">
              <h1 className="text-2xl font-bold" style={{ color: '#1e293b' }}>
                {isRTL ? (template?.name_ar || 'عقد') : (template?.name_en || template?.name_ar || 'Contract')}
              </h1>
              {previewData.contract_number && (
                <p className="text-sm text-slate-500 mt-1">
                  {isRTL ? 'رقم العقد:' : 'Contract No:'} {previewData.contract_number}
                </p>
              )}
            </div>

            {/* Arabic Content */}
            {contentAr && (
              <div dir="rtl" className="mb-8">
                {contentEn && (
                  <h3 className="font-bold text-slate-700 border-b pb-1 mb-4 text-right">
                    النص العربي
                  </h3>
                )}
                <div
                  className="prose prose-sm max-w-none text-slate-800"
                  style={{ direction: 'rtl', textAlign: 'right' }}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(contentAr) }}
                />
              </div>
            )}

            {/* English Content */}
            {contentEn && (
              <div dir="ltr" className="mt-8 pt-8 border-t">
                {contentAr && (
                  <h3 className="font-bold text-slate-700 border-b pb-1 mb-4">
                    English Version
                  </h3>
                )}
                <div
                  className="prose prose-sm max-w-none text-slate-800"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(contentEn) }}
                />
              </div>
            )}

            {/* Signature Block */}
            {contract?.signed_by_guardian && (
              <div className="mt-10 pt-6 border-t-2 border-green-500">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <p className="text-green-700 font-semibold">
                    ✓ {isRTL ? 'موقع إلكترونياً بواسطة:' : 'Digitally signed by:'} {contract.guardian_name}
                  </p>
                  <p className="text-green-600 text-sm">
                    {isRTL ? 'تاريخ التوقيع:' : 'Signed on:'}{' '}
                    {contract.signed_date ? new Date(contract.signed_date).toLocaleString() : ''}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 gap-2">
          <Button variant="outline" onClick={onClose}>
            <X className="w-4 h-4 me-2" />
            {isRTL ? 'إغلاق' : 'Close'}
          </Button>
          <Button onClick={handlePDFExport} className="gap-2">
            <Download className="w-4 h-4" />
            {isRTL ? 'تصدير PDF' : 'Export PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}