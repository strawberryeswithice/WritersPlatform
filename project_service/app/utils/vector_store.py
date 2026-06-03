from __future__ import annotations

import json
import logging
from typing import List, Optional, Tuple

try:
    from qdrant_client import QdrantClient, models as qmodels
    _QDRANT_AVAILABLE = True
except ImportError:
    logger.warning("[qdrant] qdrant-client not installed — vector search disabled. Run: pip install qdrant-client==1.9.1")
    _QDRANT_AVAILABLE = False
    QdrantClient = None
    qmodels = None

from sqlalchemy.orm import Session

from project_service.app.core.config import settings
from project_service.app.db.models import TextChunk, CharacterChunk
from project_service.app.utils.embeddings import (
    get_embedding,
    split_text_to_chunks,
    build_character_appearance_text,
)

logger = logging.getLogger(__name__)

COLL_TEXT = "writers_text_chunks"
COLL_CHAR = "writers_char_chunks"
VECTOR_DIM = 256

_client: Optional[QdrantClient] = None


def _get_client():
    global _client
    if not _QDRANT_AVAILABLE:
        raise RuntimeError("qdrant-client not installed")
    if _client is None:
        _client = QdrantClient(
            host=settings.QDRANT_HOST,
            port=settings.QDRANT_PORT,
            timeout=10,
        )
    return _client


def _ensure_collections() -> None:
    client = _get_client()
    existing = {c.name for c in client.get_collections().collections}

    for name in (COLL_TEXT, COLL_CHAR):
        if name not in existing:
            client.create_collection(
                collection_name=name,
                vectors_config=qmodels.VectorParams(
                    size=VECTOR_DIM,
                    distance=qmodels.Distance.COSINE,
                ),
            )
            client.create_payload_index(
                collection_name=name,
                field_name="project_id",
                field_schema=qmodels.PayloadSchemaType.INTEGER,
            )
            logger.info("[qdrant] created collection %s", name)

if _QDRANT_AVAILABLE:
    try:
        _ensure_collections()
    except Exception as exc:
        logger.warning("[qdrant] could not ensure collections on startup: %s", exc)

async def index_chapter(chapter_id: int, project_id: int, text: str, db: Session) -> None:
    import re
    plain = re.sub(r"<[^>]+>", "", text)

    old_rows = db.query(TextChunk).filter(TextChunk.chapter_id == chapter_id).all()
    old_ids  = [r.id for r in old_rows]
    db.query(TextChunk).filter(TextChunk.chapter_id == chapter_id).delete()

    if not plain.strip():
        db.commit()
        _qdrant_delete_by_ids(COLL_TEXT, old_ids)
        return

    try:
        _get_client().delete(
            collection_name=COLL_TEXT,
            points_selector=qmodels.FilterSelector(
                filter=qmodels.Filter(
                    must=[qmodels.FieldCondition(
                        key="chapter_id",
                        match=qmodels.MatchValue(value=chapter_id),
                    )]
                )
            ),
        )
    except Exception as exc:
        logger.warning("[qdrant] delete chapter chunks failed: %s", exc)

    chunks = split_text_to_chunks(plain)
    points: List[qmodels.PointStruct] = []

    for i, chunk in enumerate(chunks):
        embedding = await get_embedding(chunk, is_query=False)
        if embedding is None:
            continue

        row = TextChunk(
            chapter_id  = chapter_id,
            project_id  = project_id,
            chunk_index = i,
            text        = chunk[:4000],
            embedding   = json.dumps(embedding),
        )
        db.add(row)
        db.flush()

        points.append(qmodels.PointStruct(
            id      = row.id,
            vector  = embedding,
            payload = {
                "chapter_id": chapter_id,
                "project_id": project_id,
                "text":       chunk[:2000],
            },
        ))

    db.commit()

    if points:
        try:
            _ensure_collections()
            _get_client().upsert(collection_name=COLL_TEXT, points=points)
        except Exception as exc:
            logger.warning("[qdrant] upsert text chunks failed: %s", exc)

