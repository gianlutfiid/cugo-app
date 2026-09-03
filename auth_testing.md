# CUGO Auth — Testing Playbook (FastAPI + PostgreSQL + httpOnly cookies)

## Seeded account
- Super Admin: `admin@cugo.app` / `ChangeMe#CUGO2026` (is_superadmin=true, is_active=true)

## Auth endpoints (all under /api, cookies are httpOnly)
- POST /api/auth/login   {email, password} -> 200 sets access_token + refresh_token cookies, returns user (NO password/hash/token in body)
- POST /api/auth/logout  -> 200 clears cookies
- GET  /api/auth/me      -> 200 returns current user (requires access cookie)
- POST /api/auth/refresh -> 200 issues new access token from refresh cookie

## Backend API tests (curl)
```
API=<REACT_APP_BACKEND_URL>
# login
curl -s -c cj.txt -X POST "$API/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@cugo.app","password":"ChangeMe#CUGO2026"}'
# me (with cookies)
curl -s -b cj.txt "$API/api/auth/me"
# me without cookies -> 401
curl -s "$API/api/auth/me"
# refresh
curl -s -b cj.txt -c cj.txt -X POST "$API/api/auth/refresh"
# invalid password -> 401
curl -s -X POST "$API/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@cugo.app","password":"wrong"}'
```

## Inactive-user rejection (no separate account needed)
Use psql to temporarily deactivate the admin, confirm /me -> 403, then restore:
```
PGPASSWORD=<see backend/.env> psql -h localhost -U cugo -d cugo_dev \
  -c "UPDATE users SET is_active=false WHERE email='admin@cugo.app';"
# GET /api/auth/me with a valid cookie should now return 403 (Account is inactive)
# and login should return 403 as well.
PGPASSWORD=<...> psql -h localhost -U cugo -d cugo_dev \
  -c "UPDATE users SET is_active=true WHERE email='admin@cugo.app';"
```

## Frontend (browser) tests
- Visiting `/` unauthenticated redirects to `/login`.
- Login form: data-testid login-email-input, login-password-input, login-submit-button, login-error.
- After successful login -> dashboard-root visible; user-email shows admin@cugo.app; user-role shows "Super Admin".
- Refresh the page while logged in -> stays authenticated (session restored via /auth/me).
- Click logout-button (data-testid) -> redirected to /login; visiting `/` again stays on /login.
- Wrong password -> login-error is shown; stays on login page.

## Security checks
- Response bodies must NOT contain: hashed_password, password, access_token, refresh_token.
- Tokens must be in httpOnly cookies only; NOT in localStorage/sessionStorage.

## DB access
- PostgreSQL: host localhost, port 5432, db cugo_dev, user cugo, password in /app/backend/.env
