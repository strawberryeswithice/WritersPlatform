from __future__ import annotations

import asyncio
import logging
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from project_service.app.db.database import get_db, SessionLocal
from project_service.app.db.models import Chapter, Project
from project_service.app.utils.auth import get_current_user_id
from project_service.app.utils.docx_importer import generate_from_chapters, request_cancel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["import"])

class ChapterImport(BaseModel):
    title: str
    text:  str


class ImportChaptersRequest(BaseModel):
    chapters:             List[ChapterImport]
    generate_characters:  bool = False

def _get_project_owned(project_id: int, user_id: int, db: Session) -> Project:
    p = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == user_id,
        Project.user_deleted_at.is_(None),
        ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Проект не найден")
    return p

@router.post("/{project_id}/import-chapters", status_code=202)
async def import_chapters(
        project_id:         int,
        body:               ImportChaptersRequest,
        background_tasks:   BackgroundTasks,
        current_user_id:    int     = Depends(get_current_user_id),
        db:                 Session = Depends(get_db),
):
    project = _get_project_owned(project_id, current_user_id, db)

    if not body.chapters:
        raise HTTPException(status_code=400, detail="Нет глав для импорта")

    from sqlalchemy import func as sqlfunc
    max_order = db.query(sqlfunc.max(Chapter.order)).filter(
        Chapter.project_id == project_id
    ).scalar() or 0

    saved_chapters: List[ChapterImport] = []

    def _text_to_html(text: str) -> str:
        if not text:
            return "<p><br></p>"
        if '<p>' in text or '<div>' in text or '<h' in text:
            return text
        lines = text.split('\n')
        parts = []
        for line in lines:
            stripped = line.strip()
            if stripped:
                parts.append(f'<p>{stripped}</p>')
            else:
                parts.append('<p><br></p>')
        return ''.join(parts) if parts else '<p><br></p>'
    for i, ch in enumerate(body.chapters):
        title = ch.title.strip() or f"Глава {i + 1}"
        text  = ch.text or ""

        html_content = _text_to_html(text)
        chapter = Chapter(
            project_id  = project_id,
            title       = title[:300],
            content     = html_content,
            char_count  = len(text.replace(' ', '').replace('\n', '')),
            order       = max_order + i + 1,
        )
        db.add(chapter)
        saved_chapters.append(ch)

    project.chapter_count = (
            db.query(Chapter).filter(
                Chapter.project_id == project_id,
                Chapter.user_deleted_at.is_(None),
                ).count() + len(body.chapters)
    )
    db.commit()

    try:
        from project_service.app.api.routes.project import _sync_chapter_count
        import os, httpx
        token = "sync-internal"
    except Exception:
        pass

    if body.generate_characters:
        chapters_data = [{"title": ch.title, "text": ch.text} for ch in saved_chapters]

        project.is_generating = True
        db.commit()

        async def _bg():
            try:
                await generate_from_chapters(
                    project_id    = project_id,
                    chapters_text = chapters_data,
                    generate_images = True,
                )
            finally:
                _db = SessionLocal()
                try:
                    _p = _db.query(Project).filter(Project.id == project_id).first()
                    if _p:
                        _p.is_generating = False
                        _db.commit()
                except Exception:
                    pass
                finally:
                    _db.close()

        background_tasks.add_task(_bg)
        logger.info("[import] project=%d  started background generation", project_id)

    return {
        "ok":             True,
        "chapters_added": len(body.chapters),
        "generation":     body.generate_characters,
    }


@router.delete("/{project_id}/import-cancel", status_code=200)
async def cancel_generation(
        project_id:      int,
        current_user_id: int     = Depends(get_current_user_id),
        db:              Session = Depends(get_db),
):
    _get_project_owned(project_id, current_user_id, db)
    request_cancel(project_id)
    logger.info("[import] project=%d  cancel requested by user %d", project_id, current_user_id)
    return {"ok": True, "message": "Генерация отменена"}