async def index_character(character_id: int, project_id: int,
                          char_data: dict, db: Session) -> None:
    old_rows = db.query(CharacterChunk).filter(CharacterChunk.character_id == character_id).all()
    old_ids  = [r.id for r in old_rows]
    db.query(CharacterChunk).filter(CharacterChunk.character_id == character_id).delete()
    try:
        _get_client().delete(
            collection_name=COLL_CHAR,
            points_selector=qmodels.FilterSelector(
                filter=qmodels.Filter(
                    must=[qmodels.FieldCondition(
                        key="character_id",
                        match=qmodels.MatchValue(value=character_id),
                    )]
                )
            ),
        )
    except Exception as exc:
        logger.warning("[qdrant] delete char chunks failed: %s", exc)

    text = build_character_appearance_text(char_data)
    if not text.strip():
        db.commit()
        return

    embedding = await get_embedding(text, is_query=False)
    if embedding is None:
        db.commit()
        return

    row = CharacterChunk(
        character_id    = character_id,
        project_id      = project_id,
        appearance_text = text[:2000],
        embedding       = json.dumps(embedding),
    )
    db.add(row)
    db.flush()
    db.commit()

    try:
        _ensure_collections()
        _get_client().upsert(
            collection_name=COLL_CHAR,
            points=[qmodels.PointStruct(
                id      = row.id,
                vector  = embedding,
                payload = {
                    "character_id": character_id,
                    "project_id":   project_id,
                    "text":         text[:2000],
                },
            )],
        )
    except Exception as exc:
        logger.warning("[qdrant] upsert char chunk failed: %s", exc)

async def search_chunks(
        query: str,
        project_id: int,
        db: Session,
        top_k: int = 5,
) -> List[str]:
    q_emb = await get_embedding(query, is_query=True)
    if q_emb is None:
        return _pg_fallback_text(project_id, db, top_k)

    try:
        _ensure_collections()
        hits = _get_client().search(
            collection_name=COLL_TEXT,
            query_vector=q_emb,
            query_filter=qmodels.Filter(
                must=[qmodels.FieldCondition(
                    key="project_id",
                    match=qmodels.MatchValue(value=project_id),
                )]
            ),
            limit=top_k,
            with_payload=True,
        )
        return [h.payload.get("text", "") for h in hits if h.payload]
    except Exception as exc:
        logger.warning("[qdrant] search_chunks failed, falling back to PG: %s", exc)
        return _pg_fallback_text(project_id, db, top_k)


async def search_character_chunks(
        query: str,
        project_id: int,
        db: Session,
        top_k: int = 3,
) -> List[Tuple[int, str]]:
    q_emb = await get_embedding(query, is_query=True)
    if q_emb is None:
        return _pg_fallback_chars(project_id, db, top_k)

    try:
        _ensure_collections()
        hits = _get_client().search(
            collection_name=COLL_CHAR,
            query_vector=q_emb,
            query_filter=qmodels.Filter(
                must=[qmodels.FieldCondition(
                    key="project_id",
                    match=qmodels.MatchValue(value=project_id),
                )]
            ),
            limit=top_k,
            with_payload=True,
        )
        return [
            (h.payload["character_id"], h.payload.get("text", ""))
            for h in hits
            if h.payload and "character_id" in h.payload
        ]
    except Exception as exc:
        logger.warning("[qdrant] search_char_chunks failed, falling back to PG: %s", exc)
        return _pg_fallback_chars(project_id, db, top_k)


def get_all_character_appearances(project_id: int, db: Session) -> List[str]:
    rows = db.query(CharacterChunk).filter(CharacterChunk.project_id == project_id).all()
    return [r.appearance_text for r in rows if r.appearance_text]

def _qdrant_delete_by_ids(collection: str, ids: List[int]) -> None:
    if not ids:
        return
    try:
        _get_client().delete(
            collection_name=collection,
            points_selector=qmodels.PointIdsList(points=ids),
        )
    except Exception as exc:
        logger.warning("[qdrant] delete by ids failed: %s", exc)


def _pg_fallback_text(project_id: int, db: Session, top_k: int) -> List[str]:
    rows = (
        db.query(TextChunk)
        .filter(TextChunk.project_id == project_id)
        .limit(top_k)
        .all()
    )
    return [r.text for r in rows]


def _pg_fallback_chars(project_id: int, db: Session, top_k: int) -> List[Tuple[int, str]]:
    rows = (
        db.query(CharacterChunk)
        .filter(CharacterChunk.project_id == project_id)
        .limit(top_k)
        .all()
    )
    return [(r.character_id, r.appearance_text) for r in rows]
