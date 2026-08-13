# Zordon's Facility Ops Hub

A multi-role facility management platform — raise issues, auto-triage and route them to the right engineering squad, track SLAs, collaborate in comments, and watch it all on real-time role-based dashboards.

> Teleport pads misfire. Lab door sensors glitch. Zord engine coolant leaks. The Command Center needs an ops hub.

## Features

**Authentication & security**
- 🔐 Stateful session auth (Express + Redis) with four roles — `user`, `engineer`, `manager`, `admin`
- 📱 Concurrent session limiting — max 3 devices, least-recently-used evicted on the 4th sign-in, with automatic garbage collection of orphaned sessions
- 🛡️ Risk-Based Authentication — device fingerprinting and IP geolocation score every login; new device, new country, impossible travel and dormant accounts raise the score
- ✉️ Step-up email OTP when a login crosses the risk threshold — crypto-random codes, stored only as hashes, verified with `timingSafeEqual`
- 🔑 Account recovery with 256-bit `randomBytes` tokens, stored hashed, single-use, timing-safe comparison, and full session revocation on reset
- 💻 "Your devices" screen — see every active session with device, location and last-seen; revoke individually or all at once
- 🚫 No email verification on signup: an account works the moment it is created

**Core**
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

### Trying the security features locally

Every request from a laptop arrives from `127.0.0.1`, which carries no location. Outside production the API accepts an `X-Demo-IP` header so the risk engine can be exercised properly:

```bash
# sign in from the US...
curl -i -X POST localhost:9000/api/v1/auth/login -H 'Content-Type: application/json' \
  -H 'X-Demo-IP: 8.8.8.8' -d '{"email":"manager@facility.dev","password":"Password123"}'

# ...then from India seconds later — impossible travel, step-up required
curl -i -X POST localhost:9000/api/v1/auth/login -H 'Content-Type: application/json' \
  -H 'X-Demo-IP: 49.44.112.1' -d '{"email":"manager@facility.dev","password":"Password123"}'
```

The second call returns `stepUpRequired: true` with the computed travel speed instead of a session. Outside production the OTP is also returned as `devCode` (and logged), so the flow is demoable without a mail server. Sign in on four different browsers to watch the concurrent-device limit evict the oldest — visible on the **Security** page.

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
| POST | `/auth/login` `/auth/logout` | public | Session login/logout (login may return a step-up challenge) |
| POST | `/auth/verify-otp` | public | Complete a step-up challenge and open the session |
| POST | `/auth/forgot-password` `/auth/reset-password` | public | Account recovery |
| GET | `/auth/sessions` | auth | Active devices for the current user |
| DELETE | `/auth/sessions/:id` | auth | Revoke one device |
| POST | `/auth/sessions/revoke-others` | auth | Sign out everywhere else |
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
