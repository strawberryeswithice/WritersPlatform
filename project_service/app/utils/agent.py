import httpx
import json
from typing import TypedDict, Optional, List, Dict, Any

from langgraph.graph import StateGraph, END, START

from project_service.app.core.config import settings

YANDEX_GPT_URL        = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
CHUNK_SIZE             = 3500
MAX_PHRASES_PER_CHUNK  = 5
MAX_REFLECTION_RETRIES = 1
MAX_SYSTEM_CHARS  = 7000
MAX_CONTEXT_CHARS = 3000

REFUSAL_PATTERNS = [
    "я не могу обсуждать эту тему", "я не могу помочь с этим",
    "не могу выполнить этот запрос", "давай поговорим о чём-нибудь другом",
    "давай поговорим о чем-нибудь другом", "не могу помочь в создании",
    "к сожалению, я не могу", "я не в состоянии помочь",
    "это выходит за рамки моих возможностей", "не могу обсуждать",
    "не могу создавать контент",
]

GENRE_STYLE_HINTS: Dict[str, str] = {
    "роман":         "Жанр — РОМАН. Богатая образность, сложный синтаксис, психологическая глубина.",
    "рассказ":       "Жанр — РАССКАЗ. Лаконично, каждое слово работает, неожиданный финал.",
    "повесть":       "Жанр — ПОВЕСТЬ. Между рассказом и романом, чёткий образный язык.",
    "стихи":         "Жанр — ПОЭЗИЯ. Ритм, метафоры, звуковая организация.",
    "детектив":      "Жанр — ДЕТЕКТИВ. Саспенс, короткие предложения, интрига с первой строки.",
    "фэнтези":       "Жанр — ФЭНТЕЗИ. Эпический стиль, архаизмы, богатые описания мира.",
    "фантастика":    "Жанр — ФАНТАСТИКА. Футуристический стиль, научная терминология.",
    "любовный роман":"Жанр — ЛЮБОВНЫЙ РОМАН. Эмоциональный стиль, напряжение между героями.",
    "триллер":       "Жанр — ТРИЛЛЕР. Динамично, коротко, нагнетание тревоги.",
}
DEFAULT_GENRE_HINT = "Жанр не указан. Изучи стиль автора и следуй ему."

MIN_LENGTHS: Dict[str, int] = {
    "introduce": 80, "conclude": 80, "continue": 30, "improve": 100, "chat": 20,
}

TOOL_ROUTING: Dict[str, str] = {
    "introduce": "tool_introduce",
    "conclude":  "tool_conclude",
    "improve":   "tool_improve",
    "continue":  "tool_continue",
    "chat":      "chat_agent_node",
    "analyze":   "chunk_loop",
}


class AgentState(TypedDict):
    action:             str
    text:               str
    genre:              Optional[str]
    project_id:         Optional[int]
    chapter_id:         Optional[int]
    db_characters:      List[Dict]
    db_relationships:   Optional[List[Dict]]
    current_paragraph:  Optional[str]
    chat_history:       Optional[List[Dict]]
    chapter_text:       Optional[str]
    retrieved_chunks:   Optional[List[str]]
    character_consistency: Optional[str]
    memory:             Dict[str, Any]
    tool_name:          str
    system_prompt:      str
    user_prompt:        str
    raw_result:         str
    attempt:            int
    reflection_retries: int
    chunks:             List[str]
    chunk_index:        int
    chunk_results:      List[dict]
    result:             Any

def is_refusal(text: str) -> bool:
    return any(p in text.lower() for p in REFUSAL_PATTERNS)


def get_genre_hint(genre: Optional[str]) -> str:
    if not genre:
        return DEFAULT_GENRE_HINT
    return GENRE_STYLE_HINTS.get(genre.lower().strip(), DEFAULT_GENRE_HINT)


def make_headers() -> Dict[str, str]:
    return {"Authorization": f"Api-Key {settings.YANDEX_API_KEY}",
            "Content-Type": "application/json"}


def make_model_uri_main() -> str:
    return f"gpt://{settings.YANDEX_FOLDER_ID}/yandexgpt-lite/latest"


def make_model_uri_alt() -> str:
    return settings.YANDEX_ALT_MODEL_URI or f"gpt://{settings.YANDEX_FOLDER_ID}/yandexgpt/latest"


