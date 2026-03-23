import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    SECRET_KEY: str = os.environ.get(
        'SECRET_KEY',
        '8f4e6d2a9c1b7e5f3a0d8c7b6e9f2a1d4c7b8e3a9f6d2c5b1e8f7a4d0c9b6e3'
    )
    JWT_SECRET_KEY: str = os.environ.get(
        'JWT_SECRET_KEY',
        '5a8c1e7b3d9f2a6c4b8e1d7a0c9f3b6d2e8a5c7b1f9d4e6a3c8b0e7d2a9f'
    )
    SQLALCHEMY_DATABASE_URI: str = os.environ.get(
        'DATABASE_URL',
        'postgresql://postgres:OveR2568@localhost:5432/auth_db'
    )
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    ALGORITHM: str = "HS256"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()