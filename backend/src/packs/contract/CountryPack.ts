/**
 * src/packs/contract/CountryPack.ts
 *
 * Jurisdiction-specific pack contract. Zero country logic — this file only defines
 * the interface boundary between generic domain code and country implementations.
 *
 * All properties are optional because Step 2 is scaffolding; `packs/sa` will be
 * filled in module-by-module and `packs/ae` / `packs/qa` will be added later.
 */

import type { JurisdictionCode, RequestContext } from '../../lib/jurisdiction.js';

// ─────────────────────────────────────────────────────────────────────────────
// Tax
// ─────────────────────────────────────────────────────────────────────────────

export interface VatCategory {
  code: string;
  rate: number;
  name?: string;
}

export interface TaxService {
  /** Standard VAT rate for the jurisdiction (e.g. 0.15 for KSA). */
  readonly standardVatRate?: number;

  /** Resolve the VAT rate for a line-item category, optionally as of an issue date. */
  vatRateForCategory?(category: string, fallbackRate?: number, asOf?: Date | string): number;

  /** Resolve the UBL/ZATCA category code for a category name. */
  categoryCode?(category: string): string;

  /** Compute a jurisdiction-aware VAT summary for an invoice.
   *  Optional supabase client is used by DB-driven packs to load effective-dated
   *  rates from jurisdiction_tax_rules. */
  computeVatSummary?(invoice: unknown, supabase?: unknown): unknown | Promise<unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// E-Invoicing
// ─────────────────────────────────────────────────────────────────────────────

export interface EInvoiceService {
  /** Generate UBL 2.1 XML for regulatory submission. */
  generateUBLXml?(invoice: unknown, tenant: unknown): string;

  /** Compute the SHA-256 XML hash required for signing and QR. */
  generateInvoiceHash?(xml: string): string;

  /** Sign the invoice hash (ECDSA over SHA-256). */
  signInvoice?(xmlHash: string, privateKeyPem?: string): string;

  /** Generate the base64 TLV payload for the ZATCA QR code. */
  generateTLVQR?(invoice: unknown, tenant: unknown, signature: string): string;

  /** Build the bilingual HTML that is rendered into the PDF. */
  buildInvoiceHTML?(invoice: unknown, tenant: unknown, qrDataUrl: string, showFooter?: boolean): string;

  /** Render a complete ZATCA-compliant PDF/A-3 invoice. */
  generatePDF?(invoice: unknown, tenant: unknown): Promise<Buffer>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payments
// ─────────────────────────────────────────────────────────────────────────────

export interface PaymentLinkOptions {
  tenantId: string;
  invoiceId: string;
  installmentId?: string | null;
  callbackUrl: string;
  successUrl?: string;
  backUrl?: string;
  sourceType?: string;
  studentFirstName?: string;
}

export interface PaymentLinkResult {
  ok: boolean;
  paymentUrl?: string;
  error?: string;
}

export interface SadadBillResult {
  sadad_bill_number: string;
  amount: number;
  due_date: string | null;
  payment_instructions: { ar: string; en: string };
}

export interface PaymentsService {
  /** Create or refresh a hosted payment link for an invoice. */
  createOrRefreshPaymentLink?(supabase: unknown, options: PaymentLinkOptions): Promise<PaymentLinkResult>;

  /** Get an existing active payment link, or create a new one if none exists. */
  getOrCreatePaymentLink?(supabase: unknown, options: PaymentLinkOptions): Promise<PaymentLinkResult>;

  /** Process a webhook payload from the payment provider. */
  processWebhook?(supabase: unknown, payload: unknown, signature?: string): Promise<unknown>;

  /** Refund a payment, optionally for a partial amount. */
  refundPayment?(supabase: unknown, tenantId: string, paymentId: string, amount?: number): Promise<unknown>;

  /** Generate a SADAD bill number for an invoice (Saudi national payment scheme). */
  generateSadadBill?(supabase: unknown, tenantId: string, invoiceId: string): Promise<SadadBillResult>;

