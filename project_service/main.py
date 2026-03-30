import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from project_service.app.core.config import settings
from project_service.app.db.database import engine, Base
from project_service.app.db import models
from project_service.app.api.routes import project

app = FastAPI(
    title="Project Microservice",
    description="Микросервис управления содержимым проекта")

frontend_path = Path(os.getcwd()) / "frontend"

app.mount("/static", StaticFiles(directory=str(frontend_path / "static")), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(project.router)


@app.on_event("startup")
async def startup_event():

    Base.metadata.create_all(bind=engine)

@app.get("/project/{project_id}")
async def project_page(project_id: int):
    return FileResponse(frontend_path / "templates" / "project.html")

@app.get("/editor/{project_id}/{chapter_id}")
async def editor_page(project_id: int, chapter_id: int):
    return FileResponse(frontend_path / "templates" / "editor.html")
