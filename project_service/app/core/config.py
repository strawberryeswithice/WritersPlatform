import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    JWT_SECRET_KEY: str = os.environ.get(
        'JWT_SECRET_KEY',
        '5a8c1e7b3d9f2a6c4b8e1d7a0c9f3b6d2e8a5c7b1f9d4e6a3c8b0e7d2a9f'
    )
    ALGORITHM: str = "HS256"

    SQLALCHEMY_DATABASE_URI: str = os.environ.get(
        'DATABASE_URL',
        'postgresql://postgres:OveR2568@localhost:5432/auth_db'
    )

    CATALOG_URL: str = os.environ.get('CATALOG_URL', 'http://localhost:8011')

    MINIO_ENDPOINT:   str  = os.environ.get('MINIO_ENDPOINT',   'localhost:9000')
    MINIO_ACCESS_KEY: str  = os.environ.get('MINIO_ACCESS_KEY', 'minioadmin')
    MINIO_SECRET_KEY: str  = os.environ.get('MINIO_SECRET_KEY', 'minioadmin123')
    MINIO_BUCKET:     str  = os.environ.get('MINIO_BUCKET',     'character-photos')
    MINIO_TEXT_BUCKET:str  = os.environ.get('MINIO_TEXT_BUCKET','chapter-texts')
    MINIO_SECURE:     bool = os.environ.get('MINIO_SECURE', 'false').lower() == 'true'
    MINIO_PUBLIC_URL: str  = os.environ.get('MINIO_PUBLIC_URL', '')

    YANDEX_API_KEY:    str = os.environ.get('YANDEX_API_KEY',    '')
    YANDEX_FOLDER_ID:  str = os.environ.get('YANDEX_FOLDER_ID',  '')
    YANDEX_ALT_MODEL_URI: str = os.environ.get('YANDEX_ALT_MODEL_URI', '')

    QDRANT_HOST: str = os.environ.get('QDRANT_HOST', 'localhost')
    QDRANT_PORT: int = int(os.environ.get('QDRANT_PORT', '6333'))

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()