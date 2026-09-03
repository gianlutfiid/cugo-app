"""Seed the first super_admin account on startup (idempotent)."""
import logging

from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password, verify_password
from app.models.user import User

logger = logging.getLogger("cugo.seed")
settings = get_settings()


async def seed_super_admin() -> None:
    email = settings.ADMIN_EMAIL.lower().strip()
    password = settings.ADMIN_PASSWORD

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if user is None:
            db.add(
                User(
                    email=email,
                    hashed_password=hash_password(password),
                    full_name="Super Admin",
                    is_superadmin=True,
                    is_active=True,
                )
            )
            await db.commit()
            logger.info("Seeded super_admin account: %s", email)
        else:
            changed = False
            if not user.is_superadmin:
                user.is_superadmin = True
                changed = True
            if not verify_password(password, user.hashed_password):
                user.hashed_password = hash_password(password)
                changed = True
            if changed:
                await db.commit()
                logger.info("Updated super_admin account: %s", email)
