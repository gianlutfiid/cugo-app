"""CUGO App API — application entrypoint.

Supervisor runs: `uvicorn server:app` from /app/backend.
All routes are mounted under the `/api` prefix (required by the ingress).
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    description="Multi-branch laundry management system — API foundation.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.get("/api")
async def root():
    return {"service": "cugo-api", "status": "running", "version": "0.1.0"}
