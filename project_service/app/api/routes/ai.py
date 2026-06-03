from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from project_service.app.db.database import get_db
from project_service.app.db.models import Character
from project_service.app.utils.auth import get_current_user_id
from project_service.app.utils.agent import literary_agent

router = APIRouter(prefix="/api/ai", tags=["ai"])

class AiRequest(BaseModel):
    text:       str
    action:     str
    genre:      Optional[str] = None
    project_id: Optional[int] = None


class AiContinueRequest(BaseModel):
    text:              str
    current_paragraph: str
    genre:             Optional[str] = None
    project_id:        Optional[int] = None


class AiChatMessage(BaseModel):
    role: str
    text: str


class AiChatRequest(BaseModel):
    messages:     List[AiChatMessage]
    chapter_text: Optional[str] = None
    genre:        Optional[str] = None
    project_id:   Optional[int] = None
    chapter_id:   Optional[int] = None


class CharImageGenRequest(BaseModel):
    name:        Optional[str] = None
    features:    Optional[str] = None
    personality: Optional[str] = None
    desc_full:   Optional[str] = None
    gender:      Optional[str] = None
    age:         Optional[int] = None
    role:        Optional[str] = None
    short_desc:  Optional[str] = None


def fetch_db_characters(project_id: Optional[int], db: Session) -> List[Dict]:
    if not project_id:
        return []
    characters = (
        db.query(Character)
        .filter(Character.project_id == project_id)
        .order_by(Character.order)
        .all()
    )
    result = []
    for c in characters:
        char_dict: Dict = {"name": c.name}
        if c.role:        char_dict["role"]       = c.role.value
        if c.gender:      char_dict["gender"]     = c.gender_other if c.gender.value == "другое" else c.gender.value
        if c.age:         char_dict["age"]         = c.age
        if c.char_status: char_dict["status"]      = c.char_status.value
        if c.location:    char_dict["location"]    = c.location
        if c.short_desc:  char_dict["short_desc"]  = c.short_desc
        if c.features:    char_dict["features"]    = c.features
        if c.personality: char_dict["personality"] = c.personality
        if c.desc_full:   char_dict["desc_full"]   = c.desc_full
        result.append(char_dict)
    return result


def fetch_db_relationships(project_id: Optional[int], db: Session) -> List[Dict]:
    if not project_id:
        return []
    from project_service.app.db.models import CharacterRelationship, Character as CharModel
    rels = (
        db.query(CharacterRelationship)
        .filter(CharacterRelationship.project_id == project_id)
        .all()
    )
    chars = db.query(CharModel).filter(CharModel.project_id == project_id).all()
    id_to_name = {c.id: c.name for c in chars}
    result = []
    for r in rels:
        result.append({
            "char1": id_to_name.get(r.char1_id, f"Персонаж {r.char1_id}"),
            "char2": id_to_name.get(r.char2_id, f"Персонаж {r.char2_id}"),
            "relation": r.relation_type.value,
        })
    return result


async def _run_agent(initial_state: dict) -> dict:
    try:
        final_state = await literary_agent.ainvoke(initial_state)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=f"Ошибка соединения с AI: {exc}") from exc
    if final_state.get("result") is None:
        raise HTTPException(status_code=502, detail="AI-агент не вернул результат")
    return final_state


async def _rag_search(query: str, project_id: int, db: Session, top_k: int = 3) -> List[str]:
    try:
        from project_service.app.utils.vector_store import search_chunks
        return await search_chunks(query, project_id, db, top_k=top_k)
    except Exception as exc:
        print(f"[RAG] search error: {exc}")
        return []


def _build_consistency_notes(db_characters: List[Dict]) -> str:
    if not db_characters:
        return ""
    lines = []
    for c in db_characters:
        parts = [c["name"]]
        if c.get("features"):    parts.append(f"внешность: {c['features']}")
        if c.get("personality"): parts.append(f"характер: {c['personality']}")
        if c.get("desc_full"):   parts.append(c["desc_full"][:150])
        if len(parts) > 1:
            lines.append(" | ".join(parts))
    if not lines:
        return ""
    return (
            "Карточки для проверки:\n"
            + "\n".join(f"• {l}" for l in lines)
            + "\nЕсли в тексте есть противоречия — укажи явно."
    )

@router.post("/complete")
async def ai_complete(
        body: AiRequest,
        user: int = Depends(get_current_user_id),
        db:   Session = Depends(get_db),
):
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Текст не может быть пустым")
    if body.action not in ("introduce", "conclude", "improve"):
        raise HTTPException(status_code=400, detail=f"Неизвестное действие: {body.action}")

    db_chars = fetch_db_characters(body.project_id, db)
    db_rels  = fetch_db_relationships(body.project_id, db)
    state = await _run_agent({
        "action":                body.action,
        "text":                  text,
        "genre":                 body.genre,
        "project_id":            body.project_id,
        "db_characters":         db_chars,
        "db_relationships":      db_rels,
        "current_paragraph":     None,
        "chat_history":          None,
        "chapter_text":          None,
        "retrieved_chunks":      None,
        "character_consistency": _build_consistency_notes(db_chars),
    })
    return {"result": state["result"]}


