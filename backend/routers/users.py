from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from datetime import datetime, timezone
from database import get_db
from dependencies import get_current_user
from models import User, Market, Store, RefreshToken
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

    if user.onboarding_completed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 온보딩 정보가 등록된 사용자입니다.",
        )

    market = None
    store = None

    # 상인 온보딩
    if request.role == "MERCHANT":

        # 시장 선택 정보 확인
        if not all([
            request.kakao_place_id,
            request.market_name,
            request.address,
            request.latitude is not None,
            request.longitude is not None,
            request.store_name,
        ]):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="상인은 시장 선택 및 가게 정보를 입력해야 합니다.",
            )

        # 카카오 장소 ID로 기존 시장 조회
        market = (
            db.query(Market)
            .filter(
                Market.kakao_place_id == request.kakao_place_id
            )
            .first()
        )

        # 기존 시장이 없으면 시장 정보 저장
        if market is None:
            market = Market(
                kakao_place_id=request.kakao_place_id,
                market_name=request.market_name,
                address=request.address,
                latitude=request.latitude,
                longitude=request.longitude,
            )

            db.add(market)
            db.flush()

        # 선택한 시장에 상인의 개별 가게 등록
        store = Store(
            market_id=market.market_id,
            user_id=user.user_id,
            store_name=request.store_name,
            description=request.description,
        )

        db.add(store)

    # 고객 온보딩
    user.role = request.role
    user.onboarding_completed = True

    try:
        db.commit()

        if store is not None:
            db.refresh(store)

        db.refresh(user)

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="온보딩 정보 등록 중 오류가 발생했습니다.",
        )

    return {
        "user_id": user.user_id,
        "role": user.role,
        "market_id": market.market_id if market else None,
        "store_id": store.store_id if store else None,
        "store_name": store.store_name if store else None,
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