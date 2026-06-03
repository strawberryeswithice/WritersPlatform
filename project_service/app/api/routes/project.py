import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from typing import List

from fastapi import APIRouter, Depends, status, File, UploadFile, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
import httpx
import base64

from project_service.app.db.database import get_db
from project_service.app.db.models import (
    Project, Chapter, Character, CharacterCustomLabel,
    CharacterRelationship, GraphLayout, RelationshipType,
)
from project_service.app.schemas.project_schema import (
    ProjectUpdate, ProjectResponse,
    ChapterCreate, ChapterUpdate, ChapterResponse,
    CharacterCreate, CharacterUpdate, CharacterResponse,
    RelationshipIn, RelationshipOut, RelationshipBatchSave,
    GraphLayoutSave, GraphLayoutResponse,
)
from project_service.app.utils.auth import get_current_user_id, get_current_user_id_readonly, bearer_scheme
from project_service.app.utils.minio_client import minio_client

router = APIRouter(prefix="/api/projects", tags=["projects"])

from project_service.app.core.config import settings
CATALOG_URL = settings.CATALOG_URL


async def _reindex_chapter(chapter_id: int, project_id: int, text: str) -> None:
    from project_service.app.db.database import SessionLocal
    from project_service.app.utils.vector_store import index_chapter
    db = SessionLocal()
    try:
        await index_chapter(chapter_id, project_id, text, db)
    except Exception as exc:
        print(f"[BG] chapter reindex error: {exc}")
    finally:
        db.close()


async def _reindex_character(character_id: int, project_id: int, char_data: dict) -> None:
    from project_service.app.db.database import SessionLocal
    from project_service.app.utils.vector_store import index_character
    db = SessionLocal()
    try:
        await index_character(character_id, project_id, char_data, db)
    except Exception as exc:
        print(f"[BG] character reindex error: {exc}")
    finally:
        db.close()


def _char_to_embed_dict(character: Character) -> dict:
    return {
        "name":        character.name,
        "gender":      character.gender.value if character.gender else None,
        "age":         character.age,
        "features":    character.features,
        "personality": character.personality,
        "desc_full":   character.desc_full,
        "short_desc":  character.short_desc,
    }


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


def _get_project(project_id: int, user_id: int, db: Session, include_deleted: bool = False) -> Project:
    q = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == user_id
    )
    if not include_deleted:
        q = q.filter(Project.user_deleted_at.is_(None))
    project = q.first()
    if not project:
        raise HTTPException(status_code=404, detail="Проект не найден")
    return project


def _get_chapter(chapter_id: int, project: Project, db: Session, include_deleted: bool = False) -> Chapter:
    q = db.query(Chapter).filter(
        Chapter.id == chapter_id,
        Chapter.project_id == project.id
    )
    if not include_deleted:
        q = q.filter(Chapter.user_deleted_at.is_(None))
    chapter = q.first()
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


def _enrich_character_with_photo_url(character: Character):
    return {
        "id":             character.id,
        "project_id":     character.project_id,
        "name":           character.name,
        "short_desc":     character.short_desc,
        "role":           character.role,
        "gender":         character.gender,
        "gender_other":   character.gender_other,
        "birthdate":      character.birthdate,
        "age":            character.age,
        "char_status":    character.char_status,
        "location":       character.location,
        "features":       character.features,
        "personality":    character.personality,
        "desc_full":      character.desc_full,
        "photo":          character.photo,
        "photo_full":     getattr(character, 'photo_full', None),
        "photo_url":      minio_client.get_photo_url(character.photo) if character.photo else None,
        "photo_full_url": minio_client.get_photo_url(getattr(character, 'photo_full', None))
        if getattr(character, 'photo_full', None) else None,
        "order":          character.order,
        "created_at":     character.created_at,
        "updated_at":     character.updated_at,
        "custom_labels":  [{"id": lb.id, "key": lb.key, "value": lb.value}
                           for lb in character.custom_labels],
    }


def _load_chapter_content(chapter: Chapter) -> str:
    if chapter.content_url:
        text = minio_client.get_chapter_text(chapter.content_url)
        return text if text is not None else ""
    return chapter.content or ""


