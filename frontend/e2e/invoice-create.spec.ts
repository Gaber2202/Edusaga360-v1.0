import { test, expect } from '@playwright/test';

/**
 * MONEY PATH (b): Invoice create.
 *
 * Real flow (source of truth):
 *   Route:  /Fees                          (frontend/src/App.jsx, createPageUrl)
 *   Page:   frontend/src/pages/Fees.jsx
 *           - header button "New Invoice" / "فاتورة جديدة" opens <NewInvoiceDialog>
 *   Dialog: NewInvoiceDialog (in Fees.jsx)
 *           - title "Create New Invoice" / "إنشاء فاتورة جديدة"
 *           - student search input -> pick a student from results
 *           - academic_year, due_date, installments, fee lines (amount required)
 *           - submit button "Create Invoice" / "إنشاء الفاتورة"
 *   API:    POST /api/billing/invoices      (backend/src/routes/billing.ts:454,
 *           requireRole(FINANCE_ROLES); vite proxies /api -> localhost:3001)
 *           - on success dialog shows "Invoice Created" + invoice_number + VAT summary
 *
 * REQUIRES: Express backend running AND a seeded finance test user + at least
 * one active student in the tenant. The login user must hold a FINANCE role.
 */
test.describe('Invoice create (money path b)', () => {
  test('finance user can create an invoice via the billing API', async ({ page }) => {
    await page.goto('/Fees');

    // Open the New Invoice dialog.
    // TODO(verify-selector): add data-testid="new-invoice" to the header button.
    await page.getByRole('button', { name: /new invoice|فاتورة جديدة/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByText(/create new invoice|إنشاء فاتورة جديدة/i),
    ).toBeVisible();

    // Student search -> pick first result.
    // TODO(verify-selector): placeholder is "Search by student name or number...".
    // Results are <button>s populated from GET /api/billing/students; a seeded
    // student is required. Add data-testid="student-result" for stability.
    await dialog
      .getByPlaceholder(/search by student name or number|ابحث باسم الطالب/i)
      .fill(process.env.E2E_STUDENT_QUERY || 'a'); // TODO(test-data): use a known seeded student name/number
    const firstStudent = dialog.locator('button', { hasText: /•/ }).first();
    await expect(firstStudent).toBeVisible({ timeout: 15_000 });
    await firstStudent.click();

    // Fee line amount is required for the submit button to enable.
    // TODO(verify-selector): the amount input is placeholder="SAR" in the fee line grid.
    await dialog.getByPlaceholder('SAR').first().fill('1000');

    // Submit -> POST /api/billing/invoices.
    // TODO(verify-selector): add data-testid="invoice-submit" to the Create button.
    const create = dialog.getByRole('button', { name: /create invoice|إنشاء الفاتورة/i });
    await expect(create).toBeEnabled();
    await create.click();

    // Success = "Invoice Created" panel with the generated invoice_number.
    await expect(
      dialog.getByText(/invoice created|تم إنشاء الفاتورة/i),
    ).toBeVisible({ timeout: 20_000 });
    // TODO(verify-selector): optionally assert an INV-* number and the VAT summary tile.
  });
});
