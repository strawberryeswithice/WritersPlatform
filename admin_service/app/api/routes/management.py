from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from admin_service.app.db.database import get_db
from admin_service.app.db.models import User, AdminLog
from admin_service.app.utils.security import require_superadmin

router = APIRouter(tags=["admin-management"])
bearer_scheme = HTTPBearer()


def _log(db, admin_id, admin_email, admin_role, action, target_id=None, target_info=None):
    db.add(AdminLog(admin_id=admin_id, admin_email=admin_email, admin_role=admin_role,
                    action=action, target_id=target_id, target_info=target_info))
    db.commit()


class AdminOut(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    is_active: bool
    role: str
    created_at: Optional[datetime] = None
    deleted_projects_count: int = 0

    class Config:
        from_attributes = True


class AddAdminRequest(BaseModel):
    email: str


class LogOut(BaseModel):
    id: int
    admin_id: int
    admin_email: str
    admin_role: str
    action: str
    target_id: Optional[int] = None
    target_info: Optional[dict] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


@router.get("/management/admins", response_model=List[AdminOut])
async def list_admins(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    admin_id, _, _ = require_superadmin(credentials)
    admins = db.query(User).filter(
        User.role.in_(["admin", "superadmin"]),
        User.id != admin_id,
    ).order_by(User.id).all()
    return [AdminOut(id=a.id, email=a.email, full_name=a.full_name,
                     is_active=a.is_active, role=a.role, created_at=a.created_at,
                     deleted_projects_count=0) for a in admins]


@router.post("/management/admins")
async def add_admin(
    body: AddAdminRequest,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    admin_id, admin_role, admin_email = require_superadmin(credentials)
    admin = db.query(User).filter(User.id == admin_id).first()
    target = db.query(User).filter(User.email == body.email).first()
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if target.role in ("admin", "superadmin"):
        raise HTTPException(status_code=400, detail="Уже является администратором")
    target.role = "admin"
    db.commit()
    _log(db, admin_id, admin.email, admin_role, "add_admin",
         target_id=target.id, target_info={"email": target.email})
    return {"message": f"{target.email} назначен администратором"}


@router.delete("/management/admins/{user_id}")
async def remove_admin(
    user_id: int,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    admin_id, admin_role, admin_email = require_superadmin(credentials)
    admin = db.query(User).filter(User.id == admin_id).first()
    target = db.query(User).filter(User.id == user_id).first()
    if not target or target.role not in ("admin", "superadmin"):
        raise HTTPException(status_code=400, detail="Не является администратором")
    if target.id == admin_id:
        raise HTTPException(status_code=400, detail="Нельзя снять с себя роль")
    target.role = "user"
    target.token_version = (target.token_version or 0) + 1
    db.commit()
    _log(db, admin_id, admin.email, admin_role, "remove_admin",
         target_id=target.id, target_info={"email": target.email})
    return {"message": f"{target.email} лишён прав"}


@router.post("/management/admins/{user_id}/promote")
async def promote_to_superadmin(
    user_id: int,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    admin_id, admin_role, admin_email = require_superadmin(credentials)
    admin = db.query(User).filter(User.id == admin_id).first()
    target = db.query(User).filter(User.id == user_id, User.role == "admin").first()
    if not target:
        raise HTTPException(status_code=404, detail="Администратор не найден")
    target.role = "superadmin"
    db.commit()
    _log(db, admin_id, admin.email, admin_role, "promote_superadmin",
         target_id=target.id, target_info={"email": target.email})
    return {"message": f"{target.email} теперь суперадмин"}


@router.get("/logs", response_model=List[LogOut])
async def get_logs(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    require_superadmin(credentials)
    logs = (db.query(AdminLog)
            .order_by(AdminLog.created_at.desc())
            .offset((page - 1) * size).limit(size).all())
    return logs
