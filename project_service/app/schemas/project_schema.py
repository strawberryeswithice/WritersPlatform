from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from project_service.app.db.models import (
    ProjectStatus, ProjectGenre, ProjectParts,
    CharacterGender, CharacterRole, CharacterStatus,
    RelationshipType,
)
from pydantic import BaseModel, Field, field_validator

class CustomLabelIn(BaseModel):
    key: str = Field(..., max_length=100)
    value: Optional[str] = Field(None, max_length=500)


class CustomLabelOut(BaseModel):
    id: int
    key: str
    value: Optional[str]
    class Config:
        from_attributes = True

class CharacterCreate(BaseModel):
    name:         str                        = Field(..., min_length=1, max_length=150)
    short_desc:   Optional[str]              = Field(None, max_length=50)
    role:         Optional[CharacterRole]    = None
    gender:       Optional[CharacterGender]  = None
    gender_other: Optional[str]              = Field(None, max_length=100)
    birthdate:    Optional[str]              = Field(None, max_length=10)
    age:          Optional[int]              = Field(None, ge=0)
    char_status:  Optional[CharacterStatus]  = None
    location:     Optional[str]              = Field(None, max_length=200)
    features:     Optional[str]              = Field(None, max_length=500)
    personality:  Optional[str]              = None
    desc_full:    Optional[str]              = None
    photo:        Optional[str]              = None
    photo_full:   Optional[str]              = None
    order:        Optional[int]              = 0
    custom_labels: List[CustomLabelIn]       = []


class CharacterUpdate(BaseModel):
    name:         Optional[str]              = Field(None, min_length=1, max_length=150)
    short_desc:   Optional[str]              = Field(None, max_length=50)
    role:         Optional[CharacterRole]    = None
    gender:       Optional[CharacterGender]  = None
    gender_other: Optional[str]              = Field(None, max_length=100)
    birthdate:    Optional[str]              = Field(None, max_length=10)
    age:          Optional[int]              = Field(None, ge=0)
    char_status:  Optional[CharacterStatus]  = None
    location:     Optional[str]              = Field(None, max_length=200)
    features:     Optional[str]              = Field(None, max_length=500)
    personality:  Optional[str]              = None
    desc_full:    Optional[str]              = None
    photo:        Optional[str]              = None
    photo_full:   Optional[str]              = None
    order:        Optional[int]              = None
    custom_labels: Optional[List[CustomLabelIn]] = None


class CharacterResponse(BaseModel):
    id:             int
    project_id:     int
    name:           str
    short_desc:     Optional[str]
    role:           Optional[CharacterRole]
    gender:         Optional[CharacterGender]
    gender_other:   Optional[str]
    birthdate:      Optional[str]
    age:            Optional[int]
    char_status:    Optional[CharacterStatus]
    location:       Optional[str]
    features:       Optional[str]
    personality:    Optional[str]
    desc_full:      Optional[str]
    photo:          Optional[str]
    photo_full:     Optional[str] = None
    photo_url:      Optional[str] = None
    photo_full_url: Optional[str] = None
    order:          int
    created_at:     datetime
    updated_at:     Optional[datetime]
    custom_labels:  List[CustomLabelOut]
    class Config:
        from_attributes = True

class ChapterCreate(BaseModel):
    title: str  = Field(..., min_length=1, max_length=300)
    content: Optional[str] = ""
    order: int  = Field(0, ge=0)


class ChapterUpdate(BaseModel):
    title:      Optional[str] = Field(None, min_length=1, max_length=300)
    content:    Optional[str] = None
    char_count: Optional[int] = Field(None, ge=0)
    order:      Optional[int] = Field(None, ge=0)


class ChapterResponse(BaseModel):
    id:         int
    project_id: int
    title:      str
    content:    Optional[str] = ""
    content_path: Optional[str] = None
    char_count: int
    order:      int
    created_at: datetime
    updated_at: Optional[datetime]
    class Config:
        from_attributes = True

class ProjectCreate(BaseModel):
    title:       str                       = Field(..., min_length=1, max_length=200)
    description: Optional[str]             = None
    genre:       Optional[ProjectGenre]    = None
    status:      Optional[ProjectStatus]   = ProjectStatus.IN_PROGRESS
    parts:       Optional[ProjectParts]    = None


class ProjectUpdate(BaseModel):
    title:       Optional[str]             = Field(None, min_length=1, max_length=200)
    description: Optional[str]             = None
    genre:       Optional[ProjectGenre]    = None
    status:      Optional[ProjectStatus]   = None
    parts:       Optional[ProjectParts]    = None


class ProjectResponse(BaseModel):
    id:          int
    title:       str
    description: Optional[str]
    genre:       Optional[ProjectGenre]
    status:      ProjectStatus
    parts:       Optional[ProjectParts]
    owner_id:    int
    created_at:  datetime
    updated_at:  Optional[datetime]
    chapters:    List[ChapterResponse]
    characters:  List[CharacterResponse]
    user_deleted_at: Optional[datetime] = None
    is_deleted: bool = False
    is_generating: bool = False

    class Config:
        from_attributes = True


class ProjectShortResponse(BaseModel):
    id:         int
    title:      str
    genre:      Optional[ProjectGenre]
    status:     ProjectStatus
    parts:      Optional[ProjectParts]
    owner_id:   int
    created_at: datetime
    updated_at: Optional[datetime]
    class Config:
        from_attributes = True


class RelationshipIn(BaseModel):
    char1_id:      int
    char2_id:      int
    relation_type: str


class RelationshipOut(BaseModel):
    id:            int
    project_id:    int
    char1_id:      int
    char2_id:      int
    relation_type: RelationshipType
    class Config:
        from_attributes = True


class RelationshipBatchSave(BaseModel):
    relationships: List[RelationshipIn]


class GraphLayoutSave(BaseModel):
    nodes: dict


class GraphLayoutResponse(BaseModel):
    nodes: dict
    class Config:
        from_attributes = True

class AdminGraphLayoutResponse(BaseModel):
    project_id: int
    nodes: dict
    relationships: List["RelationshipOut"]

    class Config:
        from_attributes = True
