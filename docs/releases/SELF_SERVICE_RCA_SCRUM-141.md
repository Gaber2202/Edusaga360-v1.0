# Self Service RCA (SCRUM-141)

## Seeded employee
Use the HR demo seeder (`frontend/src/components/hr/HRDemoDataSeeder.jsx`) employee for ESS portal checks.

## Root causes (missing tables / disabled queries)
| Surface | Symptom | Root cause |
|---------|---------|------------|
| ESS settings / test mode | Features dark | `ess_settings` table missing; queries `enabled: false` |
| Leave / loan / expense requests | Save fails or list empty | `ess_requests` table missing |
| Onboarding tab | Empty / errors | `onboardings` flagged in schema drift |
| Assets tab | Empty | `asset_assignments` / `it_assets` missing |
| Disciplinary / training | Empty | `disciplinary_cases`, `trainings` missing |

## Recommendation for SCRUM-142
1. Add migrations for `ess_settings` + `ess_requests` (minimum).
2. Re-enable ESS queries gated on `hasTenantAccess`.
3. Link seeded employee id in `ess_settings.test_employee_id`.
4. Re-test ESS leave request + profile tabs.
