# Splitmate — Shared Expenses App

A Splitwise-style shared-expenses app for a flatmate group, built for the
Spreetail Software Engineering Intern assignment. The hard part — and the focus
of this project — is **ingesting a deliberately messy CSV**: detecting every data
problem, surfacing it, and handling it deliberately instead of silently.

- **Live app:** _<add Vercel URL after deploy>_
- **API:** _<add Render URL after deploy>_
- **Demo login:** `demo` / `demo12345`

> Built with an AI pair-programmer (Claude / Claude Code) directing it as the
> engineer of record. See [AI_USAGE.md](./AI_USAGE.md), including three concrete
> cases where the AI was wrong and how they were caught.

## What it does

- **Login** (JWT auth).
- **Groups** with **time-bounded membership** — members join and leave, and an
  expense only affects who was a member on its date.
- **Expenses** in four split types: equal, unequal (exact amounts), percentage,
  and share (ratio).
- **Balances**: net balance per person, a minimal **settle-up** plan ("who pays
  whom"), and a **drill-down** showing exactly which expenses make up a number.
- **Settlements**: record a payment from one person to another.
- **CSV import** with full anomaly detection, a **review/approve** workflow, and
  a generated **import report**.
- **Ask AI**: a natural-language balance query where the LLM only phrases the
  answer — every number comes from the deterministic engine.

## Documents (assignment deliverables)

| File | What |
|------|------|
| [SCOPE.md](./SCOPE.md) | Every CSV anomaly + how it's handled, and the DB schema |
| [DECISIONS.md](./DECISIONS.md) | Decision log: options considered and why |
| [IMPORT_REPORT.md](./IMPORT_REPORT.md) | Machine-generated import report (24 anomalies) |
| [AI_USAGE.md](./AI_USAGE.md) | AI tools, key prompts, and 3 things the AI got wrong |

## Tech stack

- **Backend:** Python 3.13, Django 5 + Django REST Framework, SimpleJWT.
- **Database:** PostgreSQL in production, SQLite locally (`dj-database-url`).
- **Frontend:** React 19 + Vite, React Router, axios.
- **AI:** Groq `llama-3.3-70b-versatile` (free tier) for the NL query only.
- **Deploy:** Render (API + Postgres) + Vercel (React).

## Architecture

```
React (Vercel)  ──HTTP/JSON──>  Django REST API (Render)  ──>  PostgreSQL
                                      │
                                      ├── importer/  CSV → stage → approve → commit
                                      ├── expenses/  models + money + splitting + balances
                                      ├── groups/    Group, time-bound Member, aliases
                                      └── aiquery/   Groq (phrasing only; math is deterministic)
```

The import is two-phase: **stage** (parse + detect anomalies, write nothing real)
→ **approve** (human accepts/rejects changed rows) → **commit** (materialize).

## Run locally

### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows  (use: source .venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
copy .env.example .env            # then add your GROQ_API_KEY (optional)
python manage.py migrate
python manage.py bootstrap_demo   # seeds the group + imports the CSV once
python manage.py runserver        # http://127.0.0.1:8000
```

Useful commands:
```bash
python manage.py test             # run the test suite (13 tests)
python manage.py import_csv       # stage the CSV and (re)generate IMPORT_REPORT.md
python manage.py import_csv --commit
```

### Frontend
```bash
cd frontend
npm install
# .env already points at http://127.0.0.1:8000/api for local dev
npm run dev                       # http://localhost:5173
```

Log in with `demo` / `demo12345`.

## Deploy

**Backend (Render):** New → Blueprint → connect this repo. `render.yaml`
provisions the web service + free Postgres, runs migrations and the idempotent
`bootstrap_demo`. After it provisions, set the `GROQ_API_KEY` env var (it's
marked secret in the blueprint). Note the service URL.

**Frontend (Vercel):** New Project → import this repo → **Root Directory =
`frontend`** (Vite auto-detected). Add env var `VITE_API_URL =
https://<your-render-host>/api`. Deploy.

CORS already allows `*.vercel.app` origins. Set `CORS_ALLOWED_ORIGINS` on Render
to your exact Vercel domain if you use a custom one.

## API overview

```
POST /api/auth/register | login | refresh        GET /api/auth/me
GET/POST/DELETE /api/groups/ | /members/ | /expenses/ | /settlements/
GET  /api/groups/<id>/balances
GET  /api/groups/<id>/members/<mid>/breakdown
POST /api/imports/upload   GET /api/imports/<id>   POST /api/imports/<id>/commit
POST /api/imports/<id>/rows/<rid>/decision
POST /api/groups/<id>/ask
```

## Where to look (for the live walkthrough)

- Money & rounding: [`backend/expenses/money.py`](./backend/expenses/money.py)
- Split math: [`backend/expenses/splitting.py`](./backend/expenses/splitting.py)
- Anomaly detection: [`backend/importer/parsing.py`](./backend/importer/parsing.py)
  + [`backend/importer/services.py`](./backend/importer/services.py)
- Balance calculation: [`backend/expenses/balances.py`](./backend/expenses/balances.py)
- AI (phrasing only): [`backend/aiquery/services.py`](./backend/aiquery/services.py)
