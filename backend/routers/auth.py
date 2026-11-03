
from fastapi import APIRouter, Depends, HTTPException, status
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import (
    SignupRequest,
    SignupResponse,
    LoginRequest,
    LoginResponse,
)
from security import create_access_token, create_refresh_token


router = APIRouter(
    prefix="/auth",
    tags=["Auth"],
)

password_hash = PasswordHash.recommended()


# 회원가입
@router.post(
    "/signup",
    response_model=SignupResponse,
    status_code=status.HTTP_201_CREATED,
)
def signup(
    request: SignupRequest,
    db: Session = Depends(get_db),
):
    # 1. 전화번호 중복 확인
    existing_user = (
        db.query(User)
        .filter(User.phone == request.phone)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 가입된 전화번호입니다.",
        )

    # 2. 비밀번호 해시 처리
    hashed_password = password_hash.hash(request.password)

    # 3. 사용자 객체 생성
    new_user = User(
        phone=request.phone,
        password_hash=hashed_password,
        name=request.name,
    )

    # 4. DB 저장
    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="회원가입 처리 중 오류가 발생했습니다.",
        )

    # 5. 회원가입 응답
    return {
        "user_id": new_user.user_id,
        "phone": new_user.phone,
        "name": new_user.name,
        "created_at": new_user.created_at,
    }

# 로그인
@router.post(
    "/login",
    response_model=LoginResponse,
    status_code=status.HTTP_200_OK,
)
def login(
    request: LoginRequest,
    db: Session = Depends(get_db),
):
    # 1. 전화번호로 사용자 조회
    user = (
        db.query(User)
        .filter(
            User.phone == request.phone,
            User.deleted_at.is_(None),
        )
        .first()
    )

    # 2. 사용자 존재 여부 및 비밀번호 확인
    if not user or not password_hash.verify(
        request.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="전화번호 또는 비밀번호가 올바르지 않습니다.",
        )

    # 3. JWT 토큰 생성
    access_token = create_access_token(user.user_id)
    refresh_token = create_refresh_token(user.user_id)

    # 4. 로그인 성공 응답
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": 3600,
    }