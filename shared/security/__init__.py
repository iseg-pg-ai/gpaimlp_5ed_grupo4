from datetime import datetime, timedelta, timezone
import jwt
from fastapi import HTTPException, status
from shared.config import settings


def create_access_token(subject: str, expires_minutes: int = 60) -> str:
    return jwt.encode(
        {"sub": subject, "exp": datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)},
        settings.blu_jwt_secret,
        algorithm="HS256",
    )


def verify_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.blu_jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        ) from exc
