import math
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel

from admin_service.app.db.database import get_db
from admin_service.app.db.models import Project, ProjectAppeal, AppealStatus, User, Chapter, Character, CharacterRelationship, GraphLayout
from admin_service.app.utils.security import require_admin
from admin_service.app.utils.email_notify import send_project_deleted, send_project_restored
from admin_service.app.utils.minio_client import get_chapter_text, get_photo_url

router = APIRouter(tags=["admin-projects"])
bearer_scheme = HTTPBearer()


class ProjectOut(BaseModel):
    id: int
    title: str
    owner_id: int
    genre: Optional[str] = None
    status: Optional[str] = None
    chapter_count: int = 0
    created_at: Optional[datetime] = None
    is_deleted: bool = False
    deleted_reason: Optional[str] = None
    deleted_at: Optional[datetime] = None
    deleted_by_email: Optional[str] = None

    class Config:
        from_attributes = True


class ProjectListOut(BaseModel):
    items: List[ProjectOut]
    total: int
    page: int
    size: int
    pages: int


class SoftDeleteBody(BaseModel):
    reason: str
    owner_email: str
    owner_name: Optional[str] = None


class CharacterOut(BaseModel):
    id: int
    name: str
    role: Optional[str] = None
    short_desc: Optional[str] = None
    desc_full: Optional[str] = None
    personality: Optional[str] = None
    gender: Optional[str] = None
    age: Optional[int] = None
    char_status: Optional[str] = None
    location: Optional[str] = None
    features: Optional[str] = None
    photo_url: Optional[str] = None
    photo_full_url: Optional[str] = None

    class Config:
        from_attributes = True


class RelationshipOut(BaseModel):
    id: int
    char1_id: int
    char2_id: int
    relation_type: str
    project_id: int

    class Config:
        from_attributes = True


class GraphOut(BaseModel):
    project_id: int
    nodes: dict
    relationships: List[RelationshipOut]


class ChapterOut(BaseModel):
    id: int
    project_id: int
    title: str
    content: Optional[str] = None
    char_count: int = 0
    order: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


@router.get("/projects", response_model=ProjectListOut)
async def list_projects(
    search: Optional[str] = Query(None),
    owner_id: Optional[int] = Query(None),
    genre: Optional[str] = Query(None),
    status_f: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    require_admin(credentials)
    query = db.query(Project)
    if search:   query = query.filter(Project.title.ilike(f"%{search}%"))
    if owner_id: query = query.filter(Project.owner_id == owner_id)
    if genre:    query = query.filter(Project.genre == genre)
    if status_f: query = query.filter(Project.status == status_f)

    total = query.count()
    items = query.order_by(Project.created_at.desc()).offset((page - 1) * size).limit(size).all()
    return ProjectListOut(items=items, total=total, page=page, size=size,
                          pages=math.ceil(total / size) if total else 0)


@router.post("/projects/{project_id}/soft-delete", response_model=ProjectOut)
async def soft_delete_project(
    project_id: int,
    body: SoftDeleteBody,
    background_tasks: BackgroundTasks,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    admin_id, _, admin_email = require_admin(credentials)
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Проект не найден")
    if p.is_deleted:
        raise HTTPException(status_code=400, detail="Уже помечен как удалённый")

    p.is_deleted = True
    p.deleted_reason = body.reason
    p.deleted_at = datetime.now(timezone.utc)
    p.deleted_by_id = admin_id
    p.deleted_by_email = admin_email
    db.commit(); db.refresh(p)

    background_tasks.add_task(send_project_deleted, body.owner_email, p.title, body.reason, admin_email)
    return p


@router.post("/projects/{project_id}/restore", response_model=ProjectOut)
async def restore_project(
    project_id: int,
    background_tasks: BackgroundTasks,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    require_admin(credentials)
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



@router.get("/projects/{project_id}/characters", response_model=List[CharacterOut])
async def get_characters(
    project_id: int,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    require_admin(credentials)
    chars = db.query(Character).filter(Character.project_id == project_id).all()

    role_map = {
        "PROTAGONIST": "протагонист", "ANTAGONIST": "антагонист",
        "MENTOR": "ментор", "SECONDARY": "второстепенный",
    }
    gender_map = {
        "FEMALE": "женский", "MALE": "мужской", "OTHER": "другое",
    }
    status_map = {
        "ALIVE": "жив", "DEAD": "мертв", "MISSING": "пропал", "UNKNOWN": "неизвестен",
    }

    result = []
    for c in chars:
        out = CharacterOut.model_validate(c)
        out.photo_url = get_photo_url(c.photo)
        out.photo_full_url = get_photo_url(c.photo_full)
        if out.role:
            out.role = role_map.get(out.role.upper(), out.role)
        if out.gender:
            out.gender = gender_map.get(out.gender.upper(), out.gender)
        if out.char_status:
            out.char_status = status_map.get(out.char_status.upper(), out.char_status)
        result.append(out)
    return result


@router.get("/projects/{project_id}/graph", response_model=GraphOut)
async def get_graph(
    project_id: int,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    require_admin(credentials)
    relationships = db.query(CharacterRelationship).filter(
        CharacterRelationship.project_id == project_id
    ).all()
    layout = db.query(GraphLayout).filter(GraphLayout.project_id == project_id).first()

    rel_map = {
        "MARRIED": "женаты", "COUPLE": "пара", "FRIENDS": "друзья",
        "ENEMIES": "враги", "ACQUAINTANCES": "знакомые", "NEUTRAL": "нейтральные",
    }

    def fix_rel(val):
        if not val:
            return val
        return rel_map.get(str(val).upper(), str(val))

    return GraphOut(
        project_id=project_id,
        nodes=layout.nodes if layout else {},
        relationships=[RelationshipOut(
            id=r.id, char1_id=r.char1_id, char2_id=r.char2_id,
            relation_type=fix_rel(r.relation_type), project_id=r.project_id,
        ) for r in relationships],
    )


import re as _re

def _strip_html(html: str) -> str:
    """Strip HTML tags and decode basic entities for the admin reader."""
    if not html:
        return ""
    text = _re.sub(r'<(p|div|br|h[1-6])[^>]*>', '\n', html, flags=_re.IGNORECASE)
    text = _re.sub(r'</?(p|div|br|h[1-6])[^>]*>', '\n', text, flags=_re.IGNORECASE)
    text = _re.sub(r'<[^>]+>', '', text)
    text = text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    text = text.replace('&nbsp;', ' ').replace('&quot;', '"').replace('&#39;', "'")
    text = _re.sub(r'\n{3,}', '\n\n', text).strip()
    return text


@router.get("/projects/{project_id}/chapters", response_model=List[ChapterOut])
async def get_chapters(
    project_id: int,
    include_content: bool = Query(False),
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    _, role, _ = require_admin(credentials)
    chapters = (db.query(Chapter)
                .filter(Chapter.project_id == project_id)
                .order_by(Chapter.order).all())
    result = []
    for ch in chapters:
        out = ChapterOut.model_validate(ch)
        if role == "superadmin" and include_content:
            raw = ""
            if ch.content_url:
                raw = get_chapter_text(ch.content_url) or ch.content or ""
            else:
                raw = ch.content or ""
            out.content = _strip_html(raw)
        else:
            out.content = None
        result.append(out)
    return result
