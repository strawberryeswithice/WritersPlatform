from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from admin_service.app.db.database import get_db
from admin_service.app.db.models import User, AdminLog
from admin_service.app.utils.security import require_admin, require_superadmin
from admin_service.app.utils.email_notify import send_ban_notification, send_unban_notification

router = APIRouter(tags=["admin-users"])
bearer_scheme = HTTPBearer()


def _log(db, admin_id, admin_email, admin_role, action, target_id=None, target_info=None):
    db.add(AdminLog(admin_id=admin_id, admin_email=admin_email, admin_role=admin_role,
                    action=action, target_id=target_id, target_info=target_info))
    db.commit()


class UserOut(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    is_active: bool
    role: str
    created_at: Optional[datetime] = None
    deleted_projects_count: int = 0

    class Config:
        from_attributes = True


class BanRequest(BaseModel):
    reason: str = ""



@router.get("/users", response_model=List[UserOut])
async def list_users(
    search: Optional[str] = Query(None),
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    require_admin(credentials)
    query = db.query(User).filter(User.role == "user")
    if search:
        query = query.filter(
            User.email.ilike(f"%{search}%") | User.full_name.ilike(f"%{search}%")
        )
    users = query.order_by(User.id).all()
    result = []
    from admin_service.app.db.models import Project as ProjectModel
    for u in users:
        deleted_count = db.query(ProjectModel).filter(
            ProjectModel.owner_id == u.id,
            ProjectModel.is_deleted.is_(True),
        ).count()
        result.append(UserOut(
            id=u.id, email=u.email, full_name=u.full_name,
            is_active=u.is_active, role=u.role, created_at=u.created_at,
            deleted_projects_count=deleted_count,
        ))
    return result


@router.post("/users/{user_id}/ban")
async def ban_user(
    user_id: int,
    body: BanRequest,
    background_tasks: BackgroundTasks,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    admin_id, admin_role, admin_email = require_superadmin(credentials)
    admin = db.query(User).filter(User.id == admin_id).first()
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if target.id == admin_id:
        raise HTTPException(status_code=400, detail="Нельзя заблокировать самого себя")

    target.is_active = False
    target.token_version = (target.token_version or 0) + 1
    db.commit()
    _log(db, admin_id, admin.email, admin_role, "ban_user",
         target_id=user_id, target_info={"email": target.email, "reason": body.reason})

    if body.reason:
        background_tasks.add_task(send_ban_notification, target.email, body.reason)
    return {"message": f"Пользователь {target.email} заблокирован"}


@router.post("/users/{user_id}/unban")
async def unban_user(
    user_id: int,
    background_tasks: BackgroundTasks,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    admin_id, admin_role, admin_email = require_superadmin(credentials)
    admin = db.query(User).filter(User.id == admin_id).first()
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    target.is_active = True
    db.commit()
    _log(db, admin_id, admin.email, admin_role, "unban_user",
         target_id=user_id, target_info={"email": target.email})
    background_tasks.add_task(send_unban_notification, target.email)
    return {"message": f"Пользователь {target.email} разблокирован"}
