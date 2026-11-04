
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
    market_id: int | None
    store_name: str | None
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
    market_id: int | None = Field(default=None, gt=0)
    store_name: str | None = Field(default=None, min_length=1, max_length=100)


class OnboardingResponse(BaseModel):
    user_id: int
    role: str
    market_id: int | None
    store_name: str | None
    onboarding_completed: bool

# 회원 탈퇴
class DeleteAccountResponse(BaseModel):
    message: str