import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { z } from 'zod';
import { AuthenticatedRequest, requireRole, PAYROLL_ROLES } from '../middleware/auth.js';
import { generatePayslipPdf } from '../packs/sa/documents.js';

export const payslipPdfRouter = Router();

const PayslipPdfSchema = z.object({
  payslip_id:   z.string().uuid(),
  employee_id:  z.string().uuid(),
  period_month: z.number().int().min(1).max(12),
  period_year:  z.number().int().min(2000).max(2100),
});

payslipPdfRouter.post('/payslip-pdf', requireRole(PAYROLL_ROLES), async (req: AuthenticatedRequest, res) => {
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