def _truncate(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    half = max_chars // 2
    return text[:half] + "\n...[сокращено]...\n" + text[-half:]


def split_into_chunks(text: str, chunk_size: int = CHUNK_SIZE) -> List[str]:
    paragraphs = [p for p in text.split("\n\n") if p.strip()]
    if not paragraphs:
        return [text[i:i+chunk_size] for i in range(0, len(text), chunk_size)]
    chunks, current, current_size = [], [], 0
    for para in paragraphs:
        if current_size + len(para) > chunk_size and current:
            chunks.append("\n\n".join(current))
            current, current_size = [para], len(para)
        else:
            current.append(para)
            current_size += len(para)
    if current:
        chunks.append("\n\n".join(current))
    return chunks

def _build_analyze_system(genre_hint: str, is_chunk: bool = False) -> str:
    chunk_note = (
        f"\nВАЖНО: тебе передан фрагмент большого текста. "
        f"Не более {MAX_PHRASES_PER_CHUNK} фраз каждого типа.\n"
    ) if is_chunk else ""
    return (
        f"{genre_hint}\n{chunk_note}\nТы профессиональный редактор. "
        "Верни ТОЛЬКО валидный JSON:\n"
        '{"spam":<0-100>,"water":<0-100>,"speech_errors":<0-100>,"grammar_errors":<0-100>,'
        '"spam_phrases":[{"phrase":"...","explanation":"..."}],'
        '"water_phrases":[{"phrase":"...","explanation":"..."}],'
        '"speech_error_phrases":[{"phrase":"...","explanation":"..."}],'
        '"grammar_error_phrases":[{"phrase":"...","explanation":"..."}],'
        '"consistency_issues":[]}'
        "\nВерни ТОЛЬКО JSON, без лишних слов.\n"
        "ВАЖНО: поле consistency_issues — ТОЛЬКО для объективных противоречий из КАРТОЧЕК ПЕРСОНАЖЕЙ: "
        "рост, вес, физические ограничения, явные внешние приметы. "
        "Формат: {\"character\":\"имя\",\"issue\":\"описание\",\"found_in_text\":true/false}. "
        "НЕ добавляй в consistency_issues: ситуативное поведение (пьян, расстроен, устал), "
        "черты характера не описанные в карточке, диалоги, эмоции. "
        "НЕ добавляй данные персонажей в grammar_error_phrases или другие поля ошибок. "
        "Лучше не сообщать о несоответствии, чем сообщить ложное."
    )


def _build_consistency_suffix(db_characters: List[Dict]) -> str:
    if not db_characters:
        return ""
    lines = []
    for c in db_characters:
        parts = [c["name"]]
        if c.get("features"):  parts.append(f"внешность: {c['features']}")
        if c.get("desc_full"): parts.append(c["desc_full"][:150])
        elif c.get("short_desc"): parts.append(c["short_desc"])
        if len(parts) > 1:
            lines.append(" | ".join(parts))
    if not lines:
        return ""
    return (
            "\n\n--- КАРТОЧКИ ПЕРСОНАЖЕЙ ---\n"
            + "\n".join(f"• {l}" for l in lines)
            + "\n--- КОНЕЦ ---\n"
              "Если персонаж в тексте ПРОТИВОРЕЧИТ карточке — добавь в grammar_error_phrases "
              "с объяснением «Несоответствие карточке: <имя> — <описание>».\n"
              "Верни ТОЛЬКО JSON."
    )


def _parse_json(raw: str) -> dict:
    try:
        s, e = raw.find("{"), raw.rfind("}") + 1
        return json.loads(raw[s:e]) if s != -1 and e > 0 else {}
    except Exception:
        return {}


def _safe_int(val, default: int = 0) -> int:
    if isinstance(val, int):
        return val
    if isinstance(val, float):
        return int(val)
    if isinstance(val, str):
        try:
            return int(val)
        except ValueError:
            return default
    return default


def _normalize_phrases(phrases_raw) -> List[dict]:
    result = []
    for item in (phrases_raw or []):
        if isinstance(item, dict):
            result.append({
                "phrase": item.get("phrase", ""),
                "explanation": item.get("explanation", ""),
            })
        elif isinstance(item, str) and item.strip():
            result.append({"phrase": item, "explanation": ""})
    return [x for x in result if x["phrase"]]


def _merge_chunks(chunk_results: List[dict]) -> dict:
    empty = {
        "spam": 0, "water": 0, "speech_errors": 0, "grammar_errors": 0,
        "spam_phrases": [], "water_phrases": [],
        "speech_error_phrases": [], "grammar_error_phrases": [],
    }
    valid = [r for r in chunk_results if r]
    if not valid:
        return empty

    n = len(valid)
    merged: dict = {
        k: sum(_safe_int(r.get(k, 0)) for r in valid) // n
        for k in ("spam", "water", "speech_errors", "grammar_errors")
    }

    for key in ("spam_phrases", "water_phrases", "speech_error_phrases", "grammar_error_phrases"):
        seen: set = set()
        combined: List[dict] = []
        for r in valid:
            raw_val = r.get(key, [])
            if not isinstance(raw_val, list):
                raw_val = []
            for item in _normalize_phrases(raw_val):
                if item["phrase"] not in seen:
                    seen.add(item["phrase"])
                    combined.append(item)
        merged[key] = combined

    seen_issues: set = set()
    merged_issues: List[dict] = []
    for r in valid:
        issues = r.get("consistency_issues", [])
        if not isinstance(issues, list):
            issues = []
        for issue in issues:
            if not isinstance(issue, dict):
                continue
            key_str = "{}|{}".format(issue.get("character",""), issue.get("issue","")[:60])
            if key_str not in seen_issues:
                seen_issues.add(key_str)
                merged_issues.append(issue)
    merged["consistency_issues"] = merged_issues

    return merged


def _flatten_to_response(merged: dict) -> dict:
    category_map = {
        "spam_phrases":         ("spam_phrases",         "spam_explanations"),
        "water_phrases":        ("water_phrases",        "water_explanations"),
        "speech_error_phrases": ("speech_error_phrases", "speech_error_explanations"),
        "grammar_error_phrases":("grammar_error_phrases","grammar_error_explanations"),
    }
    response = {k: merged.get(k, 0) for k in ("spam", "water", "speech_errors", "grammar_errors")}
    for src_key, (phrases_key, expl_key) in category_map.items():
        items = _normalize_phrases(merged.get(src_key, []))
        response[phrases_key] = [i["phrase"] for i in items]
        response[expl_key]    = {i["phrase"]: i["explanation"] for i in items if i["explanation"]}
    response["consistency_issues"] = merged.get("consistency_issues", [])
    return response

async def _call_model(model_uri: str, messages: list,
                      temperature: float = 0.4, max_tokens: int = 2000) -> str:
    payload = {
        "modelUri": model_uri,
        "completionOptions": {
            "stream": False, "temperature": temperature, "maxTokens": max_tokens,
        },
        "messages": messages,
    }
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.post(YANDEX_GPT_URL, headers=make_headers(), json=payload)
    except (httpx.ConnectError, httpx.RemoteProtocolError, httpx.TimeoutException) as exc:
        raise RuntimeError(f"Yandex GPT connection error: {exc}") from exc

    if resp.status_code != 200:
        raise RuntimeError(f"Yandex GPT error {resp.status_code}: {resp.text[:300]}")

    try:
        return resp.json()["result"]["alternatives"][0]["message"]["text"]
    except (KeyError, IndexError) as exc:
        raise RuntimeError(f"Yandex GPT unexpected response: {resp.text[:300]}") from exc


async def _call_with_fallback(messages: list,
                              temperature: float = 0.4, max_tokens: int = 2000) -> str:
    result = await _call_model(make_model_uri_main(), messages, temperature, max_tokens)
    if is_refusal(result):
        result = await _call_model(make_model_uri_alt(), messages, temperature, max_tokens)
    return result

def _format_character(c: Dict) -> str:
    parts = [c["name"]]
    if c.get("role"):        parts.append(f"роль: {c['role']}")
    if c.get("gender"):      parts.append(f"пол: {c['gender']}")
    if c.get("age"):         parts.append(f"возраст: {c['age']}")
    if c.get("status"):      parts.append(f"статус: {c['status']}")
    if c.get("short_desc"):  parts.append(f"кратко: {c['short_desc']}")
    if c.get("features"):    parts.append(f"внешность: {c['features']}")
    if c.get("personality"): parts.append(f"характер: {c['personality']}")
    return " | ".join(parts)


def _characters_block(db_characters: List[Dict], max_chars: int = 1500) -> str:
    if not db_characters:
        return ""
    lines = [_format_character(c) for c in db_characters]
    block = (
            "\n\n=== ПЕРСОНАЖИ ===\n"
            + "\n".join(f"• {l}" for l in lines)
            + "\n=== КОНЕЦ ПЕРСОНАЖЕЙ ==="
    )
    return _truncate(block, max_chars)


def _retrieved_chunks_block(chunks: Optional[List[str]], max_chars: int = 2000) -> str:
    if not chunks:
        return ""
    top = chunks[:3]
    lines = [f"[{i+1}] {_truncate(ch, 600)}" for i, ch in enumerate(top)]
    block = (
            "\n\n=== РЕЛЕВАНТНЫЕ ФРАГМЕНТЫ ===\n"
            + "\n\n".join(lines)
            + "\n=== КОНЕЦ ФРАГМЕНТОВ ==="
    )
    return _truncate(block, max_chars)


def _consistency_block(notes: Optional[str], max_chars: int = 800) -> str:
    if not notes:
        return ""
    return _truncate(
        f"\n\n=== ПРОВЕРКА СОГЛАСОВАННОСТИ ===\n{notes}\n=== КОНЕЦ ===",
        max_chars,
    )


def _relationships_block(db_relationships: Optional[List[Dict]], max_chars: int = 600) -> str:
    if not db_relationships:
        return ""
    lines = [f"• {r['char1']} ↔ {r['char2']}: {r['relation']}" for r in db_relationships]
    block = (
            "\n\n=== ОТНОШЕНИЯ ПЕРСОНАЖЕЙ ===\n"
            + "\n".join(lines)
            + "\n=== КОНЕЦ ОТНОШЕНИЙ ==="
    )
    return _truncate(block, max_chars)


def _trim_system(system: str) -> str:
    if len(system) <= MAX_SYSTEM_CHARS:
        return system
    return _truncate(system, MAX_SYSTEM_CHARS)

async def extract_memory(state: AgentState) -> dict:
    text       = state["text"].strip()
    genre_hint = get_genre_hint(state.get("genre"))
    db_chars = state.get("db_characters") or []
    db_rels  = state.get("db_relationships") or []

    base = {
        "attempt": 0, "reflection_retries": 0,
        "chunks": [], "chunk_index": 0, "chunk_results": [],
        "raw_result": "", "tool_name": "",
    }

    if db_chars:
        return {**base, "memory": {
            "characters":    [c["name"] for c in db_chars],
            "db_characters": db_chars,
            "db_relationships": db_rels,
            "themes":        [],
            "style_notes":   "",
            "genre_hint":    genre_hint,
            "source":        "database",
        }}

    if len(text) < 300:
        return {**base, "memory": {
            "characters": [], "db_characters": [], "themes": [],
            "style_notes": "", "genre_hint": genre_hint, "source": "none",
        }}

    source = (state.get("chapter_text") or text)[:3000]
    system = (
        'Ты литературный аналитик. Верни ТОЛЬКО JSON:\n'
        '{"characters":["имя1","имя2"],"themes":["тема1"],"style_notes":"описание"}\n'
        'Не более 5 персонажей и 3 тем.'
    )
    try:
        raw  = await _call_model(
            make_model_uri_main(),
            [{"role": "system", "text": system}, {"role": "user", "text": source}],
            temperature=0.1, max_tokens=300,
        )
        data = _parse_json(raw)
        memory = {
            "characters":    data.get("characters", [])[:5],
            "db_characters": [],
            "themes":        data.get("themes", [])[:3],
            "style_notes":   data.get("style_notes", ""),
            "genre_hint":    genre_hint,
            "source":        "text_extraction",
        }
    except Exception:
        memory = {
            "characters": [], "db_characters": [], "themes": [],
            "style_notes": "", "genre_hint": genre_hint, "source": "none",
        }

    return {**base, "memory": memory}

async def router_node(state: AgentState) -> dict:
    action    = state["action"]
    tool_name = TOOL_ROUTING.get(action, "tool_improve")
    updates   = {"tool_name": tool_name}
    if action == "analyze":
        updates["chunks"] = split_into_chunks(state["text"].strip(), CHUNK_SIZE)
    return updates


def route_after_router(state: AgentState) -> str:
    return state["tool_name"]


def _mem_ctx(memory: dict) -> str:
    parts = []
    if memory.get("themes"):
        parts.append(f"Темы: {', '.join(memory['themes'])}.")
    if memory.get("style_notes"):
        parts.append(f"Стиль: {memory['style_notes'][:200]}")
    return "\n".join(parts)

def tool_introduce(state: AgentState) -> Dict[str, str]:
    m = state.get("memory", {})
    system = _trim_system(
        f"{m.get('genre_hint', DEFAULT_GENRE_HINT)}\n"
        f"{_characters_block(m.get('db_characters', []))}"
        f"{_relationships_block(m.get('db_relationships', []))}\n"
        f"{_mem_ctx(m)}\n\n"
        "Напиши вводный фрагмент (3–5 предложений): задай тон, атмосферу, заинтригуй.\n"
        "Верни ТОЛЬКО текст введения."
    )
    return {"system_prompt": system, "user_prompt": state["text"].strip()}


def tool_conclude(state: AgentState) -> Dict[str, str]:
    m = state.get("memory", {})
    system = _trim_system(
        f"{m.get('genre_hint', DEFAULT_GENRE_HINT)}\n"
        f"{_characters_block(m.get('db_characters', []))}"
        f"{_relationships_block(m.get('db_relationships', []))}\n"
        f"{_mem_ctx(m)}\n\n"
        "Напиши заключительный фрагмент (3–5 предложений).\n"
        "Верни ТОЛЬКО текст."
    )
    return {"system_prompt": system, "user_prompt": state["text"].strip()}


def tool_improve(state: AgentState) -> Dict[str, str]:
    m = state.get("memory", {})
    system = _trim_system(
        f"{m.get('genre_hint', DEFAULT_GENRE_HINT)}\n"
        f"{_characters_block(m.get('db_characters', []))}"
        f"{_relationships_block(m.get('db_relationships', []))}"
        f"{_consistency_block(state.get('character_consistency'))}\n\n"
        "Ты опытный редактор. Дай до 10 конкретных рекомендаций с примерами из текста.\n"
        "Если персонаж ПРОТИВОРЕЧИТ его карточке — укажи на это явно."
    )
    return {"system_prompt": system, "user_prompt": state["text"].strip()}


def tool_continue(state: AgentState) -> Dict[str, str]:
    m    = state.get("memory", {})
    text = state["text"].strip()
    para = (state.get("current_paragraph") or "").strip()
    ctx_text = (_truncate(text, 5000))
    system = _trim_system(
        f"{m.get('genre_hint', DEFAULT_GENRE_HINT)}\n"
        f"{_characters_block(m.get('db_characters', []))}"
        f"{_relationships_block(m.get('db_relationships', []))}\n"
        f"{_mem_ctx(m)}\n\n"
        "Напиши 1–2 предложения ПОСЛЕ выделенного фрагмента.\n"
        "Верни ТОЛЬКО продолжение."
    )
    user = (
        f"=== ТЕКСТ ===\n{ctx_text}\n\n"
        f"=== ВЫДЕЛЕННЫЙ ФРАГМЕНТ ===\n\"{para}\"\n\n"
        "Напиши 1–2 предложения продолжения."
    )
    return {"system_prompt": system, "user_prompt": user}


def tool_chat(state: AgentState) -> Dict[str, str]:
    m = state.get("memory", {})

    snippet = _truncate((state.get("chapter_text") or ""), MAX_CONTEXT_CHARS)
    ch_ctx  = f"\nТекст главы (фрагмент):\n---\n{snippet}\n---" if snippet else ""

    rag_ctx = _retrieved_chunks_block(state.get("retrieved_chunks"), max_chars=MAX_CONTEXT_CHARS)
    consist = _consistency_block(state.get("character_consistency"))

    system = _trim_system(
        "Ты литературный ассистент. Помогаешь писателям.\n\n"
        f"{m.get('genre_hint', DEFAULT_GENRE_HINT)}\n"
        f"{_characters_block(m.get('db_characters', []))}\n"
        f"{_mem_ctx(m)}{ch_ctx}{rag_ctx}{consist}\n\n"
        "Используй РЕЛЕВАНТНЫЕ ФРАГМЕНТЫ как основу ответа, если они есть.\n"
        "Сообщи о противоречиях между карточкой и текстом, если обнаружишь."
    )
    return {"system_prompt": system, "user_prompt": ""}


TOOLS: Dict[str, Any] = {
    "tool_introduce": tool_introduce,
    "tool_conclude":  tool_conclude,
    "tool_improve":   tool_improve,
    "tool_continue":  tool_continue,
    "tool_chat":      tool_chat,
}

async def call_tool(state: AgentState) -> dict:
    tool_fn = TOOLS.get(state["tool_name"])
    if tool_fn is None:
        raise ValueError(f"Неизвестный инструмент: {state['tool_name']}")

    prompts       = tool_fn(state)
    system_prompt = prompts["system_prompt"]
    user_prompt   = prompts["user_prompt"]
    action        = state["action"]

    if action == "chat":
        history  = state.get("chat_history") or []
        history  = history[-6:]
        messages = [{"role": "system", "text": system_prompt}] + history
        raw = await _call_with_fallback(messages, temperature=0.55, max_tokens=1200)
    else:
        messages    = [
            {"role": "system", "text": system_prompt},
            {"role": "user",   "text": user_prompt},
        ]
        temperature = 0.65 if action in ("introduce", "conclude", "continue") else 0.4
        max_tokens  = 300  if action == "continue" else 2000
        raw = await _call_with_fallback(messages, temperature=temperature, max_tokens=max_tokens)

    return {
        "system_prompt": system_prompt, "user_prompt": user_prompt,
        "raw_result": raw, "attempt": state["attempt"] + 1,
    }


async def reflect_node(state: AgentState) -> dict:
    raw     = state["raw_result"].strip()
    action  = state["action"]
    retries = state.get("reflection_retries", 0)

    is_bad = (
            is_refusal(raw)
            or len(raw) < MIN_LENGTHS.get(action, 20)
            or (action in ("introduce", "conclude", "continue") and raw.endswith("?"))
    )

    if is_bad and retries < MAX_REFLECTION_RETRIES:
        strengthened = (
                state["system_prompt"]
                + "\n\n[ВАЖНО: предыдущий ответ не соответствовал требованиям. "
                  "Напиши заново. Верни ТОЛЬКО запрошенный текст.]"
        )
        return {"system_prompt": strengthened, "reflection_retries": retries + 1}

    return {"result": raw}


def route_after_reflect(state: AgentState) -> str:
    return "done" if state.get("result") is not None else "retry"


async def call_chunk_model(state: AgentState) -> dict:
    idx      = state["chunk_index"]
    chunk    = state["chunks"][idx]
    memory   = state.get("memory", {})
    db_chars = memory.get("db_characters", [])

    system    = _build_analyze_system(
        memory.get("genre_hint", DEFAULT_GENRE_HINT),
        is_chunk=len(state["chunks"]) > 1,
    )
    user_text = chunk + _build_consistency_suffix(db_chars)

    messages = [
        {"role": "system", "text": system},
        {"role": "user",   "text": user_text},
    ]
    raw    = await _call_model(make_model_uri_main(), messages, temperature=0.2, max_tokens=2500)
    parsed = _parse_json(raw)
    return {
        "chunk_index":   idx + 1,
        "chunk_results": state["chunk_results"] + ([parsed] if parsed else []),
        "raw_result":    raw,
        "attempt":       state["attempt"] + 1,
    }


async def merge_chunks(state: AgentState) -> dict:
    return {"result": _flatten_to_response(_merge_chunks(state["chunk_results"]))}


def route_chunks(state: AgentState) -> str:
    return "next_chunk" if state["chunk_index"] < len(state["chunks"]) else "merge"

_SEARCH_TOOL_DEF = {
    "function": {
        "name": "search_text",
        "description": (
            "Поиск фрагментов в тексте произведения. Используй этот инструмент "
            "только когда вопрос касается конкретного содержания текста, "
            "которого нет в предоставленном контексте. "
            "Режимы:\n"
            "  semantic — смысловой поиск (для сцен, персонажей, событий);\n"
            "  last     — последние фрагменты текста (конец главы/произведения);\n"
            "  first    — первые фрагменты (начало);\n"
            "  all      — все фрагменты последовательно (для общих вопросов о структуре)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Что ищем (ключевые слова, фраза, тема)"
                },
                "mode": {
                    "type": "string",
                    "enum": ["semantic", "first", "last", "all"],
                    "description": "Режим поиска"
                }
            },
            "required": ["query", "mode"]
        }
    }
}

