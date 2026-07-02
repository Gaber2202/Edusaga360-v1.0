import { test, expect } from '@playwright/test';

/**
 * MONEY PATH (a): Student attendance check-in.
 *
 * Real flow (source of truth):
 *   Route:  /StudentAttendancePage        (frontend/src/App.jsx, createPageUrl -> "/" + name)
 *   Page:   frontend/src/pages/StudentAttendancePage.jsx  (default tab = "mark")
 *   Marker: frontend/src/components/attendance/BulkAttendanceMarker.jsx
 *           - all students default to "present"
 *           - submit button label: "Submit Attendance — N students" / "حفظ الحضور — N طالب"
 *           - writes to Supabase table `student_attendances` (upsert per student)
 *           - success toast (sonner): "Attendance saved — all present" / "✓ تم حفظ الحضور..."
 *
 * NOTE: this path writes directly to Supabase from the client (tenantQuery),
 * NOT through the Express backend. A seeded test tenant with active students
 * in the selected grade is required for the submit button to be enabled.
 */
test.describe('Attendance check-in (money path a)', () => {
  test('teacher can mark a class present and save', async ({ page }) => {
    await page.goto('/StudentAttendancePage');

    // Page heading confirms we landed on the attendance screen.
    // TODO(verify-selector): heading text is "Student Attendance" / "حضور الطلاب".
    await expect(
      page.getByRole('heading', { name: /student attendance|حضور الطلاب/i }),
    ).toBeVisible();

    // The "mark" tab is default. Grade/section are Radix Selects (combobox role).
    // TODO(verify-selector): default grade is "Grade1"; a seeded tenant must
    // have active students in this grade or the grid/submit will be empty.

    // Quick action: mark everyone present (button text "Present" / "حاضر").
    // TODO(verify-selector): these are plain <button>s, not role=button-named-testids.
    const markAllPresent = page.getByRole('button', { name: /^present$|^حاضر$/i }).first();
    if (await markAllPresent.isVisible().catch(() => false)) {
      await markAllPresent.click();
    }

    // Submit button text is dynamic: "Submit Attendance — N students".
    // TODO(verify-selector): add data-testid="attendance-submit" to the submit
    // <Button> in BulkAttendanceMarker.jsx for a stable hook.
    const submit = page.getByRole('button', { name: /submit attendance|حفظ الحضور/i });
    await expect(submit).toBeEnabled();
    await submit.click();

    // Success is signalled by a green "Saved successfully" panel + sonner toast.
    // TODO(verify-selector): assert the in-page saved panel OR the toast text.
    await expect(
      page.getByText(/saved successfully|تم الحفظ بنجاح|attendance saved|تم حفظ الحضور/i),
    ).toBeVisible({ timeout: 15_000 });
  });
});
