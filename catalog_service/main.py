import os
import time
import logging
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from catalog_service.app.db.database import engine, Base
from catalog_service.app.api.routes import catalog
from catalog_service.app.api.routes import admin as admin_catalog

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logger = logging.getLogger("catalog")

app = FastAPI(
    title="Catalog Microservice",
    description="Микросервис управления проектами писателя"
)

from jose import jwt as _jwt

def _extract_user(request: Request) -> str:
    try:
        auth = request.headers.get("authorization", "")
        if not auth.startswith("Bearer "):
            return "anonymous"
        token = auth.split(" ", 1)[1]
        payload = _jwt.decode(token, options={"verify_signature": False})
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
    status = response.status_code
    method = request.method
    path   = request.url.path
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

app.include_router(catalog.router)
app.include_router(admin_catalog.router)

@app.on_event("startup")
async def startup_event():
    Base.metadata.create_all(bind=engine)

def _spa():
    spa = frontend_dist / "index.html"
    path = str(spa) if spa.exists() else str(frontend_path / "templates" / "catalog.html")
    return FileResponse(
        path,
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        }
    )

@app.get("/catalog")
async def catalog_page():
    return _spa()

@app.get("/catalog/{rest:path}")
async def catalog_spa_fallback(rest: str):
    return _spa()

@app.get("/trash")
async def trash_page():
    return _spa()

@app.get("/trash/{rest:path}")
async def trash_spa_fallback(rest: str):
    return _spa()
