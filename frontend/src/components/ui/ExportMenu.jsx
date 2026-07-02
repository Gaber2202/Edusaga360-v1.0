import React, { useState } from 'react';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { Download, FileImage, FileText, Loader2 } from 'lucide-react';
import { useLanguage } from '../LanguageContext';

/**
 * Exports a DOM region (chart or whole dashboard section) to PNG or PDF from a
 * single button — works on mobile. Pass a ref to the element you want captured.
 * html2canvas / jspdf are dynamically imported so they stay out of the main
 * bundle until the user actually exports.
 *
 *   const ref = useRef(null);
 *   <div ref={ref}> ...charts... </div>
 *   <ExportMenu targetRef={ref} filename="finance-dashboard" />
 */
export default function ExportMenu({ targetRef, filename = 'export', className }) {
  const { isRTL } = useLanguage();
  const [busy, setBusy] = useState(false);

  const capture = async () => {
    const node = targetRef?.current;
    if (!node) return null;
    const { default: html2canvas } = await import('html2canvas');
    return html2canvas(node, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      // Ignore anything explicitly marked no-export (e.g. the button itself).
      ignoreElements: (el) => el.hasAttribute?.('data-no-export'),
    });
  };

  const exportPng = async () => {
    setBusy(true);
    try {
      const canvas = await capture();
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = `${filename}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.error('PNG export failed', e);
    } finally {
      setBusy(false);
    }
  };

  const exportPdf = async () => {
    setBusy(true);
    try {
      const canvas = await capture();
      if (!canvas) return;
      const { jsPDF } = await import('jspdf');
      const img = canvas.toDataURL('image/png');
      const landscape = canvas.width > canvas.height;
      const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 20;
      const ratio = Math.min((pageW - margin * 2) / canvas.width, (pageH - margin * 2) / canvas.height);
      const w = canvas.width * ratio;
      const h = canvas.height * ratio;
      pdf.addImage(img, 'PNG', (pageW - w) / 2, margin, w, h);
      pdf.save(`${filename}.pdf`);
    } catch (e) {
      console.error('PDF export failed', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy} className={className} data-no-export>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          <span className="ms-2 hidden sm:inline">{isRTL ? 'تصدير' : 'Export'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={isRTL ? 'start' : 'end'}>
        <DropdownMenuItem onClick={exportPng}>
          <FileImage className="w-4 h-4 me-2" /> {isRTL ? 'صورة PNG' : 'PNG image'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportPdf}>
          <FileText className="w-4 h-4 me-2" /> {isRTL ? 'ملف PDF' : 'PDF document'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
