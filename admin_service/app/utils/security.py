from jose import JWTError, jwt
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from admin_service.app.core.config import settings


def decode_token(credentials: HTTPAuthorizationCredentials) -> dict:
    try:
        return jwt.decode(credentials.credentials, settings.JWT_SECRET_KEY,
                          algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Невалидный токен")


def require_admin(credentials: HTTPAuthorizationCredentials) -> tuple:
    payload = decode_token(credentials)
    role = payload.get("role", "user")
    if role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    return int(payload.get("sub")), role, payload.get("email", "")


def require_superadmin(credentials: HTTPAuthorizationCredentials) -> tuple:
    payload = decode_token(credentials)
    role = payload.get("role", "user")
    if role != "superadmin":
        raise HTTPException(status_code=403, detail="Только для суперадмина")
    return int(payload.get("sub")), role, payload.get("email", "")
