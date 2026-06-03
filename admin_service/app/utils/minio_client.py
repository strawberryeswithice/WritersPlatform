from typing import Optional
from admin_service.app.core.config import settings

try:
    from minio import Minio
    _client = Minio(
        settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_SECURE,
    )
    MINIO_AVAILABLE = True
except Exception:
    _client = None
    MINIO_AVAILABLE = False

CHAPTER_BUCKET = "chapter-texts"
PHOTO_BUCKET   = "character-photos"

MINIO_PUBLIC = settings.MINIO_PUBLIC_URL.rstrip("/")


def get_chapter_text(object_name: str) -> Optional[str]:
    if not _client or not object_name:
        return None
    try:
        response = _client.get_object(CHAPTER_BUCKET, object_name)
        return response.read().decode("utf-8")
    except Exception as e:
        print(f"[minio] get_chapter_text error: {e}")
        return None


def get_photo_url(object_name: Optional[str]) -> Optional[str]:
    if not object_name:
        return None
    if object_name.startswith("http://") or object_name.startswith("https://"):
        return object_name
    return f"{MINIO_PUBLIC}/{PHOTO_BUCKET}/{object_name}"