MAX_TOOL_CALLS = 2


async def _execute_search_tool(
        query: str,
        mode: str,
        project_id: Optional[int],
        chapter_id: Optional[int],
) -> str:
    if not project_id:
        return "project_id не передан — поиск недоступен."

    from project_service.app.db.database import SessionLocal
    from project_service.app.db.models import TextChunk

    db = SessionLocal()
    try:
        base_q = db.query(TextChunk).filter(TextChunk.project_id == project_id)
        if chapter_id:
            base_q = base_q.filter(TextChunk.chapter_id == chapter_id)

        if mode == "last":
            rows = base_q.order_by(
                TextChunk.chapter_id.desc(),
                TextChunk.chunk_index.desc()
            ).limit(3).all()
            if not rows:
                return "Текст не проиндексирован. Откройте главу и сохраните её, чтобы построить индекс."
            rows = list(reversed(rows))
            result = "\n\n---\n\n".join(r.text for r in rows)
            return f"[ПОСЛЕДНИЕ ФРАГМЕНТЫ ТЕКСТА]\n{result}"

        elif mode == "first":
            rows = base_q.order_by(
                TextChunk.chapter_id.asc(),
                TextChunk.chunk_index.asc()
            ).limit(3).all()
            if not rows:
                return "Текст не проиндексирован."
            result = "\n\n---\n\n".join(r.text for r in rows)
            return f"[ПЕРВЫЕ ФРАГМЕНТЫ ТЕКСТА]\n{result}"

        elif mode == "all":
            rows = base_q.order_by(
                TextChunk.chapter_id.asc(),
                TextChunk.chunk_index.asc()
            ).all()
            if not rows:
                return "Текст не проиндексирован."
            result = "\n\n---\n\n".join(r.text for r in rows)
            return f"[ВЕСЬ ТЕКСТ]\n{result}"

        else:
            from project_service.app.utils.vector_store import search_chunks
            chunks = await search_chunks(query, project_id, db, top_k=4)
            if not chunks:
                return "По запросу ничего не найдено в индексе."
            result = "\n\n---\n\n".join(chunks)
            return f"[НАЙДЕННЫЕ ФРАГМЕНТЫ по запросу «{query}»]\n{result}"

    except Exception as exc:
        return f"Ошибка поиска: {exc}"
    finally:
        db.close()


