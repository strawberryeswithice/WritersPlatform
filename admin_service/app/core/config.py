import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:OveR2568@db:5432/auth_db")
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "5a8c1e7b3d9f2a6c4b8e1d7a0c9f3b6d2e8a5c7b1f9d4e6a3c8b0e7d2a9f")
    ALGORITHM: str = "HS256"
    MINIO_ENDPOINT: str = os.getenv("MINIO_ENDPOINT", "minio:9000")
    MINIO_ACCESS_KEY: str = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    MINIO_SECRET_KEY: str = os.getenv("MINIO_SECRET_KEY", "minioadmin123")
    MINIO_BUCKET_CHAPTERS: str = "chapter-texts"
    MINIO_BUCKET_PHOTOS: str = "character-photos"
    MINIO_SECURE: bool = False
    MINIO_PUBLIC_URL: str = os.getenv("MINIO_PUBLIC_URL", "http://localhost:9000")

    class Config:
        env_file = ".env"


settings = Settings()