@router.post("/analyze")
async def ai_analyze(
        body: AiRequest,
        user: int = Depends(get_current_user_id),
        db:   Session = Depends(get_db),
):
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Текст не может быть пустым")

    db_chars = fetch_db_characters(body.project_id, db)
    db_rels  = fetch_db_relationships(body.project_id, db)
    state = await _run_agent({
        "action":                "analyze",
        "chapter_id":            None,
        "text":                  text,
        "genre":                 body.genre,
        "project_id":            body.project_id,
        "db_characters":         db_chars,
        "db_relationships":      db_rels,
        "current_paragraph":     None,
        "chat_history":          None,
        "chapter_text":          None,
        "retrieved_chunks":      None,
        "character_consistency": _build_consistency_notes(db_chars),
    })
    return state["result"]


@router.post("/continue")
async def ai_continue(
        body: AiContinueRequest,
        user: int = Depends(get_current_user_id),
        db:   Session = Depends(get_db),
):
    if not body.current_paragraph.strip() and not body.text.strip():
        raise HTTPException(status_code=400, detail="Текст не может быть пустым")

    db_chars = fetch_db_characters(body.project_id, db)
    state = await _run_agent({
        "action":                "continue",
        "chapter_id":            None,
        "text":                  body.text.strip(),
        "genre":                 body.genre,
        "project_id":            body.project_id,
        "db_characters":         db_chars,
        "db_relationships":      fetch_db_relationships(body.project_id, db),
        "current_paragraph":     body.current_paragraph.strip(),
        "chat_history":          None,
        "chapter_text":          None,
        "retrieved_chunks":      None,
        "character_consistency": None,
    })
    return {"result": state["result"]}


@router.post("/chat")
async def ai_chat(
        body: AiChatRequest,
        user: int = Depends(get_current_user_id),
        db:   Session = Depends(get_db),
):
    if not body.messages:
        raise HTTPException(status_code=400, detail="Сообщения не могут быть пустыми")

    history  = [{"role": m.role, "text": m.text} for m in body.messages]
    db_chars = fetch_db_characters(body.project_id, db)
    db_rels  = fetch_db_relationships(body.project_id, db)

    retrieved_chunks: List[str] = []
    if body.project_id:
        last_user = next((m.text for m in reversed(body.messages) if m.role == "user"), "")
        if last_user:
            retrieved_chunks = await _rag_search(last_user, body.project_id, db, top_k=3)

    state = await _run_agent({
        "action":                "chat",
        "text":                  "",
        "genre":                 body.genre,
        "project_id":            body.project_id,
        "chapter_id":            body.chapter_id,
        "db_characters":         db_chars,
        "db_relationships":      db_rels,
        "current_paragraph":     None,
        "chat_history":          history,
        "chapter_text":          body.chapter_text,
        "retrieved_chunks":      retrieved_chunks or None,
        "character_consistency": _build_consistency_notes(db_chars) or None,
    })
    return {"result": state["result"]}


@router.post("/generate-character-images")
async def generate_character_images(
        body: CharImageGenRequest,
        user: int = Depends(get_current_user_id),
):
    from project_service.app.core.config import settings as cfg
    if not cfg.YANDEX_API_KEY or not cfg.YANDEX_FOLDER_ID:
        raise HTTPException(
            status_code=503,
            detail="Генерация изображений недоступна: не настроен YANDEX_API_KEY / YANDEX_FOLDER_ID",
        )

    if not any([body.name, body.features, body.personality, body.desc_full]):
        raise HTTPException(
            status_code=400,
            detail="Заполните хотя бы одно поле: имя, внешность, характер или описание",
        )

    char_data = {
        "name":        body.name,
        "gender":      body.gender,
        "age":         body.age,
        "features":    body.features,
        "personality": body.personality,
        "desc_full":   body.desc_full,
        "short_desc":  body.short_desc,
    }

    from project_service.app.utils.embeddings import build_image_prompt, generate_character_images as _gen
    prompt = build_image_prompt(char_data)
    images = await _gen(prompt, count=3)

    if not images:
        raise HTTPException(
            status_code=502,
            detail=(
                "Не удалось сгенерировать изображения. "
                "Возможные причины: 1) сервисный аккаунт не имеет роли "
                "ai.imageGeneration.query в Yandex Cloud IAM; "
                "2) нет сети до llm.api.cloud.yandex.net из контейнера."
            ),
        )

    return {"images": images, "prompt": prompt}