import time
import logging
import json
from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

logger = logging.getLogger("project_service")


def _extract_identity(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return "anonymous"
    token = auth.split(" ", 1)[1]
    try:
        import base64
        payload_b64 = token.split(".")[1]
        payload_b64 += "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        uid   = payload.get("user_id", payload.get("sub", "?"))
        role  = payload.get("role", "user")
        email = payload.get("email", "")
        return f"user#{uid}({role}){' <' + email + '>' if email else ''}"
    except Exception:
        return "token:invalid"


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, service_name: str = "project"):
        super().__init__(app)
        self.service = service_name

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        if path.startswith("/static") or path in ("/health", "/favicon.ico"):
            return await call_next(request)

        identity = _extract_identity(request)
        t0 = time.perf_counter()
        response = await call_next(request)
        ms = (time.perf_counter() - t0) * 1000

        level = logging.WARNING if response.status_code >= 400 else logging.INFO
        logger.log(
            level,
            "[%s] %s %s → %d (%.0fms) | %s",
            self.service,
            request.method,
            path,
            response.status_code,
            ms,
            identity,
        )
        return response
