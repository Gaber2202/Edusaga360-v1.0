import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import https from 'https';
import http from 'http';
import { AuthenticatedRequest } from '../middleware/auth.js';

export const payslipPdfRouter = Router();


const ARABIC_MONTHS: Record<number, string> = {
  1: 'يناير', 2: 'فبراير', 3: 'مارس', 4: 'أبريل', 5: 'مايو', 6: 'يونيو',
  7: 'يوليو', 8: 'أغسطس', 9: 'سبتمبر', 10: 'أكتوبر', 11: 'نوفمبر', 12: 'ديسمبر',
};

const PayslipPdfSchema = z.object({
  payslip_id:   z.string().uuid(),
  employee_id:  z.string().uuid(),
  period_month: z.number().int().min(1).max(12),
  period_year:  z.number().int().min(2000).max(2100),
});

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

function formatSAR(amount: number): string {
  return amount.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function maskIban(iban: string | null | undefined): string {
  if (!iban) return '****';
  const clean = iban.replace(/\s+/g, '');
  return `****${clean.slice(-4)}`;
}

interface PayslipData {
  name_ar: string | null; name_en: string | null; employee_number: string | null;
  job_title_name: string | null; iban: string | null; nationality: string | null;
  hire_date: string | null; department_name: string | null;
  branch_name_ar: string | null; branch_name_en: string | null;
  company_name_ar: string | null; company_name_en: string | null; logo_url: string | null;
  period_month: number; period_year: number;
  basic_salary: number; housing_allowance: number; transport_allowance: number;
  teaching_allowance: number; overtime: number; bonus: number; other_allowances: number;
  gosi_employee: number; absence_deduction: number; loan_deduction: number;
  tuition_advance: number; penalties: number; other_deductions: number; gosi_employer: number;
}

async function generatePayslipPdf(data: PayslipData): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: 'Payslip / كشف راتب', Author: data.company_name_en ?? 'EduSaga 360' } });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const PAGE_WIDTH  = doc.page.width;
      const PAGE_HEIGHT = doc.page.height;
      const MARGIN      = 40;
      const CONTENT_W   = PAGE_WIDTH - MARGIN * 2;
      const COLOR_PRIMARY   = '#1a3c5e';
      const COLOR_SECONDARY = '#2d6a9f';
      const COLOR_RED       = '#c0392b';
      const COLOR_ROW_ALT   = '#f4f7fb';
      const COLOR_BORDER    = '#d0dce8';
      const COLOR_TEXT      = '#222222';
      const COLOR_MUTED     = '#666666';

      // Header
      doc.rect(0, 0, PAGE_WIDTH, 100).fill(COLOR_PRIMARY);
      let logoLoaded = false;
      if (data.logo_url) {
        try { const lb = await fetchBuffer(data.logo_url); doc.image(lb, MARGIN, 15, { fit: [70, 70] }); logoLoaded = true; } catch {}
      }
      const nameX = logoLoaded ? MARGIN + 80 : MARGIN;
      doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold').text(data.company_name_en ?? '', nameX, 22, { width: CONTENT_W - 160 });
      doc.fontSize(11).font('Helvetica').text(data.company_name_ar ?? '', nameX, 44, { width: CONTENT_W - 160 });
      doc.fontSize(20).font('Helvetica-Bold').fillColor('#ffffff').text('PAYSLIP', PAGE_WIDTH - MARGIN - 140, 18, { width: 140, align: 'right' });
      doc.fontSize(13).font('Helvetica').text('كشف راتب', PAGE_WIDTH - MARGIN - 140, 46, { width: 140, align: 'right' });

      // Period strip
      doc.rect(0, 100, PAGE_WIDTH, 28).fill(COLOR_SECONDARY);
      const monthAr   = ARABIC_MONTHS[data.period_month] ?? String(data.period_month);
      const periodStr = `${monthAr} ${data.period_year}   |   ${String(data.period_month).padStart(2, '0')}/${data.period_year}`;
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text(periodStr, MARGIN, 109, { width: CONTENT_W, align: 'center' });

      const now = new Date();
      const genDate = now.toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
      doc.fillColor(COLOR_MUTED).fontSize(8).font('Helvetica').text(`Generated: ${genDate}`, MARGIN, 136, { width: CONTENT_W, align: 'right' });

      // Employee details
      let curY = 150;
      doc.rect(MARGIN, curY, CONTENT_W, 20).fill(COLOR_SECONDARY);
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('EMPLOYEE DETAILS   /   بيانات الموظف', MARGIN + 6, curY + 5, { width: CONTENT_W - 12 });
      curY += 20;

      const employeeFields: Array<[string, string]> = [
        ['الاسم / Name',               data.name_en ? `${data.name_ar ?? ''} / ${data.name_en}` : (data.name_ar ?? '-')],
        ['الرقم الوظيفي / Employee ID', data.employee_number ?? '-'],
        ['المسمى الوظيفي / Job Title',  data.job_title_name ?? '-'],
        ['القسم / Department',          data.department_name ?? '-'],
        ['الفرع / Branch',              data.branch_name_en ? `${data.branch_name_ar ?? ''} / ${data.branch_name_en}` : (data.branch_name_ar ?? '-')],
        ['رقم الحساب / IBAN',           maskIban(data.iban)],
        ['تاريخ الالتحاق / Hire Date',  data.hire_date ?? '-'],
        ['الجنسية / Nationality',       data.nationality ?? '-'],
      ];

      const HALF_W = CONTENT_W / 2;
      const ROW_H  = 22;
      const LABEL_W = 140;
      employeeFields.forEach((field, idx) => {
        const col = idx % 2, row = Math.floor(idx / 2);
        const cellX = MARGIN + col * HALF_W, cellY = curY + row * ROW_H;
        doc.rect(cellX, cellY, HALF_W, ROW_H).fill(row % 2 === 0 ? '#ffffff' : COLOR_ROW_ALT).stroke(COLOR_BORDER);
        doc.fillColor(COLOR_MUTED).fontSize(7.5).font('Helvetica-Bold').text(field[0], cellX + 4, cellY + 4, { width: LABEL_W });
        doc.fillColor(COLOR_TEXT).fontSize(8.5).font('Helvetica').text(field[1], cellX + LABEL_W + 4, cellY + 4, { width: HALF_W - LABEL_W - 8, ellipsis: true });
      });
      curY += Math.ceil(employeeFields.length / 2) * ROW_H + 12;

      // Earnings / Deductions tables
      const COL_W = (CONTENT_W - 8) / 2;
      type LineItem = { label: string; amount: number };
      const earnings: LineItem[] = [{ label: 'الراتب الأساسي / Basic Salary', amount: data.basic_salary }];
      if (data.housing_allowance   > 0) earnings.push({ label: 'بدل السكن / Housing Allowance',    amount: data.housing_allowance   });
      if (data.transport_allowance > 0) earnings.push({ label: 'بدل النقل / Transport Allowance',  amount: data.transport_allowance });
      if (data.teaching_allowance  > 0) earnings.push({ label: 'بدل التدريس / Teaching Allowance', amount: data.teaching_allowance  });
      if (data.overtime            > 0) earnings.push({ label: 'العمل الإضافي / Overtime',         amount: data.overtime            });
      if (data.bonus               > 0) earnings.push({ label: 'مكافأة / Bonus',                   amount: data.bonus               });
      if (data.other_allowances    > 0) earnings.push({ label: 'بدلات أخرى / Other Allowances',    amount: data.other_allowances    });

      const grossSalary = data.basic_salary + data.housing_allowance + data.transport_allowance + data.teaching_allowance + data.overtime + data.bonus + data.other_allowances;
      const deductions: LineItem[] = [];
      if (data.gosi_employee     > 0) deductions.push({ label: 'التأمينات الاجتماعية / GOSI Employee', amount: data.gosi_employee    });
      if (data.absence_deduction > 0) deductions.push({ label: 'خصم الغياب / Absence Deduction',       amount: data.absence_deduction });
      if (data.loan_deduction    > 0) deductions.push({ label: 'قرض / Loan Deduction',                 amount: data.loan_deduction    });
      if (data.tuition_advance   > 0) deductions.push({ label: 'سلفة رسوم / Tuition Advance',          amount: data.tuition_advance   });
      if (data.penalties         > 0) deductions.push({ label: 'جزاءات / Penalties',                   amount: data.penalties         });
      if (data.other_deductions  > 0) deductions.push({ label: 'استقطاعات أخرى / Other Deductions',    amount: data.other_deductions  });
      const totalDeductions = data.gosi_employee + data.absence_deduction + data.loan_deduction + data.tuition_advance + data.penalties + data.other_deductions;
      const netSalary = Math.round((grossSalary - totalDeductions) * 100) / 100;

      function drawTable(startX: number, startY: number, title: string, items: LineItem[], totalLabel: string, totalAmount: number, totalColor: string): number {
        const ITEM_ROW_H = 18, TOTAL_H = 22, HEADER_H = 20;
        doc.rect(startX, startY, COL_W, HEADER_H).fill(COLOR_SECONDARY);
        doc.fillColor('#ffffff').fontSize(9.5).font('Helvetica-Bold').text(title, startX + 4, startY + 5, { width: COL_W - 8 });
        let y = startY + HEADER_H;
        items.forEach((item, idx) => {
          doc.rect(startX, y, COL_W, ITEM_ROW_H).fill(idx % 2 === 0 ? '#ffffff' : COLOR_ROW_ALT);
          doc.rect(startX, y, COL_W, ITEM_ROW_H).strokeColor(COLOR_BORDER).lineWidth(0.5).stroke();
          doc.fillColor(COLOR_TEXT).fontSize(8).font('Helvetica').text(item.label, startX + 4, y + 4, { width: COL_W - 70 });
          doc.fillColor(COLOR_TEXT).fontSize(8).font('Helvetica-Bold').text(formatSAR(item.amount), startX + COL_W - 70, y + 4, { width: 64, align: 'right' });
          y += ITEM_ROW_H;
        });
        doc.rect(startX, y, COL_W, TOTAL_H).fill(totalColor === COLOR_RED ? '#fdf2f2' : '#eaf2fb');
        doc.rect(startX, y, COL_W, TOTAL_H).strokeColor(COLOR_BORDER).lineWidth(1).stroke();
        doc.fillColor(totalColor).fontSize(9).font('Helvetica-Bold').text(totalLabel, startX + 4, y + 6, { width: COL_W - 80 });
        doc.fillColor(totalColor).fontSize(10).font('Helvetica-Bold').text(formatSAR(totalAmount), startX + COL_W - 80, y + 5, { width: 74, align: 'right' });
        return y + TOTAL_H;
      }

      const earningsEndY   = drawTable(MARGIN,          curY, 'EARNINGS   /   المكتسبات',    earnings, 'إجمالي المكتسبات / Gross Salary', grossSalary, COLOR_SECONDARY);
      const deductionsEndY = drawTable(MARGIN + COL_W + 8, curY, 'DEDUCTIONS   /   الاستقطاعات', deductions.length > 0 ? deductions : [{ label: 'لا توجد استقطاعات / No deductions', amount: 0 }], 'إجمالي الاستقطاعات / Total Deductions', totalDeductions, COLOR_RED);
      curY = Math.max(earningsEndY, deductionsEndY) + 16;

      // Net salary box
      const NET_BOX_H = 70;
      doc.rect(MARGIN, curY, CONTENT_W, NET_BOX_H).fill(COLOR_PRIMARY);
      doc.fillColor('#afc8e8').fontSize(11).font('Helvetica-Bold').text('صافي الراتب', MARGIN + 12, curY + 10, { width: 200, align: 'left' });
      doc.fillColor('#afc8e8').fontSize(11).font('Helvetica').text('NET SALARY', MARGIN + 12, curY + 26, { width: 200, align: 'left' });
      doc.fillColor('#ffffff').fontSize(28).font('Helvetica-Bold').text(formatSAR(netSalary), MARGIN, curY + 14, { width: CONTENT_W - 12, align: 'right' });
      doc.fillColor('#afc8e8').fontSize(10).font('Helvetica').text('ريال سعودي / SAR', MARGIN, curY + 46, { width: CONTENT_W - 12, align: 'right' });
      curY += NET_BOX_H + 12;

      // Employer GOSI (informational)
      if (data.gosi_employer > 0) {
        doc.rect(MARGIN, curY, CONTENT_W, 22).fill(COLOR_ROW_ALT).stroke(COLOR_BORDER);
        doc.fillColor(COLOR_MUTED).fontSize(8.5).font('Helvetica').text(`مساهمة صاحب العمل في التأمينات / Employer GOSI Contribution:   SAR ${formatSAR(data.gosi_employer)}  (informational only)`, MARGIN + 6, curY + 6, { width: CONTENT_W - 12 });
      }

      // Legal footer
      const FOOTER_Y = PAGE_HEIGHT - 60;
      doc.rect(0, FOOTER_Y, PAGE_WIDTH, 1).fill(COLOR_BORDER);
      doc.fillColor(COLOR_MUTED).fontSize(8).font('Helvetica-Bold').text('هذا الكشف وثيقة رسمية معتمدة   |   This payslip is an official document', MARGIN, FOOTER_Y + 8, { width: CONTENT_W, align: 'center' });
      doc.fillColor(COLOR_MUTED).fontSize(7.5).font('Helvetica').text(`${data.company_name_en ?? ''}   |   ${genDate}`, MARGIN, FOOTER_Y + 22, { width: CONTENT_W, align: 'center' });
      doc.fillColor(COLOR_MUTED).fontSize(7.5).font('Helvetica').text('Page 1 of 1', MARGIN, FOOTER_Y + 36, { width: CONTENT_W, align: 'center' });

      doc.end();
    } catch (err) { reject(err); }
  });
}

