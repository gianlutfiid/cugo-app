"""Foundation tests for CUGO API — health, root, and DB schema readiness."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
# Fallback: read from frontend .env if not set in env
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break


class TestHealth:
    def test_health_returns_ok(self):
        r = requests.get(f"{BASE_URL}/api/health", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        assert data["service"] == "cugo-api"
        assert data["database"] == "connected"
        assert data["environment"] == "development"

    def test_api_root(self):
        r = requests.get(f"{BASE_URL}/api", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["service"] == "cugo-api"
        assert data["status"] == "running"
        assert data["version"] == "0.1.0"


class TestDatabaseSchema:
    """Verify Alembic-applied tables exist via psql."""

    def test_branches_and_alembic_tables_exist(self):
        import subprocess
        # Read DB config from backend/.env
        env = {}
        with open("/app/backend/.env") as f:
            for line in f:
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.strip().split("=", 1)
                    env[k] = v
        user = env["POSTGRES_USER"]
        pw = env["POSTGRES_PASSWORD"]
        host = env.get("POSTGRES_HOST", "localhost")
        port = env.get("POSTGRES_PORT", "5432")
        db = env["POSTGRES_DB"]
        cmd = [
            "psql",
            f"postgresql://{user}:{pw}@{host}:{port}/{db}",
            "-tAc",
            "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        assert result.returncode == 0, f"psql failed: {result.stderr}"
        tables = [t.strip() for t in result.stdout.strip().split("\n") if t.strip()]
        assert "branches" in tables, f"'branches' table missing. Tables: {tables}"
        assert "alembic_version" in tables, f"'alembic_version' table missing. Tables: {tables}"
