
from datetime import datetime

from sqlalchemy import (
    Text,
    Column,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Float,
    JSON,
    func,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


# =========================================================
# 사용자
# =========================================================

class User(Base):
    __tablename__ = "users"

    user_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    phone: Mapped[str] = mapped_column(
        String(20), unique=True, index=True, nullable=False
    )
    password_hash: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    name: Mapped[str] = mapped_column(
        String(50), nullable=False
    )
    role: Mapped[str] = mapped_column(
        String(20), default="CUSTOMER", nullable=False
    )
    onboarding_completed: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


# =========================================================
# 리프레시 토큰
# =========================================================

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    token_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.user_id"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

# =========================================================
# 알림
# =========================================================

class Notification(Base):
    __tablename__ = "notifications"

    notification_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.user_id"), nullable=False
    )
    type: Mapped[str] = mapped_column(
        String(20), nullable=False
    )
    title: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    content: Mapped[str] = mapped_column(
        Text, nullable=False
    )
    related_id: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    is_read: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


# =========================================================
# 전통시장
# =========================================================

class Market(Base):
    __tablename__ = "markets"

    market_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    market_name: Mapped[str] = mapped_column(
        String(100), nullable=False
    )
    address: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    latitude: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    longitude: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    kakao_place_id: Mapped[str | None] = mapped_column(
        String(50), unique=True, nullable=True
    )


# =========================================================
# 상점
# =========================================================

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
    category: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    address: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    image_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    phone: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )


# =========================================================
# 표준 상품
# =========================================================

class Product(Base):
    __tablename__ = "products"

    product_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    product_name: Mapped[str] = mapped_column(
        String(100), nullable=False
    )
    category_id: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    description: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    image_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


# =========================================================
# 판매 게시물
# =========================================================

class Listing(Base):
    __tablename__ = "listings"

    listing_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    product_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("products.product_id"),
        nullable=False, index=True
    )
    store_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("stores.store_id"),
        nullable=False, index=True
    )

    price: Mapped[int] = mapped_column(
        Integer, nullable=False
    )
    sale_price: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )

    sale_quantity: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    sale_unit: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )
    stock_quantity: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )

    is_sold_out: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    image_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )

    sale_rate: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    sale_starts_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    sale_ends_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    version: Mapped[int] = mapped_column(
        Integer, default=1, nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

# =========================================================
# 판매 가격 이력
# =========================================================

class ListingPriceHistory(Base):
    __tablename__ = "listing_price_histories"

    history_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    listing_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("listings.listing_id"),
        nullable=False,
        index=True,
    )
    price: Mapped[int] = mapped_column(
        Integer, nullable=False
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class PriceHistory(Base):
    __tablename__ = "price_histories"

    price_history_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )

    listing_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("listings.listing_id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    price: Mapped[int] = mapped_column(
        Integer, nullable=False
    )

    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )


class Reservation(Base):
    __tablename__ = "reservations"

    reservation_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.user_id"),
        nullable=False, index=True
    )
    listing_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("listings.listing_id"),
        nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("products.product_id"),
        nullable=False, index=True
    )
    store_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("stores.store_id"),
        nullable=False, index=True
    )

    quantity: Mapped[int] = mapped_column(
        Integer, nullable=False
    )
    unit_price: Mapped[int] = mapped_column(
        Integer, nullable=False
    )
    total_price: Mapped[int] = mapped_column(
        Integer, nullable=False
    )

    pickup_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    request_note: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )
    request_id: Mapped[str | None] = mapped_column(
        String(100),
        ForeignKey("recommendation_requests.request_id"),
        nullable=True, index=True
    )

    status: Mapped[str] = mapped_column(
        String(30), default="PENDING", nullable=False
    )

    qr_token_hash: Mapped[str | None] = mapped_column(
        String(64), unique=True, nullable=True
    )

    qr_code_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(), nullable=False
    )
    picked_up_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

class ReservationEvent(Base):
    __tablename__ = "reservation_events"

    event_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    request_id: Mapped[str | None] = mapped_column(
        String(100),
        ForeignKey("recommendation_requests.request_id"),
        nullable=True, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.user_id"),
        nullable=False, index=True
    )
    reservation_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("reservations.reservation_id"),
        nullable=False, unique=True
    )
    listing_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("listings.listing_id"),
        nullable=False
    )
    product_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("products.product_id"),
        nullable=False
    )
    store_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("stores.store_id"),
        nullable=False
    )

    event_type: Mapped[str] = mapped_column(
        String(30), default="RESERVATION", nullable=False
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

# =========================================================
# 기존 음성 분석 테이블 (기존 데이터 호환용)
# =========================================================

class VoiceAnalysis(Base):
    __tablename__ = "voice_analyses"

    analysis_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.user_id"), nullable=False
    )
    intent: Mapped[str] = mapped_column(
        String(30), nullable=False
    )
    analysis_result: Mapped[dict] = mapped_column(
        JSON, nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="PENDING"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    applied_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


# =========================================================
# AI 음성 명령
# =========================================================

class VoiceCommand(Base):
    __tablename__ = "voice_commands"

    # AI 엔진에서 생성하는 UUID
    command_id: Mapped[str] = mapped_column(
        String(36), primary_key=True
    )

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.user_id"), nullable=False, index=True
    )
    store_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("stores.store_id"), nullable=False, index=True
    )

    # 음성 인식 결과 및 대화 이력
    messages: Mapped[list] = mapped_column(
        JSON, nullable=False
    )

    # Gemini가 추출한 명령
    parsed: Mapped[dict] = mapped_column(
        JSON, nullable=False
    )

    # 명령 상태
    intent: Mapped[str] = mapped_column(
        String(30), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False
    )
    message: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )

    # 추가 입력 및 상품 선택 정보
    missing_fields: Mapped[list] = mapped_column(
        JSON, nullable=False, default=list
    )
    candidates: Mapped[list] = mapped_column(
        JSON, nullable=False, default=list
    )
    selected_id: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )

    # 실행 전후 미리보기 및 결과
    preview: Mapped[dict | None] = mapped_column(
        JSON, nullable=True
    )
    result: Mapped[dict | None] = mapped_column(
        JSON, nullable=True
    )

    # 연결된 판매 게시물
    listing_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("listings.listing_id"), nullable=True
    )

    # 명령 생성 당시 상품 버전
    product_version: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )

    # 추가 답변 동시성 검사
    revision: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    # 명령 만료 시간
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


