from sqlalchemy import Column, Integer, String, DateTime, Enum, Text, Boolean, ForeignKey
from sqlalchemy.sql import func
from catalog_service.app.db.database import Base
import enum


class ProjectStatus(str, enum.Enum):
    IN_PROGRESS = "в процессе"
    COMPLETED   = "завершен"
    ON_PAUSE    = "на паузе"


class ProjectGenre(str, enum.Enum):
    NOVEL    = "роман"
    STORY    = "рассказ"
    NOVELLA  = "повесть"
    POETRY   = "стихи"
    DETECTIVE = "детектив"
    FANTASY  = "фэнтези"
    SCI_FI   = "фантастика"
    ROMANCE  = "любовный роман"
    THRILLER = "триллер"


class ProjectParts(str, enum.Enum):
    SINGLE = "одночастный"
    MULTI  = "многочастный"


class Project(Base):
    __tablename__ = "projects"

    id            = Column(Integer, primary_key=True, index=True)
    title         = Column(String(200), nullable=False)
    description   = Column(Text, nullable=True)
    genre         = Column(Enum(ProjectGenre), nullable=True)
    status        = Column(Enum(ProjectStatus), default=ProjectStatus.IN_PROGRESS)
    parts         = Column(Enum(ProjectParts), nullable=True)
    chapter_count = Column(Integer, default=0)
    owner_id      = Column(Integer, nullable=False, index=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())
    updated_at    = Column(DateTime(timezone=True), onupdate=func.now())

    is_deleted      = Column(Boolean, default=False, server_default='false', nullable=False)
    is_generating   = Column(Boolean, default=False, server_default="false", nullable=False)
    deleted_reason  = Column(Text, nullable=True)
    deleted_at      = Column(DateTime(timezone=True), nullable=True)
    deleted_by_id   = Column(Integer, nullable=True)
    deleted_by_email= Column(String, nullable=True)

    user_deleted_at = Column(DateTime(timezone=True), nullable=True)


class AppealStatus(str, enum.Enum):
    PENDING  = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class ProjectAppeal(Base):
    __tablename__ = "project_appeals"

    id              = Column(Integer, primary_key=True, index=True)
    project_id      = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_id        = Column(Integer, nullable=False)
    owner_email     = Column(String, nullable=False)
    owner_name      = Column(String, nullable=True)
    project_title   = Column(String(200), nullable=False)
    message         = Column(Text, nullable=False)
    status          = Column(Enum(AppealStatus), default=AppealStatus.PENDING, nullable=False)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_at     = Column(DateTime(timezone=True), nullable=True)
    reviewed_by_id  = Column(Integer, nullable=True)
    admin_comment   = Column(Text, nullable=True)