async def _run_chat_agent(
        system_prompt: str,
        history: List[Dict],
        project_id: Optional[int],
        chapter_id: Optional[int],
) -> str:
    messages: List[Dict] = [{"role": "system", "text": system_prompt}] + history
    tools = [_SEARCH_TOOL_DEF]

    for iteration in range(MAX_TOOL_CALLS):
        payload = {
            "modelUri": make_model_uri_main(),
            "completionOptions": {
                "stream": False,
                "temperature": 0.45,
                "maxTokens": 1500,
            },
            "messages": messages,
            "tools": tools,
        }

        try:
            async with httpx.AsyncClient(timeout=90) as client:
                resp = await client.post(YANDEX_GPT_URL, headers=make_headers(), json=payload)
        except (httpx.ConnectError, httpx.RemoteProtocolError, httpx.TimeoutException) as exc:
            raise RuntimeError(f"Yandex GPT connection error: {exc}") from exc

        if resp.status_code != 200:
            raise RuntimeError(f"Yandex GPT {resp.status_code}: {resp.text[:300]}")

        data       = resp.json()
        alt        = data["result"]["alternatives"][0]
        status     = alt.get("status", "")
        msg        = alt["message"]
        tool_calls = msg.get("toolCallList", {}).get("toolCalls", [])

        if tool_calls or "TOOL_CALLS" in status:
            messages.append(msg)

            tool_results = []
            for tc in tool_calls:
                fc      = tc.get("functionCall", {})
                fn_name = fc.get("name", "")
                raw_args = fc.get("arguments", "{}")
                try:
                    fn_args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                except Exception:
                    fn_args = {}

                if fn_name == "search_text":
                    result_text = await _execute_search_tool(
                        query      = fn_args.get("query", ""),
                        mode       = fn_args.get("mode", "semantic"),
                        project_id = project_id,
                        chapter_id = chapter_id,
                    )
                else:
                    result_text = f"Неизвестный инструмент: {fn_name}"

                tool_results.append({
                    "functionResult": {
                        "name":    fn_name,
                        "content": result_text,
                    }
                })

            result_parts = []
            for tr in tool_results:
                fr = tr.get("functionResult", {})
                result_parts.append(
                    f"[Результат инструмента «{fr.get('name', '')}»]:\n{fr.get('content', '')}"
                )
            messages.append({
                "role": "user",
                "text": "\n\n".join(result_parts),
            })
            continue
        answer = msg.get("text", "").strip()
        if answer:
            return answer

    return "Не удалось получить ответ после нескольких попыток поиска."


