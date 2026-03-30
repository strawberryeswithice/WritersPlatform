import uuid
from fastapi import APIRouter, Depends, status, File, UploadFile, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
import httpx
import base64

from project_service.app.db.database import get_db
from project_service.app.db.models import Project, Chapter, Character, CharacterCustomLabel
from project_service.app.schemas.project_schema import (
    ProjectUpdate, ProjectResponse,
    ChapterCreate, ChapterUpdate, ChapterResponse,
    CharacterCreate, CharacterUpdate, CharacterResponse,
)
from project_service.app.utils.auth import get_current_user_id, bearer_scheme
from project_service.app.utils.minio_client import minio_client

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

def _enrich_character_with_photo_url(character: Character):
    character_dict = {
        "id": character.id,
        "project_id": character.project_id,
        "name": character.name,
        "short_desc": character.short_desc,
        "role": character.role,
        "gender": character.gender,
        "gender_other": character.gender_other,
        "birthdate": character.birthdate,
        "age": character.age,
        "char_status": character.char_status,
        "location": character.location,
        "features": character.features,
        "personality": character.personality,
        "desc_full": character.desc_full,
        "photo": character.photo,
        "photo_url": minio_client.get_photo_url(character.photo) if character.photo else None,
        "order": character.order,
        "created_at": character.created_at,
        "updated_at": character.updated_at,
        "custom_labels": [{"id": lb.id, "key": lb.key, "value": lb.value} for lb in character.custom_labels]
    }
    return character_dict

@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
        project_id: int,
        current_user_id: int = Depends(get_current_user_id),
        db: Session = Depends(get_db)
):
    project = _get_project(project_id, current_user_id, db)
    return project

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

    for character in project.characters:
        if character.photo:
            minio_client.delete_photo(character.photo)

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
    character = _get_character(character_id, project, db)
    return character

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

    if char_data.get('photo') and char_data['photo'].startswith('data:image'):
        object_name = minio_client.upload_photo(char_data['photo'])
        if object_name:
            char_data['photo'] = object_name

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

    if 'photo' in update_data and update_data['photo']:
        if update_data['photo'].startswith('data:image'):
            if character.photo:
                minio_client.delete_photo(character.photo)
            object_name = minio_client.upload_photo(update_data['photo'])
            if object_name:
                update_data['photo'] = object_name
        elif update_data['photo'] is None or update_data['photo'] == '':
            if character.photo:
                minio_client.delete_photo(character.photo)
            update_data['photo'] = None

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

    if character.photo:
        minio_client.delete_photo(character.photo)

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

    contents = await file.read()
    base64_data = base64.b64encode(contents).decode('utf-8')

    ext = file.filename.split('.')[-1].lower() if file.filename else 'jpg'
    mime_type = file.content_type

    data_url = f"data:{mime_type};base64,{base64_data}"
    object_name = minio_client.upload_photo(data_url, f"{character.id}_{uuid.uuid4().hex}.{ext}")

    if not object_name:
        raise HTTPException(status_code=500, detail="Ошибка при загрузке фото")

    if character.photo:
        minio_client.delete_photo(character.photo)

    character.photo = object_name
    db.commit()
    db.refresh(character)

    photo_url = minio_client.get_photo_url(object_name)

    return {"photo_url": photo_url, "photo_path": object_name}

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