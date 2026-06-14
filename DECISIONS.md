# DECISIONS.md — Decision Log

Each significant decision, the options considered, and why we chose what we chose.

---

### 1. Money stored as integer minor units, never floats
**Options:** (a) `float`, (b) `Decimal` columns, (c) integer paise/cents.
**Chosen:** (c) integer minor units, with display formatting only at the edge.
**Why:** Floats can't represent `0.1 + 0.2` exactly — fatal for a ledger.
Integers make every sum exact and every split verifiable by hand. `Decimal` is
used transiently for parsing/rounding (`money.py`) but the stored, summed values
are integers. This is the single most important correctness decision.

### 2. Split shares use the largest-remainder method
**Options:** (a) round each share independently, (b) give the remainder to one
person, (c) largest-remainder apportionment.
**Chosen:** (c) — see `money.allocate`.
**Why:** Independent rounding makes shares not sum to the total (₹100/3 →
33.33×3 = 99.99, a lost paisa). Largest-remainder distributes the leftover units
to the largest fractional remainders, so shares **always** sum to the exact
total. Works uniformly for equal / unequal / percentage / share splits.

### 3. Rounding rule = HALF_UP, isolated in one function
**Why:** The brief explicitly says they may ask us to *change the rounding rule
live*. It lives in exactly one place (`money.to_minor`), so the change is a
one-line edit. HALF_UP matches everyday cash intuition (`899.995 → 900.00`).

### 4. Settlements are a separate table, not expenses
**Options:** (a) model a settlement as an expense with a special split, (b) a
dedicated `Settlement` table.
**Chosen:** (b).
**Why:** A settlement (line 14 "Rohan paid Aisha back") moves money between two
people; it is **not** a shared cost and must never be split or counted as group
spending. A separate table keeps balance math honest and makes "record a
payment" (a required feature) trivial. It also cleanly answers the brief's
question "is this a settlement or an expense?".

### 5. Two-phase import: stage → approve → commit
**Options:** (a) import directly, flagging issues after the fact, (b) stage
everything for review and only write on approval.
**Chosen:** (b).
**Why:** Meera asked to approve anything the app deletes or changes, and the
brief forbids both crashes and silent guesses. Staging writes only
`ImportBatch/StagedRow/Anomaly`; **no** expense exists until a human commits.
Clean rows auto-approve; anything we altered is held for review. The recommended
action is pre-computed so "approve" means "accept our policy".

### 6. Membership is time-bounded (joined_on / left_on)
**Options:** (a) a flat member list per group, (b) per-member date windows, (c) a
full membership-interval table supporting re-joins.
**Chosen:** (b).
**Why:** It directly answers Sam ("why does March electricity affect me?") and
Meera (left end-March). `is_active_on(date)` decides whether an expense touches a
member. We chose (b) over (c) because the data only needs one join and one leave
per person; (c) (an interval table) is the documented next step if re-joining
becomes a requirement.

### 7. Currency: convert to a base currency at a fixed, stored rate
**Options:** (a) live FX API, (b) a fixed documented rate captured at import,
(c) keep multi-currency and never convert.
**Chosen:** (b) — `FX_RATES_TO_BASE` in settings; rate stored on each record.
**Why:** Priya's complaint ("the sheet pretends a dollar is a rupee") demands
conversion. A live API makes results non-reproducible and adds a flaky external
dependency; balances would change between runs. A fixed rate (1 USD = 83.50 INR,
the trip window) is reproducible, auditable, and the rate is stored per-expense
so the conversion can always be re-derived. We keep the original amount too.

### 8. Conflicting duplicate → keep first, flag for human
**Options:** (a) keep the larger, (b) keep the later-logged, (c) keep the first
and require human confirmation.
**Chosen:** (c).
**Why:** Lines 24/25 (₹2400 vs ₹2450, different payers) genuinely can't be
auto-resolved — the note even says "I think hers is wrong". We pick a
deterministic default (first occurrence) but mark it `needs_review` so a human
decides which row is true. Deterministic *and* honest about the ambiguity.

### 9. Ambiguous date → one consistent format + chronology check
**Options:** (a) guess per-row, (b) commit to one format file-wide, (c) reject
ambiguous dates.
**Chosen:** (b) DD-MM-YYYY (the file's dominant, internally-consistent format)
plus a chronological **spike detector** that flags `04-05-2026` because its date
is later than both neighbours — a sign it was mis-keyed. Flagged, not rejected.
**Why:** Guessing per-row is the "silent guess" the brief warns against.
Committing to one rule is explainable and consistent; the spike check catches the
one row that actually matters without falsely flagging every early-month date.

### 10. The LLM never does math
**Options:** (a) let the LLM read raw data and compute answers, (b) compute
everything deterministically and let the LLM only interpret the question and
phrase the answer.
**Chosen:** (b) — see `aiquery/services.py`.
**Why:** This is the "reliable vs flaky AI integration" distinction the JD asks
about. LLMs are unreliable at arithmetic. We compute exact balances in code, hand
them to the model as facts, and constrain it (temperature 0, "use ONLY these
numbers") to phrasing. If the model or key is unavailable, we **degrade
gracefully** to returning the raw facts — the money is always correct.

### 11. Groq + Llama 3.3 as the LLM provider
**Options:** OpenAI/Anthropic (paid), Groq (free tier).
**Chosen:** Groq `llama-3.3-70b-versatile`.
**Why:** Free, fast, and the task (intent + phrasing over supplied facts) needs
no frontier model. The provider is a single setting; swapping is trivial because
the integration is OpenAI-compatible.

### 12. Member ≠ User (login accounts are separate from people)
**Options:** (a) every flatmate is a login user, (b) `Member` is a person in a
group, optionally linked to a `User`.
**Chosen:** (b).
**Why:** The CSV contains people who will never log in (Dev, Kabir). Coupling
identity to login would make the import impossible. A `Member` can optionally
link to a `User`, mirroring how Splitwise lets you add non-users.

### 13. Stack: Django REST + React + Postgres; SQLite locally
**Why:** Matches the JD exactly (Django APIs, React, relational DB) and is what
the live session will probe. SQLite locally means anyone can clone and run with
zero DB setup; `DATABASE_URL` switches to Postgres in production via
`dj-database-url`. One codebase, two databases, no code change.

### 14. Deploy: Render (API + Postgres) + Vercel (React)
**Why:** Render runs Python/Django with a managed Postgres and a one-file
blueprint (`render.yaml`); Vercel is the natural home for a Vite SPA. The split
keeps each platform doing what it's best at. CORS allows the Vercel origin
(including preview URLs via a regex).
