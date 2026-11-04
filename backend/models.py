
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    # 사용자 고유 ID (자동 증가)
    user_id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
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

    # 사용자 권한
    role: Mapped[str] = mapped_column(
        String(20),
        default="CUSTOMER",
        nullable=False,
    )

    # 온보딩 정보
    market_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("markets.market_id"),
        nullable=True,
    )

    store_name: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    onboarding_completed: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    token_id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.user_id"),
        nullable=False,
    )

    token_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        unique=True,
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

# Market 모델
class Market(Base):
    __tablename__ = "markets"

    # 시장 고유 ID
    market_id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    # 시장 이름
    market_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    # 시장 주소
    address: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    # 위도
    latitude: Mapped[float | None] = mapped_column(
        nullable=True,
    )

    # 경도
    longitude: Mapped[float | None] = mapped_column(
        nullable=True,
    )

    # 생성 일시
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )