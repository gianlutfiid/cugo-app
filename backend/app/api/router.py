"""Root API router — aggregates all route modules."""
from fastapi import APIRouter

from app.api.routes import auth, branches, health

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(branches.router)
