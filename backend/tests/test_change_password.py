"""Tests for POST /api/auth/change-password."""
import os
import re
import subprocess

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

MANAGER_EMAIL = "manager@cugo.app"
MANAGER_PASSWORD = "TestPass#123"
NEW_PASSWORD = "CugoTest2026"  # 12 chars, letters+numbers

FORBIDDEN_KEYS = re.compile(r"hashed_password|\$2[aby]\$", re.I)


def _leak_check(text: str, secrets: list[str]) -> str | None:
    """Return a description if any secret or forbidden field is in the text."""
    if FORBIDDEN_KEYS.search(text):
        return f"forbidden key leaked: {text[:200]}"
    for s in secrets:
        if s and s in text:
            return f"password value leaked: {s}"
    return None


def _login(session: requests.Session, email: str, password: str) -> requests.Response:
    return session.post(
        f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}
    )


def _reseed_dev():
    """Restore dev accounts after tests that mutate passwords."""
    subprocess.run(
        ["/root/.venv/bin/python", "scripts/seed_dev_data.py"],
        cwd="/app/backend",
        check=True,
        capture_output=True,
    )


@pytest.fixture
def authed_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = _login(s, MANAGER_EMAIL, MANAGER_PASSWORD)
    if r.status_code != 200:
        _reseed_dev()
        r = _login(s, MANAGER_EMAIL, MANAGER_PASSWORD)
    assert r.status_code == 200, r.text
    return s


# ---- Auth requirement ----
def test_change_password_requires_auth():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/change-password",
        json={"current_password": "x", "new_password": "Valid123456"},
    )
    assert r.status_code == 401


# ---- Wrong current ----
def test_change_password_wrong_current(authed_session):
    r = authed_session.post(
        f"{BASE_URL}/api/auth/change-password",
        json={"current_password": "not-real-pass", "new_password": "Valid123456"},
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "Current password is incorrect"


# ---- Policy: too short ----
def test_change_password_too_short(authed_session):
    r = authed_session.post(
        f"{BASE_URL}/api/auth/change-password",
        json={"current_password": MANAGER_PASSWORD, "new_password": "short1"},
    )
    assert r.status_code == 400
    assert "10 characters" in r.json()["detail"]


# ---- Policy: no number ----
def test_change_password_no_number(authed_session):
    r = authed_session.post(
        f"{BASE_URL}/api/auth/change-password",
        json={"current_password": MANAGER_PASSWORD, "new_password": "abcdefghij"},
    )
    assert r.status_code == 400
    assert "number" in r.json()["detail"].lower()


# ---- Policy: no letter ----
def test_change_password_no_letter(authed_session):
    r = authed_session.post(
        f"{BASE_URL}/api/auth/change-password",
        json={"current_password": MANAGER_PASSWORD, "new_password": "1234567890"},
    )
    assert r.status_code == 400
    assert "letter" in r.json()["detail"].lower()


# ---- Same as current ----
def test_change_password_same_as_current(authed_session):
    r = authed_session.post(
        f"{BASE_URL}/api/auth/change-password",
        json={"current_password": MANAGER_PASSWORD, "new_password": MANAGER_PASSWORD},
    )
    assert r.status_code == 400
    assert "different" in r.json()["detail"].lower()


# ---- Happy path + old fails / new works + cookies cleared + no leaks ----
def test_change_password_happy_path_and_relogin():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    try:
        r = _login(s, MANAGER_EMAIL, MANAGER_PASSWORD)
        if r.status_code != 200:
            _reseed_dev()
            r = _login(s, MANAGER_EMAIL, MANAGER_PASSWORD)
        assert r.status_code == 200

        change = s.post(
            f"{BASE_URL}/api/auth/change-password",
            json={
                "current_password": MANAGER_PASSWORD,
                "new_password": NEW_PASSWORD,
            },
        )
        assert change.status_code == 200, change.text
        body = change.json()
        assert "message" in body
        # No sensitive fields leaked
        leak = _leak_check(change.text, [MANAGER_PASSWORD, NEW_PASSWORD])
        assert leak is None, leak

        # Cookies should be cleared: Set-Cookie should include cleared access/refresh
        set_cookie_header = change.headers.get("set-cookie", "")
        assert "access_token=" in set_cookie_header
        assert "refresh_token=" in set_cookie_header

        # After change, /me with cleared cookies should fail
        s.cookies.clear()
        me = s.get(f"{BASE_URL}/api/auth/me")
        assert me.status_code == 401

        # Login with OLD password should fail
        s_old = requests.Session()
        r_old = _login(s_old, MANAGER_EMAIL, MANAGER_PASSWORD)
        assert r_old.status_code == 401

        # Login with NEW password should succeed
        s_new = requests.Session()
        r_new = _login(s_new, MANAGER_EMAIL, NEW_PASSWORD)
        assert r_new.status_code == 200
        leak = _leak_check(r_new.text, [MANAGER_PASSWORD, NEW_PASSWORD])
        assert leak is None, leak

        # And change back to original to keep credentials file valid
        back = s_new.post(
            f"{BASE_URL}/api/auth/change-password",
            json={
                "current_password": NEW_PASSWORD,
                "new_password": MANAGER_PASSWORD,
            },
        )
        assert back.status_code == 200
    finally:
        # Absolute belt-and-suspenders: reseed to restore known state
        _reseed_dev()
