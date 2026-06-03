from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Enum, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from project_service.app.db.database import Base
import enum

class ProjectStatus(str, enum.Enum):
    IN_PROGRESS = "в процессе"
    COMPLETED   = "завершен"
    ON_PAUSE    = "на паузе"

class ProjectGenre(str, enum.Enum):
    NOVEL        = "роман"
    STORY        = "рассказ"
    NOVELLA      = "повесть"
    POETRY       = "стихи"
    DETECTIVE    = "детектив"
    FANTASY      = "фэнтези"
    SCI_FI       = "фантастика"
    ROMANCE      = "любовный роман"
    THRILLER     = "триллер"

class ProjectParts(str, enum.Enum):
    SINGLE = "одночастный"
    MULTI  = "многочастный"

class CharacterGender(str, enum.Enum):
    FEMALE = "женский"
    MALE   = "мужской"
    OTHER  = "другое"

class CharacterRole(str, enum.Enum):
    PROTAGONIST   = "протагонист"
    ANTAGONIST    = "антагонист"
    MENTOR        = "ментор"
    SECONDARY     = "второстепенный"

class CharacterStatus(str, enum.Enum):
    ALIVE   = "жив"
    DEAD    = "мертв"
    MISSING = "пропал"
    UNKNOWN = "неизвестен"

class RelationshipType(str, enum.Enum):
    MARRIED       = "женаты"
    COUPLE        = "пара"
    FRIENDS       = "друзья"
    ENEMIES       = "враги"
    ACQUAINTANCES = "знакомые"
    NEUTRAL       = "нейтральные"

class Project(Base):
    __tablename__ = "projects"

    id          = Column(Integer, primary_key=True, index=True)
    title       = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    genre       = Column(Enum(ProjectGenre), nullable=True)
    status      = Column(Enum(ProjectStatus), default=ProjectStatus.IN_PROGRESS)
    parts       = Column(Enum(ProjectParts), nullable=True)
    owner_id    = Column(Integer, nullable=False, index=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now())
    updated_at       = Column(DateTime(timezone=True), onupdate=func.now())
    user_deleted_at  = Column(DateTime(timezone=True), nullable=True)
    is_deleted       = Column(Boolean, default=False)
    is_generating    = Column(Boolean, default=False, server_default="false")

    chapters    = relationship("Chapter", back_populates="project",
                               cascade="all, delete-orphan", order_by="Chapter.order")
    characters  = relationship("Character", back_populates="project",
                               cascade="all, delete-orphan", order_by="Character.order")
    relationships = relationship("CharacterRelationship", back_populates="project",
                                 cascade="all, delete-orphan")
    graph_layout  = relationship("GraphLayout", back_populates="project",
                                 cascade="all, delete-orphan", uselist=False)
    text_chunks      = relationship("TextChunk", back_populates="project",
                                    cascade="all, delete-orphan")
    character_chunks = relationship("CharacterChunk", back_populates="project",
                                    cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Project(id={self.id}, title={self.title})>"


class Chapter(Base):
    __tablename__ = "chapters"

    id           = Column(Integer, primary_key=True, index=True)
    project_id   = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    title        = Column(String(300), nullable=False)
    content      = Column(Text, nullable=True, server_default="")
    content_url  = Column(String(500), nullable=True)
    char_count      = Column(Integer, default=0)
    order           = Column(Integer, default=0)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())
    user_deleted_at = Column(DateTime(timezone=True), nullable=True)

    project = relationship("Project", back_populates="chapters")
    text_chunks = relationship("TextChunk", back_populates="chapter",
                               cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Chapter(id={self.id}, title={self.title})>"


class Character(Base):
    __tablename__ = "characters"

    id           = Column(Integer, primary_key=True, index=True)
    project_id   = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name         = Column(String(150), nullable=False)
    short_desc   = Column(String(50), nullable=True)
    role         = Column(Enum(CharacterRole), nullable=True)
    gender       = Column(Enum(CharacterGender), nullable=True)
    gender_other = Column(String(100), nullable=True)
    birthdate    = Column(String(10), nullable=True)
    age          = Column(Integer, nullable=True)
    char_status  = Column(Enum(CharacterStatus), nullable=True)
    location     = Column(String(200), nullable=True)
    features     = Column(String(500), nullable=True)
    personality  = Column(Text, nullable=True)
    desc_full    = Column(Text, nullable=True)
    photo        = Column(String(500), nullable=True)
    photo_full   = Column(String(500), nullable=True)
    order        = Column(Integer, default=0)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())
    updated_at   = Column(DateTime(timezone=True), onupdate=func.now())

    project       = relationship("Project", back_populates="characters")
    custom_labels = relationship("CharacterCustomLabel", back_populates="character",
                                 cascade="all, delete-orphan", order_by="CharacterCustomLabel.id")
    character_chunks = relationship("CharacterChunk", back_populates="character",
                                    cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Character(id={self.id}, name={self.name})>"


class CharacterCustomLabel(Base):
    __tablename__ = "character_custom_labels"

    id           = Column(Integer, primary_key=True, index=True)
    character_id = Column(Integer, ForeignKey("characters.id", ondelete="CASCADE"), nullable=False)
    key          = Column(String(100), nullable=False)
    value        = Column(String(500), nullable=True)

    character    = relationship("Character", back_populates="custom_labels")

class CharacterRelationship(Base):
    __tablename__ = "character_relationships"

    id            = Column(Integer, primary_key=True, index=True)
    project_id    = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    char1_id      = Column(Integer, ForeignKey("characters.id", ondelete="CASCADE"), nullable=False)
    char2_id      = Column(Integer, ForeignKey("characters.id", ondelete="CASCADE"), nullable=False)
    relation_type = Column(Enum(RelationshipType), nullable=False)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    project = relationship("Project", back_populates="relationships")

    def __repr__(self):
        return f"<Relationship({self.char1_id} — {self.relation_type} — {self.char2_id})>"


class GraphLayout(Base):

    __tablename__ = "graph_layouts"

    id         = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"),
                        nullable=False, unique=True)
    nodes      = Column(JSON, nullable=False, default=dict)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    project = relationship("Project", back_populates="graph_layout")

    def __repr__(self):
        return f"<GraphLayout(project={self.project_id})>"

class TextChunk(Base):
    __tablename__ = "text_chunks"

    id          = Column(Integer, primary_key=True, index=True)
    chapter_id  = Column(Integer, ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id  = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index = Column(Integer, default=0)
    text        = Column(Text, nullable=False)
    embedding   = Column(Text, nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    chapter = relationship("Chapter", back_populates="text_chunks")
    project = relationship("Project", back_populates="text_chunks")

    def __repr__(self):
        return f"<TextChunk(chapter={self.chapter_id}, idx={self.chunk_index})>"


class CharacterChunk(Base):
    __tablename__ = "character_chunks"

    id              = Column(Integer, primary_key=True, index=True)
    character_id    = Column(Integer, ForeignKey("characters.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id      = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    appearance_text = Column(Text, nullable=False)
    embedding       = Column(Text, nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    character = relationship("Character", back_populates="character_chunks")
    project   = relationship("Project", back_populates="character_chunks")

    def __repr__(self):
        return f"<CharacterChunk(character={self.character_id})>"