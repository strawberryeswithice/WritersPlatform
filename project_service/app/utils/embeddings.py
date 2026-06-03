import asyncio
import random
from typing import List, Optional

import httpx

from project_service.app.core.config import settings

YANDEX_EMBED_URL  = "https://llm.api.cloud.yandex.net/foundationModels/v1/textEmbedding"
YANDEX_ART_URL    = "https://llm.api.cloud.yandex.net/foundationModels/v1/imageGenerationAsync"
YANDEX_OPS_URL    = "https://operation.api.cloud.yandex.net/operations"

CHUNK_CHAR_SIZE   = 4000
ART_POLL_INTERVAL = 4
ART_MAX_POLLS     = 35

def _headers() -> dict:
    return {
        "Authorization": f"Api-Key {settings.YANDEX_API_KEY}",
        "Content-Type":  "application/json",
    }

async def get_embedding(text: str, is_query: bool = False) -> Optional[List[float]]:
    if not settings.YANDEX_API_KEY or not settings.YANDEX_FOLDER_ID:
        return None
    mtype     = "query" if is_query else "doc"
    model_uri = f"emb://{settings.YANDEX_FOLDER_ID}/text-search-{mtype}/latest"
    payload   = {"modelUri": model_uri, "text": text[:8000]}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(YANDEX_EMBED_URL, headers=_headers(), json=payload)
            if resp.status_code != 200:
                print(f"[Embedding] error {resp.status_code}: {resp.text[:300]}")
                return None
            return resp.json().get("embedding")
    except Exception as exc:
        print(f"[Embedding] exception: {exc}")
        return None


def split_text_to_chunks(text: str, chunk_size: int = CHUNK_CHAR_SIZE) -> List[str]:
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    if not paragraphs:
        paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
    if not paragraphs:
        return [text] if text.strip() else []

    chunks: List[str] = []
    current: List[str] = []
    current_size = 0

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


def build_character_appearance_text(char_data: dict) -> str:
    parts: List[str] = []
    if char_data.get("name"):        parts.append(f"Персонаж: {char_data['name']}")
    if char_data.get("gender"):      parts.append(f"Пол: {char_data['gender']}")
    if char_data.get("age"):         parts.append(f"Возраст: {char_data['age']}")
    if char_data.get("features"):    parts.append(f"Внешность: {char_data['features']}")
    if char_data.get("personality"): parts.append(f"Характер: {char_data['personality']}")
    if char_data.get("short_desc"):  parts.append(f"Кратко: {char_data['short_desc']}")
    if char_data.get("desc_full"):   parts.append(f"Описание: {char_data['desc_full'][:400]}")
    return ". ".join(parts)


def build_image_prompt(char_data: dict) -> str:
    parts: List[str] = []

    name = char_data.get("name", "")
    if name:
        parts.append(f"Портрет персонажа по имени {name}")

    gender_map = {
        "мужской": "мужчина", "женский": "женщина",
        "male": "мужчина",    "female": "женщина",
    }
    gender = char_data.get("gender") or ""
    if gender:
        parts.append(gender_map.get(gender.lower(), gender))

    if char_data.get("age"):
        parts.append(f"{char_data['age']} лет")

    if char_data.get("features"):
        parts.append(f"Внешность: {char_data['features']}")

    if char_data.get("personality"):
        parts.append(f"Характер: {char_data['personality']}")

    if char_data.get("desc_full"):
        parts.append(char_data["desc_full"][:300])

    parts.append("Детальный портрет, реалистичный стиль, нейтральный фон, высокое качество.")
    return ". ".join(parts)

async def generate_character_images(prompt: str, count: int = 3) -> List[str]:
    if not settings.YANDEX_API_KEY or not settings.YANDEX_FOLDER_ID:
        return []

    seeds   = random.sample(range(1, 999_999), count)
    tasks   = [_gen_one(prompt, seed) for seed in seeds]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    images: List[str] = []
    for r in results:
        if isinstance(r, str) and r.startswith("data:"):
            images.append(r)
        elif isinstance(r, Exception):
            print(f"[Art] task exception: {r}")

    return images


async def _gen_one(prompt: str, seed: int) -> Optional[str]:
    payload = {
        "modelUri": f"art://{settings.YANDEX_FOLDER_ID}/yandex-art/latest",
        "generationOptions": {
            "seed": seed,
            "aspectRatio": {"widthRatio": 1, "heightRatio": 1},
        },
        "messages": [{"weight": "1", "text": prompt}],
    }

    async with httpx.AsyncClient(timeout=120) as client:
        try:
            start_resp = await client.post(
                YANDEX_ART_URL, headers=_headers(), json=payload
            )
        except Exception as exc:
            print(f"[Art] start request failed: {exc}")
            return None

        if start_resp.status_code == 403:
            print(
                "[Art] 403 Permission denied — your API key / service account "
                "is missing the role 'ai.imageGeneration.query'. "
                "Add it in Yandex Cloud Console → IAM → Service accounts."
            )
            return None

        if start_resp.status_code != 200:
            print(f"[Art] start error {start_resp.status_code}: {start_resp.text[:300]}")
            return None

        start_data = start_resp.json()
        op_id = start_data.get("id")
        if not op_id:
            print(f"[Art] no operation id in response: {start_data}")
            return None

        for attempt in range(ART_MAX_POLLS):
            await asyncio.sleep(ART_POLL_INTERVAL)
            try:
                poll_resp = await client.get(
                    f"{YANDEX_OPS_URL}/{op_id}", headers=_headers()
                )
            except Exception as exc:
                print(f"[Art] poll request failed (attempt {attempt}): {exc}")
                continue

            if poll_resp.status_code != 200:
                print(f"[Art] poll error {poll_resp.status_code}: {poll_resp.text[:200]}")
                continue

            poll_data = poll_resp.json()

            if poll_data.get("done"):
                if poll_data.get("error"):
                    err = poll_data["error"]
                    print(f"[Art] operation failed: {err.get('message', err)}")
                    return None

                img_b64 = (
                        poll_data.get("response", {}).get("image")
                        or poll_data.get("result", {}).get("image")
                )
                if img_b64:
                    return f"data:image/jpeg;base64,{img_b64}"
                print(f"[Art] done but no image in response: {list(poll_data.keys())}")
                return None

        print(f"[Art] timed out after {ART_MAX_POLLS * ART_POLL_INTERVAL}s for seed={seed}")
        return None