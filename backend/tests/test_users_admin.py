"""Super-admin user management endpoint tests.

Covers: authz (401/403), create + one-time password, list/get, duplicate email,
privilege-escalation guards, membership add/change/remove/branch-not-found,
activate/deactivate, reset password, and branch isolation for newly-assigned
non-super users. Cleans up any TEST_ users at the end.
"""
import os
import re
import string
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

SUPER = {"email": "admin@cugo.app", "password": "ChangeMe#CUGO2026"}
MANAGER = {"email": "manager@cugo.app", "password": "TestPass#123"}
STAFF = {"email": "staff@cugo.app", "password": "TestPass#123"}

JKT = "0bdd1394-70a9-4ea0-9a7f-69bd502ba793"
BDG = "5a63df5e-5948-4d00-ab3e-1252df2ae538"
SBY = "b502a507-8e19-48f6-b990-ced57abfd3ea"


def _login(session: requests.Session, creds: dict) -> requests.Response:
    return session.post(f"{API}/auth/login", json=creds)


@pytest.fixture(scope="module")
def super_session():
    s = requests.Session()
    r = _login(s, SUPER)
    if r.status_code != 200:
        pytest.skip(f"super_admin login failed: {r.status_code} {r.text}")
    return s


@pytest.fixture(scope="module")
def created_users(super_session):
    """Track created user IDs/emails for cleanup at teardown."""
    ids: list[str] = []
    yield ids
    for uid in ids:
        try:
            # Deactivate + remove memberships; hard delete via psql later if needed
            super_session.patch(f"{API}/users/{uid}", json={"is_active": False})
        except Exception:
            pass
    # Hard-delete via psql to keep list clean
    import subprocess
    try:
        subprocess.run(
            ["psql", "-U", "cugo", "-d", "cugo_dev", "-c",
             "DELETE FROM branch_memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test-%@cugo.app'); "
             "DELETE FROM users WHERE email LIKE 'test-%@cugo.app';"],
            env={**os.environ, "PGPASSWORD": os.environ.get("POSTGRES_PASSWORD", "")},
            capture_output=True, timeout=10,
        )
    except Exception:
        pass


# ---------- Authorization ----------
class TestAuthz:
    def test_unauth_list_401(self):
        r = requests.get(f"{API}/users")
        assert r.status_code == 401

    def test_unauth_create_401(self):
        r = requests.post(f"{API}/users", json={"email": "x@y.z"})
        assert r.status_code == 401

    def test_branch_admin_forbidden(self):
        s = requests.Session()
        assert _login(s, MANAGER).status_code == 200
        for method, url, body in [
            ("get", f"{API}/users", None),
            ("post", f"{API}/users", {"email": "nope@x.com"}),
            ("patch", f"{API}/users/{uuid.uuid4()}", {"full_name": "x"}),
            ("post", f"{API}/users/{uuid.uuid4()}/memberships", {"branch_id": JKT, "role": "staff"}),
            ("post", f"{API}/users/{uuid.uuid4()}/reset-password", None),
        ]:
            r = s.request(method, url, json=body)
            assert r.status_code == 403, f"{method} {url} -> {r.status_code}"

    def test_staff_forbidden(self):
        s = requests.Session()
        assert _login(s, STAFF).status_code == 200
        r = s.get(f"{API}/users")
        assert r.status_code == 403


# ---------- Create + list ----------
class TestCreateAndList:
    def test_create_returns_password_and_no_hash(self, super_session, created_users):
        email = f"test-{uuid.uuid4().hex[:8]}@cugo.app"
        r = super_session.post(f"{API}/users", json={
            "email": email, "full_name": "TEST User",
            "memberships": [{"branch_id": JKT, "role": "staff"}],
        })
        assert r.status_code == 201, r.text
        body = r.json()
        assert "initial_password" in body
        pw = body["initial_password"]
        assert len(pw) >= 10
        assert any(c.isalpha() for c in pw) and any(c.isdigit() for c in pw)
        user = body["user"]
        assert user["email"] == email
        assert user["is_superadmin"] is False
        assert user["is_active"] is True
        assert len(user["memberships"]) == 1
        assert user["memberships"][0]["role"] == "staff"
        assert "hashed_password" not in user
        # No hash-like strings leaked anywhere in body
        assert "$2b$" not in r.text
        created_users.append(user["id"])
        # Store password for later tests
        pytest.created_email = email
        pytest.created_id = user["id"]
        pytest.created_pw = pw

    def test_list_no_hash_leak(self, super_session):
        r = super_session.get(f"{API}/users")
        assert r.status_code == 200
        assert "hashed_password" not in r.text
        assert "$2b$" not in r.text
        emails = [u["email"] for u in r.json()]
        assert pytest.created_email in emails

    def test_duplicate_email_409(self, super_session):
        r = super_session.post(f"{API}/users", json={"email": pytest.created_email})
        assert r.status_code == 409

    def test_super_admin_role_rejected_422(self, super_session):
        r = super_session.post(f"{API}/users", json={
            "email": f"test-{uuid.uuid4().hex[:6]}@cugo.app",
            "memberships": [{"branch_id": JKT, "role": "super_admin"}],
        })
        assert r.status_code == 422

    def test_no_is_superadmin_field(self, super_session, created_users):
        # Even if we send is_superadmin, it must be ignored (extra field or false)
        email = f"test-{uuid.uuid4().hex[:6]}@cugo.app"
        r = super_session.post(f"{API}/users", json={
            "email": email, "is_superadmin": True,
        })
        assert r.status_code == 201
        assert r.json()["user"]["is_superadmin"] is False
        created_users.append(r.json()["user"]["id"])


