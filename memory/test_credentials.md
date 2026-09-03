# Test Credentials

## Application login accounts

### Super Admin (seeded on startup from backend/.env)
- Email: `admin@cugo.app`
- Password: `ChangeMe#CUGO2026`
- Role: super_admin (`is_superadmin=true`, platform-wide, no branch membership)
- ⚠️ Change this password after first login (update `ADMIN_PASSWORD` in
  `backend/.env`; the seed updates the hash on restart).

No branch_admin / staff accounts exist yet (admin-created only; UI for that is
not built yet).

## Auth endpoints (all under /api)
- `POST /api/auth/login`   — body `{ "email", "password" }`, sets httpOnly cookies
- `POST /api/auth/logout`  — clears auth cookies
- `GET  /api/auth/me`      — returns current user (requires auth cookie)
- `POST /api/auth/refresh` — issues a new access token from the refresh cookie

Auth uses httpOnly cookies (`access_token`, `refresh_token`). Tokens are NEVER
returned in the response body and are NOT stored in localStorage/sessionStorage.

## Local database (development)
- Engine: PostgreSQL 15 (supervisor-managed) · Host: localhost · Port: 5432
- Database: cugo_dev · User: cugo · Password: see `backend/.env` (POSTGRES_PASSWORD)

## Health check
- `GET {REACT_APP_BACKEND_URL}/api/health`
  -> `{"status":"ok","service":"cugo-api","database":"connected","environment":"development"}`
