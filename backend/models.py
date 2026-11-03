import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    # 사용자 고유 ID
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # 로그인 식별자
    phone: Mapped[str] = mapped_column(
        String(20),
        unique=True,
        index=True,
        nullable=False,
    )

    # 해시 처리된 비밀번호
    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    # 사용자 이름
    name: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    # 사용자 권한: CUSTOMER 또는 MERCHANT
    role: Mapped[str] = mapped_column(
        String(20),
        default="CUSTOMER",
        nullable=False,
    )

    # 프로필 이미지
    profile_image: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    # 온보딩 시 선택한 시장 ID
    market_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )

    # 온보딩 시 등록한 상점명
    store_name: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    # 온보딩 완료 여부
    onboarding_completed: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    # 가입 날짜
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # 정보 수정 날짜
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # 회원 탈퇴 날짜
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
