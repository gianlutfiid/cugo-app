# CUGO App — PRD & Progress

## Original problem statement
Build "CUGO App", a **multi-branch laundry management system**. This stage is
**initialization only** — inspect the connected GitHub repo and set up a clean,
safe, runnable project foundation. **No business features yet.**

## User-confirmed decisions
- **Stack:** FastAPI (Python) + React + TypeScript + PostgreSQL.
- **ORM/migrations:** SQLAlchemy 2.0 (async) + Alembic.
- **Auth:** JWT email/password — to be added in a **later** stage (NOT now).
- **Architecture:** must be scalable for multiple branches from the start.
- **Branding:** Navy `#0D2340`, Teal `#00B3A4`, White `#FFFFFF`; clean/minimal
  professional SaaS look; white background, navy text, teal accents; avoid
  gradients/glassmorphism/"AI-generated" styling. Text logo "CUGO App" (no logo
  asset in repo yet).
- **Safe init rules:** preserve git history, no destructive changes, keep
  secrets out of the repo (`.env.example` only), proper `.gitignore`, clear
  `README.md`, minimal models, no mock/business data, smallest safe changes.

## Architecture
```
backend/  FastAPI (uvicorn server:app on :8001, /api prefix)
  app/core      -> config (env settings), database (async engine/session)
  app/models    -> Base, TimestampMixin, Branch (minimal foundation)
  app/schemas   -> Pydantic response models
  app/api/routes-> health (more to come)
  app/services  -> (future business/service layer)
  app/utils     -> (future shared helpers)
  alembic/      -> async migration env + versions
frontend/ React + TypeScript (CRA, yarn start on :3000)
  src/api       -> axios client (uses REACT_APP_BACKEND_URL)
  src/App.tsx   -> branded landing page + live system status
PostgreSQL 15 -> supervisor-managed, persistent data dir at /app/data/postgres
  DB: cugo_dev, role: cugo
```

## Implemented (2026-06)
- PostgreSQL 15 installed, persistent data dir (`/app/data/postgres`),
  supervisor-managed autostart; role `cugo` + db `cugo_dev`.
- FastAPI foundation with settings from env, async SQLAlchemy engine.
- `GET /api` (service info) and `GET /api/health` (verifies DB connectivity).
- Minimal `Branch` model + initial Alembic migration (`branches` table) applied.
- React + TS branded landing page showing live API + DB status.
- `.gitignore`, `backend/.env.example`, `frontend/.env.example`, README.
- Verified end-to-end: health = connected, landing page shows Online/Connected.

## Multi-branch schema (implemented 2026-06, reviewed decisions)
- **Roles (fixed):** `super_admin`, `branch_admin`, `staff`. Stored as String +
  CHECK constraint (not native ENUM) for reversible/extensible migrations
  (`app/models/enums.py`).
- **`branches`:** name, code(unique), is_active, address, phone,
  timezone(default `Asia/Jakarta`), timestamps.
- **`users`:** auth-ready — email(unique), hashed_password, full_name,
  is_superadmin, is_active, last_login, timestamps. No plaintext passwords.
- **`branch_memberships`:** many-to-many user↔branch, `role` per membership
  (CHECK in {branch_admin, staff}), unique(user_id, branch_id), FKs cascade.
- **Access model:** super_admin = `is_superadmin` flag, no membership needed;
  branch_admin/staff scoped to their memberships. Isolation enforced at API
  layer later.
- Migration `aac5277e85ae` applied; verified reversible (downgrade→upgrade) and
  schema inspected via psql. No seed data.

## Authentication (implemented 2026-06, tested 100%)
- JWT email/password sign-in via **httpOnly cookies** (access 30m + refresh 7d),
  Secure + SameSite=None. bcrypt hashing, PyJWT.
- Endpoints (core only): `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/auth/me`, `POST /api/auth/refresh`.
- super_admin **seeded on startup** from `ADMIN_EMAIL`/`ADMIN_PASSWORD` (idempotent).
- Admin-created users only — NO public registration. Inactive users rejected (403).
- Frontend: AuthContext + ProtectedRoute + Login page + placeholder Dashboard;
  axios `withCredentials` + 401→refresh interceptor. No tokens in localStorage.
- Verified end-to-end by testing agent (`/app/backend/tests/test_auth.py`).

## Backlog (do NOT start without explicit instruction)
- **P1:** Admin-created users UI + endpoints (create branch_admin/staff, assign
  branch memberships & roles).
- **P1:** Branch CRUD (name, code, address, phone, timezone) — super_admin.
- **P1:** Per-branch data isolation enforced in the API (branch scoping deps).
- **P2:** Auth hardening — brute-force lockout, password reset, password change.
- **P1/P2:** Core laundry domain (orders, services, customers) — schema first.
- **P1:** Branch CRUD + branch-scoped access control.
- **P1:** Core laundry domain (orders, services, customers) — schema first.
- **P2:** Reporting/dashboards per branch.

## Notes
- No business/mock data seeded (per user instruction).
- Auth not implemented yet; will require integration_expert playbook first.
