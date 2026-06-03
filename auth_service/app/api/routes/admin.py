from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import List, Optional
from jose import JWTError, jwt
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from auth_service.app.db.database import get_db
from auth_service.app.db.models import User, AdminLog
from auth_service.app.schemas.auth_schema import (
    AdminUserResponse, AddAdminRequest, AdminLogResponse, MessageResponse
)
from auth_service.app.core.config import settings

router = APIRouter(prefix="/api/admin", tags=["admin"])
bearer_scheme = HTTPBearer()

SMTP_HOST = "smtp.gmail.com"; SMTP_PORT = 587
SMTP_USER = "littlebulb95@gmail.com"; SMTP_PASSWORD = "ipajqzjgafumyaeh"


def _send_ban_email(to_email: str, reason: str):
    try:
        html = f"""<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#7fa0bd;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:40px 20px;">
    <table width="400" cellpadding="0" cellspacing="0"
           style="background:#d9e3ec;border-radius:15px;overflow:hidden;
                  box-shadow:0 6px 15px rgba(0,0,0,0.2);">
      <tr><td style="background:#c0392b;padding:24px 30px;text-align:center;">
        <div style="font-size:32px;margin-bottom:8px;">🔒</div>
        <h2 style="margin:0;color:#fff;font-size:19px;">Ваш аккаунт заблокирован</h2>
      </td></tr>
      <tr><td style="padding:26px 30px;">
        <p style="color:#4a5568;font-size:14px;line-height:1.6;margin:0 0 16px;">
          Ваш аккаунт на платформе <strong>Writers Platform</strong> был заблокирован.
        </p>
        <div style="background:#f7e8e8;border-left:4px solid #c0392b;
                    border-radius:6px;padding:14px 16px;margin-bottom:16px;">
          <p style="margin:0;font-size:13px;color:#7b1a1a;font-weight:bold;margin-bottom:6px;">
            Причина блокировки:
          </p>
          <p style="margin:0;font-size:13px;color:#5a2020;line-height:1.5;">{reason}</p>
        </div>
        <p style="color:#718096;font-size:13px;">
          Если считаете это ошибкой, свяжитесь с поддержкой платформы.
        </p>
      </td></tr>
      <tr><td style="padding:12px 30px;background:#cfd8e2;text-align:center;">
        <p style="margin:0;color:#718096;font-size:11px;">
          Writers Platform · автоматическое уведомление
        </p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>"""
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Ваш аккаунт заблокирован — Writers Platform"
        msg["From"] = f"Writers Platform <{SMTP_USER}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html, "html", "utf-8"))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
            s.ehlo(); s.starttls(); s.login(SMTP_USER, SMTP_PASSWORD)
            s.sendmail(SMTP_USER, to_email, msg.as_string())
    except Exception as e:
        print(f"[email] ban notify failed: {e}")


def _send_unban_email(to_email: str):
    try:
        html = """<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#7fa0bd;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:40px 20px;">
    <table width="400" cellpadding="0" cellspacing="0"
           style="background:#d9e3ec;border-radius:15px;overflow:hidden;box-shadow:0 6px 15px rgba(0,0,0,0.2);">
      <tr><td style="background:#27ae60;padding:24px 30px;text-align:center;">
        <div style="font-size:32px;margin-bottom:8px;">🔓</div>
        <h2 style="margin:0;color:#fff;font-size:19px;">Аккаунт восстановлен</h2>
      </td></tr>
      <tr><td style="padding:26px 30px;">
        <p style="color:#4a5568;font-size:14px;line-height:1.6;margin:0 0 16px;">
          Ваш аккаунт на платформе <strong>Writers Platform</strong> был восстановлен.
          Вы снова можете пользоваться всеми функциями платформы.
        </p>
      </td></tr>
      <tr><td style="padding:12px 30px;background:#cfd8e2;text-align:center;">
        <p style="margin:0;color:#718096;font-size:11px;">Writers Platform · автоматическое уведомление</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>"""
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Ваш аккаунт восстановлен — Writers Platform"
        msg["From"] = f"Writers Platform <{SMTP_USER}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html, "html", "utf-8"))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
            s.ehlo(); s.starttls(); s.login(SMTP_USER, SMTP_PASSWORD)
            s.sendmail(SMTP_USER, to_email, msg.as_string())
    except Exception as e:
        print(f"[email] unban notify failed: {e}")



