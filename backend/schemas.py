
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

# 회원가입 요청
class SignupRequest(BaseModel):
    phone: str = Field(min_length=10, max_length=20)
    password: str = Field(min_length=8, max_length=100)
    name: str = Field(min_length=1, max_length=50)


# 회원가입 응답
class SignupResponse(BaseModel):
    user_id: int
    phone: str
    name: str
    created_at: datetime

#로그인
class LoginRequest(BaseModel):
    phone: str = Field(min_length=10, max_length=20)
    password: str = Field(min_length=8, max_length=100)


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int

class UserMeResponse(BaseModel):
    user_id: int
    phone: str
    name: str
    role: str
    profile_image: str | None = None

    onboarding_completed: bool
    created_at: datetime

# 로그아웃
class LogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class LogoutResponse(BaseModel):
    message: str

# 내 정보 수정
class UserUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    phone: str | None = Field(default=None, min_length=10, max_length=11)


class UserUpdateResponse(BaseModel):
    user_id: int
    phone: str
    name: str


# 온보딩 정보
class OnboardingRequest(BaseModel):
    role: str = Field(pattern="^(CUSTOMER|MERCHANT)$")

    # 카카오에서 선택한 시장 정보
    kakao_place_id: str | None = Field(default=None, max_length=50)
    market_name: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=255)
    latitude: float | None = None
    longitude: float | None = None

    # 상인 가게 정보
    store_name: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=255)


class OnboardingResponse(BaseModel):
    user_id: int
    role: str
    market_id: int | None
    store_id: int | None
    store_name: str | None
    onboarding_completed: bool


# 회원 탈퇴
class DeleteAccountResponse(BaseModel):
    message: str


# 시장 상세 조회 응답
class MarketResponse(BaseModel):
    market_id: int
    market_name: str
    address: str
    latitude: float | None
    longitude: float | None

    model_config = {
        "from_attributes": True
    }

# 시장 목록 조회 응답
class MarketListResponse(BaseModel):
    total_count: int
    markets: list[MarketResponse]



class KakaoMarketSearchItem(BaseModel):
    market_id: int | None
    place_id: str
    market_name: str
    address: str
    latitude: float
    longitude: float
    category_name: str
    place_url: str


class KakaoMarketSearchResponse(BaseModel):
    total_count: int
    is_end: bool
    documents: list[KakaoMarketSearchItem]

# 카카오 검색 결과로 시장 등록 요청
class MarketCreateRequest(BaseModel):
    kakao_place_id: str = Field(min_length=1, max_length=50)
    market_name: str = Field(min_length=1, max_length=100)
    address: str = Field(min_length=1, max_length=255)
    latitude: float
    longitude: float


# 시장 등록 응답
class MarketCreateResponse(BaseModel):
    market_id: int
    kakao_place_id: str
    market_name: str
    address: str
    latitude: float | None
    longitude: float | None

    model_config = {
        "from_attributes": True
    }

# 가게 등록 요청
class StoreCreateRequest(BaseModel):
    kakao_place_id: str = Field(min_length=1, max_length=50)
    market_name: str = Field(min_length=1, max_length=100)
    address: str = Field(min_length=1, max_length=255)
    latitude: float
    longitude: float

    store_name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=255)


# 가게 등록 응답
class StoreCreateResponse(BaseModel):
    store_id: int
    market_id: int
    user_id: int
    store_name: str
    description: str | None
    created_at: datetime
    model_config = {
        "from_attributes": True
    }



class ProductDetailResponse(BaseModel):
    listing_id: int
    product_id: int
    product_name: str
    category_id: int | None
    description: str | None
    image_url: str | None
    price: int
    sale_price: int | None
    sale_price: int | None
    is_sold_out: bool
    store_id: int
    store_name: str
    market_id: int
    market_name: str


class StoreListItem(BaseModel):
    store_id: int
    store_name: str
    category: str | None = None
    address: str | None = None
    image_url: str | None = None

    model_config = {"from_attributes": True}


