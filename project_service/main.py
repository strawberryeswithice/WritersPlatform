import os
import time
import logging
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from project_service.app.core.config import settings
from project_service.app.db.database import engine, Base
from project_service.app.db import models
from project_service.app.api.routes import project
from project_service.app.api.routes import ai
from project_service.app.api.routes import admin as admin_project
from project_service.app.api.routes import import_chapters
from project_service.app.middleware.cors import add_cors_middleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logger = logging.getLogger("project")

app = FastAPI(
    title="Project Microservice",
    description="Микросервис управления содержимым проекта")

add_cors_middleware(app)
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

BASE_DIR = Path(os.getcwd())
frontend_path = BASE_DIR / "frontend"
frontend_dist = frontend_path / "dist"

if (frontend_dist / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")

if (frontend_path / "static").exists():
    app.mount("/static", StaticFiles(directory=str(frontend_path / "static")), name="static")


app.include_router(project.router)
app.include_router(ai.router)
app.include_router(admin_project.router)
app.include_router(import_chapters.router)

@app.on_event("startup")
async def startup_event():
    Base.metadata.create_all(bind=engine)
    try:
        from project_service.app.utils.minio_client import minio_client
        minio_client.upload_background_images(str(frontend_path / "static"))
    except Exception as e:
        print(f"Warning: Could not upload backgrounds to MinIO: {e}")

def _spa_response():
    spa = frontend_dist / "index.html"
    path = str(spa) if spa.exists() else str(frontend_path / "templates" / "project.html")
    return FileResponse(
        path,
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        }
    )

@app.get("/project/{project_id}")
async def project_page(project_id: int):
    return _spa_response()

@app.get("/editor/{project_id}/{chapter_id}")
async def editor_page(project_id: int, chapter_id: int):
    return _spa_response()

@app.get("/editor/{project_id}/{chapter_id}/{rest:path}")
async def editor_spa_fallback(project_id: int, chapter_id: int, rest: str):
    return _spa_response()