# ---------- Manage: super-admin target protection ----------
class TestSuperTargetGuard:
    def test_patch_super_admin_forbidden(self, super_session):
        r = super_session.get(f"{API}/users")
        super_id = next(u["id"] for u in r.json() if u["is_superadmin"])
        assert super_session.patch(f"{API}/users/{super_id}", json={"full_name": "x"}).status_code == 403
        assert super_session.post(f"{API}/users/{super_id}/memberships",
                                  json={"branch_id": JKT, "role": "staff"}).status_code == 403
        assert super_session.post(f"{API}/users/{super_id}/reset-password").status_code == 403


# ---------- Memberships ----------
class TestMemberships:
    def test_add_and_change_role(self, super_session):
        # add BDG as branch_admin
        r = super_session.post(f"{API}/users/{pytest.created_id}/memberships",
                               json={"branch_id": BDG, "role": "branch_admin"})
        assert r.status_code == 200
        roles = {m["branch_code"]: m["role"] for m in r.json()["memberships"]}
        assert roles.get("BDG-01") == "branch_admin"
        # change role staff
        r = super_session.post(f"{API}/users/{pytest.created_id}/memberships",
                               json={"branch_id": BDG, "role": "staff"})
        roles = {m["branch_code"]: m["role"] for m in r.json()["memberships"]}
        assert roles["BDG-01"] == "staff"

    def test_remove_membership(self, super_session):
        r = super_session.delete(f"{API}/users/{pytest.created_id}/memberships/{BDG}")
        assert r.status_code == 200
        codes = [m["branch_code"] for m in r.json()["memberships"]]
        assert "BDG-01" not in codes

    def test_nonexistent_branch_400(self, super_session):
        r = super_session.post(f"{API}/users/{pytest.created_id}/memberships",
                               json={"branch_id": str(uuid.uuid4()), "role": "staff"})
        assert r.status_code == 400


# ---------- Activate / deactivate ----------
class TestActivation:
    def test_deactivate_blocks_login(self, super_session):
        # Deactivate + rename
        r = super_session.patch(f"{API}/users/{pytest.created_id}",
                                json={"is_active": False, "full_name": "TEST Renamed"})
        assert r.status_code == 200
        assert r.json()["is_active"] is False
        assert r.json()["full_name"] == "TEST Renamed"

        # Login should fail (401 or 403)
        s = requests.Session()
        login = _login(s, {"email": pytest.created_email, "password": pytest.created_pw})
        assert login.status_code in (401, 403), login.status_code

    def test_reactivate_restores(self, super_session):
        r = super_session.patch(f"{API}/users/{pytest.created_id}", json={"is_active": True})
        assert r.status_code == 200 and r.json()["is_active"] is True
        s = requests.Session()
        assert _login(s, {"email": pytest.created_email, "password": pytest.created_pw}).status_code == 200


# ---------- Reset password ----------
class TestResetPassword:
    def test_reset_and_login(self, super_session):
        r = super_session.post(f"{API}/users/{pytest.created_id}/reset-password")
        assert r.status_code == 200
        new_pw = r.json()["initial_password"]
        assert len(new_pw) >= 10 and any(c.isalpha() for c in new_pw) and any(c.isdigit() for c in new_pw)

        # Old password must fail
        s = requests.Session()
        assert _login(s, {"email": pytest.created_email, "password": pytest.created_pw}).status_code == 401
        # New password works
        assert _login(s, {"email": pytest.created_email, "password": new_pw}).status_code == 200
        pytest.created_pw = new_pw


# ---------- Branch isolation regression ----------
class TestBranchIsolation:
    def test_new_user_sees_only_assigned_active_branch(self):
        s = requests.Session()
        assert _login(s, {"email": pytest.created_email, "password": pytest.created_pw}).status_code == 200
        r = s.get(f"{API}/branches")
        assert r.status_code == 200
        ids = [b["id"] for b in r.json()]
        # Was assigned JKT-01 only (staff role)
        assert JKT in ids
        assert BDG not in ids and SBY not in ids


# ---------- Regression: existing auth ----------
class TestAuthRegression:
    def test_admin_login_me_refresh_logout(self):
        s = requests.Session()
        assert _login(s, SUPER).status_code == 200
        assert s.get(f"{API}/auth/me").status_code == 200
        assert s.post(f"{API}/auth/refresh").status_code == 200
        assert s.post(f"{API}/auth/logout").status_code == 200
