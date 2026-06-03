from __future__ import annotations
import asyncio
import json
import logging
import os
import re
import httpx
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from project_service.app.db.database import SessionLocal
from project_service.app.db.models import (
    Character, CharacterCustomLabel, CharacterRelationship,
    GraphLayout, Project, RelationshipType,
)

logger = logging.getLogger(__name__)

PAGE_SIZE       = 4000
MAX_CHARS_STATE = 3000
YANDEX_API_KEY  = os.getenv("YANDEX_API_KEY", "")
YANDEX_FOLDER_ID = os.getenv("YANDEX_FOLDER_ID", "")
YANDEX_MODEL_URI = f"gpt://{YANDEX_FOLDER_ID}/yandexgpt/latest"
_cancel_flags: Dict[int, asyncio.Event] = {}

def request_cancel(project_id: int) -> None:
    flag = _cancel_flags.get(project_id)
    if flag:
        flag.set()

def _is_cancelled(project_id: int) -> bool:
    flag = _cancel_flags.get(project_id)
    return bool(flag and flag.is_set())
async def generate_from_chapters(
        project_id: int,
        chapters_text: List[Dict[str, str]],
        generate_images: bool = True,
) -> None:
    flag = asyncio.Event()
    _cancel_flags[project_id] = flag
    try:
        full_text = _build_full_text(chapters_text)
        pages     = _split_pages(full_text)
        logger.info("[import] project=%d  pages=%d  total_chars=%d",
                    project_id, len(pages), len(full_text))

        running_state: Dict[str, Any] = {"characters": [], "relationships": []}

        for i, page in enumerate(pages):
            if _is_cancelled(project_id):
                logger.info("[import] project=%d cancelled at page %d", project_id, i)
                return
            running_state = await _extract_page(page, running_state, project_id)
            logger.info("[import] project=%d  page %d/%d  chars=%d  rels=%d",
                        project_id, i + 1, len(pages),
                        len(running_state["characters"]),
                        len(running_state["relationships"]))

        if _is_cancelled(project_id):
            return

        char_map = await _save_characters(
            project_id, running_state["characters"], generate_images
        )
        if _is_cancelled(project_id):
            return

        await _save_relationships(project_id, running_state["relationships"], char_map)
        _save_graph_layout(project_id, char_map)

        logger.info("[import] project=%d  DONE  chars_saved=%d", project_id, len(char_map))

    except Exception as exc:
        logger.exception("[import] project=%d  FAILED: %s", project_id, exc)
    finally:
        _cancel_flags.pop(project_id, None)

def _build_full_text(chapters: List[Dict[str, str]]) -> str:
    parts: List[str] = []
    for ch in chapters:
        title = ch.get("title", "Глава")
        text  = ch.get("text", "")
        parts.append(f"=== {title} ===\n{text}")
    return "\n\n".join(parts)

def _split_pages(text: str) -> List[str]:
    paras   = re.split(r"\n{2,}", text)
    pages:   List[str] = []
    current: List[str] = []
    size    = 0
    for para in paras:
        if size + len(para) > PAGE_SIZE and current:
            pages.append("\n\n".join(current))
            current = [para]
            size    = len(para)
        else:
            current.append(para)
            size += len(para)

    if current:
        pages.append("\n\n".join(current))
    return pages or [""]

_SYSTEM_PROMPT = """
Ты — литературный аналитик. Тебе приходят страницы текста порциями.
Твоя задача — накапливать информацию о персонажах и их отношениях.
Уже известные персонажи передаются в поле "known_state".
Правила:
Добавляй нового персонажа только если его ещё нет в known_state.
Если нашёл новые детали о уже известном персонаже — обнови его поля.
Связи ("relationships") описывай только когда уверен: ["Имя1", "Имя2", "тип"].
Типы связей: женаты, пара, друзья, враги, знакомые, нейтральные.
Поля персонажа: name, role (протагонист/антагонист/ментор/второстепенный),
gender (мужской/женский/другое), age (число или null), features (внешность),
personality (характер), short_desc (≤40 символов).
Верни ТОЛЬКО JSON, без лишних слов:
{
 "characters": [{  "name": "... ",  "role": "... ",  "gender": "... ",  "age":null,
 "features": "... ",  "personality": "... ",  "short_desc": "... " }],
 "relationships": [[ "Имя1 ", "Имя2 ", "тип "]]
}
"""

