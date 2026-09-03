"""Tests for per-branch read isolation on /api/branches."""
import os
import re
import uuid

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

SUPER = ("admin@cugo.app", "ChangeMe#CUGO2026")
MANAGER = ("manager@cugo.app", "TestPass#123")
STAFF = ("staff@cugo.app", "TestPass#123")

ALLOWED_KEYS = {"id", "name", "code", "is_active", "address", "phone",
                "timezone", "created_at", "updated_at"}
FORBIDDEN_KEYS = re.compile(
    r"hashed_password|(?<!\w)password(?!\w)|access_token|refresh_token", re.I
)


def _login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def super_session():
    return _login(*SUPER)


@pytest.fixture(scope="module")
def manager_session():
    return _login(*MANAGER)


@pytest.fixture(scope="module")
def staff_session():
    return _login(*STAFF)


@pytest.fixture(scope="module")
def branches_by_code(super_session):
    r = super_session.get(f"{BASE_URL}/api/branches")
    assert r.status_code == 200, r.text
    return {b["code"]: b for b in r.json()}


# ---- unauthenticated ----
def test_list_branches_unauthenticated_401():
    r = requests.get(f"{BASE_URL}/api/branches")
    assert r.status_code == 401


def test_get_branch_unauthenticated_401(branches_by_code):
    bid = branches_by_code["JKT-01"]["id"]
    r = requests.get(f"{BASE_URL}/api/branches/{bid}")
    assert r.status_code == 401


# ---- super_admin ----
def test_super_admin_lists_all_branches(super_session, branches_by_code):
    codes = set(branches_by_code.keys())
    assert {"JKT-01", "BDG-01", "SBY-01"}.issubset(codes)
    # inactive included
    assert branches_by_code["SBY-01"]["is_active"] is False


def test_super_admin_gets_active_and_inactive(super_session, branches_by_code):
    for code in ("JKT-01", "SBY-01"):
        bid = branches_by_code[code]["id"]
        r = super_session.get(f"{BASE_URL}/api/branches/{bid}")
        assert r.status_code == 200, f"{code}: {r.text}"
        body = r.json()
        assert body["code"] == code
        # schema shape - only allowed fields
        assert set(body.keys()) == ALLOWED_KEYS, f"unexpected keys: {set(body.keys())}"
        assert not FORBIDDEN_KEYS.search(r.text)


# ---- branch_admin (manager) ----
def test_branch_admin_lists_only_assigned_active(manager_session):
    r = manager_session.get(f"{BASE_URL}/api/branches")
    assert r.status_code == 200
    data = r.json()
    codes = {b["code"] for b in data}
    assert codes == {"JKT-01"}, f"expected only JKT-01, got {codes}"
    assert all(b["is_active"] for b in data)


def test_branch_admin_get_own_active_200(manager_session, branches_by_code):
    bid = branches_by_code["JKT-01"]["id"]
    r = manager_session.get(f"{BASE_URL}/api/branches/{bid}")
    assert r.status_code == 200
    body = r.json()
    assert body["code"] == "JKT-01"
    assert set(body.keys()) == ALLOWED_KEYS


def test_branch_admin_get_own_inactive_404(manager_session, branches_by_code):
    bid = branches_by_code["SBY-01"]["id"]
    r = manager_session.get(f"{BASE_URL}/api/branches/{bid}")
    assert r.status_code == 404


def test_branch_admin_get_non_member_active_404(manager_session, branches_by_code):
    bid = branches_by_code["BDG-01"]["id"]
    r = manager_session.get(f"{BASE_URL}/api/branches/{bid}")
    assert r.status_code == 404


# ---- staff ----
def test_staff_lists_only_assigned_active(staff_session):
    r = staff_session.get(f"{BASE_URL}/api/branches")
    assert r.status_code == 200
    codes = {b["code"] for b in r.json()}
    assert codes == {"BDG-01"}, f"expected only BDG-01, got {codes}"


def test_staff_get_own_active_200(staff_session, branches_by_code):
    bid = branches_by_code["BDG-01"]["id"]
    r = staff_session.get(f"{BASE_URL}/api/branches/{bid}")
    assert r.status_code == 200
    assert r.json()["code"] == "BDG-01"


def test_staff_get_own_inactive_404(staff_session, branches_by_code):
    bid = branches_by_code["SBY-01"]["id"]
    r = staff_session.get(f"{BASE_URL}/api/branches/{bid}")
    assert r.status_code == 404


def test_staff_get_non_member_active_404(staff_session, branches_by_code):
    bid = branches_by_code["JKT-01"]["id"]
    r = staff_session.get(f"{BASE_URL}/api/branches/{bid}")
    assert r.status_code == 404


# ---- id manipulation ----
def test_random_uuid_returns_404_for_non_super(manager_session):
    fake = uuid.uuid4()
    r = manager_session.get(f"{BASE_URL}/api/branches/{fake}")
    assert r.status_code == 404


def test_invalid_uuid_format_returns_422(manager_session):
    r = manager_session.get(f"{BASE_URL}/api/branches/not-a-uuid")
    assert r.status_code == 422
