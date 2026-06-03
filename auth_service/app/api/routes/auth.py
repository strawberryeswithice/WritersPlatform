from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from datetime import timedelta

from auth_service.app.db.database import get_db
from auth_service.app.db.models import User
from auth_service.app.schemas.auth_schema import (
    UserRegister, UserLogin, UserResponse,
    TokenResponse, MessageResponse,
    SendCodeRequest, VerifyCodeRequest,
    ResetPasswordRequest,
)
from auth_service.app.utils.security import (
    get_password_hash, verify_password, create_access_token
)
from auth_service.app.core.config import settings
from auth_service.app.utils.security import decode_access_token
from auth_service.app.utils.email_service import (
    verify_code,
    _generate_code,
    _store_code,
    _send_email,
    _code_email_html,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _bg_send_register_email(email: str, code: str):
    html = _code_email_html(
        code,
        "Подтверждение регистрации",
        "Для завершения регистрации введите код на сайте:"
    )
    _send_email(email, "Код подтверждения регистрации", html)


def _bg_send_reset_email(email: str, code: str):
    html = _code_email_html(
        code,
        "Сброс пароля",
        "Для сброса пароля введите код на сайте:"
    )
    _send_email(email, "Код сброса пароля", html)


@router.post("/send-register-code", response_model=MessageResponse)
async def send_register_code(
        body: SendCodeRequest,
        background_tasks: BackgroundTasks,
        db: Session = Depends(get_db)
):
    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким email уже существует",
        )
    code = _generate_code()
    _store_code(body.email, code, "register")
    background_tasks.add_task(_bg_send_register_email, body.email, code)
    return {"message": "Код отправлен на указанный email"}


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserRegister, db: Session = Depends(get_db)):
    if not verify_code(user_data.email, user_data.verification_code, "register"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неверный или просроченный код подтверждения",
        )

    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким email уже существует",
        )

    is_first_user = db.query(User).count() == 0
    user_role = "superadmin" if is_first_user else "user"

    new_user = User(
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        full_name=user_data.full_name,
        is_active=True,
        role=user_role,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/login", response_model=TokenResponse)
async def login(user_data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_data.email).first()
    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email, "role": user.role,
              "tv": user.token_version or 0,
              "blocked": not user.is_active},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


@router.get("/me", response_model=UserResponse)
async def get_current_user(token: str, db: Session = Depends(get_db)):
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Невалидный токен")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Токен не содержит идентификатор пользователя")
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    token_tv = payload.get("tv", 0)
    if (user.token_version or 0) != token_tv:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Сессия устарела")
    return user


@router.post("/send-reset-code", response_model=MessageResponse)
async def send_reset_code(
        body: SendCodeRequest,
        background_tasks: BackgroundTasks,
        db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == body.email).first()
    if user:
        code = _generate_code()
        _store_code(body.email, code, "reset")
        background_tasks.add_task(_bg_send_reset_email, body.email, code)
    return {"message": "Если email зарегистрирован, код будет отправлен"}


@router.post("/verify-reset-code", response_model=MessageResponse)
async def verify_reset_code(body: VerifyCodeRequest):
    from auth_service.app.utils.email_service import _verification_codes
    from datetime import datetime

    record = _verification_codes.get(body.email)
    if not record or record["type"] != "reset" or record["code"] != body.code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неверный или просроченный код",
        )
    if datetime.utcnow() > record["expires_at"]:
        _verification_codes.pop(body.email, None)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Код истёк",
        )
    return {"message": "Код подтверждён"}


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    if not verify_code(body.email, body.verification_code, "reset"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неверный или просроченный код подтверждения",
        )
    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    user.hashed_password = get_password_hash(body.new_password)
    db.commit()
    return {"message": "Пароль успешно изменён"}