  /** Reconcile local payment state against the provider (e.g. Moyasar). */
  reconcilePaymentState?(supabase: unknown, tenantId: string, since?: string): Promise<unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Identity
// ─────────────────────────────────────────────────────────────────────────────

export interface IdentityService {
  /** Validate a national ID / Iqama / residency number. */
  validateNationalId?(id: string): boolean;

  /** Validate an IBAN for the jurisdiction. */
  validateIban?(iban: string): boolean;

  /** Format a national ID for display. */
  formatNationalId?(id: string): string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payroll
// ─────────────────────────────────────────────────────────────────────────────

export interface GosiResult {
  employee: number;
  employer: number;
  total: number;
}

export interface PayrollService {
  /** Calculate GOSI contributions for one employee. */
  calculateGosi?(basicSalary: number, nationality: string): GosiResult;

  /** Run a full payroll calculation for a period. */
  calculatePayroll?(
    supabase: unknown,
    tenantId: string,
    period: { start: string; end: string },
    employeeIds?: string[],
  ): Promise<unknown>;

  /** Generate the WPS / Mudad bank file for a period. */
  generateWpsFile?(
    supabase: unknown,
    tenantId: string,
    period: { start: string; end: string },
  ): Promise<{ filename: string; content: string }>;

  /** End-of-service gratuity for one employee (foreign workers). */
  calculateEndOfServiceBenefit?(
    basicSalary: number,
    yearsOfService: number,
    nationality?: string,
  ): { amount: number; currencyCode: string };

  /** Annual leave entitlement in days for a given length of service. */
  calculateAnnualLeave?(yearsOfService: number, isPartTime?: boolean): number;

