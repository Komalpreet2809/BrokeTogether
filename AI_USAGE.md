# AI_USAGE.md

## Tools used

- **Claude (Claude Code / Opus 4.x)** — primary development collaborator: scaffolding,
  drafting the importer/balance logic, writing tests, and the docs.
- **Groq (`llama-3.3-70b-versatile`)** — *inside the product*, for the
  natural-language balance query only. It never computes money (see
  [DECISIONS.md #10](./DECISIONS.md)).

I directed the AI and reviewed every line; I remain the engineer of record. The
notes below are honest about where it got things wrong.

## How I worked with it

I gave the AI the assignment PDF and the raw CSV, had it enumerate the anomalies
first, then drove the build in small, reviewable steps (models → money → importer
→ balances → API → frontend), committing after each so the history shows the
reasoning. Money correctness and the import policy were specified by me; the AI
implemented them and I checked the output against the CSV by hand.

## Representative prompts

- *"Enumerate every data problem in this CSV with the exact row and why it's a
  problem. Don't fix anything yet."*
- *"Money must never be a float. Store integer minor units and split with a
  largest-remainder method so shares always sum to the exact total."*
- *"The importer must stage rows and require human approval for anything it
  changes or drops — nothing is written to the expense tables until commit."*
- *"For the AI query, the model must only phrase answers from numbers I compute.
  Pass the balances as facts, temperature 0, and fall back to raw facts if the
  API fails."*
- *"Walk the balance for Rohan by hand and confirm all members' nets sum to zero."*

## Three+ concrete cases where the AI was wrong

### 1. Row numbers didn't match the CSV file lines
**What it produced:** The importer numbered rows with `enumerate(rows, start=1)`,
so "row 5" in the report was the 5th *data* row — i.e. line 6 in the file. During
the live session, "point at this row" would have been off by one against the open
spreadsheet.
**How I caught it:** I cross-read the generated `IMPORT_REPORT.md` against the CSV
and the duplicate it flagged as "row 5" was actually on file line 6.
**What I changed:** Switched to `enumerate(rows, start=2)` (header is line 1) and
documented that `row_number` is the file line, so tracing is exact.
[`backend/importer/services.py`]

### 2. Ambiguous-date rule would have flagged half the file
**What it produced:** The first approach flagged a date as ambiguous whenever both
day and month were ≤ 12 (DD-MM vs MM-DD). That is true of `01-02`, `03-02`,
`05-02`… — it would have raised a false `AMBIGUOUS_DATE` on most rows and buried
the one that matters (`04-05-2026`).
**How I caught it:** Reasoning about the data: the file is internally consistent
DD-MM-YYYY, so flagging every early-month date is noise, not signal.
**What I changed:** Committed to DD-MM-YYYY file-wide and added a **chronological
spike detector** — a row is flagged only if its date is later than *both*
neighbours (a single-row anomaly), which pinpoints exactly line 34 and nothing
else. [`_detect_date_spikes` in `services.py`]

### 3. The import report wasn't reproducible across runs
**What it produced:** Re-running the import to regenerate the report showed **22**
anomalies instead of 24. The AI had implicitly assumed detection was stateless.
**How I caught it:** Diffing two generated reports. The missing two were
`NAME_VARIANT` for "Priya S" and `NEW_MEMBER` for "Kabir" — because the *first*
import had learned the alias and created Kabir, so the second import resolved them
silently.
**What I changed:** Recognized this is correct behaviour (the system learns
identities) but the *canonical* report must come from a **freshly seeded group**.
I fixed the doc-generation procedure to reset+seed before generating
`IMPORT_REPORT.md`, and documented that detection is intentionally stateful.

### 4. Dead validation code
**What it produced:** An early version stashed an `_unequal_sum_minor` value onto
a participant dict "for later validation" that was never read — and it put the
check where it had no access to the expense total.
**How I caught it:** Code review before committing the importer — the variable was
written but never used.
**What I changed:** Removed the dead code and added a real `UNEQUAL_SUM_MISMATCH`
check in `_interpret_row`, where the original-currency amount is available to
compare against the sum of the per-person amounts.

## What I verified myself (not the AI)

- Hand-checked that all members' net balances sum to **0** (a conservation
  invariant, also asserted in `balances.compute_net` and tested).
- Re-derived a few splits by hand: the 110%-percentage rows, the USD conversions
  (540 USD × 83.50 = 45,090 INR), and the `899.995 → 900.00` rounding.
- Confirmed the settlement on line 14 is stored as a `Settlement`, never an
  `Expense`, and that Meera is dropped from the April groceries split.
