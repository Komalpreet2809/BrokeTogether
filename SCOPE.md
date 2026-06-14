# SCOPE.md — Anomaly Log & Database Schema

This document lists every data problem found in `data/expenses_export.csv`, how
the app **detects** it, and the **policy** it applies. The live, machine-generated
version is [`IMPORT_REPORT.md`](./IMPORT_REPORT.md), produced by the app on every
import (`python manage.py import_csv`).

Row numbers below are **file line numbers** (line 1 is the header), matching what
you see when you open the CSV. The detection code lives in
[`backend/importer/parsing.py`](./backend/importer/parsing.py) (field-level rules)
and [`backend/importer/services.py`](./backend/importer/services.py) (cross-row
rules: duplicates, chronology, membership).

## Handling principle

> A crashed import and a silent guess are both failures.

So every row is **staged**, never written directly. Clean rows auto-approve;
**any row the app changes, drops, merges or skips is held for human approval**
(Meera's request). Nothing becomes a real expense until a human commits.

---

## The anomalies

| # | CSV line(s) | Problem | Code | Detection | Policy / action taken |
|---|-------------|---------|------|-----------|-----------------------|
| 1 | 5 & 6 | Same dinner logged twice ("Dinner at Marina Bites" / "dinner - marina bites"), identical date+payer+amount | `DUPLICATE` | Same date + payer + amount and ≥0.5 description-token overlap | Keep the first, **drop the second**. Held for approval. |
| 2 | 24 & 25 | Same Thalassa dinner, **different** payer & amount (₹2400/Aisha vs ₹2450/Rohan) | `CONFLICTING_DUPLICATE` | Same date + high token overlap, but payer **or** amount differs | Keep the first by default, drop the second, **flag for human decision** (only one is correct). |
| 3 | 7 | Amount has a thousands separator: `"1,200"` | `THOUSANDS_SEPARATOR` | Comma present in amount | Strip the comma, parse as `1200`. (info) |
| 4 | 10 | Sub-paisa precision: `899.995` | `SUBUNIT_PRECISION` | More than 2 decimal places | Round **HALF_UP** to `900.00`. Rounding rule isolated in `money.to_minor`. |
| 5 | 9, 27 | Name case / whitespace: `priya`, `rohan ` (trailing space) | `NAME_NORMALIZED` | Normalized name matches a member case-insensitively but differs in case/space | Match to the canonical member. (info) |
| 6 | 11 | Name variant: `Priya S` | `NAME_VARIANT` | First token matches a unique member | Resolve to `Priya`, **record an alias** so it's auditable. |
| 7 | 13 | Missing payer (blank `paid_by`, "can't remember who paid") | `MISSING_PAYER` | `paid_by` empty | **Skip** — an expense cannot be attributed without a payer. Held for approval. |
| 8 | 14 | Settlement logged as an expense ("Rohan paid Aisha back", blank split_type) | `SETTLEMENT_NOT_EXPENSE` | One recipient + blank split_type (or transfer keywords) | Record as a **Settlement** (moves the balance, is not split), not an Expense. |
| 9 | 38 | Deposit transfer ("Sam deposit share", paid to Aisha only) | `SETTLEMENT_NOT_EXPENSE` | One recipient + keyword (`deposit`/`paid`) | Record as a Settlement Sam → Aisha. Flagged for review (see note below). |
| 10 | 15, 32 | Percentages sum to 110%, not 100% | `PERCENTAGE_SUM` | Sum of percentage values ≠ 100 | Treat percentages as **relative weights** and allocate proportionally (so shares still sum to the exact total). |
| 11 | 20, 21, 23, 26 | Amounts in **USD**, not the base currency | `CURRENCY_CONVERTED` | Currency ≠ base (`INR`) | Convert at a fixed, documented rate **1 USD = 83.50 INR**; store original + converted + the rate used. (info) |
| 12 | 26 | Negative amount: `-30 USD` parasailing refund | `NEGATIVE_AMOUNT` | Amount < 0 | Treat as a **refund** — keep negative so it reduces what members owe. |
| 13 | 22, 35 | `share` split type with ratio weights (e.g. `Aisha 1; Rohan 2`) | *(supported, not an anomaly)* | Recognized split type | Allocate by ratio using largest-remainder. |
| 14 | 23 | Non-member participant: `Dev's friend Kabir` (one day) | `NEW_MEMBER` | Name resolves to no existing member/alias | **Create as a guest** participant, include in this expense, flag it. |
| 15 | 27 | Non-standard date with no year: `Mar-14` | `DATE_FORMAT` | Matches `MMM-DD` pattern | Parse as `2026-03-14`, inferring the year from the rest of the file. |
| 16 | 34 | Ambiguous date `04-05-2026` ("April 5 or May 4?"), out of order | `AMBIGUOUS_DATE` | Date is a single-row chronological spike **and** both parts ≤ 12 | Apply the file's dominant format **DD-MM-YYYY** consistently → `2026-05-04`; flag for review. |
| 17 | 28 | Missing currency (blank, "forgot to set currency") | `MISSING_CURRENCY` | Currency blank | Default to the group's base currency (`INR`). |
| 18 | 31 | Zero amount: `0` ("counted twice earlier") | `ZERO_AMOUNT` | Amount parses to 0 | **Skip** — a zero expense affects no balance. Held for approval. |
| 19 | 36 | Member who left still in the split (Meera, after moving out end-March) | `INACTIVE_MEMBER_IN_SPLIT` | Participant not active on the expense date (membership window) | **Remove** the inactive member from the split. Held for approval. |
| 20 | 42 | `split_type=equal` but per-person shares also given | `SPLIT_DETAILS_IGNORED` | Equal type with non-empty `split_details` | Honor `equal`, ignore the redundant shares. |
| 21 | (any unequal) | Exact split amounts don't add up to the total | `UNEQUAL_SUM_MISMATCH` | Σ(details) ≠ amount | Allocate proportionally so shares still sum to the total; flag the mismatch. *(Not triggered by the sample — line 12 sums correctly — but implemented.)* |

That is **20 distinct problem types** across the file (the brief promised "at
least 12"), surfaced as **24 anomaly instances** on a first import.

### A documented judgement call — the Sam deposit (line 38)

"Sam deposit share … paid Aisha his deposit" is genuinely ambiguous: it could be
a flat security deposit Aisha merely *collected* (shouldn't affect peer balances)
or money Sam *owes the group* via Aisha. We treat it as a **transfer Sam → Aisha**
(our settlement policy) **and flag it for review** so a human can reject it if the
deposit is really the landlord's. This is exactly the "surface, don't silently
guess" behaviour the brief asks for.

---

## Membership over time (Sam & Meera)

Membership is **time-bounded** on the `Member` model via `joined_on` / `left_on`:

- Aisha, Rohan, Priya: members since the start (`joined_on = NULL`).
- **Meera**: `left_on = 2026-03-31` → excluded from any expense dated after that
  (line 36 April groceries drops her automatically).
- **Sam**: `joined_on = 2026-04-08` → March electricity can never touch him.
- **Dev**: `is_guest = True` (trip participant, never a standing member).
- **Kabir**: discovered from the CSV and created as a guest.

`Member.is_active_on(date)` is the single source of truth, used by both the
importer and the manual "add expense" path.

---

## Database schema

Relational (PostgreSQL in production, SQLite locally). All money is stored as
**integer minor units** (paise/cents) — never floats.

```
User (Django auth)
  └─ owns ─< Group (id, name, owner, base_currency)
                ├─< Member (id, group, name, user?, joined_on, left_on, is_guest)
                │      └─< MemberAlias (id, member, raw_name)        # identity resolution
                ├─< Expense (id, group, description, paid_by→Member, date,
                │            amount_minor, currency, amount_base_minor, fx_rate,
                │            split_type, notes, import_batch?, source_row)
                │      └─< ExpenseSplit (id, expense, member→Member,
                │                        share_minor, raw_value)     # who owes what
                ├─< Settlement (id, group, from_member→Member, to_member→Member,
                │               date, amount_minor, currency, amount_base_minor,
                │               fx_rate, notes, import_batch?, source_row)
                └─< ImportBatch (id, group, uploaded_by, filename, status,
                                 raw_row_count, created_at, committed_at)
                       ├─< StagedRow (id, batch, row_number, raw(json), parsed(json),
                       │              proposed_action, status, decided_by, decided_at)
                       └─< Anomaly (id, batch, row→StagedRow, row_number, code,
                                    severity, field, message, action_taken,
                                    raw_value, resolved_value)        # the import report
```

Key design points (rationale in [DECISIONS.md](./DECISIONS.md)):

- **Money as integer minor units** + a separate `*_base_minor` + stored `fx_rate`
  → exact arithmetic and a fully auditable currency conversion.
- **Settlement is its own table**, not an Expense → settlements move balances
  without ever being split or double-counted.
- **`ExpenseSplit.share_minor`** is the concrete amount used in balance math;
  `raw_value` keeps the original percent/share/amount so any number can be
  explained ("no magic numbers" — Rohan).
- **`source_row` + `import_batch`** on every imported record → trace any balance
  back to the exact CSV line in the live session.
- **StagedRow + Anomaly** make the import a reviewable, approvable artefact
  rather than a black box.
