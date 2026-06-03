import time
import logging
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from auth_service.app.db.database import engine, Base
from auth_service.app.api.routes import auth
from auth_service.app.api.routes import admin

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logger = logging.getLogger("auth")

app = FastAPI(
    title="Auth мicroservice",
    description="микросервис авторизации и регистрации пользователей")

from jose import jwt as _jwt

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
    elif not path.startswith("/assets") and not path.startswith("/static"):
        logger.info("%s %s → %d  %dms  user=%s", method, path, status, ms, user)
    return response

frontend_path = Path(__file__).resolve().parent.parent / "frontend"
frontend_dist = frontend_path / "dist"

if (frontend_dist / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")

app.mount("/static", StaticFiles(directory=str(frontend_path / "static")), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(admin.router)

@app.on_event("startup")
async def startup_event():
    Base.metadata.create_all(bind=engine)

def _spa():
    spa = frontend_dist / "index.html"
    if spa.exists():
        return FileResponse(str(spa))
    return FileResponse(str(frontend_path / "templates" / "auth.html"))

@app.get("/")
async def root():
    return _spa()

@app.get("/admin")
async def admin_page():
    return _spa()

@app.get("/admin/{rest:path}")
async def admin_spa_fallback(rest: str):
    return _spa()
