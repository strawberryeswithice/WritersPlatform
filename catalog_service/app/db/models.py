from sqlalchemy import Column, Integer, String, DateTime, Enum, Text
from sqlalchemy.sql import func
from catalog_service.app.db.database import Base
import enum

class ProjectStatus(str, enum.Enum):
    IN_PROGRESS = "в процессе"
    COMPLETED = "завершен"
    ON_PAUSE = "на паузе"

class ProjectGenre(str, enum.Enum):
    NOVEL = "роман"
    STORY = "рассказ"
    NOVELLA = "повесть"
    POETRY = "стихи"

class ProjectParts(str, enum.Enum):
    SINGLE = "одночастный"
    MULTI = "многочастный"

class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    genre = Column(Enum(ProjectGenre), nullable=True)
    status = Column(Enum(ProjectStatus), default=ProjectStatus.IN_PROGRESS)
    parts = Column(Enum(ProjectParts), nullable=True)
    chapter_count = Column(Integer, default=0)
    owner_id = Column(Integer, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())