def _save_chapter_content(chapter: Chapter, new_content: str, db: Session):
    if chapter.content_url:
        minio_client.delete_chapter_text(chapter.content_url)
    object_name = minio_client.upload_chapter_text(new_content, chapter.id)
    if object_name is None:
        raise HTTPException(status_code=500, detail="Ошибка при сохранении текста главы в хранилище")
    chapter.content_url = object_name
    chapter.content     = ""


def _chapter_to_response_dict(chapter: Chapter) -> dict:
    return {
        "id":         chapter.id,
        "project_id": chapter.project_id,
        "title":      chapter.title,
        "content":    _load_chapter_content(chapter),
        "char_count": chapter.char_count,
        "order":      chapter.order,
        "created_at": chapter.created_at,
        "updated_at": chapter.updated_at,
    }

@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
        project_id: int,
        current_user_id: int = Depends(get_current_user_id_readonly),
        db: Session = Depends(get_db)
):
    project = _get_project(project_id, current_user_id, db)
    return {
        "id":          project.id,
        "title":       project.title,
        "description": project.description,
        "genre":       project.genre,
        "status":      project.status,
        "parts":       project.parts,
        "owner_id":    project.owner_id,
        "created_at":  project.created_at,
        "updated_at":  project.updated_at,
        "chapters":    [_chapter_to_response_dict(ch) for ch in project.chapters if not ch.user_deleted_at],
        "characters":  [_enrich_character_with_photo_url(ch) for ch in project.characters],
    }


@router.get("/{project_id}/chapters_with_content")
async def get_chapters_with_content(
        project_id: int,
        current_user_id: int = Depends(get_current_user_id_readonly),
        db: Session = Depends(get_db)
):
    project = _get_project(project_id, current_user_id, db)
    chapters = [ch for ch in project.chapters if not ch.user_deleted_at]
    result = []
    for ch in chapters:
        content = _load_chapter_content(ch)
        result.append({
            "id": ch.id, "title": ch.title, "order": ch.order,
            "char_count": ch.char_count, "content": content or "",
        })
    return result


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
    return {
        "id":          project.id,
        "title":       project.title,
        "description": project.description,
        "genre":       project.genre,
        "status":      project.status,
        "parts":       project.parts,
        "owner_id":    project.owner_id,
        "created_at":  project.created_at,
        "updated_at":  project.updated_at,
        "chapters":    [_chapter_to_response_dict(ch) for ch in project.chapters if not ch.user_deleted_at],
        "characters":  [_enrich_character_with_photo_url(ch) for ch in project.characters],
    }


