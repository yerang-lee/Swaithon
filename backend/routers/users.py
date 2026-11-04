from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from datetime import datetime, timezone
from database import get_db
from dependencies import get_current_user
from models import User, Market, RefreshToken
from schemas import (
  UserMeResponse, UserUpdateRequest, UserUpdateResponse, 
  OnboardingRequest, OnboardingResponse, DeleteAccountResponse
)



router = APIRouter(
    prefix="/users",
    tags=["Users"],
)


# 내 정보 조회
@router.get(
    "/me",
    response_model=UserMeResponse,
)
def get_my_info(
    current_user: User = Depends(get_current_user),
):
    return current_user

# 내 정보 수정
@router.patch(
    "/me",
    response_model=UserUpdateResponse,
    status_code=status.HTTP_200_OK,
)
def update_my_info(
    request: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 수정할 정보가 없는 경우
    if request.name is None and request.phone is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="수정할 정보를 입력해주세요.",
        )

    # 현재 사용자 조회
    user = (
        db.query(User)
        .filter(
            User.user_id == current_user.user_id,
            User.deleted_at.is_(None),
        )
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자 정보를 찾을 수 없습니다.",
        )

    # 전화번호 중복 확인
    if request.phone is not None:
        existing_user = (
            db.query(User)
            .filter(
                User.phone == request.phone,
                User.user_id != user.user_id,
                User.deleted_at.is_(None),
            )
            .first()
        )

        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="이미 가입된 전화번호입니다.",
            )

    # 이름 수정
    if request.name is not None:
        user.name = request.name

    # 전화번호 수정
    if request.phone is not None:
        user.phone = request.phone

    # DB 저장
    try:
        db.commit()
        db.refresh(user)

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="사용자 정보 수정 중 오류가 발생했습니다.",
        )

    return {
        "user_id": user.user_id,
        "phone": user.phone,
        "name": user.name,
    }

# 온보딩 정보 등록
@router.patch(
    "/me/onboarding",
    response_model=OnboardingResponse,
    status_code=status.HTTP_200_OK,
)
def register_onboarding(
    request: OnboardingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 1. 사용자 정보 조회
    user = (
        db.query(User)
        .filter(
            User.user_id == current_user.user_id,
            User.deleted_at.is_(None),
        )
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자 정보를 찾을 수 없습니다.",
        )

    # 2. 이미 온보딩을 완료한 경우
    if user.onboarding_completed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 온보딩 정보가 등록된 사용자입니다.",
        )

    # 3. 시장 ID가 입력된 경우 시장 존재 여부 확인
    if request.market_id is not None:
        market = (
            db.query(Market)
            .filter(Market.market_id == request.market_id)
            .first()
        )

        if not market:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="시장 정보를 찾을 수 없습니다.",
            )

    # 4. 온보딩 정보 등록
    user.role = request.role
    user.market_id = request.market_id
    user.store_name = request.store_name
    user.onboarding_completed = True

    # 5. DB 저장
    try:
        db.commit()
        db.refresh(user)

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="온보딩 정보 등록 중 오류가 발생했습니다.",
        )

    # 6. 응답 반환
    return {
        "user_id": user.user_id,
        "role": user.role,
        "market_id": user.market_id,
        "store_name": user.store_name,
        "onboarding_completed": user.onboarding_completed,
    }

# 회원 탈퇴
@router.delete("/me", response_model=DeleteAccountResponse)
def delete_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        # 1. 탈퇴할 사용자 조회
        user = db.query(User).filter(
            User.user_id == current_user.user_id,
            User.deleted_at.is_(None)
        ).first()

        if not user:
            raise HTTPException(
                status_code=404,
                detail="사용자 정보를 찾을 수 없습니다."
            )

        # 2. 계정 비활성화
        user.deleted_at = datetime.now(timezone.utc)

        # 3. 해당 사용자의 Refresh Token 전체 폐기
        db.query(RefreshToken).filter(
            RefreshToken.user_id == user.user_id,
            RefreshToken.revoked_at.is_(None)
        ).update(
            {"revoked_at": datetime.now(timezone.utc)},
            synchronize_session=False
        )

        db.commit()

        return {"message": "회원 탈퇴가 완료되었습니다."}

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="회원 탈퇴 처리 중 오류가 발생했습니다."
        )