async def _extract_page(
        page: str,
        running_state: Dict[str, Any],
        project_id: int,
) -> Dict[str, Any]:
    state_json = json.dumps(running_state, ensure_ascii=False)
    if len(state_json) > MAX_CHARS_STATE:
        slim = {
            "characters": [
                {"name": c["name"], "role": c.get("role"), "short_desc": c.get("short_desc")}
                for c in running_state["characters"]
            ],
            "relationships": running_state["relationships"],
        }
        state_json = json.dumps(slim, ensure_ascii=False)

    user_msg = (
        f"KNOWN_STATE:\n{state_json}\n\n"
        f"NEW_PAGE:\n{page}"
    )

    payload = {
        "modelUri": YANDEX_MODEL_URI,
        "completionOptions": {
            "stream": False,
            "temperature": 0.1,
            "maxTokens": 2000,
        },
        "messages": [
            {"role": "system", "text": _SYSTEM_PROMPT},
            {"role": "user", "text": user_msg},
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.post(
                "https://llm.api.cloud.yandex.net/foundationModels/v1/completion",
                headers={
                    "Authorization": f"Api-Key {YANDEX_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        resp.raise_for_status()
        data = resp.json()
        raw = data["result"]["alternatives"][0]["message"]["text"]

        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw).strip()
        parsed = json.loads(raw)
        return _merge_states(running_state, parsed)
    except Exception as exc:
        logger.warning("[import] page extract failed: %s", exc)
        return running_state

def _merge_states(
        old: Dict[str, Any],
        new: Dict[str, Any],
) -> Dict[str, Any]:
    char_map: Dict[str, Dict] = {c["name"]: c for c in old.get("characters", [])}
    for nc in new.get("characters", []):
        name = nc.get("name", "").strip()
        if not name:
            continue
        if name in char_map:
            existing = char_map[name]
            for k, v in nc.items():
                if v and not existing.get(k):
                    existing[k] = v
        else:
            char_map[name] = nc

    rel_set: set = set()
    rels: List = list(old.get("relationships", []))
    for rel in rels:
        key = tuple(sorted(rel[:2]) + [rel[2]])
        rel_set.add(key)

    for rel in new.get("relationships", []):
        if len(rel) < 3:
            continue
        key = tuple(sorted(rel[:2]) + [rel[2]])
        if key not in rel_set:
            rel_set.add(key)
            rels.append(rel)

    return {"characters": list(char_map.values()), "relationships": rels}

_ROLE_MAP = {
    "протагонист":    "PROTAGONIST",
    "антагонист":     "ANTAGONIST",
    "ментор":         "MENTOR",
    "второстепенный": "SECONDARY",
}
_GENDER_MAP = {
    "мужской":  "MALE",
    "женский":  "FEMALE",
    "другое":   "OTHER",
}
_REL_VALID = {r.value for r in RelationshipType}

async def _save_characters(
        project_id: int,
        characters: List[Dict],
        generate_images: bool,
) -> Dict[str, int]:
    char_map: Dict[str, int] = {}
    db: Session = SessionLocal()
    try:
        existing_names = {
            c.name
            for c in db.query(Character).filter(Character.project_id == project_id).all()
        }

        for order, cd in enumerate(characters):
            if _is_cancelled(project_id):
                break

            name = (cd.get("name") or "").strip()
            if not name or name in existing_names:
                ex = db.query(Character).filter(
                    Character.project_id == project_id,
                    Character.name == name,
                    ).first()
                if ex:
                    char_map[name] = ex.id
                continue

            role   = _ROLE_MAP.get((cd.get("role") or "").lower())
            gender = _GENDER_MAP.get((cd.get("gender") or "").lower())
            age_v  = cd.get("age")
            age    = int(age_v) if isinstance(age_v, (int, float)) and age_v else None

            char = Character(
                project_id  = project_id,
                name        = name,
                short_desc  = (cd.get("short_desc") or "")[:50] or None,
                role        = role,
                gender      = gender,
                age         = age,
                features    = cd.get("features") or None,
                personality = cd.get("personality") or None,
                order       = order,
            )
            db.add(char)
            db.flush()
            existing_names.add(name)
            char_map[name] = char.id

        db.commit()
    finally:
        db.close()

    if generate_images and not _is_cancelled(project_id):
        tasks = [
            _gen_and_save_image(project_id, char_id, cd)
            for cd, char_id in zip(characters, [char_map.get(cd.get("name", "")) for cd in characters])
            if char_id
        ]
        await asyncio.gather(*tasks, return_exceptions=True)

    return char_map

async def _gen_and_save_image(project_id: int, char_id: int, cd: Dict) -> None:
    if _is_cancelled(project_id):
        return
    try:
        from project_service.app.utils.embeddings import build_image_prompt, generate_character_images
        prompt = build_image_prompt(cd)
        images = await generate_character_images(prompt, count=1)
        if not images:
            return

        from project_service.app.utils.minio_client import minio_client
        b64_url = images[0]
        thumb_path, full_path = minio_client.upload_photo_pair(b64_url, None)
        if not thumb_path:
            return

        db: Session = SessionLocal()
        try:
            char = db.query(Character).filter(Character.id == char_id).first()
            if char:
                char.photo      = thumb_path
                char.photo_full = full_path or thumb_path
                db.commit()
        finally:
            db.close()
    except Exception as exc:
        logger.warning("[import] image gen failed for char %d: %s", char_id, exc)

async def _save_relationships(
        project_id: int,
        relationships: List,
        char_map: Dict[str, int],
) -> None:
    db: Session = SessionLocal()
    try:
        db.query(CharacterRelationship).filter(
            CharacterRelationship.project_id == project_id
        ).delete()

        for rel in relationships:
            if len(rel) < 3:
                continue
            n1, n2, rtype = rel[0], rel[1], rel[2]
            c1  = char_map.get(n1)
            c2  = char_map.get(n2)
            if not c1 or not c2 or c1 == c2:
                continue
            if rtype not in _REL_VALID:
                rtype = "нейтральные"
            c1s, c2s = sorted([c1, c2])
            db.add(CharacterRelationship(
                project_id    = project_id,
                char1_id      = c1s,
                char2_id      = c2s,
                relation_type = RelationshipType(rtype),
            ))

        db.commit()
    finally:
        db.close()

def _save_graph_layout(project_id: int, char_map: Dict[str, int]) -> None:
    import math
    ids = list(char_map.values())
    n   = len(ids)
    if not n:
        return
    cx, cy, r = 500, 350, min(250, max(120, n * 35))
    nodes: Dict[str, Dict] = {}
    for i, cid in enumerate(ids):
        angle = 2 * math.pi * i / n
        nodes[str(cid)] = {
            "x": round(cx + r * math.cos(angle)),
            "y": round(cy + r * math.sin(angle)),
        }

    db: Session = SessionLocal()
    try:
        layout = db.query(GraphLayout).filter(GraphLayout.project_id == project_id).first()
        if layout:
            layout.nodes = nodes
        else:
            db.add(GraphLayout(project_id=project_id, nodes=nodes))
        db.commit()
    finally:
        db.close()