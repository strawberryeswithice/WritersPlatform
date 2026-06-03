from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import Optional, List
from jose import JWTError, jwt

from project_service.app.db.database import get_db
from project_service.app.db.models import (
    Project, Chapter, Character, CharacterRelationship, GraphLayout
)
from project_service.app.schemas.project_schema import (
    AdminGraphLayoutResponse,
    ProjectResponse, ChapterResponse, CharacterResponse,
    RelationshipOut, GraphLayoutResponse,
)
from project_service.app.core.config import settings

router = APIRouter(prefix="/api/admin/projects", tags=["admin-projects"])
bearer_scheme = HTTPBearer()


def _require_admin(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> tuple:
    try:
        payload = jwt.decode(credentials.credentials, settings.JWT_SECRET_KEY,
                             algorithms=[settings.ALGORITHM])
        role = payload.get("role", "user")
        if role not in ("admin", "superadmin"):
            raise HTTPException(status_code=403, detail="Доступ запрещён")
        return int(payload.get("sub")), role
    except JWTError:
        raise HTTPException(status_code=401, detail="Невалидный токен")


def _require_superadmin(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> tuple:
    try:
        payload = jwt.decode(credentials.credentials, settings.JWT_SECRET_KEY,
                             algorithms=[settings.ALGORITHM])
        role = payload.get("role", "user")
        if role != "superadmin":
            raise HTTPException(status_code=403, detail="Только для суперадмина")
        return int(payload.get("sub")), role
    except JWTError:
        raise HTTPException(status_code=401, detail="Невалидный токен")


@router.get("/{project_id}/characters", response_model=List[CharacterResponse])
async def admin_get_characters(
    project_id: int,
    admin_info: tuple = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Проект не найден")
    return project.characters


@router.get("/{project_id}/graph", response_model=AdminGraphLayoutResponse)
async def admin_get_graph(
    project_id: int,
    admin_info: tuple = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Проект не найден")

    relationships = db.query(CharacterRelationship).filter(
        CharacterRelationship.project_id == project_id
    ).all()
    layout = db.query(GraphLayout).filter(GraphLayout.project_id == project_id).first()

    rel_out = [RelationshipOut(
        id=r.id, char1_id=r.char1_id, char2_id=r.char2_id,
        relation_type=r.relation_type, project_id=r.project_id
    ) for r in relationships]

    return AdminGraphLayoutResponse(
        project_id=project_id,
        nodes=layout.nodes if layout else {},
        relationships=rel_out,
    )


from project_service.app.utils.minio_client import minio_client


@router.get("/{project_id}/chapters", response_model=List[ChapterResponse])
async def admin_get_chapters(
    project_id: int,
    include_content: bool = Query(False),
    admin_info: tuple = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    _, role = admin_info
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Проект не найден")

    chapters = db.query(Chapter).filter(Chapter.project_id == project_id).order_by(Chapter.order).all()

    result = []
    for ch in chapters:
        data = ChapterResponse.model_validate(ch)
        if role == "superadmin" and include_content:
            if ch.content_url:
                try:
                    data.content = minio_client.get_chapter_text(ch.content_url) or ""
                except Exception:
                    data.content = ch.content or ""
            else:
                data.content = ch.content or ""
        else:
            data.content = None
            data.content_path = None
        result.append(data)
    return result
