from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import httpx

from project_service.app.db.database import get_db
from project_service.app.db.models import Project, Chapter, Character, CharacterCustomLabel
from project_service.app.schemas.project_schema import (
    ProjectUpdate, ProjectResponse,
    ChapterCreate, ChapterUpdate, ChapterResponse,
    CharacterCreate, CharacterUpdate, CharacterResponse,
)
from project_service.app.utils.auth import get_current_user_id, bearer_scheme

router = APIRouter(prefix="/api/projects", tags=["projects"])

from project_service.app.core.config import settings
CATALOG_URL = settings.CATALOG_URL

async def _sync_chapter_count(project_id: int, db: Session, token: str):
    count = db.query(Chapter).filter(Chapter.project_id == project_id).count()
    try:
        async with httpx.AsyncClient() as client:
            await client.patch(
                f"{CATALOG_URL}/api/catalog/projects/{project_id}",
                json={"chapter_count": count},
                headers={"Authorization": f"Bearer {token}"},
                timeout=3.0
            )
    except Exception:
        pass

def _get_project(project_id: int, user_id: int, db: Session) -> Project:
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == user_id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Проект не найден")
    return project


def _get_chapter(chapter_id: int, project: Project, db: Session) -> Chapter:
    chapter = db.query(Chapter).filter(
        Chapter.id == chapter_id,
        Chapter.project_id == project.id
    ).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Глава не найдена")
    return chapter


def _get_character(character_id: int, project: Project, db: Session) -> Character:
    char = db.query(Character).filter(
        Character.id == character_id,
        Character.project_id == project.id
    ).first()
    if not char:
        raise HTTPException(status_code=404, detail="Персонаж не найден")
    return char


def _sync_custom_labels(character: Character, labels_in, db: Session):
    db.query(CharacterCustomLabel).filter(
        CharacterCustomLabel.character_id == character.id
    ).delete()
    for lb in labels_in:
        if lb.key or lb.value:
            db.add(CharacterCustomLabel(
                character_id=character.id,
                key=lb.key,
                value=lb.value or ''
            ))

@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
        project_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    return _get_project(project_id, current_user_id, db)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
        project_id: int,
        data: ProjectUpdate,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    project = _get_project(project_id, current_user_id, db)

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(project, field, value)

    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=204)
async def delete_project(
        project_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    project = _get_project(project_id, current_user_id, db)
    db.delete(project)
    db.commit()

@router.post("/{project_id}/chapters", response_model=ChapterResponse, status_code=201)
async def add_chapter(
        project_id: int,
        data: ChapterCreate,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db),
        credentials=Depends(bearer_scheme)
):
    project = _get_project(project_id, current_user_id, db)
    if data.order == 0:
        max_order = db.query(Chapter).filter(
            Chapter.project_id == project.id
        ).count()
        order = max_order
    else:
        order = data.order

    chapter = Chapter(
        project_id=project.id,
        title=data.title,
        char_count=0,
        order=order
    )
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    await _sync_chapter_count(project_id, db, credentials.credentials)
    return chapter


@router.patch("/{project_id}/chapters/{chapter_id}", response_model=ChapterResponse)
async def update_chapter(
        project_id: int,
        chapter_id: int,
        data: ChapterUpdate,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    project = _get_project(project_id, current_user_id, db)
    chapter = _get_chapter(chapter_id, project, db)

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(chapter, field, value)

    db.commit()
    db.refresh(chapter)
    return chapter


@router.delete("/{project_id}/chapters/{chapter_id}", status_code=204)
async def delete_chapter(
        project_id: int,
        chapter_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db),
        credentials=Depends(bearer_scheme)
):
    project = _get_project(project_id, current_user_id, db)
    chapter = _get_chapter(chapter_id, project, db)
    db.delete(chapter)
    db.commit()
    await _sync_chapter_count(project_id, db, credentials.credentials)

@router.get("/{project_id}/characters/{character_id}", response_model=CharacterResponse)
async def get_character(
        project_id: int,
        character_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    project = _get_project(project_id, current_user_id, db)
    return _get_character(character_id, project, db)


@router.post("/{project_id}/characters", response_model=CharacterResponse, status_code=201)
async def add_character(
        project_id: int,
        data: CharacterCreate,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    project = _get_project(project_id, current_user_id, db)

    if data.order == 0:
        order = db.query(Character).filter(Character.project_id == project.id).count()
    else:
        order = data.order

    custom_labels_in = data.custom_labels
    char_data = data.model_dump(exclude={'custom_labels'})
    char_data['order'] = order

    character = Character(**char_data, project_id=project.id)
    db.add(character)
    db.flush()

    _sync_custom_labels(character, custom_labels_in, db)

    db.commit()
    db.refresh(character)
    return character


@router.patch("/{project_id}/characters/{character_id}", response_model=CharacterResponse)
async def update_character(
        project_id: int,
        character_id: int,
        data: CharacterUpdate,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    project = _get_project(project_id, current_user_id, db)
    character = _get_character(character_id, project, db)

    update_data = data.model_dump(exclude_unset=True)
    custom_labels_in = update_data.pop('custom_labels', None)

    for field, value in update_data.items():
        setattr(character, field, value)

    if custom_labels_in is not None:
        _sync_custom_labels(character, custom_labels_in, db)

    db.commit()
    db.refresh(character)
    return character


@router.delete("/{project_id}/characters/{character_id}", status_code=204)
async def delete_character(
        project_id: int,
        character_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    project = _get_project(project_id, current_user_id, db)
    character = _get_character(character_id, project, db)
    db.delete(character)
    db.commit()