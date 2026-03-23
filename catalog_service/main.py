import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from catalog_service.app.db.database import engine, Base
from catalog_service.app.api.routes import catalog

app = FastAPI(
    title="Catalog Microservice",
    description="Микросервис управления проектами писателя"
)

frontend_path = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=str(frontend_path / "static")), name="static")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(catalog.router)

@app.on_event("startup")
async def startup_event():
    Base.metadata.create_all(bind=engine)

@app.get("/catalog")
async def catalog_page():
    return FileResponse(frontend_path / "templates" / "catalog.html")
