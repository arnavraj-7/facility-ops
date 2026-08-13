# Zordon's Facility Ops Hub

A multi-role facility management platform — raise issues, auto-triage and route them to the right engineering squad, track SLAs, collaborate in comments, and watch it all on real-time role-based dashboards.

> Teleport pads misfire. Lab door sensors glitch. Zord engine coolant leaks. The Command Center needs an ops hub.

## Features

**Core**
- 🔐 Session auth (Redis-backed) with four roles — `user`, `engineer`, `manager`, `admin`. No email verification: an account works the moment it is created.
- 🏢 Multi-tenancy — every user & ticket is scoped to a facility; signup provisions a new tenant and signs you straight in
- 🎫 Raise issues with automatic triage (priority, category, team, hardware-dispatch flag)
- 👷 Assign engineers; role-scoped boards (requesters see their own, engineers their queue, managers everything)
- ⏱️ SLA timers per priority with an automatic breach worker + escalation
- 💬 Comments plus a full system activity timeline (status changes, assignments, breaches)
- 🔀 Status workflow: `open → assigned → in_progress → resolved → closed` (+ `pending_approval`)
- 📊 Dashboard analytics — live ticket feed, counts by status/priority/team, overdue, avg resolution, 7-day trend

**Advanced**
- ⚡ Real-time notifications over Server-Sent Events (live toasts + auto-refreshing boards)
- 🗂️ Bulk operations (set status / priority / assign across many tickets)
- 🧠 Human-in-the-loop approval — critical tickets pause for a manager to approve or re-route before dispatch
- 🤖 Optional Gemini + LangGraph triage microservice, with a built-in keyword engine as the always-on fallback

**Ops**
- 🔁 In-process SLA worker loop
- 🌗 Minimal light/dark UI (React + Tailwind + shadcn-style components)
- 🧯 Degrades gracefully: no Redis → memory sessions; no AI service → keyword triage

## Architecture

```
                ┌───────────────┐
   Browser ───► │  frontend      │  React + Vite + Tailwind
                │  (SPA)         │
                └──────┬─────────┘
                       │ /api  (same-origin Vite proxy)
                ┌──────▼─────────┐      ┌──────────────┐
                │  backend       │◄────►│  AI service   │  FastAPI + LangGraph
                │  Express 5     │ HTTP │  (Gemini)     │  optional — off by default
                └──┬────────┬────┘      └──────────────┘
                   │        │
            ┌──────▼──┐  ┌──▼───────┐
            │ MongoDB │  │  Redis    │  sessions (optional — memory fallback)
            │ (Atlas) │  │ (docker)  │
            └─────────┘  └──────────┘
```

## Tech stack

- **Frontend** — React 18, Vite, TypeScript, Tailwind CSS, shadcn-style UI, React Query, Recharts
- **Backend** — Node 22+, Express 5, Mongoose, Zod, express-session + connect-redis, Winston
- **AI (optional)** — Python FastAPI + LangGraph + Gemini, human-in-the-loop interrupt
- **Data** — MongoDB (Atlas or local), Redis

## Quick start

Docker is used for **Redis only** — everything else runs natively.

```bash
# 1. install (backend + frontend)
npm run setup

# 2. configure the backend
cp backend/.env.example backend/.env      # then set MONGO_URI + SESSION_SECRET

# 3. optional: start Redis (skip it and sessions fall back to memory)
npm run redis:up

# 4. load the demo tenant + tickets
npm run seed

# 5. run both apps
npm run dev
```

- App: <http://localhost:5173>
- API: <http://localhost:9000>

The Vite dev server proxies `/api` to the backend, so the session cookie is same-origin and needs no CORS gymnastics.

### Demo accounts (after seeding) — password `Password123`

| Email | Role | What they see |
|---|---|---|
| `admin@facility.dev` | admin | Everything + team management |
| `manager@facility.dev` | manager | Everything + assign & approve |
| `billy@facility.dev` | engineer | Their assigned queue |
| `ranger@facility.dev` | user | Only the issues they raised |

### Optional: Gemini triage service

Off by default — the backend runs a built-in keyword triage engine in-process, so every feature works without Python or an API key.

```bash
pip install -r src/ai/requirements.txt
export GOOGLE_API_KEY=your_key          # PowerShell: $env:GOOGLE_API_KEY="your_key"
uvicorn src.ai.main:app --reload --port 8000    # run from the repo root
```

Then set `AI_ENABLED=true` in `backend/.env`. If the service goes down mid-demo, ticket creation silently falls back to the keyword engine.

## API overview

All under `/api/v1`. Auth is a session cookie (`credentials: include`).

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/auth/signup` | public | Create a tenant + admin, and log in |
| POST | `/auth/login` `/auth/logout` | public | Session login/logout |
| GET | `/auth/me` | auth | Current user + tenant |
| POST | `/tickets` | auth | Raise an issue (auto-triage) |
| GET | `/tickets` | auth | List (filters, search, pagination, role-scoped) |
| GET | `/tickets/:id` | auth | Ticket detail |
| PATCH | `/tickets/:id/status` | auth\* | Change status |
| PATCH | `/tickets/:id/assign` | manager/admin | Assign engineer |
| POST | `/tickets/:id/approve` | manager/admin | Approve / override triage routing |
| POST | `/tickets/bulk` | manager/admin | Bulk status/priority/assign |
| GET/POST | `/tickets/:id/comments` | auth | List / add comments |
| GET | `/analytics/dashboard` | auth | Dashboard stats (role-scoped) |
| GET | `/notifications` `/notifications/stream` | auth | List + live SSE stream |
| GET/POST | `/users` `/users/engineers` | manager/admin | Team + engineer list; admin adds members |

\* engineers may only change status on tickets assigned to them; requesters may only close or reopen a ticket they raised.

## Project structure

```
backend/        Express API (models, controllers, services, workers, routes)
frontend/       React SPA (pages, components/ui, hooks, context)
src/ai/         Optional FastAPI + LangGraph triage microservice
docker-compose.yml   Redis only
```
