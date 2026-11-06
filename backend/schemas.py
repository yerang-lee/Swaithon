
from datetime import datetime

from pydantic import BaseModel, Field

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
    profile_image: str | None

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

class StoreListResponse(BaseModel):
    total_count: int
    stores: list[StoreCreateResponse]


class ProductDetailResponse(BaseModel):
    listing_id: int
    product_id: int
    product_name: str
    category_id: int | None
    description: str | None
    image_url: str | None
    price: int
    discount_price: int | None
    is_sold_out: bool
    store_id: int
    store_name: str
    market_id: int
    market_name: str


class ProductListItem(BaseModel):
    listing_id: int
    product_id: int
    store_id: int
    store_name: str
    product_name: str
    category_id: int | None
    price: int
    discount_price: int | None
    image_url: str | None
    is_sold_out: bool


class ProductListResponse(BaseModel):
    total_count: int
    page: int
    size: int
    products: list[ProductListItem]