async def chat_agent_node(state: AgentState) -> dict:
    m       = state.get("memory", {})
    chars   = _characters_block(m.get("db_characters", []))
    rels    = _relationships_block(m.get("db_relationships", []))
    ctx     = _mem_ctx(m)
    consist = _consistency_block(state.get("character_consistency"))

    snippet = (state.get("chapter_text") or "")[:1500]
    ch_ctx  = (
        f"\nПредпросмотр главы (первые 1500 символов):\n---\n{snippet}\n---"
        if snippet else ""
    )

    history    = state.get("chat_history") or []
    project_id = state.get("project_id")
    chapter_id = state.get("chapter_id")
    retrieved  = state.get("retrieved_chunks") or []

    if retrieved:
        rag_ctx = _retrieved_chunks_block(retrieved)
        system  = _trim_system(
            "Ты литературный ассистент. Помогаешь писателям работать с их текстом.\n\n"
            f"{m.get('genre_hint', DEFAULT_GENRE_HINT)}\n"
            f"{chars}{rels}\n{ctx}{ch_ctx}{rag_ctx}{consist}\n\n"
            "Отвечай, опираясь на фрагменты текста выше. "
            "Будь конкретен и лаконичен."
        )
        messages = [{"role": "system", "text": system}] + history
        try:
            result = await _call_with_fallback(messages, temperature=0.45, max_tokens=1500)
        except RuntimeError as exc:
            raise RuntimeError(str(exc)) from exc
    else:
        system = _trim_system(
            "Ты литературный ассистент. Помогаешь писателям работать с их текстом.\n\n"
            f"{m.get('genre_hint', DEFAULT_GENRE_HINT)}\n"
            f"{chars}{rels}\n{ctx}{ch_ctx}{consist}\n\n"
            "У тебя есть инструмент search_text для поиска в тексте произведения. "
            "Используй его только если вопрос касается конкретного содержания текста "
            "(события, цитаты, начало/конец). Для общих советов — отвечай сразу."
        )
        try:
            result = await _run_chat_agent(
                system_prompt = system,
                history       = history,
                project_id    = project_id,
                chapter_id    = chapter_id,
            )
        except RuntimeError as exc:
            raise RuntimeError(str(exc)) from exc

    return {"result": result}

