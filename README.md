# Zordon's Facility Ops Hub

A multi-role facility management platform — raise issues, AI-triage and route them to the right engineering squad, track SLAs, collaborate in comments, and watch it all on real-time dashboards.

> Teleport pads misfire. Lab door sensors glitch. Zord engine coolant leaks. The Command Center needs an ops hub.

## Features

**Core**
- 🔐 Session auth (Redis-backed) with four roles — `user`, `engineer`, `manager`, `admin`
- 🏢 Multi-tenancy — every user & ticket is scoped to a facility; signup provisions a new tenant
- 🎫 Raise issues with AI triage (priority, category, team, hardware-dispatch flag)
- 👷 Assign engineers; role-scoped boards (requesters see their own, engineers their queue, managers everything)
- ⏱️ SLA timers per priority with an automatic breach worker + escalation
- 💬 Comments + a full system activity timeline (status changes, assignments, breaches)
- 🔀 Status workflow: open → assigned → in_progress → resolved → closed (+ pending_approval)
- 📊 Dashboard analytics — counts by status/priority/team, overdue, avg resolution, 7-day trend

**Advanced**
- 📨 Email alerts (nodemailer) + SMS-ready (Twilio) on assignment, status change, SLA breach
- ⚡ Real-time notifications over Server-Sent-Events (live toasts + auto-refreshing boards)
- 🗂️ Bulk operations (set status / priority / assign across many tickets)
- 🧠 Human-in-the-loop AI approval — critical tickets pause for a manager to approve or re-route

**Ops**
- 🐳 Dockerized (backend, frontend, AI, Mongo, Redis) via `docker compose`
- 🔁 In-process SLA worker queue
- 🌗 Minimal light/dark UI (React + Tailwind + shadcn-style components)

## Architecture

```
                ┌───────────────┐
   Browser ───► │  frontend      │  React + Vite + Tailwind (nginx in prod)
                │  (SPA)         │
                └──────┬─────────┘
                       │ /api  (same-origin proxy)
                ┌──────▼─────────┐      ┌──────────────┐
                │  backend       │◄────►│  AI service   │  FastAPI + LangGraph
                │  Express 5     │ HTTP │  (Gemini)     │  (optional, graceful fallback)
                └──┬────────┬────┘      └──────────────┘
                   │        │
            ┌──────▼──┐  ┌──▼───────┐
            │ MongoDB │  │  Redis    │  sessions + (future) queues
            └─────────┘  └──────────┘
```

## Tech stack

- **Frontend** — React 18, Vite, TypeScript, Tailwind CSS, shadcn-style UI, React Query, Recharts
- **Backend** — Node 22, Express 5, Mongoose, Zod, express-session + connect-redis, Winston, nodemailer
- **AI** — Python FastAPI + LangGraph + Gemini (`langchain-google-genai`), human-in-the-loop interrupt
- **Data** — MongoDB, Redis

## Quick start (Docker)

```bash
# from the repo root
docker compose up --build

# once it's running, in another terminal — seed the demo tenant + tickets:
docker compose exec backend npm run seed
```

- App: <http://localhost:8080>
- API: <http://localhost:9000>

To also run the Gemini AI service (needs a key):

```bash
GOOGLE_API_KEY=your_key docker compose --profile ai up --build
```

Without it, ticket triage uses a built-in keyword heuristic — everything still works.

### Demo accounts (after seeding) — password `Password123`

| Email | Role |
|---|---|
| `admin@facility.dev` | admin |
| `manager@facility.dev` | manager |
| `billy@facility.dev` | engineer |
| `ranger@facility.dev` | user |

## Local development (without Docker)

You need MongoDB and Redis running locally (or `docker run -p 27017:27017 mongo:7` and `docker run -p 6379:6379 redis:7-alpine`).

```bash
# Backend
cd backend
cp .env.example .env        # adjust if needed
npm install
npm run seed                # optional demo data
npm run dev                 # http://localhost:9000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173 (proxies /api → :9000)
```

The Vite dev server proxies `/api` to the backend, so the session cookie works same-origin with no CORS setup.

### AI service (optional)

```bash
cd src/ai
pip install -r requirements.docker.txt   # curated runtime deps
export GOOGLE_API_KEY=your_key
uvicorn src.ai.main:app --reload --port 8000   # run from the repo root
```

## API overview

All under `/api/v1`. Auth is a session cookie (`credentials: include`).

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/auth/signup` | public | Create a tenant + admin |
| POST | `/auth/login` `/auth/logout` | public | Session login/logout |
| GET | `/auth/me` | auth | Current user + tenant |
| POST | `/tickets` | auth | Raise an issue (AI triage) |
| GET | `/tickets` | auth | List (filters, search, pagination, role-scoped) |
| GET | `/tickets/:id` | auth | Ticket detail |
| PATCH | `/tickets/:id/status` | auth* | Change status |
| PATCH | `/tickets/:id/assign` | manager/admin | Assign engineer |
| POST | `/tickets/:id/approve` | manager/admin | Approve / override AI routing |
| POST | `/tickets/bulk` | manager/admin | Bulk status/priority/assign |
| GET/POST | `/tickets/:id/comments` | auth | List / add comments |
| GET | `/analytics/dashboard` | auth | Dashboard stats (role-scoped) |
| GET | `/notifications` `/stream` | auth | List + live SSE stream |
| GET/POST | `/users` `/users/engineers` | manager/admin | Team + engineer list; admin adds members |

\* engineers may only change status on tickets assigned to them.

## Project structure

```
backend/        Express API (models, controllers, services, workers, routes)
frontend/       React SPA (pages, components/ui, hooks, context)
src/ai/         FastAPI + LangGraph triage microservice
docker-compose.yml
```
