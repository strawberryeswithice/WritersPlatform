from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from catalog_service.app.db.models import ProjectStatus, ProjectGenre

class ProjectCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200, description="Название проекта")
    genre: Optional[ProjectGenre] = Field(None, description="Жанр")
    status: Optional[ProjectStatus] = Field(ProjectStatus.IN_PROGRESS, description="Статус")

class ProjectUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    genre: Optional[ProjectGenre] = None
    status: Optional[ProjectStatus] = None
    chapter_count: Optional[int] = Field(None, ge=0)

class ProjectResponse(BaseModel):
    id: int
    title: str
    genre: Optional[ProjectGenre]
    status: ProjectStatus
    chapter_count: int
    owner_id: int
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

class ProjectListResponse(BaseModel):
    items: List[ProjectResponse]
    total: int
    page: int
    size: int
    pages: int