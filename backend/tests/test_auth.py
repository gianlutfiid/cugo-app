"""Auth endpoint tests for CUGO App."""
import os
import re

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "admin@cugo.app"
ADMIN_PASSWORD = "ChangeMe#CUGO2026"

FORBIDDEN_KEYS = re.compile(r"hashed_password|(?<!\w)password(?!\w)|access_token|refresh_token", re.I)


@pytest.fixture
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---- login ----
def test_login_success_sets_cookies_and_returns_safe_user(client):
    r = client.post(f"{BASE_URL}/api/auth/login",
                    json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["email"] == ADMIN_EMAIL
    assert data["is_superadmin"] is True
    assert data["is_active"] is True
    assert "id" in data
    assert "memberships" in data
    # No sensitive fields in the body
    assert not FORBIDDEN_KEYS.search(r.text), f"Sensitive fields leaked: {r.text}"
    # httpOnly cookies present
    cookies = {c.name: c for c in r.cookies}
    assert "access_token" in cookies
    assert "refresh_token" in cookies
    # requests exposes rest via _rest
    for name in ("access_token", "refresh_token"):
        c = cookies[name]
        rest = getattr(c, "_rest", {}) or {}
        # httponly key may be 'HttpOnly' or 'httponly'
        keys_lower = {k.lower() for k in rest.keys()}
        assert "httponly" in keys_lower, f"{name} is not HttpOnly: {rest}"


def test_login_invalid_password(client):
    r = client.post(f"{BASE_URL}/api/auth/login",
                    json={"email": ADMIN_EMAIL, "password": "wrong-password"})
    assert r.status_code == 401
    assert r.json().get("detail") == "Invalid email or password"


def test_login_unknown_user(client):
    r = client.post(f"{BASE_URL}/api/auth/login",
                    json={"email": "nobody@cugo.app", "password": "whatever"})
    assert r.status_code == 401
    assert r.json().get("detail") == "Invalid email or password"


# ---- me ----
def test_me_without_cookie_returns_401(client):
    r = client.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code == 401


def test_me_with_cookie_returns_user(client):
    login = client.post(f"{BASE_URL}/api/auth/login",
                        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert login.status_code == 200
    r = client.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == ADMIN_EMAIL
    assert data["is_superadmin"] is True
    assert not FORBIDDEN_KEYS.search(r.text)


# ---- refresh ----
def test_refresh_issues_new_access_token(client):
    login = client.post(f"{BASE_URL}/api/auth/login",
                        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert login.status_code == 200
    old_access = client.cookies.get("access_token")
    # Ensure a different iat -> different token
    import time; time.sleep(1)
    r = client.post(f"{BASE_URL}/api/auth/refresh")
    assert r.status_code == 200, r.text
    new_access = None
    # Set-Cookie in response
    for c in r.cookies:
        if c.name == "access_token":
            new_access = c.value
    # If server didn't send in this response's cookies, fetch from session (already merged)
    if new_access is None:
        new_access = client.cookies.get("access_token")
    assert new_access is not None
    assert new_access != old_access, "Access token should be rotated on refresh"
    # After refresh, /me still works
    me = client.get(f"{BASE_URL}/api/auth/me")
    assert me.status_code == 200


def test_refresh_without_cookie_returns_401(client):
    r = client.post(f"{BASE_URL}/api/auth/refresh")
    assert r.status_code == 401


# ---- logout ----
def test_logout_clears_cookies_and_me_returns_401(client):
    login = client.post(f"{BASE_URL}/api/auth/login",
                        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert login.status_code == 200
    r = client.post(f"{BASE_URL}/api/auth/logout")
    assert r.status_code == 200
    # Cookies cleared from session
    client.cookies.clear()
    me = client.get(f"{BASE_URL}/api/auth/me")
    assert me.status_code == 401


# ---- inactive user path ----
def test_inactive_user_rejected():
    """Deactivate admin via psql, verify 403 for login + /me, restore active."""
    import subprocess
    pg_password = None
    with open("/app/backend/.env") as f:
        for line in f:
            if line.startswith("POSTGRES_PASSWORD="):
                pg_password = line.split("=", 1)[1].strip()
                break
    assert pg_password, "POSTGRES_PASSWORD not found"

    def psql(sql: str):
        env = {**os.environ, "PGPASSWORD": pg_password}
        return subprocess.run(
            ["psql", "-h", "localhost", "-U", "cugo", "-d", "cugo_dev", "-c", sql],
            env=env, capture_output=True, text=True, check=True,
        )

    # First login while active
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200

    try:
        psql(f"UPDATE users SET is_active=false WHERE email='{ADMIN_EMAIL}';")

        # /me with existing valid cookie should now 403
        me = s.get(f"{BASE_URL}/api/auth/me")
        assert me.status_code == 403, f"expected 403, got {me.status_code}: {me.text}"
        assert "inactive" in me.json().get("detail", "").lower()

        # Fresh login should return 403 as well
        s2 = requests.Session()
        r2 = s2.post(f"{BASE_URL}/api/auth/login",
                     json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r2.status_code == 403
        assert "inactive" in r2.json().get("detail", "").lower()
    finally:
        # ALWAYS restore
        psql(f"UPDATE users SET is_active=true WHERE email='{ADMIN_EMAIL}';")

    # After restore, login works again
    s3 = requests.Session()
    r3 = s3.post(f"{BASE_URL}/api/auth/login",
                 json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r3.status_code == 200


# ---- bcrypt sanity ----
def test_bcrypt_hash_format_in_db():
    import subprocess
    pg_password = None
    with open("/app/backend/.env") as f:
        for line in f:
            if line.startswith("POSTGRES_PASSWORD="):
                pg_password = line.split("=", 1)[1].strip()
                break
    env = {**os.environ, "PGPASSWORD": pg_password}
    out = subprocess.run(
        ["psql", "-h", "localhost", "-U", "cugo", "-d", "cugo_dev", "-tA", "-c",
         f"SELECT hashed_password FROM users WHERE email='{ADMIN_EMAIL}';"],
        env=env, capture_output=True, text=True, check=True,
    ).stdout.strip()
    assert out.startswith("$2b$") or out.startswith("$2a$") or out.startswith("$2y$"), \
        f"Password hash is not bcrypt: {out[:10]}"