class StoreListResponse(BaseModel):
    total_count: int
    page: int
    size: int
    stores: list[StoreListItem]


class StoreProductListItem(BaseModel):
    listing_id: int
    product_id: int
    store_id: int
    product_name: str
    price: int
    sale_price: int | None = None
    category_id: int | None = None
    is_sold_out: bool
    is_on_sale: bool
    image_url: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}



class StoreProductListResponse(BaseModel):
    products: list[StoreProductListItem]
    total_count: int
    page: int
    size: int

class ProductListItem(BaseModel):
    listing_id: int
    product_id: int
    store_id: int
    market_id: int
    store_name: str
    product_name: str
    category_id: int | None = None
    category: str | None = None
    price: int
    sale_price: int | None = None
    is_on_sale: bool | None = None
    image_url: str | None = None
    is_sold_out: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ProductListResponse(BaseModel):
    total_count: int
    page: int
    size: int
    products: list[ProductListItem]


# 음성 분석 의도
VoiceIntent = Literal[
    "PRODUCT_CREATE",
    "PRODUCT_UPDATE",
    "PRODUCT_DELETE",
    "PRODUCT_SOLD_OUT",
    "SOLD_OUT",
    "SALE_CREATE",
    "SALE_DELETE",
]


# 음성 분석 결과 입력
class VoiceAnalysisCreate(BaseModel):
    intent: VoiceIntent

    product_name: str = Field(
        min_length=1,
        max_length=100,
    )

    price: int | None = Field(
        default=None,
        ge=0,
    )

    quantity: int | None = Field(
        default=None,
        ge=1,
    )

    unit: str | None = None

    discount_rate: float | None = Field(
        default=None,
        ge=0,
        le=100,
    )

    sale_price: int | None = Field(
        default=None,
        ge=0,
    )

    needs_confirmation: bool = False

    # 상품 수정 시 수정할 정보가 있는지 확인
    @model_validator(mode="after")
    def validate_update_fields(self):
        if self.intent == "PRODUCT_UPDATE":
            if (
                self.price is None
                and self.sale_price is None
                and self.discount_rate is None
            ):
                raise ValueError("수정할 상품 정보가 없습니다.")

        return self


# 음성 분석 결과 응답
class VoiceAnalysisResponse(BaseModel):
    analysis_id: int
    intent: str
    analysis_result: dict
    status: str
    created_at: datetime

    model_config = {
        "from_attributes": True,
    }

class StoreDetailResponse(BaseModel):
    store_id: int
    market_id: int
    market_name: str
    user_id: int
    store_name: str
    category: str | None = None
    address: str | None = None
    phone: str | None = None
    image_url: str | None = None
    description: str | None = None

    model_config = {"from_attributes": True}

# 찜하기 등록 요청
class FavoriteCreateRequest(BaseModel):
    listing_id: int = Field(gt=0)
    request_id: str | None = Field(default=None, max_length=100)


# 찜하기 등록 응답
class FavoriteResponse(BaseModel):
    favorite_id: int
    listing_id: int
    is_active: bool
    created_at: datetime

    model_config = {
        "from_attributes": True,
    }

class FavoriteCreateResponse(BaseModel):
    favorite_id: int
    user_id: int
    listing_id: int
    product_id: int
    store_id: int
    product_name: str
    store_name: str
    created_at: datetime
    message: str

class FavoriteListItem(BaseModel):
    favorite_id: int
    listing_id: int
    product_id: int
    product_name: str
    store_id: int
    store_name: str
    market_id: int
    market_name: str
    category_id: int | None = None
    price: int
    sale_price: int | None = None
    is_sold_out: bool
    is_on_sale: bool
    image_url: str | None = None
    created_at: datetime


class FavoriteListResponse(BaseModel):
    total_count: int
    page: int
    size: int
    favorites: list[FavoriteListItem]


# 찜하기 취소 응답
class FavoriteDeleteResponse(BaseModel):
    favorite_id: int
    listing_id: int
    message: str

