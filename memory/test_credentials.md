# Test Credentials

## Application login accounts
None yet — authentication (JWT email/password) has **not** been implemented at
this initialization stage. No user accounts or seed data exist.

## Local database (development)
- Engine: PostgreSQL 15 (supervisor-managed)
- Host: localhost
- Port: 5432
- Database: cugo_dev
- Role/User: cugo
- Password: see `backend/.env` (POSTGRES_PASSWORD) — not committed to git.

## Health check
- `GET {REACT_APP_BACKEND_URL}/api/health`
  -> `{"status":"ok","service":"cugo-api","database":"connected","environment":"development"}`
