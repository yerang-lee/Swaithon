
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Market, Store, User
from schemas import StoreCreateRequest, StoreCreateResponse
from dependencies import get_current_user


router = APIRouter(
    prefix="/stores",
    tags=["Stores"],
)


# 가게 등록
@router.post(
    "",
    response_model=StoreCreateResponse,
    status_code=201,
)
def create_store(
    request: StoreCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 상인 권한 확인
    if current_user.role != "MERCHANT":
        raise HTTPException(
            status_code=403,
            detail="상인만 가게를 등록할 수 있습니다.",
        )

    # 카카오 장소 ID로 시장 조회
    market = (
        db.query(Market)
        .filter(
            Market.kakao_place_id == request.kakao_place_id
        )
        .first()
    )

    # 시장이 DB에 없는 경우 시장 정보 저장
    if market is None:
        market = (
            db.query(Market)
            .filter(
                Market.market_name == request.market_name,
                Market.address == request.address,
            )
            .first()
        )

        if market is not None:
            market.kakao_place_id = request.kakao_place_id
            market.latitude = request.latitude
            market.longitude = request.longitude

        else:
            market = Market(
                kakao_place_id=request.kakao_place_id,
                market_name=request.market_name,
                address=request.address,
                latitude=request.latitude,
                longitude=request.longitude,
            )

            db.add(market)

        db.flush()

    # 가게 등록
    new_store = Store(
        market_id=market.market_id,
        user_id=current_user.user_id,
        store_name=request.store_name,
        description=request.description,
    )

    db.add(new_store)
    db.commit()
    db.refresh(new_store)

    return new_store

# 가게 상세 조회
@router.get(
    "/{store_id}",
    response_model=StoreCreateResponse,
)
def get_store(
    store_id: int,
    db: Session = Depends(get_db),
):
    store = (
        db.query(Store)
        .filter(Store.store_id == store_id)
        .first()
    )

    if store is None:
        raise HTTPException(
            status_code=404,
            detail="가게를 찾을 수 없습니다.",
        )

    return store
