from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import Optional
import math
from catalog_service.app.db.database import get_db
from catalog_service.app.db.models import Project, ProjectStatus, ProjectGenre
from catalog_service.app.schemas.catalog_schema import (
    ProjectCreate, ProjectUpdate, ProjectResponse, ProjectListResponse
)
from catalog_service.app.utils.auth import get_current_user_id
from catalog_service.app.core.config import settings

router = APIRouter(prefix="/api/catalog", tags=["catalog"])

@router.get("/projects", response_model=ProjectListResponse)
async def list_projects(
        search: Optional[str] = Query(None, description="Поиск по названию"),
        genre: Optional[ProjectGenre] = Query(None, description="Фильтр по жанру"),
        status: Optional[ProjectStatus] = Query(None, description="Фильтр по статусу"),
        chapters_min: Optional[int] = Query(None, ge=0, description="Минимальное кол-во глав"),
        chapters_max: Optional[int] = Query(None, ge=0, description="Максимальное кол-во глав"),
        page: int = Query(1, ge=1, description="Номер страницы"),
        size: int = Query(settings.DEFAULT_PAGE_SIZE, ge=1, le=settings.MAX_PAGE_SIZE),
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    query = db.query(Project).filter(Project.owner_id == current_user_id)

    if search:
        query = query.filter(Project.title.ilike(f"%{search}%"))
    if genre:
        query = query.filter(Project.genre == genre)
    if status:
        query = query.filter(Project.status == status)
    if chapters_min is not None:
        query = query.filter(Project.chapter_count >= chapters_min)
    if chapters_max is not None:
        query = query.filter(Project.chapter_count <= chapters_max)

    total = query.count()
    offset = (page - 1) * size
    items = query.order_by(Project.created_at.desc()).offset(offset).limit(size).all()

    return ProjectListResponse(
        items=items,
        total=total,
        page=page,
        size=size,
        pages=math.ceil(total / size) if total else 0
    )

@router.post("/projects", response_model=ProjectResponse, status_code=201)
async def create_project(
        project_data: ProjectCreate,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    project = Project(
        **project_data.model_dump(),
        chapter_count=0,
        owner_id=current_user_id
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
        project_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    project = _get_owned_project(project_id, current_user_id, db)
    return project

@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
        project_id: int,
        project_data: ProjectUpdate,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    project = _get_owned_project(project_id, current_user_id, db)
    update_data = project_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return project

@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(
        project_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    project = _get_owned_project(project_id, current_user_id, db)
    db.delete(project)
    db.commit()

def _get_owned_project(project_id: int, user_id: int, db: Session) -> Project:
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == user_id
    ).first()

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Проект не найден"
        )
    return project