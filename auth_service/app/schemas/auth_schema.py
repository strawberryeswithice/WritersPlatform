from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List
from datetime import datetime


class SendCodeRequest(BaseModel):
    email: EmailStr = Field(..., description="Email адрес пользователя")


class VerifyCodeRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6)


class UserRegister(BaseModel):
    email: EmailStr = Field(..., description="Email адрес пользователя")
    password: str = Field(..., min_length=8, max_length=50, description="Пароль (мин. 8 символов)")
    password_confirm: str = Field(..., description="Подтверждение пароля")
    full_name: Optional[str] = Field(None, max_length=100, description="Имя пользователя")
    verification_code: str = Field(..., min_length=6, max_length=6, description="6-значный код из письма")

    @field_validator("password_confirm")
    def passwords_match(cls, v, info):
        if "password" in info.data and v != info.data["password"]:
            raise ValueError("Пароли не совпадают")
        return v


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    verification_code: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=8, max_length=50)
    new_password_confirm: str

    @field_validator("new_password_confirm")
    def passwords_match(cls, v, info):
        if "new_password" in info.data and v != info.data["new_password"]:
            raise ValueError("Пароли не совпадают")
        return v


class UserLogin(BaseModel):
    email: EmailStr = Field(..., description="Email адрес")
    password: str = Field(..., description="Пароль")


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str]
    is_active: bool
    role: str = "user"
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 3600


class MessageResponse(BaseModel):
    message: str
    detail: Optional[str] = None


class AdminUserResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str]
    is_active: bool
    role: str
    created_at: datetime
    deleted_projects_count: int = 0

    class Config:
        from_attributes = True


class AddAdminRequest(BaseModel):
    email: EmailStr = Field(..., description="Email пользователя, которого назначаем администратором")
    role: str = Field("admin", description="Роль: admin или superadmin")

    @field_validator("role")
    def validate_role(cls, v):
        if v not in ("admin", "superadmin"):
            raise ValueError("Роль должна быть 'admin' или 'superadmin'")
        return v


class AdminLogResponse(BaseModel):
    id: int
    admin_id: int
    admin_email: str
    admin_role: str
    action: str
    target_id: Optional[int]
    target_info: Optional[dict]
    created_at: datetime

    class Config:
        from_attributes = True
