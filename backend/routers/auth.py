import hashlib
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from database import get_db
from models import User, RefreshToken
from schemas import (
    SignupRequest,
    SignupResponse,
    LoginRequest,
    LoginResponse,
    LogoutRequest,
    LogoutResponse,
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

    # 4. Refresh Token 해시 생성
    token_hash = hashlib.sha256(
        refresh_token.encode("utf-8")
    ).hexdigest()

    # 5. Refresh Token 만료 시간 설정
    expires_at = datetime.now(timezone.utc) + timedelta(days=14)

    # 6. Refresh Token DB 저장
    stored_token = RefreshToken(
        user_id=user.user_id,
        token_hash=token_hash,
        expires_at=expires_at,
    )

    try:
        db.add(stored_token)
        db.commit()

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="토큰 저장 중 오류가 발생했습니다.",
        )

    # 7. 로그인 성공 응답
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": 3600,
    }

# 로그아웃
@router.post(
    "/logout",
    response_model=LogoutResponse,
    status_code=status.HTTP_200_OK,
)
def logout(
    request: LogoutRequest,
    db: Session = Depends(get_db),
):
    # 1. 전달받은 Refresh Token 해시 생성
    token_hash = hashlib.sha256(
        request.refresh_token.encode("utf-8")
    ).hexdigest()

    # 2. DB에서 Refresh Token 조회
    stored_token = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
        )
        .first()
    )

    # 3. 토큰이 없거나 이미 폐기된 경우
    if not stored_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않은 Refresh Token입니다.",
        )

    # 4. Refresh Token 폐기
    stored_token.revoked_at = datetime.now(timezone.utc)

    try:
        db.commit()

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="로그아웃 처리 중 오류가 발생했습니다.",
        )

    # 5. 로그아웃 성공 응답
    return {
        "message": "로그아웃되었습니다.",
    }