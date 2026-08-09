# ADR-008: Multi-Currency Aggregation for Cross-Border Groups

## Status

**Proposed** — decision required. Blocks the cross-border group fix identified in Task 14.

## Context

Task 14 created one tenant with three branches — Riyadh (SA), Dubai (AE), Doha (QA) — and issued one invoice per branch:

| Branch | Currency | Total |
|---|---|---|
| Riyadh | SAR | 2,575 |
| Dubai | AED | 2,525 |
| Doha | QAR | 2,500 |

The Executive Command Center reported group revenue of **10,175** and labelled it **SAR**.

That figure is meaningless. `MetricsService.getDashboard` adds `total_amount` values numerically with no conversion, no rate source, and no stated presentation currency. It treats three currencies as one unit.

The number is also plausible enough to go unchallenged in a board pack, which is what makes it dangerous. A wrong total that looks reasonable is worse than a visible gap.

This was deliberately deferred in ADR-004, which recorded that FX handling was not being built. Task 14 is the point at which the deferral stops being acceptable, because the Executive Command Center is the screen sold to portfolio operators — the exact buyer for whom cross-border matters.

## Decision

**Do not aggregate across currencies. Report per-currency subtotals, and state the currency on every figure.**

Concretely:

1. **Where all branches in scope share one currency** — behave exactly as today. A single total, labelled with that currency. This is every current customer and every near-term customer.
2. **Where branches in scope span multiple currencies** — return a **breakdown**, not a sum:
   ```
   Revenue
     SAR  2,575
     AED  2,525
     QAR  2,500
   ```
   No combined figure. No implied conversion.
3. **Every monetary figure carries its currency code.** No unlabelled numbers anywhere in the Executive Command Center.
4. **Ratios that are currency-independent stay aggregated** — collection *rate*, occupancy, headcount, attendance. A percentage is not denominated in riyals. Only absolute money amounts split.
5. **Do not build an FX service.** No rate table, no rate provider, no revaluation.

## Alternatives Considered

**Option A — Convert to a presentation currency.** The group picks a reporting currency; amounts convert at a rate. Correct for a mature multi-currency group, and what a group CFO ultimately wants.

Rejected for now: it requires a rate source, a rate-date policy (transaction date, period-end, or average), a stored rate for auditability, and a defensible answer when the auditor asks which rate was used and why. That is a real build, and no customer has yet asked for it. Building it speculatively means guessing at a rate policy the customer will want to set themselves.

**Option B — Keep summing (status quo).** Rejected outright. It produces a wrong number that looks right.

**Option C — Block mixed-currency groups entirely.** Refuse to render the group view and require a single-currency selection. Rejected: it removes a capability that works fine at the branch level and makes the product look less capable than it is.

## Consequences

**Positive**
- No wrong numbers. Every figure is defensible.
- Cheap — a grouping change in the metrics service, not a new subsystem.
- Honest in a sales conversation, and the honesty is a differentiator: *"we don't convert your currencies without your rate policy — tell us your rate source and we'll add it."* That is a better answer than a silent conversion the CFO discovers later.
- Single-currency groups, which is everyone today, see no change.

**Negative**
- A group CFO does not get a single headline revenue number. Some will ask for one.
- The Executive Command Center layout must handle a variable number of currency rows.
- Charts and trend lines need a currency dimension or must be rendered per currency.

## Revisit Triggers

Open ADR-009 for a presentation-currency build when **any** of these occurs:

- A signed customer operates branches in more than one currency and asks for a consolidated figure.
- A customer states their rate policy — source, date convention, and how it is audited.
- Statutory consolidated reporting across currencies becomes a requirement.

At that point the design is Option A, and ADR-004's FX scaffolding on `journal_entry_lines` (`fx_rate`, `fx_rate_date`, currently unused and set to 1.0) is the foundation it builds on. That scaffolding was added precisely so this migration would be additive.

## Note on Scope

This ADR governs **aggregation and display**. It does not change how individual invoices are denominated — each invoice already carries its own `currency_code` correctly, verified in Task 14 at both the database and UI level for single-country tenants.