def _build_graph() -> StateGraph:
    graph = StateGraph(AgentState)

    graph.add_node("extract_memory",  extract_memory)
    graph.add_node("router_node",     router_node)
    graph.add_node("call_tool",       call_tool)
    graph.add_node("reflect_node",    reflect_node)
    graph.add_node("chunk_loop",      call_chunk_model)
    graph.add_node("merge_chunks",    merge_chunks)
    graph.add_node("chat_agent_node", chat_agent_node)

    graph.add_edge(START, "extract_memory")
    graph.add_edge("extract_memory", "router_node")

    _skip = {"chunk_loop", "chat_agent_node"}
    tool_targets = {name: "call_tool" for name in TOOL_ROUTING.values() if name not in _skip}
    tool_targets["chunk_loop"]      = "chunk_loop"
    tool_targets["chat_agent_node"] = "chat_agent_node"
    graph.add_conditional_edges("router_node", route_after_router, tool_targets)

    graph.add_edge("call_tool", "reflect_node")
    graph.add_conditional_edges("reflect_node", route_after_reflect,
                                {"retry": "call_tool", "done": END})

    graph.add_conditional_edges("chunk_loop", route_chunks,
                                {"next_chunk": "chunk_loop", "merge": "merge_chunks"})
    graph.add_edge("merge_chunks",    END)
    graph.add_edge("chat_agent_node", END)

    return graph


literary_agent = _build_graph().compile()