# =========================================================
# AI 음성 명령 실행 이력
# =========================================================

class VoiceEvent(Base):
    __tablename__ = "voice_events"

    event_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )

    command_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("voice_commands.command_id"),
        nullable=False,
        index=True,
    )

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.user_id"), nullable=False
    )
    store_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("stores.store_id"), nullable=False
    )

    intent: Mapped[str] = mapped_column(
        String(30), nullable=False
    )

    # 변경 전 상품 정보
    before_data: Mapped[dict | None] = mapped_column(
        JSON, nullable=True
    )

    # 변경 후 상품 정보
    after_data: Mapped[dict] = mapped_column(
        JSON, nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# 찜하기

class Favorite(Base):
    __tablename__ = "favorites"

    favorite_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.user_id"),
        nullable=False,
        index=True,
    )
    listing_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("listings.listing_id"),
        nullable=False,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
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

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "listing_id",
            name="uq_favorites_user_listing",
        ),
    )

class FavoriteEvent(Base):
    __tablename__ = "favorite_events"

    request_id: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    event_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.user_id"),
        nullable=False,
        index=True,
    )
    listing_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("listings.listing_id"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("products.product_id"),
        nullable=False,
    )
    store_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("stores.store_id"),
        nullable=False,
    )
    event_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


# =========================================================
# 추천 요청 기록
# =========================================================

class RecommendationRequest(Base):
    __tablename__ = "recommendation_requests"

    # AI 모델이 생성한 추천 요청 ID
    request_id: Mapped[str] = mapped_column(
        String(100), primary_key=True
    )

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.user_id"),
        nullable=False,
        index=True,
    )

    # 추천 기준 시각
    as_of: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    # 추천 결과 생성 시각
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    # 추천 규칙 버전
    rule_version: Mapped[str] = mapped_column(
        String(50), nullable=False
    )

    # 사용자 추천 상태
    # new_no_interest / new_with_interest / behavior_based
    user_state: Mapped[str] = mapped_column(
        String(30), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


# =========================================================
# 추천 상품 기록
# =========================================================

class RecommendationItem(Base):
    __tablename__ = "recommendation_items"

    recommendation_item_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )

    request_id: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("recommendation_requests.request_id"),
        nullable=False,
        index=True,
    )

    listing_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("listings.listing_id"),
        nullable=False,
    )

    # 추천 당시 상품 및 점포 정보
    product_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("products.product_id"),
        nullable=False,
    )

    store_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("stores.store_id"),
        nullable=False,
    )

    # 추천 순위 및 점수
    rank: Mapped[int] = mapped_column(
        Integer, nullable=False
    )

    score: Mapped[float] = mapped_column(
        Float, nullable=False
    )

    # 추천 당시 학습 특성 스냅샷
    feature_snapshot: Mapped[dict] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "request_id",
            "listing_id",
            name="uq_recommendation_request_listing",
        ),
        UniqueConstraint(
            "request_id",
            "rank",
            name="uq_recommendation_request_rank",
        ),
    )


# =========================================================
# 추천 상품 노출 기록
# =========================================================

class RecommendationImpression(Base):
    __tablename__ = "recommendation_impressions"

    # 프론트엔드에서 생성하는 UUID
    # 중복 요청 방지용
    event_id: Mapped[str] = mapped_column(
        String(36), primary_key=True
    )

    request_id: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("recommendation_requests.request_id"),
        nullable=False,
        index=True,
    )

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.user_id"),
        nullable=False,
        index=True,
    )

    listing_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("listings.listing_id"),
        nullable=False,
    )

    # 화면에 실제로 노출된 순서
    position: Mapped[int] = mapped_column(
        Integer, nullable=False
    )

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "request_id",
            "listing_id",
            name="uq_impression_request_listing",
        ),
    )


# =========================================================
# 상품 상세 조회 기록
# =========================================================

class ProductViewEvent(Base):
    __tablename__ = "product_view_events"

    # 프론트엔드에서 생성하는 UUID
    event_id: Mapped[str] = mapped_column(
        String(36), primary_key=True
    )

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.user_id"),
        nullable=False,
        index=True,
    )

    listing_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("listings.listing_id"),
        nullable=False,
        index=True,
    )

    product_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("products.product_id"),
        nullable=False,
    )

    store_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("stores.store_id"),
        nullable=False,
    )

    # 추천을 통해 상세 페이지에 진입한 경우 연결
    # 일반적인 상품 상세 조회라면 NULL
    request_id: Mapped[str | None] = mapped_column(
        String(100),
        ForeignKey("recommendation_requests.request_id"),
        nullable=True,
    )

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )



class Image(Base):
    __tablename__ = "images"

    image_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    listing_id: Mapped[int] = mapped_column(
        ForeignKey("listings.listing_id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    image_url: Mapped[str] = mapped_column(
        String(500), nullable=False
    )
    file_name: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    stored_file_name: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
