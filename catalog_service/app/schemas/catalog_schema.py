from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from catalog_service.app.db.models import ProjectStatus, ProjectGenre


class ProjectCreate(BaseModel):
    title:  str = Field(..., min_length=1, max_length=200)
    genre:  Optional[ProjectGenre] = None
    status: Optional[ProjectStatus] = ProjectStatus.IN_PROGRESS


class ProjectUpdate(BaseModel):
    title:         Optional[str] = Field(None, min_length=1, max_length=200)
    genre:         Optional[ProjectGenre] = None
    status:        Optional[ProjectStatus] = None
    chapter_count: Optional[int] = Field(None, ge=0)


class ProjectResponse(BaseModel):
    id:            int
    title:         str
    genre:         Optional[ProjectGenre]
    status:        ProjectStatus
    chapter_count: int
    owner_id:      int
    created_at:    datetime
    updated_at:    Optional[datetime]
    # soft-delete
    is_deleted:      bool = False
    is_generating:   bool = False
    deleted_reason:  Optional[str] = None
    deleted_at:      Optional[datetime] = None
    deleted_by_email:Optional[str] = None

    class Config:
        from_attributes = True


class ProjectListResponse(BaseModel):
    items: List[ProjectResponse]
    total: int
    page:  int
    size:  int
    pages: int


class AppealCreate(BaseModel):
    message:     str = Field(..., min_length=10, max_length=2000)
    owner_email: str = Field(..., description="Email владельца для сохранения")


class AppealResponse(BaseModel):
    id:            int
    project_id:    int
    project_title: str
    owner_id:      int
    owner_email:   str
    owner_name:    Optional[str] = None
    message:       str
    status:        str
    admin_comment: Optional[str] = None
    created_at:    datetime
    reviewed_at:   Optional[datetime] = None

    class Config:
        from_attributes = True

    class Config:
        from_attributes = True


class AdminSoftDeleteRequest(BaseModel):
    reason: str = Field(..., min_length=5, max_length=1000, description="Причина удаления")
