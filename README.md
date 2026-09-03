# CUGO App

Multi-branch laundry management system.

> **Status:** Project foundation / initialization stage. No business features
> have been implemented yet — this is a clean, runnable skeleton prepared for
> incremental development of the multi-branch CUGO platform.

## Tech stack

| Layer     | Technology                                   |
| --------- | -------------------------------------------- |
| Frontend  | React + TypeScript (Create React App)        |
| Backend   | FastAPI (Python 3.11)                         |
| Database  | PostgreSQL 15                                 |
| ORM       | SQLAlchemy 2.0 (async) + Alembic migrations   |

## Project structure

```
.
├── backend/
│   ├── server.py              # FastAPI entrypoint (app = FastAPI)
│   ├── alembic.ini            # Alembic configuration
│   ├── alembic/               # Migration environment + versions
│   ├── requirements.txt
│   ├── .env.example
│   └── app/
│       ├── core/              # Settings & database engine/session
│       ├── models/            # SQLAlchemy models (Base, Branch)
│       ├── schemas/           # Pydantic request/response schemas
│       ├── api/               # API router
│       │   └── routes/        # Endpoint modules (health, ...)
│       ├── services/          # Business/service layer (future)
│       └── utils/             # Shared helpers (future)
└── frontend/
    ├── package.json
    ├── tsconfig.json
    ├── .env.example
    ├── public/
    └── src/
        ├── api/               # Backend API client
        ├── App.tsx
        └── index.tsx
```

## Prerequisites

- Python 3.11+
- Node.js 20+ and Yarn
- PostgreSQL 15+ running locally

## Configuration

Environment variables are kept out of version control. Copy the example files
and fill in your own values:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

**backend/.env**

| Variable            | Description                                    |
| ------------------- | ---------------------------------------------- |
| `POSTGRES_USER`     | PostgreSQL role                                |
| `POSTGRES_PASSWORD` | PostgreSQL password                            |
| `POSTGRES_HOST`     | Database host (e.g. `localhost`)               |
| `POSTGRES_PORT`     | Database port (e.g. `5432`)                    |
| `POSTGRES_DB`       | Database name                                  |
| `CORS_ORIGINS`      | Comma-separated allowed frontend origins       |
| `ENVIRONMENT`       | `development` / `production`                   |

**frontend/.env**

| Variable                 | Description                          |
| ------------------------ | ------------------------------------ |
| `REACT_APP_BACKEND_URL`  | Base URL of the backend API          |

## Running locally

### Backend

```bash
cd backend
pip install -r requirements.txt

# Apply database migrations
alembic upgrade head

# Start the API (development)
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

The API is served under the `/api` prefix. Health check:

```bash
curl http://localhost:8001/api/health
# {"status":"ok","service":"cugo-api","database":"connected","environment":"development"}
```

### Frontend

```bash
cd frontend
yarn install
yarn start   # serves on http://localhost:3000
```

## Database migrations (Alembic)

```bash
cd backend

# Autogenerate a migration after changing models
alembic revision --autogenerate -m "describe change"

# Apply migrations
alembic upgrade head

# Roll back the last migration
alembic downgrade -1
```

## Data model (foundation)

Multi-branch access model — the schema is designed so branch-level data
isolation can be enforced at the API layer later.

| Table                | Purpose                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| `branches`           | A CUGO branch. Fields: `name`, `code` (unique), `is_active`, `address`, `phone`, `timezone` (default `Asia/Jakarta`), timestamps. |
| `users`              | Auth-ready account. Fields: `email` (unique), `hashed_password`, `full_name`, `is_superadmin`, `is_active`, `last_login`, timestamps. Passwords are never stored in plaintext. |
| `branch_memberships` | Many-to-many link (user ↔ branch) carrying a `role` per branch. Unique on `(user_id, branch_id)`. `role` ∈ {`branch_admin`, `staff`} (DB CHECK constraint). FKs cascade on delete. |

**Roles**

- `super_admin` — platform-wide access; represented by `users.is_superadmin`.
  Requires **no** branch membership.
- `branch_admin` / `staff` — scoped to the branches in `branch_memberships`.

Roles are stored as strings with a CHECK constraint (not a native ENUM) so new
roles/permissions can be added later with clean, reversible migrations. See
`backend/app/models/enums.py`.

## Notes

- JWT email/password authentication will be added in a later stage; the `users`
  table is already auth-ready.
- No business/laundry tables or seed data exist yet — they will be designed
  before implementing business features.
