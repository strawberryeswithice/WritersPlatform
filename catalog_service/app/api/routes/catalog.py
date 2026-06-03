import math
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import Optional

from catalog_service.app.db.database import get_db
from catalog_service.app.db.models import Project, ProjectStatus, ProjectGenre, ProjectAppeal, AppealStatus
from catalog_service.app.schemas.catalog_schema import (
    ProjectCreate, ProjectUpdate, ProjectResponse, ProjectListResponse,
    AppealCreate, AppealResponse,
)
from catalog_service.app.utils.auth import get_current_user_id
from catalog_service.app.core.config import settings

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.get("/projects", response_model=ProjectListResponse)
async def list_projects(
        search: Optional[str] = Query(None),
        genre:  Optional[ProjectGenre] = Query(None),
        status_filter: Optional[ProjectStatus] = Query(None, alias="status"),
        chapters_min: Optional[int] = Query(None, ge=0),
        chapters_max: Optional[int] = Query(None, ge=0),
        page: int = Query(1, ge=1),
        size: int = Query(settings.DEFAULT_PAGE_SIZE, ge=1, le=settings.MAX_PAGE_SIZE),
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db),
):

    query = db.query(Project).filter(
        Project.owner_id == current_user_id,
        Project.user_deleted_at.is_(None),
    )

    if search:        query = query.filter(Project.title.ilike(f"%{search}%"))
    if genre:         query = query.filter(Project.genre == genre)
    if status_filter: query = query.filter(Project.status == status_filter)
    if chapters_min is not None: query = query.filter(Project.chapter_count >= chapters_min)
    if chapters_max is not None: query = query.filter(Project.chapter_count <= chapters_max)

    total  = query.count()
    offset = (page - 1) * size
    items  = query.order_by(Project.is_deleted.asc(), Project.created_at.desc()).offset(offset).limit(size).all()

    return ProjectListResponse(
        items=items, total=total, page=page, size=size,
        pages=math.ceil(total / size) if total else 0,
    )


@router.post("/projects", response_model=ProjectResponse, status_code=201)
async def create_project(
        project_data: ProjectCreate,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db),
):
    project = Project(**project_data.model_dump(), chapter_count=0, owner_id=current_user_id)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
        project_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db),
):
    return _get_owned(project_id, current_user_id, db)


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
        project_id: int,
        project_data: ProjectUpdate,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db),
):
    project = _get_owned(project_id, current_user_id, db)
    if project.is_deleted:
        raise HTTPException(status_code=400, detail="Нельзя редактировать удалённый проект")
    for field, value in project_data.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(
        project_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db),
):
    project = _get_owned(project_id, current_user_id, db)
    project.user_deleted_at = datetime.now(timezone.utc)
    db.commit()


@router.post("/projects/{project_id}/restore", status_code=200)
async def restore_project(
        project_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db),
):
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == current_user_id,
        ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Проект не найден")
    project.user_deleted_at = None
    db.commit()
    return {"ok": True}


@router.delete("/projects/{project_id}/dismiss", status_code=204)
async def dismiss_deleted_project(
        project_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db),
):
    project = _get_owned(project_id, current_user_id, db)
    if not project.is_deleted:
        raise HTTPException(status_code=400, detail="Проект не помечен как удалённый")
    db.delete(project)
    db.commit()


@router.post("/projects/{project_id}/appeal", response_model=AppealResponse, status_code=201)
async def create_appeal(
        project_id: int,
        body: AppealCreate,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db),
):
    project = _get_owned(project_id, current_user_id, db)
    if not project.is_deleted:
        raise HTTPException(status_code=400, detail="Проект не помечен как удалённый")

    total_appeals = db.query(ProjectAppeal).filter(
        ProjectAppeal.project_id == project_id,
        ProjectAppeal.owner_id == current_user_id,
        ).count()
    if total_appeals >= 3:
        raise HTTPException(status_code=400,
                            detail="Достигнут лимит апелляций (максимум 3) для этого проекта")

    existing = db.query(ProjectAppeal).filter(
        ProjectAppeal.project_id == project_id,
        ProjectAppeal.status == AppealStatus.PENDING,
        ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Апелляция по этому проекту уже подана")

    appeal = ProjectAppeal(
        project_id=project_id,
        owner_id=current_user_id,
        owner_email=body.owner_email,
        owner_name=getattr(body, "owner_name", None),
        project_title=project.title,
        message=body.message,
    )
    db.add(appeal)
    db.commit()
    db.refresh(appeal)
    return appeal


def _get_owned(project_id: int, user_id: int, db: Session) -> Project:
    p = db.query(Project).filter(Project.id == project_id, Project.owner_id == user_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Проект не найден")
    return p
