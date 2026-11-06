
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Float, JSON, func
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
        Float,
        nullable=True,
    )

    # 경도
    longitude: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    # 생성 일시
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # 카카오 장소 고유 ID
    kakao_place_id: Mapped[str | None] = mapped_column(
        String(50),
        unique=True,
        nullable=True,
    )


class Store(Base):
    __tablename__ = "stores"

    store_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    market_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("markets.market_id"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.user_id"), nullable=False
    )
    store_name: Mapped[str] = mapped_column(
        String(100), nullable=False
    )
    description: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Product(Base):
    __tablename__ = "products"

    # 표준 상품 고유 ID
    product_id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    # 표준 상품명
    product_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    # 상품 카테고리 ID
    category_id: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    # 상품 설명
    description: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    # 상품 이미지 URL
    image_url: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
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

class Listing(Base):
    __tablename__ = "listings"

    # 판매 게시물 고유 ID
    listing_id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    # 표준 상품 ID
    product_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("products.product_id"),
        nullable=False,
        index=True,
    )

    # 판매하는 가게 ID
    store_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("stores.store_id"),
        nullable=False,
        index=True,
    )

    # 정상 판매 가격
    price: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    # 할인 가격
    discount_price: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    # 품절 여부
    is_sold_out: Mapped[bool] = mapped_column(
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


class VoiceAnalysis(Base):
    __tablename__ = "voice_analyses"

    # 음성 분석 결과 고유 ID
    analysis_id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    # 분석을 요청한 사용자 ID
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.user_id"),
        nullable=False,
    )

    # 분석 의도: PRODUCT_CREATE, PRODUCT_UPDATE 등
    intent: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    # LLM이 추출한 분석 결과 JSON
    analysis_result: Mapped[dict] = mapped_column(
        JSON,
        nullable=False,
    )

    # 분석 상태: PENDING, APPLIED, CANCELLED
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="PENDING",
    )

    # 분석 결과 생성 시간
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
    )

    # 분석 결과 최종 반영 시간
    applied_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )
