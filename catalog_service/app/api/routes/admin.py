import math
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import Optional, List
from jose import JWTError, jwt
from pydantic import BaseModel

from catalog_service.app.db.database import get_db
from catalog_service.app.db.models import Project, ProjectAppeal, AppealStatus
from catalog_service.app.schemas.catalog_schema import (
    ProjectResponse, ProjectListResponse,
    AppealResponse, AdminSoftDeleteRequest,
)
from catalog_service.app.utils.email_notify import (
    send_project_deleted, send_project_restored,
    send_appeal_accepted, send_appeal_rejected,
)
from catalog_service.app.core.config import settings

router = APIRouter(prefix="/api/admin/catalog", tags=["admin-catalog"])
bearer_scheme = HTTPBearer()


def _require_admin(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> tuple:
    try:
        payload = jwt.decode(credentials.credentials, settings.JWT_SECRET_KEY,
                             algorithms=[settings.ALGORITHM])
        role = payload.get("role", "user")
        if role not in ("admin", "superadmin"):
            raise HTTPException(status_code=403, detail="Доступ запрещён")
        return int(payload.get("sub")), role, payload.get("email", "")
    except JWTError:
        raise HTTPException(status_code=401, detail="Невалидный токен")



@router.get("/projects", response_model=ProjectListResponse)
async def admin_list_projects(
    search:    Optional[str] = Query(None),
    owner_id:  Optional[int] = Query(None),
    genre:     Optional[str] = Query(None),
    status_f:  Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    admin_info: tuple = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(Project)
    if search:   query = query.filter(Project.title.ilike(f"%{search}%"))
    if owner_id: query = query.filter(Project.owner_id == owner_id)
    if genre:    query = query.filter(Project.genre == genre)
    if status_f: query = query.filter(Project.status == status_f)

    total  = query.count()
    offset = (page - 1) * size
    items  = query.order_by(Project.created_at.desc()).offset(offset).limit(size).all()

    return ProjectListResponse(
        items=items, total=total, page=page, size=size,
        pages=math.ceil(total / size) if total else 0,
    )


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def admin_get_project(
    project_id: int,
    admin_info: tuple = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Проект не найден")
    return p


class SoftDeleteWithEmail(AdminSoftDeleteRequest):
    owner_email: str
    owner_name:  Optional[str] = None


@router.post("/projects/{project_id}/soft-delete", response_model=ProjectResponse)
async def admin_soft_delete_project(
    project_id: int,
    body: SoftDeleteWithEmail,
    background_tasks: BackgroundTasks,
    admin_info: tuple = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    admin_id, _, admin_email = admin_info
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Проект не найден")
    if p.is_deleted:
        raise HTTPException(status_code=400, detail="Проект уже помечен как удалённый")

    p.is_deleted        = True
    p.deleted_reason    = body.reason
    p.deleted_at        = datetime.now(timezone.utc)
    p.deleted_by_id     = admin_id
    p.deleted_by_email  = admin_email
    db.commit()
    db.refresh(p)

    background_tasks.add_task(
        send_project_deleted, body.owner_email, p.title, body.reason, admin_email
    )
    return p


@router.post("/projects/{project_id}/restore", response_model=ProjectResponse)
async def admin_restore_project(
    project_id: int,
    background_tasks: BackgroundTasks,
    admin_info: tuple = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    admin_id, _, admin_email = admin_info
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Проект не найден")

    last_appeal = (db.query(ProjectAppeal)
                   .filter(ProjectAppeal.project_id == project_id)
                   .order_by(ProjectAppeal.created_at.desc()).first())
    owner_email = last_appeal.owner_email if last_appeal else None
    title = p.title

    p.is_deleted = False; p.deleted_reason = None; p.deleted_at = None
    p.deleted_by_id = None; p.deleted_by_email = None
    db.commit(); db.refresh(p)

    if owner_email:
        background_tasks.add_task(send_project_restored, owner_email, title)
    return p



@router.get("/appeals", response_model=List[AppealResponse])
async def admin_list_appeals(
    status_f: Optional[str] = Query("pending", alias="status"),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    admin_info: tuple = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(ProjectAppeal)
    if status_f:
        try:
            query = query.filter(ProjectAppeal.status == AppealStatus(status_f))
        except ValueError:
            pass
    appeals = (query.order_by(ProjectAppeal.created_at.desc())
                    .offset((page - 1) * size).limit(size).all())
    return appeals


class ReviewBody(BaseModel):
    resolution: str = "rejected"   # "accepted" | "rejected"
    admin_comment: Optional[str] = None


@router.post("/appeals/{appeal_id}/review", response_model=AppealResponse)
async def admin_review_appeal(
    appeal_id: int,
    body: ReviewBody,
    background_tasks: BackgroundTasks,
    admin_info: tuple = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    admin_id, _, admin_email = admin_info
    appeal = db.query(ProjectAppeal).filter(ProjectAppeal.id == appeal_id).first()
    if not appeal:
        raise HTTPException(status_code=404, detail="Апелляция не найдена")

    resolution = body.resolution.lower()
    if resolution == "accepted":
        appeal.status = AppealStatus.ACCEPTED
        project = db.query(Project).filter(Project.id == appeal.project_id).first()
        if project:
            project.is_deleted = False; project.deleted_reason = None
            project.deleted_at = None; project.deleted_by_id = None; project.deleted_by_email = None
        background_tasks.add_task(
            send_appeal_accepted, appeal.owner_email, appeal.project_title, body.admin_comment
        )
    else:
        appeal.status = AppealStatus.REJECTED
        background_tasks.add_task(
            send_appeal_rejected, appeal.owner_email, appeal.project_title, body.admin_comment
        )

    appeal.reviewed_at = datetime.now(timezone.utc)
    appeal.reviewed_by_id = admin_id
    appeal.admin_comment = body.admin_comment
    db.commit(); db.refresh(appeal)
    return appeal


router = APIRouter(prefix="/api/admin/catalog", tags=["admin-catalog"])
bearer_scheme = HTTPBearer()


def _require_admin(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> tuple:
    try:
        payload = jwt.decode(credentials.credentials, settings.JWT_SECRET_KEY,
                             algorithms=[settings.ALGORITHM])
        role = payload.get("role", "user")
        if role not in ("admin", "superadmin"):
            raise HTTPException(status_code=403, detail="Доступ запрещён")
        return int(payload.get("sub")), role, payload.get("email", "")
    except JWTError:
        raise HTTPException(status_code=401, detail="Невалидный токен")


@router.get("/projects", response_model=ProjectListResponse)
async def admin_list_projects(
    search:    Optional[str] = Query(None),
    owner_id:  Optional[int] = Query(None),
    genre:     Optional[str] = Query(None),
    status_f:  Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    admin_info: tuple = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(Project)
    if search:   query = query.filter(Project.title.ilike(f"%{search}%"))
    if owner_id: query = query.filter(Project.owner_id == owner_id)
    if genre:    query = query.filter(Project.genre == genre)
    if status_f: query = query.filter(Project.status == status_f)

    total  = query.count()
    offset = (page - 1) * size
    items  = query.order_by(Project.created_at.desc()).offset(offset).limit(size).all()

    return ProjectListResponse(
        items=items, total=total, page=page, size=size,
        pages=math.ceil(total / size) if total else 0,
    )


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def admin_get_project(
    project_id: int,
    admin_info: tuple = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Проект не найден")
    return p


class SoftDeleteWithEmail(AdminSoftDeleteRequest):
    owner_email: str


@router.post("/projects/{project_id}/soft-delete", response_model=ProjectResponse)
async def admin_soft_delete_project(
    project_id: int,
    body: SoftDeleteWithEmail,
    background_tasks: BackgroundTasks,
    admin_info: tuple = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    admin_id, _, admin_email = admin_info
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Проект не найден")
    if p.is_deleted:
        raise HTTPException(status_code=400, detail="Проект уже помечен как удалённый")

    p.is_deleted        = True
    p.deleted_reason    = body.reason
    p.deleted_at        = datetime.now(timezone.utc)
    p.deleted_by_id     = admin_id
    p.deleted_by_email  = admin_email
    db.commit()
    db.refresh(p)

    background_tasks.add_task(
        send_project_deleted, body.owner_email, p.title, body.reason, admin_email
    )
    return p


@router.post("/projects/{project_id}/restore", response_model=ProjectResponse)
async def admin_restore_project(
    project_id: int,
    admin_info: tuple = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Проект не найден")
    p.is_deleted = False; p.deleted_reason = None; p.deleted_at = None
    p.deleted_by_id = None; p.deleted_by_email = None
    db.commit(); db.refresh(p)
    return p

@router.get("/appeals", response_model=List[AppealResponse])
async def admin_list_appeals(
    status_f: Optional[str] = Query("pending", alias="status"),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    admin_info: tuple = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(ProjectAppeal)
    if status_f:
        try:
            query = query.filter(ProjectAppeal.status == AppealStatus(status_f))
        except ValueError:
            pass
    appeals = (query.order_by(ProjectAppeal.created_at.desc())
                    .offset((page - 1) * size).limit(size).all())
    return appeals


@router.post("/appeals/{appeal_id}/review", response_model=AppealResponse)
async def admin_review_appeal(
    appeal_id: int,
    admin_info: tuple = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    admin_id, _, _ = admin_info
    appeal = db.query(ProjectAppeal).filter(ProjectAppeal.id == appeal_id).first()
    if not appeal:
        raise HTTPException(status_code=404, detail="Апелляция не найдена")
    appeal.status = AppealStatus.REVIEWED
    appeal.reviewed_at = datetime.now(timezone.utc)
    appeal.reviewed_by_id = admin_id
    db.commit(); db.refresh(appeal)
    return appeal
