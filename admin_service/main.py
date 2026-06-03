import time
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from jose import jwt as _jwt

from admin_service.app.db.database import engine, Base
from admin_service.app.api.routes import users, management, projects, appeals

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logger = logging.getLogger("admin")

app = FastAPI(title="Admin Microservice", description="Единый сервис администрирования Writers Platform")


def _extract_user(request: Request) -> str:
    try:
        auth = request.headers.get("authorization", "")
        if not auth.startswith("Bearer "):
            return "anonymous"
        payload = _jwt.decode(auth.split(" ", 1)[1], options={"verify_signature": False})
        email = payload.get("email") or payload.get("sub", "?")
        role  = payload.get("role", "user")
        return f"{email} [{role}]"
    except Exception:
        return "anonymous"


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    user  = _extract_user(request)
    response = await call_next(request)
    ms = int((time.time() - start) * 1000)
    status, method, path = response.status_code, request.method, request.url.path
    if status >= 400:
        logger.warning("%s %s → %d  %dms  user=%s", method, path, status, ms, user)
    else:
        logger.info("%s %s → %d  %dms  user=%s", method, path, status, ms, user)
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PREFIX = "/api/admin"
app.include_router(users.router,      prefix=PREFIX)
app.include_router(management.router, prefix=PREFIX)
app.include_router(projects.router,   prefix=PREFIX)
app.include_router(appeals.router,    prefix=PREFIX)


@app.on_event("startup")
async def startup():
    Base.metadata.create_all(bind=engine)
    logger.info("Admin service started on :8013")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "admin"}
