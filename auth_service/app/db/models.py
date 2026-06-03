from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON
from sqlalchemy.sql import func
from auth_service.app.db.database import Base


class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    email           = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name       = Column(String, nullable=True)
    is_active       = Column(Boolean, default=True)
    role            = Column(String(20), nullable=False, default="user", server_default="user")
    token_version   = Column(Integer, nullable=False, default=0, server_default="0")
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<User(id={self.id}, email={self.email}, role={self.role})>"


class AdminLog(Base):
    __tablename__ = "admin_logs"

    id          = Column(Integer, primary_key=True, index=True)
    admin_id    = Column(Integer, nullable=False, index=True)
    admin_email = Column(String, nullable=False)
    admin_role  = Column(String(20), nullable=False)
    action      = Column(String(50), nullable=False)
    target_id   = Column(Integer, nullable=True)
    target_info = Column(JSON, nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<AdminLog(admin={self.admin_id}, action={self.action})>"
