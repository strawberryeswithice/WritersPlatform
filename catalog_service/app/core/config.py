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
    DEFAULT_PAGE_SIZE: int = 10
    MAX_PAGE_SIZE: int = 10000

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
