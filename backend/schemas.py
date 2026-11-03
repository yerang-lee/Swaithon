
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