def _decode_token(credentials: HTTPAuthorizationCredentials) -> dict:
    try:
        return jwt.decode(credentials.credentials, settings.JWT_SECRET_KEY,
                          algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Невалидный токен")


def require_admin(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
                  db: Session = Depends(get_db)) -> tuple:
    payload = _decode_token(credentials)
    role = payload.get("role", "user")
    if role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    return int(payload.get("sub")), role


def require_superadmin(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
                       db: Session = Depends(get_db)) -> tuple:
    payload = _decode_token(credentials)
    role = payload.get("role", "user")
    if role != "superadmin":
        raise HTTPException(status_code=403, detail="Только для суперадмина")
    return int(payload.get("sub")), role


def _log(db, admin_id, admin_email, admin_role, action, target_id=None, target_info=None):
    db.add(AdminLog(admin_id=admin_id, admin_email=admin_email, admin_role=admin_role,
                    action=action, target_id=target_id, target_info=target_info))
    db.commit()



@router.get("/users", response_model=List[AdminUserResponse])
async def list_users(
    search: Optional[str] = Query(None),
    admin_info: tuple = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(User).filter(User.role == "user")
    if search:
        query = query.filter(User.email.ilike(f"%{search}%"))
    users = query.order_by(User.id).all()
    result = []
    for u in users:
        deleted_count = db.query(AdminLog).filter(
            AdminLog.action == "delete_project",
            AdminLog.target_info["owner_id"].as_integer() == u.id,
        ).count()
        result.append(AdminUserResponse(
            id=u.id, email=u.email, full_name=u.full_name,
            is_active=u.is_active, role=u.role, created_at=u.created_at,
            deleted_projects_count=deleted_count,
        ))
    return result

from pydantic import BaseModel as BaseModel_

class BanRequest(BaseModel_):
    reason: str




class BanRequest(BaseModel_):
    reason: str = ""


@router.post("/users/{user_id}/ban", response_model=MessageResponse)
async def ban_user(
    user_id: int,
    body: BanRequest,
    background_tasks: BackgroundTasks,
    admin_info: tuple = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    admin_id, admin_role = admin_info
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
        background_tasks.add_task(_send_ban_email, target.email, body.reason)
    return {"message": f"Пользователь {target.email} заблокирован"}


@router.post("/users/{user_id}/unban", response_model=MessageResponse)
async def unban_user(
    user_id: int,
    background_tasks: BackgroundTasks,
    admin_info: tuple = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    admin_id, admin_role = admin_info
    admin = db.query(User).filter(User.id == admin_id).first()
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    target.is_active = True
    db.commit()
    _log(db, admin_id, admin.email, admin_role, "unban_user",
         target_id=user_id, target_info={"email": target.email})
    background_tasks.add_task(_send_unban_email, target.email)
    return {"message": f"Пользователь {target.email} разблокирован"}



@router.post("/log/delete-project", response_model=MessageResponse)
async def log_project_delete(
    payload: dict,
    admin_info: tuple = Depends(require_admin),
    db: Session = Depends(get_db),
):
    admin_id, admin_role = admin_info
    admin = db.query(User).filter(User.id == admin_id).first()
    _log(db, admin_id, admin.email, admin_role, "delete_project",
         target_id=payload.get("project_id"),
         target_info={"title": payload.get("title"), "owner_id": payload.get("owner_id"),
                      "owner_email": payload.get("owner_email"), "reason": payload.get("reason")})
    return {"message": "Лог записан"}



@router.get("/management/admins", response_model=List[AdminUserResponse])
async def list_admins(admin_info: tuple = Depends(require_superadmin),
                      db: Session = Depends(get_db)):
    admin_id, _ = admin_info
    admins = db.query(User).filter(
        User.role.in_(["admin", "superadmin"]),
        User.id != admin_id
    ).order_by(User.id).all()
    return [AdminUserResponse(id=a.id, email=a.email, full_name=a.full_name,
                              is_active=a.is_active, role=a.role, created_at=a.created_at,
                              deleted_projects_count=0) for a in admins]


@router.post("/management/admins", response_model=MessageResponse)
async def add_admin(body: AddAdminRequest, admin_info: tuple = Depends(require_superadmin),
                    db: Session = Depends(get_db)):
    admin_id, admin_role = admin_info
    admin = db.query(User).filter(User.id == admin_id).first()
    target = db.query(User).filter(User.email == body.email).first()
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if target.role in ("admin", "superadmin"):
        raise HTTPException(status_code=400, detail="Уже является администратором")
    target.role = body.role
    db.commit()
    _log(db, admin_id, admin.email, admin_role, "add_admin",
         target_id=target.id, target_info={"email": target.email, "new_role": body.role})
    return {"message": f"{target.email} назначен {body.role}"}


@router.post("/management/admins/{user_id}/promote", response_model=MessageResponse)
async def promote_superadmin(user_id: int, admin_info: tuple = Depends(require_superadmin),
                             db: Session = Depends(get_db)):
    admin_id, admin_role = admin_info
    admin = db.query(User).filter(User.id == admin_id).first()
    target = db.query(User).filter(User.id == user_id).first()
    if not target or target.role != "admin":
        raise HTTPException(status_code=400, detail="Пользователь не является обычным администратором")
    target.role = "superadmin"; db.commit()
    _log(db, admin_id, admin.email, admin_role, "promote_superadmin",
         target_id=target.id, target_info={"email": target.email})
    return {"message": f"{target.email} теперь суперадмин"}


@router.delete("/management/admins/{user_id}", response_model=MessageResponse)
async def remove_admin(user_id: int, admin_info: tuple = Depends(require_superadmin),
                       db: Session = Depends(get_db)):
    admin_id, admin_role = admin_info
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


@router.get("/logs", response_model=List[AdminLogResponse])
async def get_logs(page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=200),
                   admin_info: tuple = Depends(require_superadmin),
                   db: Session = Depends(get_db)):
    offset = (page - 1) * size
    return db.query(AdminLog).order_by(AdminLog.created_at.desc()).offset(offset).limit(size).all()
