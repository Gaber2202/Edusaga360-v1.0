/**
 * Enrollment contract PDF (ADR-006 Category A — server-side render).
 * Shared renderer used by /api/contracts/:id/pdf; pack-specific clauses live in content.
 */

import http from 'http';
import https from 'https';
import PDFDocument from 'pdfkit';

function fetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function stripHtml(html: string): string {
  return String(html || '')
    .replace(/<\/(p|div|h[1-6]|li|br|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface ContractPdfInput {
  schoolNameEn?: string | null;
  schoolNameAr?: string | null;
  logoUrl?: string | null;
  contractNumber?: string | null;
  studentName?: string | null;
  guardianName?: string | null;
  academicYear?: string | null;
  grade?: string | null;
  netAmount?: number | null;
  currencyCode?: string | null;
  contentEn?: string | null;
  contentAr?: string | null;
  signerTypedName?: string | null;
  signedDate?: string | null;
  jurisdictionCode?: string | null;
}

export async function renderEnrollmentContractPdf(data: ContractPdfInput): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 48,
        info: {
          Title: `Enrollment Contract ${data.contractNumber || ''}`.trim(),
          Author: data.schoolNameEn || 'EduSaga 360',
        },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const MARGIN = 48;
      const PAGE_W = doc.page.width;
      const CONTENT_W = PAGE_W - MARGIN * 2;

      doc.rect(0, 0, PAGE_W, 90).fill('#1a3c5e');
      let logoLoaded = false;
      if (data.logoUrl) {
        try {
          const lb = await fetchBuffer(data.logoUrl);
          doc.image(lb, MARGIN, 12, { fit: [64, 64] });
          logoLoaded = true;
        } catch {
          /* logo optional */
        }
      }
      const nameX = logoLoaded ? MARGIN + 76 : MARGIN;
      doc.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold')
        .text(data.schoolNameEn || 'School', nameX, 22, { width: CONTENT_W - 80 });
      if (data.schoolNameAr) {
        doc.fontSize(11).font('Helvetica').text(data.schoolNameAr, nameX, 44, { width: CONTENT_W - 80 });
      }
      doc.fontSize(11).font('Helvetica-Bold')
        .text('ENROLLMENT CONTRACT', PAGE_W - MARGIN - 150, 28, { width: 150, align: 'right' });

      let y = 110;
      doc.fillColor('#222').fontSize(11).font('Helvetica');
      const meta = [
        `Contract #: ${data.contractNumber || '—'}`,
        `Jurisdiction: ${data.jurisdictionCode || '—'}`,
        `Student: ${data.studentName || '—'}`,
        `Guardian: ${data.guardianName || '—'}`,
        `Grade: ${data.grade || '—'}  |  Year: ${data.academicYear || '—'}`,
        `Net fees: ${data.netAmount != null ? Number(data.netAmount).toLocaleString() : '—'} ${data.currencyCode || ''}`.trim(),
      ];
      for (const line of meta) {
        doc.text(line, MARGIN, y, { width: CONTENT_W });
        y += 16;
      }
      y += 8;
      doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).stroke('#d0dce8');
      y += 16;

      const bodyEn = stripHtml(data.contentEn || '');
      const bodyAr = stripHtml(data.contentAr || '');
      if (bodyEn) {
        doc.font('Helvetica-Bold').fontSize(12).text('English', MARGIN, y);
        y = doc.y + 6;
        doc.font('Helvetica').fontSize(10).text(bodyEn, MARGIN, y, { width: CONTENT_W, align: 'left' });
        y = doc.y + 14;
      }
      if (bodyAr) {
        if (y > doc.page.height - 120) {
          doc.addPage();
          y = MARGIN;
        }
        doc.font('Helvetica-Bold').fontSize(12).text('Arabic', MARGIN, y);
        y = doc.y + 6;
        doc.font('Helvetica').fontSize(10).text(bodyAr, MARGIN, y, { width: CONTENT_W, align: 'right' });
        y = doc.y + 14;
      }

      if (data.signerTypedName || data.signedDate) {
        if (y > doc.page.height - 100) doc.addPage();
        doc.moveDown();
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a3c5e')
          .text('Signature audit', MARGIN, doc.y);
        doc.font('Helvetica').fontSize(10).fillColor('#222')
          .text(`Typed name: ${data.signerTypedName || '—'}`, MARGIN, doc.y + 4)
          .text(`Signed at: ${data.signedDate || '—'}`, MARGIN, doc.y + 4);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