@router.delete("/{project_id}", status_code=204)
async def delete_project(
        project_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    project = _get_project(project_id, current_user_id, db)
    project.user_deleted_at = datetime.now(timezone.utc)
    db.commit()


@router.post("/{project_id}/restore", status_code=200)
async def restore_project(
        project_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    project = _get_project(project_id, current_user_id, db, include_deleted=True)
    project.user_deleted_at = None
    db.commit()
    return {"ok": True}


@router.delete("/{project_id}/purge", status_code=204)
async def purge_project(
        project_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    project = _get_project(project_id, current_user_id, db, include_deleted=True)
    for chapter in project.chapters:
        if chapter.content_url:
            minio_client.delete_chapter_text(chapter.content_url)
    for character in project.characters:
        if character.photo:
            minio_client.delete_photo(character.photo)
        if getattr(character, 'photo_full', None):
            minio_client.delete_photo(character.photo_full)
    db.delete(project)
    db.commit()


@router.get("/trash/items")
async def get_trash(
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    cutoff = datetime.now(timezone.utc) - timedelta(days=60)

    expired_projects = db.query(Project).filter(
        Project.owner_id == current_user_id,
        Project.user_deleted_at.isnot(None),
        Project.user_deleted_at < cutoff,
        ).all()
    for p in expired_projects:
        for ch in p.chapters:
            if ch.content_url:
                minio_client.delete_chapter_text(ch.content_url)
        for char in p.characters:
            if char.photo:
                minio_client.delete_photo(char.photo)
            if getattr(char, 'photo_full', None):
                minio_client.delete_photo(char.photo_full)
        db.delete(p)

    expired_chapters = db.query(Chapter).join(Project).filter(
        Project.owner_id == current_user_id,
        Project.user_deleted_at.is_(None),
        Chapter.user_deleted_at.isnot(None),
        Chapter.user_deleted_at < cutoff,
        ).all()
    for ch in expired_chapters:
        if ch.content_url:
            minio_client.delete_chapter_text(ch.content_url)
        db.delete(ch)
    db.commit()

    trash_projects = db.query(Project).filter(
        Project.owner_id == current_user_id,
        Project.user_deleted_at.isnot(None),
        ).order_by(Project.user_deleted_at.desc()).all()

    trash_chapters = db.query(Chapter).join(Project).filter(
        Project.owner_id == current_user_id,
        Project.user_deleted_at.is_(None),
        Chapter.user_deleted_at.isnot(None),
        ).order_by(Chapter.user_deleted_at.desc()).all()

    def expires_at(dt):
        if dt is None:
            return None
        return (dt + timedelta(days=60)).isoformat()

    return {
        "projects": [
            {
                "id": p.id, "title": p.title, "genre": p.genre,
                "status": p.status,
                "chapter_count": sum(1 for ch in p.chapters if not ch.user_deleted_at),
                "user_deleted_at": p.user_deleted_at.isoformat() if p.user_deleted_at else None,
                "expires_at": expires_at(p.user_deleted_at),
            }
            for p in trash_projects
        ],
        "chapters": [
            {
                "id": ch.id, "title": ch.title,
                "project_id": ch.project_id,
                "project_title": ch.project.title if ch.project else "—",
                "char_count": ch.char_count, "order": ch.order,
                "user_deleted_at": ch.user_deleted_at.isoformat() if ch.user_deleted_at else None,
                "expires_at": expires_at(ch.user_deleted_at),
            }
            for ch in trash_chapters
        ],
    }

@router.post("/{project_id}/chapters", response_model=ChapterResponse, status_code=201)
async def add_chapter(
        project_id: int,
        data: ChapterCreate,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db),
        credentials=Depends(bearer_scheme)
):
    project = _get_project(project_id, current_user_id, db)
    order = db.query(Chapter).filter(Chapter.project_id == project.id).count() if data.order == 0 else data.order

    chapter = Chapter(
        project_id=project.id,
        title=data.title,
        char_count=0,
        order=order,
        content="",
        content_url=None,
    )
    db.add(chapter)
    db.flush()

    if data.content:
        _save_chapter_content(chapter, data.content, db)

    db.commit()
    db.refresh(chapter)
    await _sync_chapter_count(project_id, db, credentials.credentials)

    if data.content:
        asyncio.create_task(_reindex_chapter(chapter.id, project.id, data.content))

    return _chapter_to_response_dict(chapter)


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

    update_data = data.model_dump(exclude_unset=True)
    new_content = update_data.pop("content", None)

    for field, value in update_data.items():
        setattr(chapter, field, value)

    if new_content is not None:
        _save_chapter_content(chapter, new_content, db)

    db.commit()
    db.refresh(chapter)

    if new_content is not None:
        asyncio.create_task(_reindex_chapter(chapter.id, project.id, new_content))

    return _chapter_to_response_dict(chapter)


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
    chapter.user_deleted_at = datetime.now(timezone.utc)
    db.commit()
    await _sync_chapter_count(project_id, db, credentials.credentials)


@router.post("/{project_id}/chapters/{chapter_id}/restore", status_code=200)
async def restore_chapter(
        project_id: int,
        chapter_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db),
        credentials=Depends(bearer_scheme)
):
    project = _get_project(project_id, current_user_id, db, include_deleted=True)
    chapter = _get_chapter(chapter_id, project, db, include_deleted=True)
    chapter.user_deleted_at = None
    db.commit()
    await _sync_chapter_count(project_id, db, credentials.credentials)
    return {"ok": True}


@router.delete("/{project_id}/chapters/{chapter_id}/purge", status_code=204)
async def purge_chapter(
        project_id: int,
        chapter_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db),
        credentials=Depends(bearer_scheme)
):
    project = _get_project(project_id, current_user_id, db, include_deleted=True)
    chapter = _get_chapter(chapter_id, project, db, include_deleted=True)
    if chapter.content_url:
        minio_client.delete_chapter_text(chapter.content_url)
    db.delete(chapter)
    db.commit()


@router.get("/{project_id}/chapters/{chapter_id}", response_model=ChapterResponse)
async def get_chapter(
        project_id: int,
        chapter_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    project = _get_project(project_id, current_user_id, db)
    chapter = _get_chapter(chapter_id, project, db)
    return _chapter_to_response_dict(chapter)


from pydantic import BaseModel as _PydanticBase
import re as _re


class _ChapterContentUpdate(_PydanticBase):
    content_html: str


@router.get("/{project_id}/chapters/{chapter_id}/content")
async def get_chapter_content(
        project_id: int,
        chapter_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    project = _get_project(project_id, current_user_id, db)
    chapter = _get_chapter(chapter_id, project, db)
    return {"content": _load_chapter_content(chapter)}


@router.put("/{project_id}/chapters/{chapter_id}/content")
async def update_chapter_content(
        project_id: int,
        chapter_id: int,
        data: _ChapterContentUpdate,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    project = _get_project(project_id, current_user_id, db)
    chapter = _get_chapter(chapter_id, project, db)

    _save_chapter_content(chapter, data.content_html, db)

    plain = _re.sub(r'<[^>]+>', '', data.content_html)
    chapter.char_count = len(plain.replace(' ', '').replace('\n', ''))

    db.commit()
    db.refresh(chapter)

    asyncio.create_task(_reindex_chapter(chapter.id, project.id, data.content_html))

    return {"ok": True, "char_count": chapter.char_count}

@router.get("/{project_id}/characters/{character_id}", response_model=CharacterResponse)
async def get_character(
        project_id: int,
        character_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    project = _get_project(project_id, current_user_id, db)
    character = _get_character(character_id, project, db)
    return _enrich_character_with_photo_url(character)


@router.post("/{project_id}/characters", response_model=CharacterResponse, status_code=201)
async def add_character(
        project_id: int,
        data: CharacterCreate,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    project = _get_project(project_id, current_user_id, db)

    order = db.query(Character).filter(Character.project_id == project.id).count() \
        if data.order == 0 else data.order

    custom_labels_in = data.custom_labels
    char_data = data.model_dump(exclude={'custom_labels'})
    char_data['order'] = order

    if char_data.get('photo') and char_data['photo'].startswith('data:image'):
        photo_full_data = char_data.pop('photo_full', None)
        if photo_full_data and photo_full_data.startswith('data:image'):
            thumb_path, full_path = minio_client.upload_photo_pair(char_data['photo'], photo_full_data)
        else:
            thumb_path, full_path = minio_client.upload_photo_pair(char_data['photo'], None)
        if thumb_path: char_data['photo'] = thumb_path
        if full_path:  char_data['photo_full'] = full_path
    else:
        char_data.pop('photo_full', None)

    character = Character(**char_data, project_id=project.id)
    db.add(character)
    db.flush()

    _sync_custom_labels(character, custom_labels_in, db)
    db.commit()
    db.refresh(character)

    asyncio.create_task(_reindex_character(character.id, project.id, _char_to_embed_dict(character)))

    return _enrich_character_with_photo_url(character)


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

    if 'photo' in update_data and update_data['photo']:
        if update_data['photo'].startswith('data:image'):
            if character.photo:
                minio_client.delete_photo(character.photo)
            if getattr(character, 'photo_full', None):
                minio_client.delete_photo(character.photo_full)
            full_data = update_data.pop('photo_full', None)
            thumb_path, full_path = minio_client.upload_photo_pair(update_data['photo'], full_data)
            if thumb_path: update_data['photo'] = thumb_path
            if full_path:  update_data['photo_full'] = full_path
            elif 'photo_full' not in update_data:
                update_data['photo_full'] = None
        elif update_data['photo'] is None or update_data['photo'] == '':
            if character.photo:
                minio_client.delete_photo(character.photo)
            if getattr(character, 'photo_full', None):
                minio_client.delete_photo(character.photo_full)
            update_data['photo'] = None
            update_data['photo_full'] = None
    elif 'photo_full' in update_data and update_data.get('photo_full', '').startswith('data:image'):
        if getattr(character, 'photo_full', None):
            minio_client.delete_photo(character.photo_full)
        _, full_path = minio_client.upload_photo_pair('', update_data['photo_full'])
        update_data['photo_full'] = full_path

    for field, value in update_data.items():
        setattr(character, field, value)

    if custom_labels_in is not None:
        _sync_custom_labels(character, custom_labels_in, db)

    db.commit()
    db.refresh(character)

    asyncio.create_task(_reindex_character(character.id, project.id, _char_to_embed_dict(character)))

    return _enrich_character_with_photo_url(character)


@router.delete("/{project_id}/characters/{character_id}", status_code=204)
async def delete_character(
        project_id: int,
        character_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    project = _get_project(project_id, current_user_id, db)
    character = _get_character(character_id, project, db)
    if character.photo:
        minio_client.delete_photo(character.photo)
    if getattr(character, 'photo_full', None):
        minio_client.delete_photo(character.photo_full)
    db.delete(character)
    db.commit()


@router.post("/{project_id}/characters/{character_id}/upload-photo")
async def upload_character_photo(
        project_id: int,
        character_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db),
        file: UploadFile = File(...)
):
    project = _get_project(project_id, current_user_id, db)
    character = _get_character(character_id, project, db)

    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Файл должен быть изображением")

    contents  = await file.read()
    base64_data = base64.b64encode(contents).decode('utf-8')
    ext       = file.filename.split('.')[-1].lower() if file.filename else 'jpg'
    data_url  = f"data:{file.content_type};base64,{base64_data}"

    object_name = minio_client.upload_photo(data_url, f"{character.id}_{uuid.uuid4().hex}.{ext}")
    if not object_name:
        raise HTTPException(status_code=500, detail="Ошибка при загрузке фото")

    if character.photo:
        minio_client.delete_photo(character.photo)

    character.photo = object_name
    db.commit()
    db.refresh(character)

    return {"photo_url": minio_client.get_photo_url(object_name), "photo_path": object_name}


@router.get("/{project_id}/characters/{character_id}/photo")
async def get_character_photo(
        project_id: int,
        character_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    project = _get_project(project_id, current_user_id, db)
    character = _get_character(character_id, project, db)
    if not character.photo:
        raise HTTPException(status_code=404, detail="Фото не найдено")
    photo_url = minio_client.get_photo_url(character.photo)
    if not photo_url:
        raise HTTPException(status_code=404, detail="Фото не найдено")
    return RedirectResponse(url=photo_url)

@router.get("/{project_id}/relationships", response_model=List[RelationshipOut])
async def get_relationships(
        project_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db),
):
    _get_project(project_id, current_user_id, db)
    rels = db.query(CharacterRelationship).filter(
        CharacterRelationship.project_id == project_id
    ).all()
    return [
        RelationshipOut(
            id=r.id,
            project_id=r.project_id,
            char1_id=r.char1_id,
            char2_id=r.char2_id,
            relation_type=r.relation_type,
        )
        for r in rels
    ]


@router.put("/{project_id}/relationships", response_model=List[RelationshipOut])
async def save_relationships(
        project_id: int,
        data: RelationshipBatchSave,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db),
):
    _get_project(project_id, current_user_id, db)

    db.query(CharacterRelationship).filter(
        CharacterRelationship.project_id == project_id
    ).delete()

    created = []
    for rel in data.relationships:
        try:
            rel_type = RelationshipType(rel.relation_type)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Неверный тип отношений: {rel.relation_type}"
            )

        c1, c2 = sorted([rel.char1_id, rel.char2_id])
        obj = CharacterRelationship(
            project_id=project_id,
            char1_id=c1,
            char2_id=c2,
            relation_type=rel_type,
        )
        db.add(obj)
        created.append(obj)

    db.commit()
    for obj in created:
        db.refresh(obj)

    return [
        RelationshipOut(
            id=obj.id,
            project_id=obj.project_id,
            char1_id=obj.char1_id,
            char2_id=obj.char2_id,
            relation_type=obj.relation_type,
        )
        for obj in created
    ]

@router.get("/{project_id}/graph-layout", response_model=GraphLayoutResponse)
async def get_graph_layout(
        project_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db),
):
    _get_project(project_id, current_user_id, db)
    layout = db.query(GraphLayout).filter(
        GraphLayout.project_id == project_id
    ).first()
    return GraphLayoutResponse(nodes=layout.nodes if layout else {})


@router.put("/{project_id}/graph-layout", response_model=GraphLayoutResponse)
async def save_graph_layout(
        project_id: int,
        data: GraphLayoutSave,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db),
):
    _get_project(project_id, current_user_id, db)

    layout = db.query(GraphLayout).filter(
        GraphLayout.project_id == project_id
    ).first()

    if layout:
        layout.nodes = data.nodes
    else:
        layout = GraphLayout(project_id=project_id, nodes=data.nodes)
        db.add(layout)

    db.commit()
    db.refresh(layout)

    return GraphLayoutResponse(nodes=layout.nodes)