  /** Overtime pay for a given number of extra hours. */
  calculateOvertime?(
    basicSalary: number,
    normalHoursPerMonth: number,
    overtimeHours: number,
    isNight?: boolean,
    isRestDay?: boolean,
  ): { amount: number; currencyCode: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// Government Integrations
// ─────────────────────────────────────────────────────────────────────────────

export interface GovIntegrationsService {
  /** Nafath identity verification (placeholder). */
  nafath?: Record<string, unknown>;

  /** Qiwa contract status (placeholder). */
  qiwa?: Record<string, unknown>;

  /** Mudad payroll / WPS submission (placeholder). */
  mudad?: Record<string, unknown>;

  /** Muqeem residency / visa check (placeholder). */
  muqeem?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Regulator Reports
// ─────────────────────────────────────────────────────────────────────────────

export interface RegulatorReportsService {
  /** Nitaqat / Saudization calculation for a tenant. */
  calculateNitaqat?(
    supabase: unknown,
    tenantId: string,
    options?: {
      branchId?: string;
      employees?: unknown[];
      departments?: unknown[];
    },
  ): Promise<unknown>;

  /** ZATCA VAT return computation. */
  calculateVatReturn?(supabase: unknown, period: { start: string; end: string }): Promise<unknown>;

  /** MHRSD workforce report CSV. */
  generateMHRSDReport?(supabase: unknown, tenantId: string): Promise<string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Academic Calendar
// ─────────────────────────────────────────────────────────────────────────────

export interface AcademicCalendarService {
  /** Resolve the active academic year for a date. */
  currentAcademicYearForDate?(supabase: unknown, tenantId: string, date?: Date | string): Promise<unknown>;

  /** Resolve the academic year immediately before a given start date. */
  academicYearBefore?(supabase: unknown, tenantId: string, startDate: string): Promise<unknown>;

  /** List term boundaries for an academic year. */
  termBoundariesForYear?(yearLabel: string): Array<{ start: string; end: string; name: string }>;

  /** Format a date as Hijri for display. */
  formatHijri?(date: Date | string, locale?: 'ar' | 'en'): string;

  /** Convert a Gregorian date to Umm al-Qura Hijri parts. */
  gregorianToHijri?(date: Date | string): { year: number; month: number; day: number };

  /** Convert Umm al-Qura Hijri parts to a Gregorian date. */
  hijriToGregorian?(year: number, month: number, day: number): Date;

  /** Zero-padded numeric Hijri string, e.g. "1448-01-17". */
  hijriNumeric?(date: Date | string): string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fee Governance
// ─────────────────────────────────────────────────────────────────────────────

export interface FeeIncreaseInput {
  tenantId: string;
  branchId?: string;
  regulatorCode?: string;
  currentTuition: number;
  proposedTuition: number;
  academicYear: string;
  occupancyRate?: number;
  yearsOfOperation?: number;
  hasAuditedLosses?: boolean;
  rating?: string;
  eci?: number;
}

export interface FeeIncreaseResult {
  permitted: boolean;
  maxIncreasePct?: number;
  maxTuition?: number;
  reason: string;
}

export interface FeeGovernanceService {
  /** Evaluate whether a proposed tuition increase is permitted under the
   *  branch's regulator rules. Returns a result; throws
   *  NotImplementedInJurisdiction if no rule is configured for the regulator. */
  evaluateFeeIncrease?(
    supabase: unknown,
    jurisdictionCode: string,
    input: FeeIncreaseInput,
  ): Promise<FeeIncreaseResult>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Documents
// ─────────────────────────────────────────────────────────────────────────────

/** TODO: Document template set. Templates currently live in the frontend
 * (`frontend/src/components/yamen/yamenUtils.jsx`, `ContractPreviewModal.jsx`,
 * `YamenDraftDocuments.jsx`, etc.). This type is intentionally left as a marker
 * until Muhammed decides how to move document generation to the backend. */
export type DocumentTemplateSet = never;

export interface DocumentsService {
  /** Render an already-backend invoice to a ZATCA-compliant PDF. */
  renderInvoicePdf?(invoice: unknown, tenant: unknown): Promise<Buffer>;

  /** Render an already-backend payslip to a PDF. */
  renderPayslipPdf?(payslipData: unknown): Promise<Buffer>;

  /**
   * TODO: Category A and B document generation (HR letters, contracts, VAT
   * returns, MHRSD reports) is intentionally not implemented here.
   * See ADR-006 and Task 8b.
   */
  buildDocument?<T extends DocumentTemplateSet>(
    templateKey: string,
    variables: Record<string, unknown>,
  ): T;

  /** TODO: Category A and B; see ADR-006 and Task 8b. */
  renderPdf?<T extends DocumentTemplateSet>(document: T): Promise<Buffer>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Localisation
// ─────────────────────────────────────────────────────────────────────────────

export interface CurrencyFormatOptions {
  value: number;
  currency?: string;
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

export interface LocalisationService {
  /** Format a money value for display (SAR, AED, QAR, etc.). */
  formatMoney?(options: CurrencyFormatOptions): string;

  /** Convert a major-currency amount to minor units (halalas, fils, dirham). */
  toMinorUnits?(amount: number | string, minorUnits?: number): number;

  /** Convert minor units back to a major-currency amount. */
  toMajorUnits?(amountMinor: number | string, minorUnits?: number): number;

  /** Round a major-unit amount to the currency's minor-unit precision. */
  roundToMinorUnits?(amount: number | string, minorUnits?: number): number;

  /** Format a number for the jurisdiction. */
  formatNumber?(value: number, locale?: string): string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Country Pack
// ─────────────────────────────────────────────────────────────────────────────

export interface CountryPack {
  readonly code: JurisdictionCode;
  readonly tax?: TaxService;
  readonly eInvoice?: EInvoiceService;
  readonly payments?: PaymentsService;
  readonly identity?: IdentityService;
  readonly payroll?: PayrollService;
  readonly govIntegrations?: GovIntegrationsService;
  readonly regulatorReports?: RegulatorReportsService;
  readonly academicCalendar?: AcademicCalendarService;
  readonly feeGovernance?: FeeGovernanceService;
  readonly documents?: DocumentsService;
  readonly localisation?: LocalisationService;
}

export type { JurisdictionCode, RequestContext };