# 추천 상품 상세 조회 기록 요청
class ProductViewRequest(BaseModel):
    request_id: str = Field(..., min_length=1, max_length=100)
    event_id: str = Field(..., min_length=1, max_length=36)
    listing_id: int = Field(gt=0)
    occurred_at: datetime

class ReservationCreateRequest(BaseModel):
    listing_id: int
    product_id: int
    quantity: int = Field(..., gt=0)
    pickup_at: datetime
    request_note: str | None = None
    request_id: str | None = None


class ReservationCreateResponse(BaseModel):
    reservation_id: int
    user_id: int
    listing_id: int
    product_id: int
    product_name: str
    store_id: int
    store_name: str
    quantity: int
    unit_price: int
    total_price: int
    pickup_at: datetime
    request_note: str | None
    status: str
    created_at: datetime
    message: str

class ReservationDetailResponse(BaseModel):
    reservation_id: int
    listing_id: int
    product_id: int
    product_name: str
    store_id: int
    store_name: str
    quantity: int
    total_price: int
    status: str
    created_at: datetime
    qr_code_data: str | None = None
    qr_code_expires_at: datetime | None = None

class PickupVerifyRequest(BaseModel):
    qr_code_data: str = Field(..., min_length=1)


class PickupVerifyResponse(BaseModel):
    reservation_id: int
    listing_id: int
    product_id: int
    product_name: str
    store_name: str
    status: str
    completed_at: datetime
    message: str

class ReservationListItem(BaseModel):
    reservation_id: int
    listing_id: int
    product_id: int
    product_name: str
    store_id: int
    store_name: str
    market_id: int
    market_name: str
    category_id: int | None
    category: str | None
    category_name: str | None
    quantity: int
    unit_price: int
    total_price: int
    pickup_at: datetime
    status: str
    created_at: datetime


class ReservationListResponse(BaseModel):
    reservations: list[ReservationListItem]
    total_count: int
    page: int
    size: int

class ReservationStatusUpdateRequest(BaseModel):
    status: str


class ReservationStatusUpdateResponse(BaseModel):
    reservation_id: int
    status: str
    updated_at: datetime
    message: str

class MerchantReservationListItem(BaseModel):
    reservation_id: int
    customer_id: int
    product_id: int
    product_name: str
    quantity: int
    unit_price: int
    total_price: int
    pickup_at: datetime
    request_note: str | None
    status: str
    created_at: datetime


class MerchantReservationListResponse(BaseModel):
    reservations: list[MerchantReservationListItem]
    total_count: int
    page: int
    size: int

class ReservationCancelResponse(BaseModel):
    reservation_id: int
    status: str
    cancelled_at: datetime
    message: str

class MerchantListingItem(BaseModel):
    listing_id: int
    product_id: int
    product_name: str
    category_id: int | None
    price: int
    sale_price: int | None
    sale_quantity: float | None
    sale_unit: str | None
    stock_quantity: int | None
    is_sold_out: bool
    sale_rate: int | None
    created_at: datetime


class MerchantListingListResponse(BaseModel):
    listings: list[MerchantListingItem]
    total_count: int
    page: int
    size: int

# =========================================================
# 알림 목록 조회
# =========================================================

NotificationType = Literal[
    "RESERVATION",
    "SALE",
    "PRODUCT",
    "SYSTEM",
]


class NotificationListItem(BaseModel):
    notification_id: int
    type: NotificationType
    title: str
    content: str
    related_id: int | None = None
    is_read: bool
    created_at: datetime

    model_config = {
        "from_attributes": True,
    }


class NotificationListResponse(BaseModel):
    notifications: list[NotificationListItem]
    unread_count: int
    total_count: int
    page: int
    size: int

# =========================================================
# 알림 읽음 처리
# =========================================================

class NotificationReadResponse(BaseModel):
    notification_id: int
    is_read: bool
    read_at: datetime
    message: str