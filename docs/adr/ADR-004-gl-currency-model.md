# ADR-004: General Ledger Currency Model

## Status

**Accepted** — 1 August 2026. GL row counts confirmed empty (see *Data Point* below), which validates the premise this decision rests on. Unblocks Category E of `Phase_1_Lite_Migration_Spec.md`.

## Context

Phase 1-Lite adds `currency_code` to 77 monetary columns. Five of them belong to the accounting layer and cannot be treated like the others:

- `journal_entries.total_debit`, `journal_entries.total_credit`
- `journal_entry_lines.debit`, `journal_entry_lines.credit`
- `chart_of_accounts.balance`

A single `currency_code` on a ledger line is not a multi-currency general ledger. A real one records, per line: the **transaction** currency and amount, the **functional** (reporting) currency and amount, the **FX rate** applied, and the **rate date**. Without those, a group operating across currencies cannot produce a consolidated trial balance that balances, and cannot evidence how a foreign-currency amount was translated.

The ledger is also the one table set in the system that **cannot be rewritten**. Invoices can be reissued and student records corrected, but a posted journal is an audit artefact underpinning ZATCA filings, GOSI submissions and WPS runs. Whatever semantics the columns carry at first posting must remain true for the life of the record.

### What actually triggers multi-currency

The assumed trigger has been geographic expansion into the UAE or Qatar. That is deferred and not commercially committed. Two nearer triggers exist inside Saudi Arabia alone:

1. **Foreign supplier and licensing invoices** — international curriculum bodies, foreign software vendors, and overseas suppliers bill in GBP, USD or EUR. `purchase_orders`, `purchase_requisitions` and `expenses` post to the GL.
2. **International guardians** paying tuition from foreign accounts, or fees denominated in a non-SAR currency by arrangement.

Functional currency remains SAR regardless — ZATCA, GOSI and WPS reporting is SAR-denominated and that does not change. The question is only whether the original transaction currency is preserved alongside it.

## Decision

**Adopt Option 1 (single functional currency), executed so that Option 2 remains purely additive.**

Concretely:

1. Add `currency_code text NOT NULL` to `journal_entries` and `journal_entry_lines` (and to `chart_of_accounts` for `balance`), backfilled `'SAR'`.
2. **Document the semantics explicitly in the schema.** `debit`, `credit`, `total_debit`, `total_credit` and `balance` are **functional-currency amounts**. Record this as a column comment, not only in this ADR:

   ```sql
   COMMENT ON COLUMN journal_entry_lines.debit IS
     'Functional-currency amount. Currency given by journal_entry_lines.currency_code. See ADR-004.';
   ```

3. Add FX scaffolding now, unused: `fx_rate numeric(18,8) NOT NULL DEFAULT 1.0` and `fx_rate_date date` on `journal_entry_lines`. Every existing and near-term row carries rate 1.0 against itself.
4. Do **not** build an FX rate service, rate table, or revaluation logic. Not now.

Option 2 later becomes `ALTER TABLE ... ADD COLUMN debit_txn`, `currency_txn` — additive, with every historical row already unambiguous.

### Why this and not plain Option 1

Plain Option 1 is not wrong about storage; it is wrong about *semantics*. If the column is simply called `debit` with no documented meaning, then on the day transaction currency is introduced, nobody can say whether the existing eight years of postings are functional or transaction amounts. Resolving that on a posted ledger means reinterpreting an audit trail — which is not a migration, it is an accounting incident.

The expensive part of the Option 1 → Option 2 move is that ambiguity, not the column count. Naming and documenting the semantics now removes it at a cost of roughly one hour.

### Why not Option 2 outright

An earlier draft of this recommendation favoured full dual-currency columns immediately. That was formed before production row counts were known, on the assumption that the ledger already held meaningful history and that retrofitting would be painful.

With a near-empty ledger, the premise fails. The cost of moving Option 1 → Option 2 is proportional to posted rows. At effectively zero rows it is a schema change, not a data migration. Carrying six unused columns, dual-posting logic, and a rate concept through every accounting code path — to serve a requirement with no committed customer — is the over-engineering the parent work order explicitly warns against.

**This recommendation is conditional on that premise.** See *Open Data Point*.

## Alternatives Considered

**Option 1 (plain single currency).** One `currency_code`, no documented semantics, no scaffolding. Cheapest today. Rejected: leaves the semantic ambiguity that constitutes the actual future cost.

**Option 2 (full dual-currency now).** `currency_txn` / `amount_txn` / `currency_functional` / `amount_functional` / `fx_rate` / `fx_rate_date`, dual posting throughout. Correct for a multi-currency group. Rejected for now: no committed multi-currency requirement, an empty ledger removes the retrofit penalty, and the complexity taxes every accounting code path immediately.

**Option 3 (defer entirely).** Leave the GL columns untouched in Phase 1-Lite. Rejected: leaves the ledger as the only part of the system with no currency dimension, and the first real school posts a full term into it.

## Consequences

**Positive**
- Phase 1-Lite unblocks; Category E can be written and applied.
- No FX service, rate table, or revaluation logic to build, test or operate.
- Ledger semantics unambiguous from the first posted entry.
- The eventual Option 2 migration is additive, with no reinterpretation of history.

**Negative**
- Original transaction currency is not preserved. A USD supplier invoice posts as its SAR equivalent; the USD figure survives only on the source document, not in the ledger.
- `fx_rate` sits unused, which reads as speculative until it is needed.
- If multi-currency arrives sooner than expected, there is still a migration — smaller and additive, but real.

## Trade-offs

Operational simplicity now is prioritised over transaction-currency fidelity, on the basis that all current activity is SAR and no committed requirement exists. The irreversible risk — ambiguous semantics on an audit-grade table — is eliminated at negligible cost. The reversible risk — needing additional columns later — is accepted.

## Revisit Triggers

Reopen this ADR when **any** of the following occurs:

- A supplier, licensing body or vendor invoice must be posted in a non-SAR currency.
- A tuition contract is denominated in a currency other than SAR.
- A second jurisdiction moves from deferred to committed.
- A customer requires consolidated reporting across more than one currency.

Whoever hits a trigger first opens ADR-005 rather than working around this one.

## Data Point

Measured 1 August 2026:

| Table | Rows |
|---|---:|
| `journal_entries` | 0 |
| `journal_entry_lines` | 0 |
| `chart_of_accounts` | 0 |

The ledger is entirely empty. The retrofit cost of moving from Option 1 to Option 2 is therefore zero rows of posted accounting data, which is the premise this decision rests on. Option 1 with functional-currency semantics and FX scaffolding is adopted.

**Note for a future reader:** an empty `chart_of_accounts` alongside 58 existing invoices indicates the general ledger has never been posted to. Whether invoice issuance actually posts to the GL is a separate open question, tracked outside this ADR. It does not affect the currency decision.
