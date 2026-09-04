"""Root API router — aggregates all route modules."""
from fastapi import APIRouter

from app.api.routes import auth, branches, customers, finance, health, kpi, orders, production, services, users

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(branches.router)
api_router.include_router(customers.router)
api_router.include_router(services.router)
api_router.include_router(orders.router)
api_router.include_router(production.router)
api_router.include_router(kpi.router)
api_router.include_router(finance.router)
api_router.include_router(users.router)
