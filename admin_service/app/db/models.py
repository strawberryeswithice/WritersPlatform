import enum
from sqlalchemy import (Column, Integer, String, Boolean, DateTime,
                         JSON, Text, Enum, ForeignKey)
from sqlalchemy.sql import func
from admin_service.app.db.database import Base



class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    email           = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name       = Column(String, nullable=True)
    is_active       = Column(Boolean, default=True)
    role            = Column(String(20), nullable=False, default="user", server_default="user")
    token_version   = Column(Integer, nullable=False, default=0, server_default="0")
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())


class AdminLog(Base):
    __tablename__ = "admin_logs"

    id          = Column(Integer, primary_key=True, index=True)
    admin_id    = Column(Integer, nullable=False, index=True)
    admin_email = Column(String, nullable=False)
    admin_role  = Column(String(20), nullable=False)
    action      = Column(String(50), nullable=False)
    target_id   = Column(Integer, nullable=True)
    target_info = Column(JSON, nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())



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
    deleted_reason  = Column(Text, nullable=True)
    deleted_at      = Column(DateTime(timezone=True), nullable=True)
    deleted_by_id   = Column(Integer, nullable=True)
    deleted_by_email= Column(String, nullable=True)


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



class Chapter(Base):
    __tablename__ = "chapters"

    id           = Column(Integer, primary_key=True, index=True)
    project_id   = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    title        = Column(String(200), nullable=False)
    content      = Column(Text, nullable=True, server_default="")
    content_url  = Column(String(500), nullable=True)
    char_count   = Column(Integer, default=0)
    order        = Column(Integer, default=0)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())
    updated_at   = Column(DateTime(timezone=True), onupdate=func.now())


class Character(Base):
    __tablename__ = "characters"

    id          = Column(Integer, primary_key=True, index=True)
    project_id  = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name        = Column(String(200), nullable=False)
    role        = Column(String(100), nullable=True)
    short_desc  = Column(Text, nullable=True)
    desc_full   = Column(Text, nullable=True)
    personality = Column(Text, nullable=True)
    gender      = Column(String(20), nullable=True)
    gender_other= Column(String(100), nullable=True)
    birthdate   = Column(String(50), nullable=True)
    age         = Column(String(20), nullable=True)
    char_status = Column(String(50), nullable=True)
    location    = Column(String(200), nullable=True)
    features    = Column(Text, nullable=True)
    photo       = Column(String(500), nullable=True)
    photo_full  = Column(String(500), nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())


class CharacterRelationship(Base):
    __tablename__ = "character_relationships"

    id            = Column(Integer, primary_key=True, index=True)
    project_id    = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    char1_id      = Column(Integer, ForeignKey("characters.id", ondelete="CASCADE"), nullable=False)
    char2_id      = Column(Integer, ForeignKey("characters.id", ondelete="CASCADE"), nullable=False)
    relation_type = Column(String(50), nullable=False, default="нейтральные")


class GraphLayout(Base):
    __tablename__ = "graph_layouts"

    id         = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"),
                        nullable=False, unique=True)
    nodes      = Column(JSON, default={}, nullable=False, server_default="{}")
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
