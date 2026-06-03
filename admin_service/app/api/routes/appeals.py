from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel

from admin_service.app.db.database import get_db
from admin_service.app.db.models import Project, ProjectAppeal, AppealStatus
from admin_service.app.utils.security import require_admin
from admin_service.app.utils.email_notify import send_appeal_accepted, send_appeal_rejected, send_project_restored

router = APIRouter(tags=["admin-appeals"])
bearer_scheme = HTTPBearer()


class AppealOut(BaseModel):
    id: int
    project_id: int
    project_title: str
    owner_id: int
    owner_email: str
    owner_name: Optional[str] = None
    message: str
    status: str
    admin_comment: Optional[str] = None
    created_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ReviewBody(BaseModel):
    resolution: str = "rejected"
    admin_comment: Optional[str] = None


@router.get("/appeals", response_model=List[AppealOut])
async def list_appeals(
    status_f: Optional[str] = Query("pending", alias="status"),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    require_admin(credentials)
    query = db.query(ProjectAppeal)
    if status_f:
        try:
            query = query.filter(ProjectAppeal.status == AppealStatus(status_f))
        except ValueError:
            pass
    appeals = (query.order_by(ProjectAppeal.created_at.desc())
                    .offset((page - 1) * size).limit(size).all())
    return appeals


@router.post("/appeals/{appeal_id}/review", response_model=AppealOut)
async def review_appeal(
    appeal_id: int,
    body: ReviewBody,
    background_tasks: BackgroundTasks,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    admin_id, _, admin_email = require_admin(credentials)
    appeal = db.query(ProjectAppeal).filter(ProjectAppeal.id == appeal_id).first()
    if not appeal:
        raise HTTPException(status_code=404, detail="Апелляция не найдена")

    resolution = body.resolution.lower()
    if resolution == "accepted":
        appeal.status = AppealStatus.ACCEPTED
        project = db.query(Project).filter(Project.id == appeal.project_id).first()
        if project:
            project.is_deleted = False
            project.deleted_reason = None
            project.deleted_at = None
            project.deleted_by_id = None
            project.deleted_by_email = None
        background_tasks.add_task(
            send_appeal_accepted, appeal.owner_email, appeal.project_title, body.admin_comment
        )
    else:
        appeal.status = AppealStatus.REJECTED
        background_tasks.add_task(
            send_appeal_rejected, appeal.owner_email, appeal.project_title, body.admin_comment
        )

    appeal.reviewed_at = datetime.now(timezone.utc)
    appeal.reviewed_by_id = admin_id
    appeal.admin_comment = body.admin_comment
    db.commit()
    db.refresh(appeal)
    return appeal