payslipPdfRouter.post('/payslip-pdf', async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = PayslipPdfSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', code: 400, errors: parsed.error.flatten() });
    }

    const tenant_id = req.user!.tenant_id!;
    const { payslip_id, employee_id, period_month, period_year } = parsed.data;

    const { data: rawEmployee, error: empError } = await supabase
      .from('employees').select('id, employee_number, name_ar, name_en, job_title_name, bank_iban, nationality, hire_date, department_name, branch_id')
      .eq('id', employee_id).eq('tenant_id', tenant_id).single();
    if (empError || !rawEmployee) return res.status(404).json({ error: 'Employee not found', code: 404 });
    const employee = rawEmployee as any;

    const { data: rawTenant, error: tenantError } = await supabase
      .from('tenants').select('id, name_ar, name_en, logo_url').eq('id', tenant_id).single();
    if (tenantError || !rawTenant) throw tenantError ?? new Error('Tenant not found');
    const tenant = rawTenant as any;

    let branchNameAr: string | null = null, branchNameEn: string | null = null;
    if (employee.branch_id) {
      const { data: bd } = await supabase.from('branches').select('name_ar, name_en').eq('id', employee.branch_id).eq('tenant_id', tenant_id).single();
      if (bd) { const b = bd as any; branchNameAr = b.name_ar ?? null; branchNameEn = b.name_en ?? null; }
    }

    const { data: rawPayslip, error: payslipError } = await supabase
      .from('payslip_lines').select('*').eq('id', payslip_id).eq('tenant_id', tenant_id).single();

    let pv: { basic_salary: number; housing_allowance: number; transport_allowance: number; teaching_allowance: number; overtime: number; bonus: number; other_allowances: number; gosi_employee: number; absence_deduction: number; loan_deduction: number; tuition_advance: number; penalties: number; other_deductions: number; gosi_employer: number; };

    if (payslipError || !rawPayslip) {
      const { data: rawSalary, error: salaryError } = await supabase
        .from('employees').select('basic_salary, housing_allowance, transport_allowance, other_allowances, nationality').eq('id', employee_id).eq('tenant_id', tenant_id).single();
      if (salaryError || !rawSalary) return res.status(404).json({ error: 'Payslip not found and no salary data available', code: 404 });
      const s = rawSalary as any;
      const basic = Number(s.basic_salary ?? 0);
      const otherSum = Object.values(s.other_allowances ?? {}).reduce((sum: number, v) => sum + Number(v ?? 0), 0);
      const isSaudi = /^(saudi|saudi arabia|sa|سعودي)$/i.test((employee.nationality ?? '').trim());
      const gosiWage = Math.min(basic, 45_000);
      pv = { basic_salary: basic, housing_allowance: Number(s.housing_allowance ?? 0), transport_allowance: Number(s.transport_allowance ?? 0), teaching_allowance: 0, overtime: 0, bonus: 0, other_allowances: otherSum, gosi_employee: Math.round(gosiWage * (isSaudi ? 0.09 : 0.015) * 100) / 100, absence_deduction: 0, loan_deduction: 0, tuition_advance: 0, penalties: 0, other_deductions: 0, gosi_employer: Math.round(gosiWage * (isSaudi ? 0.1175 : 0.02) * 100) / 100 };
    } else {
      const p = rawPayslip as any;
      pv = { basic_salary: Number(p.basic_salary ?? 0), housing_allowance: Number(p.housing_allowance ?? 0), transport_allowance: Number(p.transport_allowance ?? 0), teaching_allowance: Number(p.teaching_allowance ?? 0), overtime: Number(p.overtime ?? 0), bonus: Number(p.bonus ?? 0), other_allowances: Number(p.other_allowances ?? 0), gosi_employee: Number(p.gosi_employee ?? 0), absence_deduction: Number(p.absence_deduction ?? 0), loan_deduction: Number(p.loan_deduction ?? 0), tuition_advance: Number(p.tuition_advance ?? 0), penalties: Number(p.penalties ?? 0), other_deductions: Number(p.other_deductions ?? 0), gosi_employer: Number(p.gosi_employer ?? 0) };
    }

    const pdfBuffer = await generatePayslipPdf({
      name_ar: employee.name_ar ?? null, name_en: employee.name_en ?? null, employee_number: employee.employee_number ?? null,
      job_title_name: employee.job_title_name ?? null, iban: employee.bank_iban ?? null, nationality: employee.nationality ?? null,
      hire_date: employee.hire_date ?? null, department_name: employee.department_name ?? null,
      branch_name_ar: branchNameAr, branch_name_en: branchNameEn,
      company_name_ar: tenant.name_ar ?? null, company_name_en: tenant.name_en ?? null, logo_url: tenant.logo_url ?? null,
      period_month, period_year, ...pv,
    });

    const filename = `payslip_${employee_id}_${period_month}_${period_year}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('Failed to generate payslip PDF:', err);
    if (!res.headersSent) return res.status(500).json({ error: 'Failed to generate payslip PDF', code: 500 });
  }
});
